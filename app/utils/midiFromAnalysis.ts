import type { MidiClip, MidiElementInfo, MidiGenerationContext, MidiMarker, MidiNote } from './midiGenerator';
import { generateMidiClip } from './midiGenerator';

export interface MidiExtractedEvent {
  beat: number;
  duration_beats: number;
  midi: number;
  velocity: number;
}

/** Fidelidade da transcrição de um stem */
export interface StemFidelity {
  confidence: number; // 0–1
  method: 'detected' | 'estimated';
}

export interface MidiExtractionData {
  source?: string;
  coverage?: 'full' | 'segment';
  bars?: number;
  max_beats?: number;
  duration_sec?: number;
  segment_start_sec?: number;
  stems?: Record<string, MidiExtractedEvent[]>;
  stem_meta?: Record<string, StemFidelity>;
}

/** Subconjunto da análise usado para gerar MIDIs */
export interface MusicAnalysisForMidi {
  bpm?: number;
  key?: string;
  musicalIdentity?: { genre?: string };
  groove?: {
    rhythmicPattern?: string;
    grooveType?: string;
    swing?: number;
  };
  harmony?: { key?: string | null };
  drumElements?: {
    kick?: { present: boolean; role: string; energy: number; pattern?: string; type?: string };
    snareClap?: { present: boolean; role: string; energy: number; pattern?: string; type?: string };
    hihats?: { present: boolean; role: string; energy: number; pattern?: string; type?: string };
    cymbalsRides?: { present: boolean; role: string; energy: number; pattern?: string; type?: string };
    percussion?: { present: boolean; role: string; energy: number; pattern?: string; type?: string };
    fills?: { present: boolean; role: string; energy: number; pattern?: string; type?: string };
  };
  bassElements?: {
    subBass?: { present: boolean; energy: number };
    midBass?: { present: boolean; energy: number };
    bassline?: { present: boolean; energy: number };
  };
  synthLayers?: Array<{
    name: string;
    function: string;
    energy: number;
  }>;
  temporalArrangement?: Array<{
    category: string;
    element: string;
    role: string;
    intensity: number;
    start?: number;
    end?: number;
  }>;
  /** Seções do arranjo (intro/build/drop...) com tempos em segundos */
  structure?: {
    sections?: Array<{ name: string; start: number; end: number }>;
  };
  midiExtraction?: MidiExtractionData;
}

export const ANALYSIS_CACHE_KEY_PREFIX = 'legolas-analysis-v5';

export function analysisCacheKey(filename: string): string {
  return `${ANALYSIS_CACHE_KEY_PREFIX}:${filename}`;
}

/** Metadados de exibição por chave de stem extraído do Python */
const STEM_META: Record<string, { element: string; category: string; role: string }> = {
  kick: { element: 'Kick', category: 'Drums', role: 'base' },
  snare_clap: { element: 'Snare/Clap', category: 'Drums', role: 'groove' },
  hihats: { element: 'Hi-Hats', category: 'Drums', role: 'textura' },
  cymbals_rides: { element: 'Cymbals/Rides', category: 'Drums', role: 'textura' },
  percussion: { element: 'Percussion', category: 'Drums', role: 'groove' },
  fills: { element: 'Fills', category: 'Drums', role: 'impacto' },
  sub_bass: { element: 'Sub Bass', category: 'Bass', role: 'base' },
  mid_bass: { element: 'Mid Bass', category: 'Bass', role: 'groove' },
  bassline: { element: 'Bassline', category: 'Bass', role: 'groove' },
  synth_pad: { element: 'Pad', category: 'Synths', role: 'harmonia' },
  synth_lead: { element: 'Lead', category: 'Synths', role: 'melodia' },
  synth_arp: { element: 'Arp', category: 'Synths', role: 'sequência' },
  synth_texture: { element: 'Textura', category: 'Synths', role: 'ambiente' },
  synth_fx: { element: 'FX', category: 'Synths', role: 'impacto' },
};

export function hasValidMidiExtraction(analysis: MusicAnalysisForMidi | null | undefined): boolean {
  const extraction = analysis?.midiExtraction;
  const stems = extraction?.stems;
  if (!stems) return false;
  const hasStems = Object.values(stems).some((events) => Array.isArray(events) && events.length >= 2);
  if (!hasStems) return false;
  // v5+: exige cobertura da faixa inteira (rejeita cache de trecho curto)
  if (extraction.coverage && extraction.coverage !== 'full') return false;
  if ((extraction.bars ?? 0) > 0 && (extraction.bars ?? 0) < 8) return false;
  return true;
}

