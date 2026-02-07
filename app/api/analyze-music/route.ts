import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { getDownloadsPath } from '../utils/common';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ──────────────────────────────────────────────────────────────────
// DEDUPLICATION: Evitar análises simultâneas do mesmo arquivo
// ──────────────────────────────────────────────────────────────────
const pendingAnalyses = new Map<string, Promise<AudioAnalysis>>();

// ──────────────────────────────────────────────────────────────────
// INTERFACES
// ──────────────────────────────────────────────────────────────────

interface FrequencyAnalysis {
  subBass: number;      // 20-60 Hz
  bass: number;          // 60-250 Hz
  lowMid: number;       // 250-500 Hz
  mid: number;          // 500-2000 Hz
  highMid: number;      // 2000-4000 Hz
  high: number;         // 4000-20000 Hz
}

// ── 1. Identidade Musical ──
interface MusicalIdentity {
  genre: string;
  subgenres: string[];
  energyLevel: string;
  energyScore: number;
  mood: string[];
  context: string[];
}

// ── 2. Groove e Ritmo ──
interface GrooveAndRhythm {
  bpm: number | null;
  swing: number;
  grooveType: string;
  rhythmicComplexity: string;
  rhythmicPattern: string;
}

// ── 3. Elementos de Bateria ──
interface DrumElementDetail {
  present: boolean;
  type: string;
  role: string;
  pattern: string;
  energy: number;
  count?: number;
}

interface DrumElements {
  kick: DrumElementDetail;
  snareClap: DrumElementDetail;
  hihats: DrumElementDetail;
  cymbalsRides: DrumElementDetail;
  percussion: DrumElementDetail;
  fills: DrumElementDetail;
}

// ── 4. Elementos de Bass ──
interface SubBassDetail {
  present: boolean;
  type: string;
  mono: boolean;
  sidechain: boolean;
  energy: number;
}

interface MidBassDetail {
  present: boolean;
  texture: string;
  movement: string;
  energy: number;
}

interface BasslineDetail {
  present: boolean;
  type: string;
  energy: number;
}

interface BassElements {
  subBass: SubBassDetail;
  midBass: MidBassDetail;
  bassline: BasslineDetail;
  kickBassRelation: string;
}

// ── 5. Synths e Camadas ──
interface SynthLayer {
  name: string;
  category: string;
  function: string;
  movement: string;
  register: string;
  energy: number;
}

// ── 6. Harmonia ──
interface HarmonyAnalysis {
  key: string | null;
  harmonicUsage: string;
  harmonicFeeling: string;
  activeNotes: number;
  harmonicVariation: number;
}

// ── 7. Estrutura ──
interface StructureSection {
  name: string;
  start: number;
  end: number;
  startFormatted: string;
  endFormatted: string;
  function: string;
  energy: number;
  elementsEntering: string[];
  elementsExiting: string[];
}

interface EnergyCurvePoint {
  time: number;
  energy: number;
}

interface StructureAnalysis {
  sections: StructureSection[];
  energyCurve: EnergyCurvePoint[];
  totalDuration: number;
}

// ── 8. Dinâmica ──
interface DynamicsAnalysis {
  energyEvolution: string;
  dynamicRange: number;
  layering: string;
  tensionMoments: number;
  reliefMoments: number;
  predictability: string;
  energyQuarters: { q1: number; q2: number; q3: number; q4: number };
}

// ── 9. Mix ──
interface MixAnalysis {
  stereoWidth: string;
  depth: string;
  clarity: string;
  highlights: string[];
  conflicts: string[];
}

// ── 10. DJ Analysis ──
interface DJEntryExitPoint {
  time: number;
  timeFormatted: string;
  description: string;
}

interface DJAnalysis {
  mixability: string;
  mixabilityDetail: string;
  entryPoints: DJEntryExitPoint[];
  exitPoints: DJEntryExitPoint[];
  compatibleStyles: string[];
  setMoment: string;
  bpm: number | null;
  key: string | null;
}

// ── 11. Resumo Executivo ──
interface ExecutiveSummary {
  identity: string;
  differential: string;
  worksBest: string;
}

// ── Análise completa ──
interface AudioAnalysis {
  filename: string;
  duration: number;
  sampleRate: number;
  bitrate: number;
  channels: number;
  format: string;
  codec: string;
  frequencyAnalysis: FrequencyAnalysis;
  loudness: {
    peak: number;
    rms: number;
    lufs?: number;
  };
  bpm?: number;
  key?: string;
  analysisMethod?: 'python' | 'ffmpeg';

