'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import BaseModal from './BaseModal';
import { usePlayer } from '../contexts/PlayerContext';
import { getThumbnailUrl } from '../utils/thumbnailCache';
import { getCachedDominantColor } from '../utils/colorExtractor';
import { useSettings } from '../hooks/useSettings';
import LoadingSpinner from './LoadingSpinner';
import { generateAndDownloadMidi, type MidiGenerationContext } from '../utils/midiGenerator';
import { safeSetItem, safeGetItem } from '../utils/localStorage';

// ──────────────────────────────────────────────────────────────────
// INTERFACES
// ──────────────────────────────────────────────────────────────────

interface DrumElementDetail {
  present: boolean;
  type: string;
  role: string;
  pattern: string;
  energy: number;
  count?: number;
}

interface SynthLayer {
  name: string;
  category: string;
  function: string;
  movement: string;
  register: string;
  energy: number;
}

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

interface DJEntryExitPoint {
  time: number;
  timeFormatted: string;
  description: string;
}

interface ArrangementTimelineItem {
  category: string;
  element: string;
  start: number;
  end: number;
  sections: string[];
  intensity: number;
  role: string;
}

interface FullAnalysis {
  // Dados básicos
  bpm?: number;
  key?: string;
  duration?: number;
  analysisMethod?: string;
  frequencyAnalysis?: {
    subBass: number;
    bass: number;
    lowMid: number;
    mid: number;
    highMid: number;
    high: number;
  };
  loudness?: {
    peak: number;
    rms: number;
    lufs?: number;
  };
  // 11 eixos de análise
  musicalIdentity?: {
    genre: string;
    subgenres: string[];
    energyLevel: string;
    energyScore: number;
    mood: string[];
    context: string[];
  };
  grooveAndRhythm?: {
    bpm: number | null;
    swing: number;
    grooveType: string;
    rhythmicComplexity: string;
    rhythmicPattern: string;
  };
  drumElements?: {
    kick: DrumElementDetail;
    snareClap: DrumElementDetail;
    hihats: DrumElementDetail;
    cymbalsRides: DrumElementDetail;
    percussion: DrumElementDetail;
    fills: DrumElementDetail;
  };
  bassElements?: {
    subBass: { present: boolean; type: string; mono: boolean; sidechain: boolean; energy: number };
    midBass: { present: boolean; texture: string; movement: string; energy: number };
    bassline: { present: boolean; type: string; energy: number };
    kickBassRelation: string;
  };
  synthLayers?: SynthLayer[];
  harmony?: {
    key: string | null;
    harmonicUsage: string;
    harmonicFeeling: string;
    activeNotes: number;
    harmonicVariation: number;
  };
  structure?: {
    sections: StructureSection[];
    energyCurve: EnergyCurvePoint[];
    totalDuration: number;
  };
  dynamics?: {
    energyEvolution: string;
    dynamicRange: number;
    layering: string;
    tensionMoments: number;
    reliefMoments: number;
    predictability: string;
    energyQuarters: { q1: number; q2: number; q3: number; q4: number };
  };
  mixAnalysis?: {
    stereoWidth: string;
    depth: string;
    clarity: string;
    highlights: string[];
    conflicts: string[];
  };
  djAnalysis?: {
    mixability: string;
    mixabilityDetail: string;
    entryPoints: DJEntryExitPoint[];
    exitPoints: DJEntryExitPoint[];
    compatibleStyles: string[];
    setMoment: string;
    bpm: number | null;
    key: string | null;
  };
  executiveSummary?: {
    identity: string;
    differential: string;
    worksBest: string;
  };
  temporalArrangement?: ArrangementTimelineItem[];
}

interface MusicStudyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'summary' | 'identity' | 'rhythm' | 'drums' | 'bass' | 'synths' | 'harmony' | 'structure' | 'dynamics' | 'mix' | 'dj' | 'arrangement';

// ──────────────────────────────────────────────────────────────────
// COMPONENTES AUXILIARES
// ──────────────────────────────────────────────────────────────────

function SectionTitle({ icon, title, themeColors }: { icon: React.ReactNode; title: string; themeColors: { primary: string } }) {
  return (
    <h4 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: themeColors.primary }}>
      {icon}
      {title}
    </h4>
  );
}

function InfoCard({ label, value, themeColors, large }: {
  label: string;
  value: string | number;
  themeColors: { primary: string; background: string; border: string };
  large?: boolean;
}) {
  return (
    <div className="p-3 rounded-lg border" style={{ backgroundColor: themeColors.background, borderColor: themeColors.border }}>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`${large ? 'text-2xl' : 'text-lg'} font-bold`} style={{ color: themeColors.primary }}>
        {value}
      </div>
    </div>
  );
}

function Tag({ text, themeColors }: { text: string; themeColors: { primary: string; background: string; border: string } }) {
  return (
    <span
      className="px-3 py-1.5 rounded-lg text-sm font-medium border inline-block"
      style={{ backgroundColor: themeColors.background, color: themeColors.primary, borderColor: themeColors.border }}
    >
      {text}
    </span>
  );
}

function ProgressBar({ value, max = 100, themeColors }: { value: number; max?: number; themeColors: { primary: string } }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="w-full h-2 rounded-full bg-gray-700 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: themeColors.primary }} />
    </div>
  );
}