function intensityForStem(analysis: MusicAnalysisForMidi, stemKey: string, fallback: number): number {
  const drums = analysis.drumElements;
  const bass = analysis.bassElements;
  const map: Record<string, number | undefined> = {
    kick: drums?.kick?.energy,
    snare_clap: drums?.snareClap?.energy,
    hihats: drums?.hihats?.energy,
    cymbals_rides: drums?.cymbalsRides?.energy,
    percussion: drums?.percussion?.energy,
    fills: drums?.fills?.energy,
    sub_bass: bass?.subBass?.energy,
    mid_bass: bass?.midBass?.energy,
    bassline: bass?.bassline?.energy,
  };
  if (map[stemKey] != null) return map[stemKey] as number;
  if (stemKey.startsWith('synth_')) {
    const layer = analysis.synthLayers?.find((l) => {
      const key = elementToMidiStemKey(l.name, 'Synths');
      return key === stemKey;
    });
    if (layer) return layer.energy;
  }
  return fallback;
}

/** Mapeia elemento da UI para chave do stem extraído do Python */
export function elementToMidiStemKey(element: string, category: string): string | null {
  const el = element.toLowerCase();
  if (el.includes('kick')) return 'kick';
  if (el.includes('snare') || el.includes('clap')) return 'snare_clap';
  if (el.includes('hi-hat') || el.includes('hihat') || el.includes('hat')) return 'hihats';
  if (el.includes('cymbal') || el.includes('ride')) return 'cymbals_rides';
  if (el.includes('fill') || el.includes('trans')) return 'fills';
  if (el.includes('perc')) return 'percussion';
  if (el.includes('sub')) return 'sub_bass';
  if (el.includes('mid bass') || el.includes('midbass')) return 'mid_bass';
  if (el.includes('bassline') || el.includes('bass line')) return 'bassline';
  if (category === 'Bass') return 'bassline';
  if (el.includes('pad') || el.includes('drone') || el.includes('chord')) return 'synth_pad';
  if (el.includes('lead') || el.includes('melody') || el.includes('hook')) return 'synth_lead';
  if (el.includes('arp') || el.includes('sequ')) return 'synth_arp';
  if (el.includes('fx') || el.includes('riser') || el.includes('sweep')) return 'synth_fx';
  if (el.includes('textur') || el.includes('atmo') || el.includes('ambient')) return 'synth_texture';
  if (category === 'Synths') return 'synth_lead';
  return null;
}

/** Resolve a chave do stem extraído que corresponde a um elemento da UI. */
function resolveStemKey(
  stems: Record<string, MidiExtractedEvent[]>,
  element: string,
  category: string
): string | undefined {
  const primaryKey = elementToMidiStemKey(element, category);
  if (primaryKey && stems[primaryKey]?.length) {
    return primaryKey;
  }

  const el = element.toLowerCase();
  const candidates = Object.keys(stems).filter((k) => k.startsWith('synth_'));
  for (const key of candidates) {
    const match =
      (key === 'synth_pad' && el.includes('pad')) ||
      (key === 'synth_lead' && el.includes('lead')) ||
      (key === 'synth_arp' && (el.includes('arp') || el.includes('sequ'))) ||
      (key === 'synth_fx' && el.includes('fx')) ||
      (key === 'synth_texture' && el.includes('textur'));
    if (match && stems[key]?.length) return key;
  }

  return undefined;
}

function resolveStemEvents(
  stems: Record<string, MidiExtractedEvent[]>,
  element: string,
  category: string
): MidiExtractedEvent[] | undefined {
  const key = resolveStemKey(stems, element, category);
  return key ? stems[key] : undefined;
}

/**
 * Fidelidade da transcrição de um elemento: confiança (0–1) + método.
 * Quando o stem veio de áudio, usa stem_meta do Python; senão, marca como
 * template (gerado por padrão de gênero, não transcrito).
 */
export function getStemFidelityForElement(
  analysis: MusicAnalysisForMidi,
  element: string,
  category: string
): { confidence: number; method: 'detected' | 'estimated' | 'template' } {
  const extraction = analysis.midiExtraction;
  const stems = extraction?.stems;
  if (stems) {
    const key = resolveStemKey(stems, element, category);
    if (key) {
      const meta = extraction?.stem_meta?.[key];
      if (meta) return { confidence: meta.confidence, method: meta.method };
      // Stem extraído sem metadados (cache antigo): assume detecção média
      return { confidence: 0.5, method: 'detected' };
    }
  }
  // Sem stem extraído → será gerado por template de gênero
  return { confidence: 0, method: 'template' };
}