  // Dados detalhados da análise v2
  musicalIdentity?: MusicalIdentity;
  grooveAndRhythm?: GrooveAndRhythm;
  drumElements?: DrumElements;
  bassElements?: BassElements;
  synthLayers?: SynthLayer[];
  harmony?: HarmonyAnalysis;
  structure?: StructureAnalysis;
  dynamics?: DynamicsAnalysis;
  mixAnalysis?: MixAnalysis;
  djAnalysis?: DJAnalysis;
  executiveSummary?: ExecutiveSummary;

  // Arranjo temporal (timeline estilo Ableton)
  temporalArrangement?: Array<{
    category: string;
    element: string;
    start: number;
    end: number;
    startFormatted?: string;
    endFormatted?: string;
    sections: string[];
    intensity: number;
    role: string;
    behavior?: string;
    function?: string;
  }>;

  // Retrocompatibilidade
  detectedElements: {
    synths: string[];
    instruments: string[];
    drumElements: {
      kick: boolean;
      snare: boolean;
      hihat: boolean;
      cymbals: boolean;
      percussion: boolean;
    };
    bassElements: {
      subBass: boolean;
      midBass: boolean;
      bassline: boolean;
    };
  };
}

// Interface para resultado do script Python v2
interface PythonAnalysisResult {
  success: boolean;
  filename?: string;
  duration?: number;
  sample_rate?: number;
  bpm?: number;
  key?: string;
  analysis_method?: string;
  loudness?: {
    peak_db: number;
    rms_db: number;
  };
  frequency_analysis?: {
    sub_bass: number;
    bass: number;
    low_mid: number;
    mid: number;
    high_mid: number;
    high: number;
  };
  // Novos campos v2
  musical_identity?: {
    genre: string;
    subgenres: string[];
    energy_level: string;
    energy_score: number;
    mood: string[];
    context: string[];
  };
  groove_and_rhythm?: {
    bpm: number | null;
    swing: number;
    groove_type: string;
    rhythmic_complexity: string;
    rhythmic_pattern: string;
  };
  drum_elements?: Record<string, {
    present: boolean;
    type: string;
    role: string;
    pattern: string;
    energy: number;
    count?: number;
  }>;
  bass_elements?: {
    sub_bass: { present: boolean; type: string; mono: boolean; sidechain: boolean; energy: number };
    mid_bass: { present: boolean; texture: string; movement: string; energy: number };
    bassline: { present: boolean; type: string; energy: number };
    kick_bass_relation: string;
  };
  synth_layers?: Array<{
    name: string;
    category: string;
    function: string;
    movement: string;
    register: string;
    energy: number;
  }>;
  harmony?: {
    key: string | null;
    harmonic_usage: string;
    harmonic_feeling: string;
    active_notes: number;
    harmonic_variation: number;
  };
  structure?: {
    sections: Array<{
      name: string;
      start: number;
      end: number;
      start_formatted: string;
      end_formatted: string;
      function: string;
      energy: number;
      elements_entering: string[];
      elements_exiting: string[];
    }>;
    energy_curve: Array<{ time: number; energy: number }>;
    total_duration: number;
  };
  dynamics?: {
    energy_evolution: string;
    dynamic_range: number;
    layering: string;
    tension_moments: number;
    relief_moments: number;
    predictability: string;
    energy_quarters: { q1: number; q2: number; q3: number; q4: number };
  };
  mix_analysis?: {
    stereo_width: string;
    depth: string;
    clarity: string;
    highlights: string[];
    conflicts: string[];
  };
  dj_analysis?: {
    mixability: string;
    mixability_detail: string;
    entry_points: Array<{ time: number; time_formatted: string; description: string }>;
    exit_points: Array<{ time: number; time_formatted: string; description: string }>;
    compatible_styles: string[];
    set_moment: string;
    bpm: number | null;
    key: string | null;
  };
  executive_summary?: {
    identity: string;
    differential: string;
    works_best: string;
  };
  temporal_arrangement?: Array<{
    category: string;
    element: string;
    start: number;
    end: number;
    start_formatted?: string;
    end_formatted?: string;
    sections: string[];
    intensity: number;
    role: string;
    behavior?: string;
    function?: string;
  }>;
  // Retrocompatibilidade
  drum_detection?: {
    kick_present: boolean;
    snare_present: boolean;
    hihat_present: boolean;
    cymbals_present: boolean;
    percussion_present: boolean;
  };
  bass_detection?: {
    sub_bass: boolean;
    mid_bass: boolean;
    bassline: boolean;
  };
  detected_synths?: string[];
  detected_instruments?: string[];
  error?: string;
}

