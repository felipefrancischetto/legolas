import {
  createZipArchive,
  generateMidiClip,
  midiClipToBytes,
  type MidiGenerationContext,
} from './midiGenerator';
import {
  analysisCacheKey,
  buildMidiGenerationContext,
  collectMidiElementsFromAnalysis,
  hasValidMidiExtraction,
  mapAnalysisFromApi,
  type MusicAnalysisForMidi,
} from './midiFromAnalysis';
import { safeGetItem, safeSetItem } from './localStorage';

export interface MidiPackTrackInput {
  name: string;
  title?: string;
  displayName?: string;
  artist?: string;
  bpm?: number;
  key?: string;
  genre?: string;
  folder?: string;
}

export interface MidiPackExportProgress {
  phase: 'analyzing' | 'generating' | 'packaging' | 'done' | 'cancelled';
  current: number;
  total: number;
  trackLabel: string;
  midiFilesTotal: number;
  tracksOk: number;
  tracksFailed: number;
}

export interface MidiPackExportResult {
  zipBytes: Uint8Array;
  packFolderName: string;
  midiFileCount: number;
  tracksProcessed: number;
  tracksSucceeded: number;
  tracksFailed: number;
  errors: Array<{ track: string; error: string }>;
}

const ANALYSIS_TIMEOUT_MS = 300_000;

const AUDIO_FORMAT_RANK: Record<string, number> = {
  flac: 4,
  wav: 3,
  m4a: 2,
  mp3: 1,
};

function formatRank(filename: string): number {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return AUDIO_FORMAT_RANK[ext] ?? 0;
}

function trackIdentityKey(file: MidiPackTrackInput): string {
  const base = (file.title || file.displayName || file.name)
    .replace(/\.(mp3|flac|wav|m4a)$/i, '')
    .trim()
    .toLowerCase();
  const artist = (file.artist || '').trim().toLowerCase();
  const folder = file.folder || 'principal';
  return `${folder}|${artist}|${base}`;
}

/** Uma faixa por música — prioriza FLAC (melhor extração MIDI). */
export function pickBestTracksForMidiPack(tracks: MidiPackTrackInput[]): MidiPackTrackInput[] {
  const byKey = new Map<string, MidiPackTrackInput>();
  for (const track of tracks) {
    const key = trackIdentityKey(track);
    const existing = byKey.get(key);
    if (!existing || formatRank(track.name) > formatRank(existing.name)) {
      byKey.set(key, track);
    }
  }
  return Array.from(byKey.values());
}

/** Nome seguro para pastas/arquivos no ZIP (Windows) */
export function sanitizePackPathSegment(value: string, maxLen = 80): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/g, '');
  if (!cleaned) return 'Sem_nome';
  return cleaned.length > maxLen ? cleaned.substring(0, maxLen).trim() : cleaned;
}

function buildTrackFolderName(file: MidiPackTrackInput, usedNames: Set<string>): string {
  const artist = sanitizePackPathSegment(file.artist || 'Artista_Desconhecido', 50);
  const title = sanitizePackPathSegment(
    file.title || file.displayName || file.name.replace(/\.(mp3|flac|wav|m4a)$/i, ''),
    60
  );
  let base = `${artist} - ${title}`;
  if (file.folder === 'nao-normalizadas') {
    base = `[nao-normalizadas] ${base}`;
  }
  let folder = base;
  let n = 2;
  while (usedNames.has(folder.toLowerCase())) {
    folder = `${base} (${n})`;
    n++;
  }
  usedNames.add(folder.toLowerCase());
  return folder;
}