function stemEventsToMidiNotes(events: MidiExtractedEvent[]): MidiNote[] {
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midiToNoteName = (midi: number): string => {
    const octave = Math.floor(midi / 12) - 2;
    const note = NOTE_NAMES[midi % 12];
    return `${note}${octave}`;
  };

  return events.map((ev) => ({
    note: midiToNoteName(ev.midi),
    midi: Math.max(0, Math.min(127, ev.midi)),
    start_beat: ev.beat,
    duration_beats: Math.max(0.0625, ev.duration_beats),
    velocity: Math.max(1, Math.min(127, Math.round(ev.velocity))),
  }));
}

export function getExtractedNotesForElement(
  analysis: MusicAnalysisForMidi,
  element: string,
  category: string
): MidiNote[] | undefined {
  const stems = analysis.midiExtraction?.stems;
  if (!stems) return undefined;
  const events = resolveStemEvents(stems, element, category);
  if (!events || events.length < 2) return undefined;
  return stemEventsToMidiNotes(events);
}

function getDrumPatternForStem(
  analysis: MusicAnalysisForMidi,
  stemKey: string | null
): string | undefined {
  if (!stemKey || !analysis.drumElements) return undefined;
  const map: Record<string, keyof NonNullable<MusicAnalysisForMidi['drumElements']>> = {
    kick: 'kick',
    snare_clap: 'snareClap',
    hihats: 'hihats',
    cymbals_rides: 'cymbalsRides',
    percussion: 'percussion',
    fills: 'fills',
  };
  const field = map[stemKey];
  if (!field) return undefined;
  return analysis.drumElements[field]?.pattern;
}

/** Override opcional passado ao montar o contexto de geração */
export interface MidiBuildOverrides {
  bpm?: number;
  key?: string;
  genre?: string;
  /** 'swing' (default) preserva microtiming; 'grid' alinha tudo à grade */
  quantize?: 'swing' | 'grid';
}

/** Monta contexto de geração com dados reais da análise + eventos extraídos do áudio */
export function buildMidiGenerationContext(
  analysis: MusicAnalysisForMidi,
  el: MidiElementInfo,
  overrides?: MidiBuildOverrides
): MidiGenerationContext {
  const bpm = overrides?.bpm ?? analysis.bpm ?? 128;
  const key = overrides?.key ?? analysis.key ?? analysis.harmony?.key ?? undefined;
  const genre = overrides?.genre ?? analysis.musicalIdentity?.genre;
  const stemKey = elementToMidiStemKey(el.element, el.category);

  return {
    element: el.element,
    category: el.category,
    role: el.role,
    intensity: el.intensity,
    bpm,
    key: key ?? undefined,
    genre,
    timeSignature: '4/4',
    rhythmicPattern: analysis.groove?.rhythmicPattern,
    grooveType: analysis.groove?.grooveType,
    swing: analysis.groove?.swing,
    drumPattern: getDrumPatternForStem(analysis, stemKey),
    extractedNotes: getExtractedNotesForElement(analysis, el.element, el.category),
    quantize: overrides?.quantize ?? 'swing',
  };
}

/** Mapeia resposta da API para formato usado na geração de MIDI */
export function mapAnalysisFromApi(a: Record<string, unknown>): MusicAnalysisForMidi {
  const groove = a.grooveAndRhythm as
    | { rhythmicPattern?: string; grooveType?: string; swing?: number }
    | undefined;

  const rawExtraction = a.midiExtraction as MidiExtractionData | undefined;

  return {
    bpm: a.bpm as number | undefined,
    key: a.key as string | undefined,
    musicalIdentity: a.musicalIdentity as MusicAnalysisForMidi['musicalIdentity'],
    groove: groove
      ? {
          rhythmicPattern: groove.rhythmicPattern,
          grooveType: groove.grooveType,
          swing: groove.swing,
        }
      : undefined,
    harmony: a.harmony as MusicAnalysisForMidi['harmony'],
    drumElements: a.drumElements as MusicAnalysisForMidi['drumElements'],
    bassElements: a.bassElements as MusicAnalysisForMidi['bassElements'],
    synthLayers: a.synthLayers as MusicAnalysisForMidi['synthLayers'],
    temporalArrangement: a.temporalArrangement as MusicAnalysisForMidi['temporalArrangement'],
    structure: a.structure as MusicAnalysisForMidi['structure'],
    midiExtraction: rawExtraction
      ? {
          source: rawExtraction.source,
          coverage: rawExtraction.coverage ?? 'full',
          bars: rawExtraction.bars,
          max_beats: rawExtraction.max_beats,
          duration_sec: rawExtraction.duration_sec,
          segment_start_sec: rawExtraction.segment_start_sec ?? 0,
          stems: rawExtraction.stems ?? {},
          stem_meta: rawExtraction.stem_meta ?? {},
        }
      : undefined,
  };
}