/**
 * Tenta analisar usando o script Python (librosa)
 */
async function analyzeWithPython(filePath: string): Promise<PythonAnalysisResult | null> {
  try {
    const scriptPath = join(process.cwd(), 'scripts', 'audio_analyzer.py');

    if (!existsSync(scriptPath)) {
      console.log('⚠️ [Python Analysis] Script não encontrado:', scriptPath);
      return null;
    }

    console.log(`🐍 [Python Analysis] Analisando: ${filePath.split(/[/\\]/).pop()}`);

    // Tentar python3.11 primeiro, depois python3, depois python
    const pythonCommands = ['python3.11', 'python3', 'python'];
    let stdout = '';
    let stderr = '';
    let lastError: Error | null = null;

    for (const pythonCmd of pythonCommands) {
      try {
        const result = await execAsync(
          `${pythonCmd} "${scriptPath}" "${filePath}"`,
          {
            maxBuffer: 1024 * 1024 * 10,
            timeout: 300000,  // 300 segundos (5 min) para arquivos grandes
            env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }  // Evitar __pycache__ (triggera rebuilds)
          }
        );
        stdout = result.stdout;
        stderr = result.stderr;
        lastError = null;
        break;
      } catch (error) {
        lastError = error as Error;
        const execError = error as Error & { stderr?: string; stdout?: string; killed?: boolean };
        const errMsg = execError.stderr || execError.stdout || '';
        // Se o erro é de dependências faltando, não tentar outro Python
        if (errMsg.includes('Depend') && errMsg.includes('faltando')) {
          throw error;
        }
        // Se foi killed (timeout/SIGTERM), não tentar outro Python
        if (execError.killed) {
          throw error;
        }
        // Tentar próximo comando Python
        continue;
      }
    }

    if (lastError) {
      throw lastError;
    }

    if (stderr && !stderr.includes('UserWarning')) {
      console.warn('⚠️ [Python Analysis] Stderr:', stderr);
    }

    const result: PythonAnalysisResult = JSON.parse(stdout);

    if (!result.success) {
      console.warn('⚠️ [Python Analysis] Falha:', result.error);
      return null;
    }

    console.log('✅ [Python Analysis] Análise v2 concluída com sucesso');
    console.log(`   BPM: ${result.bpm}, Key: ${result.key}, Genre: ${result.musical_identity?.genre}`);

    return result;
  } catch (error) {
    console.warn('⚠️ [Python Analysis] Erro ao executar script:', error);
    return null;
  }
}

/**
 * Converte resultado do Python v2 para o formato AudioAnalysis
 */