function DrumRow({ name, detail, themeColors, onMidiClick }: { name: string; detail: DrumElementDetail; themeColors: { primary: string; background: string; border: string }; onMidiClick?: () => void }) {
  return (
    <div
      className={`p-3 rounded-lg border ${detail.present ? 'opacity-100 cursor-pointer hover:brightness-110 transition-all' : 'opacity-40'}`}
      style={{ backgroundColor: detail.present ? themeColors.background : 'rgba(63, 63, 70, 0.3)', borderColor: themeColors.border }}
      title={detail.present ? '🎹 Clique para baixar MIDI' : undefined}
      onClick={detail.present ? onMidiClick : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white">{name}</span>
        {detail.present ? (
          <svg className="w-4 h-4" style={{ color: themeColors.primary }} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : (
          <span className="text-xs text-gray-500">ausente</span>
        )}
      </div>
      {detail.present && (
        <div className="space-y-1 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>Tipo:</span>
            <span className="text-white capitalize">{detail.type}</span>
          </div>
          <div className="flex justify-between">
            <span>Papel:</span>
            <span className="text-white capitalize">{detail.role}</span>
          </div>
          <div className="flex justify-between">
            <span>Padrão:</span>
            <span className="text-white capitalize">{detail.pattern}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────────────────────────

export default function MusicStudyModal({ isOpen, onClose }: MusicStudyModalProps) {
  const { playerState } = usePlayer();
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<TabType>('summary');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [themeColors, setThemeColors] = useState({
    primary: 'rgb(16, 185, 129)',
    primaryLight: 'rgba(16, 185, 129, 0.9)',
    primaryDark: 'rgba(16, 185, 129, 0.7)',
    background: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)'
  });

  const [midiDownloaded, setMidiDownloaded] = useState<string | null>(null);

  const currentFile = playerState.currentFile;
  const hasAnalysisRef = useRef<boolean>(false);

  // ── MIDI Download Handler ──
  const handleStemMidiDownload = useCallback((element: string, category: string, role: string, intensity: number) => {
    if (!analysis) return;
    const ctx: MidiGenerationContext = {
      element,
      category,
      role,
      intensity,
      bpm: analysis.bpm || 128,
      key: analysis.key || analysis.harmony?.key || undefined,
      genre: analysis.musicalIdentity?.genre,
      timeSignature: '4/4',
    };
    generateAndDownloadMidi(ctx);
    setMidiDownloaded(element);
    setTimeout(() => setMidiDownloaded(null), 2000);
  }, [analysis]);

  // Extrair cor dominante
  useEffect(() => {
    if (!currentFile || !isOpen) return;
    const extractColor = async () => {
      if (settings.disableDynamicColors) {
        setThemeColors({
          primary: 'rgb(16, 185, 129)',
          primaryLight: 'rgba(16, 185, 129, 0.9)',
          primaryDark: 'rgba(16, 185, 129, 0.7)',
          background: 'rgba(16, 185, 129, 0.15)',
          border: 'rgba(16, 185, 129, 0.4)'
        });
        return;
      }
      try {
        const thumbnailUrl = getThumbnailUrl(currentFile.name);
        const colorData = await getCachedDominantColor(thumbnailUrl);
        setThemeColors({
          primary: `rgb(${colorData.r}, ${colorData.g}, ${colorData.b})`,
          primaryLight: `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.9)`,
          primaryDark: `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.7)`,
          background: `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.15)`,
          border: `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.4)`
        });
      } catch (error) {
        console.warn('Erro ao extrair cor dominante:', error);
      }
    };
    extractColor();
  }, [currentFile?.name, isOpen, settings.disableDynamicColors]);

  // Chamar API de análise (com cache em localStorage)
  useEffect(() => {
    if (!isOpen || !currentFile) {
      setAnalysis(null);
      setIsAnalyzing(false);
      hasAnalysisRef.current = false;
      return;
    }

    const cacheKey = `legolas-analysis:${currentFile.name}`;

    // 1) Tentar recuperar do cache
    const cached = safeGetItem<FullAnalysis>(cacheKey);
    if (cached) {
      console.log('[MusicStudyModal] Análise carregada do cache:', currentFile.name);
      setAnalysis(cached);
      hasAnalysisRef.current = true;
      setIsAnalyzing(false);
      return;
    }

    // 2) Sem cache → buscar da API
    const fetchAnalysis = async () => {
      try {
        setIsAnalyzing(true);
        hasAnalysisRef.current = false;

        const timeoutId = setTimeout(() => {
          if (!hasAnalysisRef.current) {
            console.warn('[MusicStudyModal] Timeout da análise');
            setIsAnalyzing(false);
          }
        }, 130000);

        const response = await fetch('/api/analyze-music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: currentFile.name })
        });

        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (data.success && data.analysis) {
          const a = data.analysis;
          const analysisData: FullAnalysis = {
            bpm: a.bpm,
            key: a.key,
            duration: a.duration,
            analysisMethod: a.analysisMethod,
            frequencyAnalysis: a.frequencyAnalysis,
            loudness: a.loudness,
            musicalIdentity: a.musicalIdentity,
            grooveAndRhythm: a.grooveAndRhythm,
            drumElements: a.drumElements,
            bassElements: a.bassElements,
            synthLayers: a.synthLayers,
            harmony: a.harmony,
            structure: a.structure,
            dynamics: a.dynamics,
            mixAnalysis: a.mixAnalysis,
            djAnalysis: a.djAnalysis,
            executiveSummary: a.executiveSummary,
            temporalArrangement: a.temporalArrangement
          };

          setAnalysis(analysisData);
          hasAnalysisRef.current = true;

          // 3) Salvar no cache para reutilizar depois
          safeSetItem(cacheKey, analysisData, {
            maxSize: 512 * 1024, // 512KB limite por análise
            onError: (err) => console.warn('[MusicStudyModal] Cache não salvo:', err.message)
          });
        } else {
          throw new Error(data.error || 'Análise falhou');
        }
      } catch (error) {
        console.error('[MusicStudyModal] Erro:', error);
      } finally {
        setIsAnalyzing(false);
      }
    };

    fetchAnalysis();
  }, [isOpen, currentFile?.name]);

  if (!isOpen) return null;

  // ── TABS CONFIG ──
  const tabs: { id: TabType; label: string; short: string }[] = [
    { id: 'summary', label: 'Resumo', short: 'Resumo' },
    { id: 'identity', label: 'Identidade', short: 'ID' },
    { id: 'rhythm', label: 'Ritmo', short: 'BPM' },
    { id: 'drums', label: 'Bateria', short: 'Drums' },
    { id: 'bass', label: 'Bass', short: 'Bass' },
    { id: 'synths', label: 'Synths', short: 'Synths' },
    { id: 'harmony', label: 'Harmonia', short: 'Harm' },
    { id: 'structure', label: 'Estrutura', short: 'Struct' },
    { id: 'dynamics', label: 'Dinâmica', short: 'Dyn' },
    { id: 'mix', label: 'Mixagem', short: 'Mix' },
    { id: 'dj', label: 'DJ', short: 'DJ' },
    { id: 'arrangement', label: 'Arranjo', short: 'Arr' },
  ];

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Análise Profissional de Música Eletrônica"
      maxWidth="max-w-5xl"
      themeColors={themeColors}
    >
      {!currentFile ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg mb-4">Nenhuma música tocando</div>
          <p className="text-gray-500 text-sm">Reproduza uma música para ver a análise</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center gap-4 pb-4 border-b" style={{ borderColor: themeColors.border }}>
            <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
              <Image
                src={getThumbnailUrl(currentFile.name)}
                alt={currentFile.title || currentFile.displayName}
                fill
                className="object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-white truncate">
                {currentFile.title || currentFile.displayName}
              </h3>
              <p className="text-sm truncate" style={{ color: themeColors.primary }}>
                {currentFile.artist || 'Artista Desconhecido'}
              </p>
              {analysis?.musicalIdentity && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {analysis.musicalIdentity.genre} • {analysis.bpm} BPM • {analysis.key}
                </p>
              )}
            </div>
            {analysis?.analysisMethod && (
              <div className="text-xs px-2 py-1 rounded-full border" style={{ borderColor: themeColors.border, color: themeColors.primary }}>
                {analysis.analysisMethod === 'python' ? 'librosa' : 'ffmpeg'}
              </div>
            )}
          </div>

          {/* Tabs - scrollável */}
          <div className="flex gap-1 overflow-x-auto pb-1 border-b scrollbar-thin" style={{ borderColor: themeColors.border }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all border-b-2 flex-shrink-0 ${
                  activeTab === tab.id ? '' : 'opacity-50 hover:opacity-80'
                }`}
                style={{
                  color: activeTab === tab.id ? themeColors.primary : 'rgba(255, 255, 255, 0.6)',
                  borderBottomColor: activeTab === tab.id ? themeColors.primary : 'transparent'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Conteúdo */}
          <div className="min-h-[300px] max-h-[60vh] overflow-y-auto pr-1">
            {isAnalyzing ? (
              <div className="flex flex-col items-center justify-center py-16">
                <LoadingSpinner size="lg" themeColors={themeColors} isLoading={true} />
                <p className="text-gray-400 mt-4 text-sm">Analisando música com librosa...</p>
                <p className="text-gray-500 mt-1 text-xs">Isso pode levar até 2 minutos</p>
              </div>
            ) : analysis ? (
              <>
                {/* ── 11. RESUMO EXECUTIVO ── */}
                {activeTab === 'summary' && (
                  <div className="space-y-4">
                    {analysis.executiveSummary && (
                      <>
                        <div className="p-4 rounded-lg border" style={{ backgroundColor: themeColors.background, borderColor: themeColors.border }}>
                          <div className="text-sm font-semibold text-white mb-2">Identidade da Faixa</div>
                          <p className="text-sm text-gray-300">{analysis.executiveSummary.identity}</p>
                        </div>
                        <div className="p-4 rounded-lg border" style={{ backgroundColor: themeColors.background, borderColor: themeColors.border }}>
                          <div className="text-sm font-semibold text-white mb-2">Principal Diferencial</div>
                          <p className="text-sm text-gray-300">{analysis.executiveSummary.differential}</p>
                        </div>
                        <div className="p-4 rounded-lg border" style={{ backgroundColor: themeColors.background, borderColor: themeColors.border }}>
                          <div className="text-sm font-semibold text-white mb-2">Onde Funciona Melhor</div>
                          <p className="text-sm text-gray-300">{analysis.executiveSummary.worksBest}</p>
                        </div>
                      </>
                    )}
                    {/* Quick stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {analysis.bpm && <InfoCard label="BPM" value={analysis.bpm} themeColors={themeColors} large />}
                      {analysis.key && <InfoCard label="Tonalidade" value={analysis.key} themeColors={themeColors} large />}
                      {analysis.musicalIdentity && <InfoCard label="Energia" value={`${analysis.musicalIdentity.energyScore}%`} themeColors={themeColors} large />}
                      {analysis.grooveAndRhythm && <InfoCard label="Groove" value={analysis.grooveAndRhythm.grooveType} themeColors={themeColors} large />}
                    </div>
                    {/* Frequências resumo */}
                    {analysis.frequencyAnalysis && (
                      <div>
                        <div className="text-xs text-gray-400 mb-2 font-medium">Espectro de Frequências</div>
                        <div className="grid grid-cols-6 gap-1">
                          {[
                            { label: 'Sub', value: analysis.frequencyAnalysis.subBass },
                            { label: 'Bass', value: analysis.frequencyAnalysis.bass },
                            { label: 'LMid', value: analysis.frequencyAnalysis.lowMid },
                            { label: 'Mid', value: analysis.frequencyAnalysis.mid },
                            { label: 'HMid', value: analysis.frequencyAnalysis.highMid },
                            { label: 'High', value: analysis.frequencyAnalysis.high }
                          ].map(band => (
                            <div key={band.label} className="text-center">
                              <div className="h-16 flex items-end justify-center mb-1">
                                <div
                                  className="w-full rounded-t-sm"
                                  style={{
                                    height: `${Math.min(100, (band.value / 255) * 100)}%`,
                                    backgroundColor: themeColors.primary,
                                    opacity: 0.7
                                  }}
                                />
                              </div>
                              <div className="text-[10px] text-gray-500">{band.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── 1. IDENTIDADE MUSICAL ── */}
                {activeTab === 'identity' && analysis.musicalIdentity && (
                  <div className="space-y-4">
                    <SectionTitle
                      icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>}
                      title="Identidade Musical"
                      themeColors={themeColors}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <InfoCard label="Gênero Principal" value={analysis.musicalIdentity.genre} themeColors={themeColors} large />
                      <InfoCard label="Energia Geral" value={`${analysis.musicalIdentity.energyLevel} (${analysis.musicalIdentity.energyScore}%)`} themeColors={themeColors} large />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-2 font-medium">Subgêneros Prováveis</div>
                      <div className="flex flex-wrap gap-2">
                        {analysis.musicalIdentity.subgenres.map((sg, i) => <Tag key={i} text={sg} themeColors={themeColors} />)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-2 font-medium">Mood Emocional</div>
                      <div className="flex flex-wrap gap-2">
                        {analysis.musicalIdentity.mood.map((m, i) => <Tag key={i} text={m} themeColors={themeColors} />)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-2 font-medium">Contexto de Uso</div>
                      <div className="flex flex-wrap gap-2">
                        {analysis.musicalIdentity.context.map((c, i) => <Tag key={i} text={c} themeColors={themeColors} />)}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 2. BPM, GROOVE E RITMO ── */}
                {activeTab === 'rhythm' && analysis.grooveAndRhythm && (
                  <div className="space-y-4">
                    <SectionTitle
                      icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                      title="BPM, Groove e Ritmo"
                      themeColors={themeColors}
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <InfoCard label="BPM" value={analysis.grooveAndRhythm.bpm || 'N/A'} themeColors={themeColors} large />
                      <InfoCard label="Swing" value={`${analysis.grooveAndRhythm.swing}%`} themeColors={themeColors} />
                      <InfoCard label="Groove" value={analysis.grooveAndRhythm.grooveType} themeColors={themeColors} />
                      <InfoCard label="Complexidade Rítmica" value={analysis.grooveAndRhythm.rhythmicComplexity} themeColors={themeColors} />
                      <InfoCard label="Padrão Rítmico" value={analysis.grooveAndRhythm.rhythmicPattern} themeColors={themeColors} />
                    </div>
                  </div>
                )}

                {/* ── 3. ELEMENTOS DE BATERIA ── */}
                {activeTab === 'drums' && analysis.drumElements && (
                  <div className="space-y-4">
                    <SectionTitle
                      icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>}
                      title="Elementos de Bateria (Detalhado)"
                      themeColors={themeColors}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <DrumRow name="Kick" detail={analysis.drumElements.kick} themeColors={themeColors} onMidiClick={() => handleStemMidiDownload('Kick', 'Drums', analysis.drumElements!.kick.role, analysis.drumElements!.kick.energy)} />
                      <DrumRow name="Snare / Clap" detail={analysis.drumElements.snareClap} themeColors={themeColors} onMidiClick={() => handleStemMidiDownload('Snare/Clap', 'Drums', analysis.drumElements!.snareClap.role, analysis.drumElements!.snareClap.energy)} />
                      <DrumRow name="Hi-Hats" detail={analysis.drumElements.hihats} themeColors={themeColors} onMidiClick={() => handleStemMidiDownload('Hi-Hats', 'Drums', analysis.drumElements!.hihats.role, analysis.drumElements!.hihats.energy)} />
                      <DrumRow name="Cymbals / Rides" detail={analysis.drumElements.cymbalsRides} themeColors={themeColors} onMidiClick={() => handleStemMidiDownload('Cymbals/Rides', 'Drums', analysis.drumElements!.cymbalsRides.role, analysis.drumElements!.cymbalsRides.energy)} />
                      <DrumRow name="Percussões" detail={analysis.drumElements.percussion} themeColors={themeColors} onMidiClick={() => handleStemMidiDownload('Percussion', 'Drums', analysis.drumElements!.percussion.role, analysis.drumElements!.percussion.energy)} />
                      <DrumRow name="Fills / Transições" detail={analysis.drumElements.fills} themeColors={themeColors} onMidiClick={() => handleStemMidiDownload('Fills', 'Drums', analysis.drumElements!.fills.role, analysis.drumElements!.fills.energy)} />
                    </div>
                  </div>
                )}

                {/* ── 4. ELEMENTOS DE BASS ── */}
                {activeTab === 'bass' && analysis.bassElements && (
                  <div className="space-y-4">
                    <SectionTitle
                      icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>}
                      title="Elementos de Bass"
                      themeColors={themeColors}
                    />
                    {/* Sub Bass */}
                    <div
                      className={`p-4 rounded-lg border ${analysis.bassElements.subBass.present ? 'cursor-pointer hover:brightness-110 transition-all' : ''}`}
                      style={{ backgroundColor: themeColors.background, borderColor: themeColors.border }}
                      title={analysis.bassElements.subBass.present ? '🎹 Clique para baixar MIDI' : undefined}
                      onClick={analysis.bassElements.subBass.present ? () => handleStemMidiDownload('Sub Bass', 'Bass', 'base', analysis.bassElements!.subBass.energy) : undefined}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-white">Sub Bass (20-60Hz)</span>
                        {analysis.bassElements.subBass.present && (
                          <svg className="w-4 h-4" style={{ color: themeColors.primary }} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                        <div>Tipo: <span className="text-white capitalize">{analysis.bassElements.subBass.type}</span></div>
                        <div>Mono: <span className="text-white">{analysis.bassElements.subBass.mono ? 'Sim' : 'Não'}</span></div>
                        <div>Sidechain: <span className="text-white">{analysis.bassElements.subBass.sidechain ? 'Sim' : 'Não'}</span></div>
                        <div>Energia: <span className="text-white">{analysis.bassElements.subBass.energy}%</span></div>
                      </div>
                    </div>
                    {/* Mid Bass */}
                    <div
                      className={`p-4 rounded-lg border ${analysis.bassElements.midBass.present ? 'cursor-pointer hover:brightness-110 transition-all' : ''}`}
                      style={{ backgroundColor: themeColors.background, borderColor: themeColors.border }}
                      title={analysis.bassElements.midBass.present ? '🎹 Clique para baixar MIDI' : undefined}
                      onClick={analysis.bassElements.midBass.present ? () => handleStemMidiDownload('Mid Bass', 'Bass', 'groove', analysis.bassElements!.midBass.energy) : undefined}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-white">Mid Bass (60-250Hz)</span>
                        {analysis.bassElements.midBass.present && (
                          <svg className="w-4 h-4" style={{ color: themeColors.primary }} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                        <div>Textura: <span className="text-white capitalize">{analysis.bassElements.midBass.texture}</span></div>
                        <div>Movimento: <span className="text-white capitalize">{analysis.bassElements.midBass.movement}</span></div>
                        <div>Energia: <span className="text-white">{analysis.bassElements.midBass.energy}%</span></div>
                      </div>
                    </div>
                    {/* Bassline */}
                    <div
                      className={`p-4 rounded-lg border ${analysis.bassElements.bassline.present ? 'cursor-pointer hover:brightness-110 transition-all' : ''}`}
                      style={{ backgroundColor: themeColors.background, borderColor: themeColors.border }}
                      title={analysis.bassElements.bassline.present ? '🎹 Clique para baixar MIDI' : undefined}
                      onClick={analysis.bassElements.bassline.present ? () => handleStemMidiDownload('Bassline', 'Bass', 'groove', analysis.bassElements!.bassline.energy) : undefined}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-white">Bassline</span>
                        {analysis.bassElements.bassline.present && (
                          <svg className="w-4 h-4" style={{ color: themeColors.primary }} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                        <div>Tipo: <span className="text-white capitalize">{analysis.bassElements.bassline.type}</span></div>
                        <div>Energia: <span className="text-white">{analysis.bassElements.bassline.energy}%</span></div>
                      </div>
                    </div>
                    {/* Relação Kick x Bass */}
                    <InfoCard label="Relação Kick x Bass" value={analysis.bassElements.kickBassRelation} themeColors={themeColors} />
                  </div>
                )}

                {/* ── 5. SYNTHS E CAMADAS SONORAS ── */}
                {activeTab === 'synths' && analysis.synthLayers && (
                  <div className="space-y-4">
                    <SectionTitle
                      icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>}
                      title="Synths e Camadas Sonoras"
                      themeColors={themeColors}
                    />
                    {analysis.synthLayers.map((layer, i) => (
                      <div
                        key={i}
                        className="p-4 rounded-lg border cursor-pointer hover:brightness-110 transition-all"
                        style={{ backgroundColor: themeColors.background, borderColor: themeColors.border }}
                        title="🎹 Clique para baixar MIDI"
                        onClick={() => handleStemMidiDownload(layer.name, 'Synths', layer.function, layer.energy)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-white">{layer.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ backgroundColor: themeColors.border, color: themeColors.primary }}>
                            {layer.category}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                          <div>Função: <span className="text-white capitalize">{layer.function}</span></div>
                          <div>Movimento: <span className="text-white capitalize">{layer.movement}</span></div>
                          <div>Registro: <span className="text-white capitalize">{layer.register}</span></div>
                          <div>Energia: <span className="text-white">{layer.energy}%</span></div>
                        </div>
                        <div className="mt-2">
                          <ProgressBar value={layer.energy} themeColors={themeColors} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── 6. HARMONIA E TONALIDADE ── */}
                {activeTab === 'harmony' && analysis.harmony && (
                  <div className="space-y-4">
                    <SectionTitle
                      icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>}
                      title="Harmonia e Tonalidade"
                      themeColors={themeColors}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <InfoCard label="Tonalidade" value={analysis.harmony.key || 'N/A'} themeColors={themeColors} large />
                      <InfoCard label="Notas Ativas" value={analysis.harmony.activeNotes} themeColors={themeColors} large />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <InfoCard label="Uso Harmônico" value={analysis.harmony.harmonicUsage} themeColors={themeColors} />
                      <InfoCard label="Sensação Harmônica" value={analysis.harmony.harmonicFeeling} themeColors={themeColors} />
                    </div>
                  </div>
                )}

                {/* ── 7. ESTRUTURA DA MÚSICA ── */}
                {activeTab === 'structure' && analysis.structure && (
                  <div className="space-y-4">
                    <SectionTitle
                      icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                      title="Estrutura da Música (Timeline)"
                      themeColors={themeColors}
                    />

                    {/* Curva de Energia visual */}
                    {analysis.structure.energyCurve.length > 0 && (
                      <div className="p-4 rounded-lg border" style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderColor: themeColors.border }}>
                        <div className="text-xs text-gray-400 mb-2 font-medium">Curva de Energia</div>
                        <div className="flex items-end gap-0.5" style={{ height: '60px' }}>
                          {analysis.structure.energyCurve.map((point, i) => (
                            <div
                              key={i}
                              className="flex-1 rounded-t-sm transition-all"
                              style={{
                                height: `${Math.max(4, point.energy)}%`,
                                backgroundColor: themeColors.primary,
                                opacity: 0.5 + (point.energy / 200)
                              }}
                              title={`${Math.floor(point.time / 60)}:${String(Math.floor(point.time % 60)).padStart(2, '0')} - Energia: ${point.energy}%`}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Seções */}
                    {analysis.structure.sections.map((section, i) => (
                      <div key={i} className="p-4 rounded-lg border" style={{ backgroundColor: themeColors.background, borderColor: themeColors.border }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-white">{section.name}</span>
                          <span className="text-xs text-gray-400">{section.startFormatted} → {section.endFormatted}</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">{section.function}</p>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs text-gray-500">Energia:</span>
                          <div className="flex-1">
                            <ProgressBar value={section.energy} themeColors={themeColors} />
                          </div>
                          <span className="text-xs font-semibold" style={{ color: themeColors.primary }}>{section.energy}%</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {section.elementsEntering.map((el, j) => (
                            <span key={`in-${j}`} className="text-[10px] px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-800/30">
                              + {el}
                            </span>
                          ))}
                          {section.elementsExiting.map((el, j) => (
                            <span key={`out-${j}`} className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 border border-red-800/30">
                              - {el}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── 8. DINÂMICA E ARRANJO ── */}
                {activeTab === 'dynamics' && analysis.dynamics && (
                  <div className="space-y-4">
                    <SectionTitle
                      icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
                      title="Dinâmica e Arranjo"
                      themeColors={themeColors}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <InfoCard label="Evolução de Energia" value={analysis.dynamics.energyEvolution} themeColors={themeColors} />
                      <InfoCard label="Range Dinâmico" value={`${analysis.dynamics.dynamicRange}%`} themeColors={themeColors} />
                      <InfoCard label="Uso de Camadas" value={analysis.dynamics.layering} themeColors={themeColors} />
                      <InfoCard label="Previsibilidade" value={analysis.dynamics.predictability} themeColors={themeColors} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <InfoCard label="Momentos de Tensão" value={analysis.dynamics.tensionMoments} themeColors={themeColors} />
                      <InfoCard label="Momentos de Alívio" value={analysis.dynamics.reliefMoments} themeColors={themeColors} />
                    </div>
                    {/* Energia por quartos */}
                    <div className="p-4 rounded-lg border" style={{ backgroundColor: themeColors.background, borderColor: themeColors.border }}>
                      <div className="text-xs text-gray-400 mb-3 font-medium">Energia por Quartil da Música</div>
                      <div className="grid grid-cols-4 gap-3">
                        {['q1', 'q2', 'q3', 'q4'].map((q, i) => (
                          <div key={q} className="text-center">
                            <div className="text-xs text-gray-500 mb-1">{i === 0 ? '0-25%' : i === 1 ? '25-50%' : i === 2 ? '50-75%' : '75-100%'}</div>
                            <div className="h-16 flex items-end justify-center mb-1">
                              <div
                                className="w-full rounded-t-sm"
                                style={{
                                  height: `${analysis.dynamics.energyQuarters[q as keyof typeof analysis.dynamics.energyQuarters]}%`,
                                  backgroundColor: themeColors.primary,
                                  opacity: 0.7
                                }}
                              />
                            </div>
                            <div className="text-xs font-semibold" style={{ color: themeColors.primary }}>
                              {analysis.dynamics.energyQuarters[q as keyof typeof analysis.dynamics.energyQuarters]}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 9. MIXAGEM ── */}
                {activeTab === 'mix' && analysis.mixAnalysis && (
                  <div className="space-y-4">
                    <SectionTitle
                      icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>}
                      title="Análise de Mixagem (Perceptiva)"
                      themeColors={themeColors}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <InfoCard label="Espaço Estéreo" value={analysis.mixAnalysis.stereoWidth} themeColors={themeColors} />
                      <InfoCard label="Profundidade" value={analysis.mixAnalysis.depth} themeColors={themeColors} />
                      <InfoCard label="Clareza" value={analysis.mixAnalysis.clarity} themeColors={themeColors} />
                    </div>
                    {analysis.mixAnalysis.highlights.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-400 mb-2 font-medium">Destaques Sonoros</div>
                        <div className="flex flex-wrap gap-2">
                          {analysis.mixAnalysis.highlights.map((h, i) => <Tag key={i} text={h} themeColors={themeColors} />)}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-xs text-gray-400 mb-2 font-medium">Possíveis Pontos de Conflito</div>
                      <div className="space-y-1">
                        {analysis.mixAnalysis.conflicts.map((c, i) => (
                          <div key={i} className="text-sm text-gray-300 flex items-center gap-2">
                            <span className={c.includes('Nenhum') ? 'text-green-400' : 'text-yellow-400'}>
                              {c.includes('Nenhum') ? '✓' : '⚠'}
                            </span>
                            {c}
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Loudness */}
                    {analysis.loudness && (
                      <div className="grid grid-cols-2 gap-3">
                        <InfoCard label="Peak" value={`${analysis.loudness.peak} dB`} themeColors={themeColors} />
                        <InfoCard label="RMS" value={`${analysis.loudness.rms} dB`} themeColors={themeColors} />
                      </div>
                    )}
                  </div>
                )}

                {/* ── 10. ANÁLISE PARA DJ ── */}
                {activeTab === 'dj' && analysis.djAnalysis && (
                  <div className="space-y-4">
                    <SectionTitle
                      icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                      title="Análise para DJ"
                      themeColors={themeColors}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-4 rounded-lg border" style={{ backgroundColor: themeColors.background, borderColor: themeColors.border }}>
                        <div className="text-xs text-gray-400 mb-1">Facilidade de Mixagem</div>
                        <div className="text-lg font-bold capitalize" style={{ color: themeColors.primary }}>{analysis.djAnalysis.mixability}</div>
                        <p className="text-xs text-gray-400 mt-1">{analysis.djAnalysis.mixabilityDetail}</p>
                      </div>
                      <InfoCard label="Momento Ideal no Set" value={analysis.djAnalysis.setMoment} themeColors={themeColors} />
                    </div>

                    {/* Pontos de Entrada */}
                    <div>
                      <div className="text-xs text-gray-400 mb-2 font-medium">Pontos de Entrada</div>
                      <div className="space-y-1">
                        {analysis.djAnalysis.entryPoints.map((p, i) => (
                          <div key={i} className="flex items-center gap-3 p-2 rounded-lg" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
                            <span className="text-xs font-mono text-green-400 w-12">{p.timeFormatted}</span>
                            <span className="text-xs text-gray-300">{p.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pontos de Saída */}
                    <div>
                      <div className="text-xs text-gray-400 mb-2 font-medium">Pontos de Saída</div>
                      <div className="space-y-1">
                        {analysis.djAnalysis.exitPoints.map((p, i) => (
                          <div key={i} className="flex items-center gap-3 p-2 rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                            <span className="text-xs font-mono text-red-400 w-12">{p.timeFormatted}</span>
                            <span className="text-xs text-gray-300">{p.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Compatibilidade */}
                    <div>
                      <div className="text-xs text-gray-400 mb-2 font-medium">Compatibilidade com Outros Estilos</div>
                      <div className="flex flex-wrap gap-2">
                        {analysis.djAnalysis.compatibleStyles.map((s, i) => <Tag key={i} text={s} themeColors={themeColors} />)}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── ARRANJO (Timeline estilo Ableton) ── */}
                {activeTab === 'arrangement' && analysis.temporalArrangement && analysis.temporalArrangement.length > 0 && (
                  <div className="space-y-4">
                    <SectionTitle
                      icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>}
                      title="Arranjo da Música"
                      themeColors={themeColors}
                    />

                    {/* Timeline Container */}
                    <div
                      className="rounded-lg border p-4 overflow-x-auto"
                      style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', borderColor: themeColors.border }}
                    >
                      {(() => {
                        const totalDuration = analysis.duration || analysis.structure?.totalDuration || 300;
                        const interval = totalDuration > 300 ? 60 : totalDuration > 180 ? 30 : 15;
                        const markers: number[] = [];
                        for (let t = 0; t <= totalDuration; t += interval) markers.push(t);
                        if (markers[markers.length - 1] < totalDuration) markers.push(totalDuration);

                        // Group by category
                        const categories = ['Synths', 'Drums', 'Bass'];
                        const categoryLabels: Record<string, string> = { Synths: 'Synths', Drums: 'Bateria', Bass: 'Bass' };
                        const categoryColors: Record<string, Record<string, string>> = {
                          Synths: { base: themeColors.primary, groove: themeColors.primaryLight || themeColors.primary, textura: themeColors.primaryDark || themeColors.primary, impacto: '#f59e0b' },
                          Drums: { base: '#ef4444', groove: '#f97316', textura: '#eab308', impacto: '#84cc16' },
                          Bass: { base: '#3b82f6', groove: '#6366f1', textura: '#8b5cf6', impacto: '#a78bfa' }
                        };

                        const getColor = (cat: string, role: string) => {
                          return categoryColors[cat]?.[role] || categoryColors[cat]?.groove || themeColors.primary;
                        };

                        return (
                          <>
                            {/* Time Scale */}
                            <div className="mb-3 flex items-center gap-2">
                              <div className="w-36 flex-shrink-0 text-xs text-gray-500 font-medium">Elemento</div>
                              <div className="flex-1 relative" style={{ minWidth: '500px' }}>
                                <div className="flex justify-between text-[10px] text-gray-600 mb-1">
                                  {markers.map(time => (
                                    <span key={time}>{Math.floor(time / 60)}:{String(Math.floor(time % 60)).padStart(2, '0')}</span>
                                  ))}
                                </div>
                                <div className="relative h-px bg-gray-700">
                                  {markers.map(time => (
                                    <div
                                      key={time}
                                      className="absolute top-0 w-px h-2 bg-gray-600"
                                      style={{ left: `${(time / totalDuration) * 100}%` }}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Structure bar */}
                            {analysis.structure?.sections && (
                              <div className="mb-4 flex items-center gap-2">
                                <div className="w-36 flex-shrink-0 text-[10px] text-gray-500 font-medium">Estrutura</div>
                                <div className="flex-1 relative h-6 rounded overflow-hidden" style={{ minWidth: '500px' }}>
                                  {analysis.structure.sections.map((section, idx) => {
                                    const left = (section.start / totalDuration) * 100;
                                    const width = ((section.end - section.start) / totalDuration) * 100;
                                    const colors = [
                                      `${themeColors.primary}30`, `${themeColors.primary}45`,
                                      `${themeColors.primary}60`, `${themeColors.primary}30`,
                                      `${themeColors.primary}50`, `${themeColors.primary}25`
                                    ];
                                    return (
                                      <div
                                        key={idx}
                                        className="absolute h-full flex items-center justify-center text-[9px] font-semibold text-white/70 border-r border-gray-700/50"
                                        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: colors[idx % colors.length] }}
                                        title={`${section.name}: ${section.startFormatted} → ${section.endFormatted}`}
                                      >
                                        {width > 8 ? section.name : ''}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Tracks by category */}
                            {categories.map(cat => {
                              const items = analysis.temporalArrangement!.filter(el => el.category === cat);
                              if (items.length === 0) return null;
                              return (
                                <div key={cat} className="mb-3">
                                  <div className="text-[10px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                                    {categoryLabels[cat] || cat}
                                  </div>
                                  <div className="space-y-1">
                                    {items.map((item, idx) => {
                                      const left = (item.start / totalDuration) * 100;
                                      const width = Math.max(1, ((item.end - item.start) / totalDuration) * 100);
                                      const color = getColor(cat, item.role);
                                      const startMin = Math.floor(item.start / 60);
                                      const startSec = Math.floor(item.start % 60);
                                      const endMin = Math.floor(item.end / 60);
                                      const endSec = Math.floor(item.end % 60);
                                      return (
                                        <div key={idx} className="flex items-center gap-2">
                                          <div className="w-36 flex-shrink-0 text-[11px] text-gray-400 truncate" title={item.element}>
                                            {item.element}
                                          </div>
                                          <div className="flex-1 relative h-7" style={{ minWidth: '500px' }}>
                                            <div
                                              className="absolute h-full rounded-sm flex items-center px-1.5 text-[9px] font-medium text-white/90 shadow-sm cursor-pointer transition-all hover:brightness-125 hover:shadow-md"
                                              style={{
                                                left: `${left}%`,
                                                width: `${width}%`,
                                                backgroundColor: midiDownloaded === item.element ? '#22c55e' : color,
                                                opacity: 0.4 + (item.intensity / 170),
                                                minWidth: '4px'
                                              }}
                                              title={`${midiDownloaded === item.element ? '✓ MIDI baixado!\n' : '🎹 Clique para baixar MIDI\n'}${item.element}\n${startMin}:${String(startSec).padStart(2, '0')} → ${endMin}:${String(endSec).padStart(2, '0')}\nIntensidade: ${item.intensity}% | Papel: ${item.role}\nSeções: ${item.sections.join(', ')}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleStemMidiDownload(item.element, cat, item.role, item.intensity);
                                              }}
                                            >
                                              <span className="truncate">{width > 10 ? item.element : ''}</span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Legend */}
                            <div className="mt-4 pt-3 border-t border-gray-700/50">
                              <div className="flex flex-wrap gap-4 text-[10px] text-gray-500">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: themeColors.primary }} />
                                  <span>Synths</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
                                  <span>Bateria</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#3b82f6' }} />
                                  <span>Bass</span>
                                </div>
                                <span className="text-gray-600">|</span>
                                <span>base</span>
                                <span>groove</span>
                                <span>textura</span>
                                <span>impacto</span>
                              </div>
                              <p className="text-[10px] text-gray-600 mt-2">
                                Clique em qualquer bloco para baixar o padrão MIDI (.mid) compatível com Ableton Live.
                              </p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <p>Não foi possível realizar a análise</p>
                <p className="text-sm text-gray-500 mt-2">Verifique se o Python e librosa estão instalados</p>
              </div>
            )}
          </div>
        </div>
      )}
    </BaseModal>
  );
}