/** Arquivo fora do padrão Beatport ou na pasta nao-normalizadas */
export function isNonOrganizedFile(file: {
  folder?: string;
  label?: string;
  bpm?: number;
  genre?: string;
  isBeatportFormat?: boolean;
}): boolean {
  if (file.folder === 'nao-normalizadas') return true;
  const hasLabel = !!file.label;
  const hasBpm = !!file.bpm;
  const hasGenre = !!file.genre;
  const isBeatportFormat = file.isBeatportFormat === true;
  return !hasLabel || !hasBpm || !hasGenre || !isBeatportFormat;
}

/**
 * Coleta stems para exportar MIDI.
 * Prioridade: eventos extraídos do áudio; complementa com detecção quando não há extração.
 */
export function collectMidiElementsFromAnalysis(analysis: MusicAnalysisForMidi): MidiElementInfo[] {
  const elements: MidiElementInfo[] = [];
  const seen = new Set<string>();

  const push = (element: string, category: string, role: string, intensity: number) => {
    const key = `${category}:${element}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    elements.push({ element, category, role, intensity });
  };

  const stems = analysis.midiExtraction?.stems;
  if (stems) {
    for (const [stemKey, events] of Object.entries(stems)) {
      if (!events || events.length < 2) continue;
      const meta = STEM_META[stemKey];
      if (!meta) continue;
      push(meta.element, meta.category, meta.role, intensityForStem(analysis, stemKey, 75));
    }
  }

  const hasExtractedStem = (element: string, category: string) => {
    const notes = getExtractedNotesForElement(analysis, element, category);
    return notes && notes.length >= 2;
  };

  if (analysis.drumElements) {
    const drums = analysis.drumElements;
    if (drums.kick?.present && !hasExtractedStem('Kick', 'Drums'))
      push('Kick', 'Drums', drums.kick.role, drums.kick.energy);
    if (drums.snareClap?.present && !hasExtractedStem('Snare/Clap', 'Drums'))
      push('Snare/Clap', 'Drums', drums.snareClap.role, drums.snareClap.energy);
    if (drums.hihats?.present && !hasExtractedStem('Hi-Hats', 'Drums'))
      push('Hi-Hats', 'Drums', drums.hihats.role, drums.hihats.energy);
    if (drums.cymbalsRides?.present && !hasExtractedStem('Cymbals/Rides', 'Drums'))
      push('Cymbals/Rides', 'Drums', drums.cymbalsRides.role, drums.cymbalsRides.energy);
    if (drums.percussion?.present && !hasExtractedStem('Percussion', 'Drums'))
      push('Percussion', 'Drums', drums.percussion.role, drums.percussion.energy);
    if (drums.fills?.present && !hasExtractedStem('Fills', 'Drums'))
      push('Fills', 'Drums', drums.fills.role, drums.fills.energy);
  }

  if (analysis.bassElements) {
    const bass = analysis.bassElements;
    if (bass.subBass?.present && !hasExtractedStem('Sub Bass', 'Bass'))
      push('Sub Bass', 'Bass', 'base', bass.subBass.energy);
    if (bass.midBass?.present && !hasExtractedStem('Mid Bass', 'Bass'))
      push('Mid Bass', 'Bass', 'groove', bass.midBass.energy);
    if (bass.bassline?.present && !hasExtractedStem('Bassline', 'Bass'))
      push('Bassline', 'Bass', 'groove', bass.bassline.energy);
  }

  if (analysis.synthLayers) {
    for (const layer of analysis.synthLayers) {
      if (hasExtractedStem(layer.name, 'Synths')) continue;
      push(layer.name, 'Synths', layer.function, layer.energy);
    }
  }

  if (analysis.temporalArrangement) {
    for (const item of analysis.temporalArrangement) {
      if (hasExtractedStem(item.element, item.category)) continue;
      push(item.element, item.category, item.role, item.intensity);
    }
  }

  return elements;
}

function secondsToBeats(seconds: number, bpm: number): number {
  return (seconds * bpm) / 60;
}

/** Primeiro instante (em beats) em que o elemento aparece no arranjo temporal. */
export function getArrangementStartBeat(
  analysis: MusicAnalysisForMidi,
  element: string,
  category: string,
  bpm: number
): number {
  const items = analysis.temporalArrangement?.filter(
    (i) => i.element === element && i.category === category && (i.start ?? 0) >= 0
  );
  if (!items?.length) return 0;
  return Math.min(...items.map((i) => secondsToBeats(i.start ?? 0, bpm)));
}

/** Desloca notas de templates para a posição do arranjo (extraídas do áudio já vêm alinhadas). */
export function alignClipToArrangement(
  clip: MidiClip,
  analysis: MusicAnalysisForMidi,
  element: string,
  category: string,
  fromAudio: boolean
): MidiClip {
  if (fromAudio) return clip;
  const startBeat = getArrangementStartBeat(analysis, element, category, clip.bpm);
  if (startBeat <= 0) return clip;

  const notes = clip.notes.map((n) => ({
    ...n,
    start_beat: n.start_beat + startBeat,
  }));
  const maxEnd = Math.max(...notes.map((n) => n.start_beat + n.duration_beats), 0);
  const beatsPerBar = parseInt(clip.time_signature.split('/')[0], 10) || 4;

  return {
    ...clip,
    notes,
    bars: Math.max(clip.bars, Math.ceil(maxEnd / beatsPerBar)),
  };
}

/** Marcadores de seção (intro/build/drop...) em beats, para embutir no SMF. */
export function getSectionMarkers(
  analysis: MusicAnalysisForMidi,
  bpm: number
): MidiMarker[] {
  const sections = analysis.structure?.sections;
  if (!sections?.length) return [];
  return sections
    .filter((s) => Number.isFinite(s.start))
    .map((s) => ({
      beat: Math.max(0, secondsToBeats(s.start, bpm)),
      label: s.name,
    }))
    .sort((a, b) => a.beat - b.beat);
}

/** Fatia um clip de faixa inteira em um clip por seção do arranjo. */
export function sliceClipBySections(
  clip: MidiClip,
  markers: MidiMarker[]
): Array<{ section: string; clip: MidiClip }> {
  if (markers.length === 0) return [{ section: 'Full', clip }];
  const beatsPerBar = parseInt(clip.time_signature.split('/')[0], 10) || 4;
  const bounds = markers.map((m) => m.beat);
  const maxBeat = Math.max(clip.bars * beatsPerBar, ...clip.notes.map((n) => n.start_beat + n.duration_beats));

  const result: Array<{ section: string; clip: MidiClip }> = [];
  for (let i = 0; i < markers.length; i++) {
    const start = bounds[i];
    const end = i + 1 < bounds.length ? bounds[i + 1] : maxBeat;
    if (end <= start) continue;
    const notes = clip.notes
      .filter((n) => n.start_beat >= start - 1e-6 && n.start_beat < end - 1e-6)
      .map((n) => ({ ...n, start_beat: n.start_beat - start }));
    if (notes.length === 0) continue;
    result.push({
      section: markers[i].label,
      clip: {
        ...clip,
        notes,
        bars: Math.max(1, Math.ceil((end - start) / beatsPerBar)),
        markers: undefined,
      },
    });
  }
  return result.length ? result : [{ section: 'Full', clip }];
}

/** Gera um MidiClip por stem, alinhado ao arranjo quando possível. */
export function buildAllMidiClipsForExport(
  analysis: MusicAnalysisForMidi,
  overrides?: MidiBuildOverrides
): MidiClip[] {
  const bpm = overrides?.bpm ?? analysis.bpm ?? 128;
  const key = overrides?.key ?? analysis.key ?? analysis.harmony?.key ?? undefined;
  const genre = overrides?.genre ?? analysis.musicalIdentity?.genre;
  const elements = collectMidiElementsFromAnalysis(analysis);
  const markers = getSectionMarkers(analysis, bpm);
  const clips: MidiClip[] = [];

  for (const el of elements) {
    const ctx = buildMidiGenerationContext(analysis, el, {
      bpm,
      key: key ?? undefined,
      genre,
      quantize: overrides?.quantize,
    });
    const fromAudio = !!getExtractedNotesForElement(analysis, el.element, el.category);
    const clip = alignClipToArrangement(
      generateMidiClip(ctx),
      analysis,
      el.element,
      el.category,
      fromAudio
    );
    // Marcadores de seção só fazem sentido na cobertura de faixa inteira (eventos do áudio)
    if (fromAudio && markers.length) clip.markers = markers;
    clips.push(clip);
  }

  return clips;
}