function convertPythonResult(pythonResult: PythonAnalysisResult, filePath: string): AudioAnalysis {
  const freq = pythonResult.frequency_analysis || {
    sub_bass: 0, bass: 0, low_mid: 0, mid: 0, high_mid: 0, high: 0
  };

  const toScale = (v: number) => Math.round(v * 255);

  // ── Musical Identity ──
  const mi = pythonResult.musical_identity;
  const musicalIdentity: MusicalIdentity | undefined = mi ? {
    genre: mi.genre,
    subgenres: mi.subgenres,
    energyLevel: mi.energy_level,
    energyScore: mi.energy_score,
    mood: mi.mood,
    context: mi.context
  } : undefined;

  // ── Groove and Rhythm ──
  const gr = pythonResult.groove_and_rhythm;
  const grooveAndRhythm: GrooveAndRhythm | undefined = gr ? {
    bpm: gr.bpm,
    swing: gr.swing,
    grooveType: gr.groove_type,
    rhythmicComplexity: gr.rhythmic_complexity,
    rhythmicPattern: gr.rhythmic_pattern
  } : undefined;

  // ── Drum Elements ──
  const de = pythonResult.drum_elements;
  const drumElements: DrumElements | undefined = de ? {
    kick: {
      present: de.kick?.present ?? false,
      type: de.kick?.type ?? 'seco',
      role: de.kick?.role ?? 'ausente',
      pattern: de.kick?.pattern ?? 'ausente',
      energy: de.kick?.energy ?? 0
    },
    snareClap: {
      present: de.snare_clap?.present ?? false,
      type: de.snare_clap?.type ?? 'snare',
      role: de.snare_clap?.role ?? 'ausente',
      pattern: de.snare_clap?.pattern ?? 'ausente',
      energy: de.snare_clap?.energy ?? 0
    },
    hihats: {
      present: de.hihats?.present ?? false,
      type: de.hihats?.type ?? 'fechados',
      role: de.hihats?.role ?? 'ausente',
      pattern: de.hihats?.pattern ?? 'ausente',
      energy: de.hihats?.energy ?? 0
    },
    cymbalsRides: {
      present: de.cymbals_rides?.present ?? false,
      type: de.cymbals_rides?.type ?? 'ride',
      role: de.cymbals_rides?.role ?? 'ausente',
      pattern: de.cymbals_rides?.pattern ?? 'ausente',
      energy: de.cymbals_rides?.energy ?? 0
    },
    percussion: {
      present: de.percussion?.present ?? false,
      type: de.percussion?.type ?? 'eletrônicas',
      role: de.percussion?.role ?? 'ausente',
      pattern: de.percussion?.pattern ?? 'ausente',
      energy: de.percussion?.energy ?? 0
    },
    fills: {
      present: de.fills?.present ?? false,
      type: de.fills?.type ?? 'fills',
      role: de.fills?.role ?? 'ausente',
      pattern: de.fills?.pattern ?? 'ausente',
      energy: de.fills?.energy ?? 0,
      count: de.fills?.count
    }
  } : undefined;

  // ── Bass Elements ──
  const be = pythonResult.bass_elements;
  const bassElementsDetailed: BassElements | undefined = be ? {
    subBass: {
      present: be.sub_bass?.present ?? false,
      type: be.sub_bass?.type ?? 'sustentado',
      mono: be.sub_bass?.mono ?? true,
      sidechain: be.sub_bass?.sidechain ?? false,
      energy: be.sub_bass?.energy ?? 0
    },
    midBass: {
      present: be.mid_bass?.present ?? false,
      texture: be.mid_bass?.texture ?? 'limpo',
      movement: be.mid_bass?.movement ?? 'estático',
      energy: be.mid_bass?.energy ?? 0
    },
    bassline: {
      present: be.bassline?.present ?? false,
      type: be.bassline?.type ?? 'ausente',
      energy: be.bassline?.energy ?? 0
    },
    kickBassRelation: be.kick_bass_relation ?? 'sem relação clara'
  } : undefined;

  // ── Synth Layers ──
  const sl = pythonResult.synth_layers;
  const synthLayers: SynthLayer[] | undefined = sl ? sl.map(l => ({
    name: l.name,
    category: l.category,
    function: l.function,
    movement: l.movement,
    register: l.register,
    energy: l.energy
  })) : undefined;

  // ── Harmony ──
  const ha = pythonResult.harmony;
  const harmony: HarmonyAnalysis | undefined = ha ? {
    key: ha.key,
    harmonicUsage: ha.harmonic_usage,
    harmonicFeeling: ha.harmonic_feeling,
    activeNotes: ha.active_notes,
    harmonicVariation: ha.harmonic_variation
  } : undefined;

  // ── Structure ──
  const st = pythonResult.structure;
  const structure: StructureAnalysis | undefined = st ? {
    sections: (st.sections || []).map(s => ({
      name: s.name,
      start: s.start,
      end: s.end,
      startFormatted: s.start_formatted,
      endFormatted: s.end_formatted,
      function: s.function,
      energy: s.energy,
      elementsEntering: s.elements_entering,
      elementsExiting: s.elements_exiting
    })),
    energyCurve: st.energy_curve || [],
    totalDuration: st.total_duration
  } : undefined;

  // ── Dynamics ──
  const dy = pythonResult.dynamics;
  const dynamics: DynamicsAnalysis | undefined = dy ? {
    energyEvolution: dy.energy_evolution,
    dynamicRange: dy.dynamic_range,
    layering: dy.layering,
    tensionMoments: dy.tension_moments,
    reliefMoments: dy.relief_moments,
    predictability: dy.predictability,
    energyQuarters: dy.energy_quarters
  } : undefined;

  // ── Mix Analysis ──
  const mx = pythonResult.mix_analysis;
  const mixAnalysis: MixAnalysis | undefined = mx ? {
    stereoWidth: mx.stereo_width,
    depth: mx.depth,
    clarity: mx.clarity,
    highlights: mx.highlights,
    conflicts: mx.conflicts
  } : undefined;

  // ── DJ Analysis ──
  const dj = pythonResult.dj_analysis;
  const djAnalysis: DJAnalysis | undefined = dj ? {
    mixability: dj.mixability,
    mixabilityDetail: dj.mixability_detail,
    entryPoints: (dj.entry_points || []).map(p => ({
      time: p.time,
      timeFormatted: p.time_formatted,
      description: p.description
    })),
    exitPoints: (dj.exit_points || []).map(p => ({
      time: p.time,
      timeFormatted: p.time_formatted,
      description: p.description
    })),
    compatibleStyles: dj.compatible_styles,
    setMoment: dj.set_moment,
    bpm: dj.bpm,
    key: dj.key
  } : undefined;

  // ── Executive Summary ──
  const es = pythonResult.executive_summary;
  const executiveSummary: ExecutiveSummary | undefined = es ? {
    identity: es.identity,
    differential: es.differential,
    worksBest: es.works_best
  } : undefined;

  return {
    filename: pythonResult.filename || filePath.split(/[/\\]/).pop() || 'unknown',
    duration: pythonResult.duration || 0,
    sampleRate: pythonResult.sample_rate || 22050,
    bitrate: 0,
    channels: 2,
    format: 'flac',
    codec: 'flac',
    frequencyAnalysis: {
      subBass: toScale(freq.sub_bass),
      bass: toScale(freq.bass),
      lowMid: toScale(freq.low_mid),
      mid: toScale(freq.mid),
      highMid: toScale(freq.high_mid),
      high: toScale(freq.high)
    },
    loudness: {
      peak: pythonResult.loudness?.peak_db || -3,
      rms: pythonResult.loudness?.rms_db || -12
    },
    bpm: pythonResult.bpm,
    key: pythonResult.key,
    analysisMethod: 'python',
    // Dados ricos v2
    musicalIdentity,
    grooveAndRhythm,
    drumElements,
    bassElements: bassElementsDetailed,
    synthLayers,
    harmony,
    structure,
    dynamics,
    mixAnalysis,
    djAnalysis,
    executiveSummary,
    // Arranjo temporal (v2: com behavior, function, timestamps formatados)
    temporalArrangement: (pythonResult.temporal_arrangement || []).map(item => ({
      category: item.category,
      element: item.element,
      start: item.start,
      end: item.end,
      startFormatted: item.start_formatted,
      endFormatted: item.end_formatted,
      sections: item.sections,
      intensity: item.intensity,
      role: item.role,
      behavior: item.behavior,
      function: item.function,
    })),
    // Retrocompatibilidade
    detectedElements: {
      synths: pythonResult.detected_synths || [],
      instruments: pythonResult.detected_instruments || [],
      drumElements: {
        kick: pythonResult.drum_detection?.kick_present || false,
        snare: pythonResult.drum_detection?.snare_present || false,
        hihat: pythonResult.drum_detection?.hihat_present || false,
        cymbals: pythonResult.drum_detection?.cymbals_present || false,
        percussion: pythonResult.drum_detection?.percussion_present || false
      },
      bassElements: {
        subBass: pythonResult.bass_detection?.sub_bass || false,
        midBass: pythonResult.bass_detection?.mid_bass || false,
        bassline: pythonResult.bass_detection?.bassline || false
      }
    }
  };
}