async function fetchAnalysisForTrack(
  filename: string,
  signal?: AbortSignal
): Promise<MusicAnalysisForMidi> {
  const cacheKey = analysisCacheKey(filename);
  const cached = safeGetItem<MusicAnalysisForMidi>(cacheKey);
  if (cached && hasValidMidiExtraction(cached)) return cached;

  if (signal?.aborted) {
    throw new DOMException('Exportação cancelada', 'AbortError');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
  const onParentAbort = () => controller.abort();
  signal?.addEventListener('abort', onParentAbort);

  try {
    const response = await fetch('/api/analyze-music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, preferBestQuality: true }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => null);
      throw new Error(err?.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.analysis) {
      throw new Error(data.error || 'Análise falhou');
    }

    const analysisData = mapAnalysisFromApi(data.analysis);
    safeSetItem(cacheKey, analysisData, { maxSize: 6 * 1024 * 1024, onError: () => {} });
    return analysisData;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onParentAbort);
  }
}

function buildMidisForTrack(
  file: MidiPackTrackInput,
  analysis: MusicAnalysisForMidi,
  trackFolder: string
): { name: string; data: Uint8Array }[] {
  const bpm = analysis.bpm || file.bpm || 128;
  const key = analysis.key || analysis.harmony?.key || file.key || undefined;
  const genre = analysis.musicalIdentity?.genre || file.genre;
  const elements = collectMidiElementsFromAnalysis(analysis);
  const entries: { name: string; data: Uint8Array }[] = [];

  for (const el of elements) {
    const ctx: MidiGenerationContext = buildMidiGenerationContext(analysis, el, {
      bpm,
      key: key ?? undefined,
      genre,
    });
    const clip = generateMidiClip(ctx);
    const bytes = midiClipToBytes(clip);
    const safeElement = sanitizePackPathSegment(el.element, 40);
    const safeCategory = sanitizePackPathSegment(el.category, 20);
    const midiName = `${safeElement}_${bpm}bpm_${clip.bars}bar.mid`;
    entries.push({
      name: `${trackFolder}/${safeCategory}/${midiName}`,
      data: bytes,
    });
  }

  const trackInfo = {
    title: file.title || file.displayName,
    artist: file.artist,
    bpm,
    key: key ?? null,
    genre: genre ?? null,
    sourceFile: file.name,
    libraryFolder: file.folder || 'principal',
    stems: elements.map((e) => ({ element: e.element, category: e.category, role: e.role })),
    generatedAt: new Date().toISOString(),
  };

  entries.push({
    name: `${trackFolder}/track-info.json`,
    data: new TextEncoder().encode(JSON.stringify(trackInfo, null, 2)),
  });

  return entries;
}

function buildPackReadme(
  packName: string,
  stats: { tracks: number; midis: number; failed: number }
): string {
  return [
    'Legolas — MIDI Pack',
    '===================',
    '',
    `Pasta do pack: ${packName}`,
    `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    `Faixas processadas: ${stats.tracks}`,
    `Arquivos MIDI: ${stats.midis}`,
    stats.failed > 0 ? `Faixas com erro: ${stats.failed}` : '',
    '',
    'Estrutura:',
    '  Artista - Titulo/',
    '    Drums/     → kick, snare, hats...',
    '    Bass/      → sub, bassline...',
    '    Synths/    → leads, pads, arps...',
    '    (outras categorias da análise)',
    '    track-info.json',
    '',
    'Ableton Live 12:',
    '  Arraste cada .mid para uma faixa MIDI, ou use Importar arquivo MIDI.',
    '  Bateria está no canal 10 (GM).',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Gera ZIP com uma pasta por música e subpastas por categoria (Drums, Bass, Synths...).
 */
export async function buildMidiPackZip(
  tracks: MidiPackTrackInput[],
  options: {
    packLabel?: string;
    onProgress?: (p: MidiPackExportProgress) => void;
    signal?: AbortSignal;
    /** Uma faixa por música, sempre FLAC quando existir */
    dedupeBestFormat?: boolean;
  } = {}
): Promise<MidiPackExportResult> {
  const { onProgress, signal } = options;
  const trackList = options.dedupeBestFormat !== false ? pickBestTracksForMidiPack(tracks) : tracks;
  const date = new Date().toISOString().slice(0, 10);
  const packFolderName = sanitizePackPathSegment(
    options.packLabel || `Legolas_MIDI_Pack_${date}`,
    60
  );

  const zipEntries: { name: string; data: Uint8Array }[] = [];
  const usedFolderNames = new Set<string>();
  const errors: Array<{ track: string; error: string }> = [];
  let midiFileCount = 0;
  let tracksSucceeded = 0;
  let tracksFailed = 0;

  const report = (
    phase: MidiPackExportProgress['phase'],
    current: number,
    trackLabel: string
  ) => {
    onProgress?.({
      phase,
      current,
      total: trackList.length,
      trackLabel,
      midiFilesTotal: midiFileCount,
      tracksOk: tracksSucceeded,
      tracksFailed,
    });
  };

  for (let i = 0; i < trackList.length; i++) {
    if (signal?.aborted) {
      onProgress?.({
        phase: 'cancelled',
        current: i,
        total: trackList.length,
        trackLabel: '',
        midiFilesTotal: midiFileCount,
        tracksOk: tracksSucceeded,
        tracksFailed,
      });
      throw new DOMException('Exportação cancelada', 'AbortError');
    }

    const file = trackList[i];
    const label = file.title || file.displayName || file.name;
    report('analyzing', i + 1, label);

    try {
      const analysis = await fetchAnalysisForTrack(file.name, signal);
      report('generating', i + 1, label);

      const trackFolder = buildTrackFolderName(file, usedFolderNames);
      const trackEntries = buildMidisForTrack(file, analysis, trackFolder);
      const midiOnly = trackEntries.filter((e) => e.name.endsWith('.mid'));

      if (midiOnly.length === 0) {
        throw new Error('Nenhum stem MIDI detectado na análise');
      }

      zipEntries.push(...trackEntries);
      midiFileCount += midiOnly.length;
      tracksSucceeded++;
    } catch (err) {
      tracksFailed++;
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      errors.push({ track: label, error: msg });
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
    }
  }

  report('packaging', trackList.length, 'Montando arquivo ZIP...');

  zipEntries.unshift({
    name: `${packFolderName}/README.txt`,
    data: new TextEncoder().encode(
      buildPackReadme(packFolderName, {
        tracks: tracksSucceeded,
        midis: midiFileCount,
        failed: tracksFailed,
      })
    ),
  });

  zipEntries.unshift({
    name: `${packFolderName}/pack-manifest.json`,
    data: new TextEncoder().encode(
      JSON.stringify(
        {
          pack: packFolderName,
          generatedAt: new Date().toISOString(),
          totalTracks: trackList.length,
          tracksSucceeded,
          tracksFailed,
          midiFileCount,
          errors,
        },
        null,
        2
      )
    ),
  });

  // Prefixo raiz em todas as entradas (exceto as que já têm packFolderName no path)
  const prefixed = zipEntries.map((entry) => {
    if (entry.name.startsWith(`${packFolderName}/`)) return entry;
    return { name: `${packFolderName}/${entry.name}`, data: entry.data };
  });

  const zipBytes = createZipArchive(prefixed);

  onProgress?.({
    phase: 'done',
    current: trackList.length,
    total: trackList.length,
    trackLabel: 'Concluído',
    midiFilesTotal: midiFileCount,
    tracksOk: tracksSucceeded,
    tracksFailed,
  });

  return {
    zipBytes,
    packFolderName,
    midiFileCount,
    tracksProcessed: trackList.length,
    tracksSucceeded,
    tracksFailed,
    errors,
  };
}