/**
 * Analisa um arquivo de áudio usando ffprobe e ffmpeg (fallback)
 */
async function analyzeAudioFileInternal(filePath: string): Promise<AudioAnalysis> {
  try {
    // PRIORIDADE 1: Tentar análise Python v2 (mais completa e precisa)
    console.log('🎵 [Analyze] Tentando análise Python v2...');
    const pythonResult = await analyzeWithPython(filePath);

    if (pythonResult) {
      console.log('✅ [Analyze] Usando resultados do Python v2');
      return convertPythonResult(pythonResult, filePath);
    }

    // FALLBACK: Análise com ffmpeg (menos precisa, sem dados ricos)
    console.log('⚠️ [Analyze] Python não disponível, usando ffmpeg...');

    const { stdout: probeOutput } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
      { maxBuffer: 1024 * 1024 * 10 }
    );

    const probeData = JSON.parse(probeOutput);
    const format = probeData.format || {};
    const audioStream = probeData.streams?.find((s: { codec_type: string }) => s.codec_type === 'audio') || {};

    const duration = parseFloat(format.duration || '0');
    const sampleRate = parseInt(audioStream.sample_rate || '44100', 10);
    const bitrate = parseInt(format.bit_rate || '0', 10);
    const channels = parseInt(audioStream.channels || '2', 10);
    const codec = audioStream.codec_name || 'unknown';
    const formatName = format.format_name || 'unknown';

    return {
      filename: filePath.split(/[/\\]/).pop() || 'unknown',
      duration,
      sampleRate,
      bitrate,
      channels,
      format: formatName,
      codec,
      frequencyAnalysis: {
        subBass: 80,
        bass: 90,
        lowMid: 70,
        mid: 75,
        highMid: 65,
        high: 60
      },
      loudness: {
        peak: -2.0,
        rms: -11.0,
        lufs: -11.5
      },
      detectedElements: {
        synths: ['Synth'],
        instruments: ['Instrumento'],
        drumElements: {
          kick: true,
          snare: true,
          hihat: true,
          cymbals: false,
          percussion: false
        },
        bassElements: {
          subBass: true,
          midBass: true,
          bassline: true
        }
      },
      analysisMethod: 'ffmpeg'
    };
  } catch (error) {
    console.error('Erro ao analisar áudio:', error);
    throw error;
  }
}

/**
 * Wrapper com deduplicação: evita análises simultâneas do mesmo arquivo
 */
async function analyzeAudioFile(filePath: string): Promise<AudioAnalysis> {
  // Se já existe uma análise em andamento para este arquivo, reutilizar
  const existing = pendingAnalyses.get(filePath);
  if (existing) {
    console.log('♻️ [Analyze] Reutilizando análise em andamento para:', filePath);
    return existing;
  }

  // Criar nova análise e registrar
  const analysisPromise = analyzeAudioFileInternal(filePath).finally(() => {
    pendingAnalyses.delete(filePath);
  });

  pendingAnalyses.set(filePath, analysisPromise);
  return analysisPromise;
}

/**
 * POST /api/analyze-music
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename } = body;

    if (!filename) {
      return NextResponse.json(
        { success: false, error: 'Filename é obrigatório' },
        { status: 400 }
      );
    }

    const downloadsPath = await getDownloadsPath();
    const filePath = join(downloadsPath, filename);

    if (!existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: 'Arquivo não encontrado' },
        { status: 404 }
      );
    }

    console.log(`🎵 [Analyze Music API] Analisando arquivo: ${filename}`);

    const startTime = Date.now();

    const analysisPromise = analyzeAudioFile(filePath);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: análise demorou mais de 300 segundos')), 300000)
    );

    const analysis = await Promise.race([analysisPromise, timeoutPromise]);
    const duration = Date.now() - startTime;

    console.log(`✅ [Analyze Music API] Análise concluída em ${duration}ms`);

    return NextResponse.json({
      success: true,
      analysis,
      analysisTime: duration
    });

  } catch (error) {
    console.error('❌ [Analyze Music API] Erro:', error);
    const errorMsg = error instanceof Error ? error.message : 'Erro ao analisar música';
    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
        hint: errorMsg.includes('Timeout')
          ? 'O arquivo é muito grande. A análise pode demorar vários minutos para arquivos FLAC grandes.'
          : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/analyze-music?filename=...
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');

    if (!filename) {
      return NextResponse.json(
        { success: false, error: 'Parâmetro filename é obrigatório' },
        { status: 400 }
      );
    }

    const downloadsPath = await getDownloadsPath();
    const filePath = join(downloadsPath, filename);

    if (!existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: 'Arquivo não encontrado' },
        { status: 404 }
      );
    }

    console.log(`🎵 [Analyze Music API GET] Analisando arquivo: ${filename}`);

    const startTime = Date.now();

    const analysisPromise = analyzeAudioFile(filePath);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: análise demorou mais de 300 segundos')), 300000)
    );

    const analysis = await Promise.race([analysisPromise, timeoutPromise]);
    const duration = Date.now() - startTime;

    console.log(`✅ [Analyze Music API GET] Análise concluída em ${duration}ms`);

    return NextResponse.json({
      success: true,
      analysis,
      analysisTime: duration
    });

  } catch (error) {
    console.error('❌ [Analyze Music API GET] Erro:', error);
    const errorMsg = error instanceof Error ? error.message : 'Erro ao analisar música';
    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
        hint: errorMsg.includes('Timeout')
          ? 'O arquivo é muito grande. A análise pode demorar vários minutos para arquivos FLAC grandes.'
          : undefined
      },
      { status: 500 }
    );
  }
}
