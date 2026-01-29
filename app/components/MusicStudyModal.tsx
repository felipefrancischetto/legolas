'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import BaseModal from './BaseModal';
import { usePlayer } from '../contexts/PlayerContext';
import { getThumbnailUrl } from '../utils/thumbnailCache';
import { getCachedDominantColor } from '../utils/colorExtractor';
import { useSettings } from '../hooks/useSettings';
import LoadingSpinner from './LoadingSpinner';
import { useAudioAnalysis } from '../hooks/useAudioAnalysis';

interface MusicStudyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ArrangementElement {
  name: string;
  type: 'synth' | 'instrument' | 'drum' | 'bass';
  startTime: number; // em segundos
  endTime: number; // em segundos
  color?: string;
}

interface MusicAnalysis {
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
  structure: {
    intro: number;
    breakdown: number;
    drop: number;
    outro: number;
  };
  arrangement?: ArrangementElement[];
  characteristics?: {
    brightness: number;
    warmth: number;
    punch: number;
    texture: string;
    attack: string;
    sustain: string;
    harmonics: number;
  };
  frequencyData?: {
    subBass: number;
    bass: number;
    lowMid: number;
    mid: number;
    highMid: number;
    high: number;
  };
}

type TabType = 'analysis' | 'details' | 'arrangement';

/**
 * Retorna cor para elemento baseado no tipo e nome
 */
function getColorForElement(
  type: 'synth' | 'instrument' | 'drum' | 'bass',
  name: string,
  themeColors: { primary: string; primaryLight: string; primaryDark: string }
): string {
  if (type === 'synth') {
    if (name.includes('Pad') || name.includes('Atmosférico')) {
      return themeColors.primaryLight;
    } else if (name.includes('Lead') || name.includes('Metálico') || name.includes('Brilhante')) {
      return themeColors.primary;
    } else {
      return themeColors.primaryDark;
    }
  } else if (type === 'instrument') {
    if (name.includes('Piano')) return '#60a5fa';
    if (name.includes('Strings')) return '#a78bfa';
    if (name.includes('Brass')) return '#fbbf24';
    return '#60a5fa';
  } else if (type === 'drum') {
    if (name.includes('Kick')) return '#ef4444';
    if (name.includes('Snare')) return '#f97316';
    if (name.includes('Hi-Hat') || name.includes('Hihat')) return '#eab308';
    if (name.includes('Cymbals')) return '#84cc16';
    return '#22c55e';
  } else if (type === 'bass') {
    if (name.includes('Sub')) return '#3b82f6';
    if (name.includes('Mid')) return '#6366f1';
    return '#8b5cf6';
  }
  return themeColors.primary;
}

/**
 * Gera arranjo baseado nos elementos detectados
 */
function generateArrangementFromElements(
  elements: {
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
  },
  duration: number,
  themeColors: { primary: string; primaryLight: string; primaryDark: string }
): ArrangementElement[] {
  const arrangement: ArrangementElement[] = [];
  const intro = Math.min(16, duration * 0.125);
  const breakdown = Math.min(32, duration * 0.25);
  const outro = Math.min(16, duration * 0.125);

  // Adicionar synths
  elements.synths.forEach((synth, idx) => {
    if (synth.includes('Pad') || synth.includes('Atmosférico')) {
      arrangement.push({
        name: synth,
        type: 'synth',
        startTime: 0,
        endTime: duration - outro,
        color: themeColors.primaryLight
      });
    } else if (synth.includes('Lead') || synth.includes('Metálico')) {
      arrangement.push({
        name: synth,
        type: 'synth',
        startTime: intro,
        endTime: duration - outro,
        color: themeColors.primary
      });
    } else {
      arrangement.push({
        name: synth,
        type: 'synth',
        startTime: intro + breakdown,
        endTime: duration - outro,
        color: themeColors.primaryDark
      });
    }
  });

  // Adicionar instrumentos
  elements.instruments.forEach((instrument, idx) => {
    const startTime = intro + (breakdown * idx / Math.max(1, elements.instruments.length));
    arrangement.push({
      name: instrument,
      type: 'instrument',
      startTime,
      endTime: duration - outro,
      color: idx === 0 ? '#60a5fa' : idx === 1 ? '#a78bfa' : '#fbbf24'
    });
  });

  // Adicionar bateria
  if (elements.drumElements.kick) {
    arrangement.push({
      name: 'Kick',
      type: 'drum',
      startTime: intro,
      endTime: duration - outro,
      color: '#ef4444'
    });
  }
  if (elements.drumElements.snare) {
    arrangement.push({
      name: 'Snare',
      type: 'drum',
      startTime: intro + breakdown / 4,
      endTime: duration - outro,
      color: '#f97316'
    });
  }
  if (elements.drumElements.hihat) {
    arrangement.push({
      name: 'Hi-Hat',
      type: 'drum',
      startTime: intro,
      endTime: duration - outro,
      color: '#eab308'
    });
  }
  if (elements.drumElements.cymbals) {
    arrangement.push({
      name: 'Cymbals',
      type: 'drum',
      startTime: intro + breakdown,
      endTime: duration - outro,
      color: '#84cc16'
    });
  }
  if (elements.drumElements.percussion) {
    arrangement.push({
      name: 'Percussão',
      type: 'drum',
      startTime: intro + breakdown / 2,
      endTime: duration - outro,
      color: '#22c55e'
    });
  }

  // Adicionar bass
  if (elements.bassElements.subBass) {
    arrangement.push({
      name: 'Sub Bass',
      type: 'bass',
      startTime: intro,
      endTime: duration - outro,
      color: '#3b82f6'
    });
  }
  if (elements.bassElements.midBass) {
    arrangement.push({
      name: 'Mid Bass',
      type: 'bass',
      startTime: intro + breakdown / 2,
      endTime: duration - outro,
      color: '#6366f1'
    });
  }
  if (elements.bassElements.bassline) {
    arrangement.push({
      name: 'Bassline',
      type: 'bass',
      startTime: intro,
      endTime: duration - outro,
      color: '#8b5cf6'
    });
  }

  return arrangement;
}

export default function MusicStudyModal({ isOpen, onClose }: MusicStudyModalProps) {
  const { playerState } = usePlayer();
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<TabType>('analysis');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<MusicAnalysis | null>(null);
  const [themeColors, setThemeColors] = useState({
    primary: 'rgb(16, 185, 129)',
    primaryLight: 'rgba(16, 185, 129, 0.9)',
    primaryDark: 'rgba(16, 185, 129, 0.7)',
    background: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)'
  });

  const currentFile = playerState.currentFile;
  const analysisAudioRef = useRef<HTMLAudioElement | null>(null);
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasAnalysisRef = useRef<boolean>(false);

  // Usar análise real de áudio
  const { analysis: realAnalysis, isReady: analysisReady } = useAudioAnalysis(
    analysisAudioRef.current,
    isOpen && !!currentFile && isAnalyzing
  );

  // Extrair cor dominante quando arquivo muda
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
        const r = colorData.r;
        const g = colorData.g;
        const b = colorData.b;
        
        setThemeColors({
          primary: `rgb(${r}, ${g}, ${b})`,
          primaryLight: `rgba(${r}, ${g}, ${b}, 0.9)`,
          primaryDark: `rgba(${r}, ${g}, ${b}, 0.7)`,
          background: `rgba(${r}, ${g}, ${b}, 0.15)`,
          border: `rgba(${r}, ${g}, ${b}, 0.4)`
        });
      } catch (error) {
        console.warn('Erro ao extrair cor dominante:', error);
      }
    };
    
    extractColor();
  }, [currentFile?.name, isOpen, settings.disableDynamicColors]);

  // Chamar API de análise quando modal abrir
  useEffect(() => {
    if (!isOpen || !currentFile) {
      // Limpar estado quando modal fechar
      setAnalysis(null);
      setIsAnalyzing(false);
      hasAnalysisRef.current = false;
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
        analysisTimeoutRef.current = null;
      }
      return;
    }

    // Chamar API de análise imediatamente
    const fetchAnalysis = async () => {
      try {
        console.log('[MusicStudyModal] 🎵 Chamando API de análise...', {
          filename: currentFile.name
        });
        
        setIsAnalyzing(true);
        hasAnalysisRef.current = false;
        
        // Timeout de segurança (30 segundos)
        const timeoutId = setTimeout(() => {
          if (!hasAnalysisRef.current) {
            console.warn('[MusicStudyModal] ⚠️ Timeout: Análise da API demorou mais de 30 segundos');
            setIsAnalyzing(false);
          }
        }, 30000);
        
        const response = await fetch('/api/analyze-music', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: currentFile.name
          })
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.success && data.analysis) {
          console.log('[MusicStudyModal] ✅ Análise recebida da API:', data.analysis);
          
          // Converter análise da API para formato do componente
          const apiAnalysis = data.analysis;
          
          // Usar duração real da música
          const realDuration = apiAnalysis.duration || (currentFile.duration ? parseFloat(currentFile.duration.split(':').reduce((acc, time, i) => acc + parseFloat(time) * Math.pow(60, 1 - i), 0).toString()) : 128);
          
          setAnalysis({
            synths: apiAnalysis.detectedElements.synths || [],
            instruments: apiAnalysis.detectedElements.instruments || [],
            drumElements: apiAnalysis.detectedElements.drumElements || {
              kick: false,
              snare: false,
              hihat: false,
              cymbals: false,
              percussion: false
            },
            bassElements: apiAnalysis.detectedElements.bassElements || {
              subBass: false,
              midBass: false,
              bassline: false
            },
            structure: apiAnalysis.structure || {
              intro: 0,
              breakdown: 0,
              drop: 0,
              outro: 0
            },
            arrangement: (apiAnalysis.temporalArrangement && apiAnalysis.temporalArrangement.length > 0)
              ? apiAnalysis.temporalArrangement.map(el => ({
                  name: el.name,
                  type: el.type,
                  startTime: el.startTime,
                  endTime: el.endTime,
                  color: getColorForElement(el.type, el.name, themeColors)
                }))
              : generateArrangementFromElements(
                  apiAnalysis.detectedElements,
                  realDuration,
                  themeColors
                ),
            characteristics: undefined, // API não retorna isso ainda
            frequencyData: {
              subBass: apiAnalysis.frequencyAnalysis.subBass || 0,
              bass: apiAnalysis.frequencyAnalysis.bass || 0,
              lowMid: apiAnalysis.frequencyAnalysis.lowMid || 0,
              mid: apiAnalysis.frequencyAnalysis.mid || 0,
              highMid: apiAnalysis.frequencyAnalysis.highMid || 0,
              high: apiAnalysis.frequencyAnalysis.high || 0
            }
          });
          
          hasAnalysisRef.current = true;
          setIsAnalyzing(false);
          
          console.log('[MusicStudyModal] ✅ Análise completa da API');
        } else {
          throw new Error(data.error || 'Análise não retornou dados válidos');
        }
      } catch (error) {
        console.error('[MusicStudyModal] ❌ Erro ao chamar API de análise:', error);
        setIsAnalyzing(false);
        // Continuar tentando com análise do navegador como fallback
      }
    };

    fetchAnalysis();
    
    // Cleanup
    return () => {
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
        analysisTimeoutRef.current = null;
      }
    };
  }, [isOpen, currentFile?.name, themeColors]);

  // Configurar elemento de áudio para análise (fallback/complemento)
  useEffect(() => {
    console.log('[MusicStudyModal] Configurando áudio para análise', {
      isOpen,
      hasCurrentFile: !!currentFile,
      currentFileName: currentFile?.name
    });

    if (!isOpen || !currentFile) {
      console.log('[MusicStudyModal] Modal fechado ou sem arquivo - limpando');
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
        analysisTimeoutRef.current = null;
      }
      if (analysisAudioRef.current) {
        analysisAudioRef.current.pause();
        analysisAudioRef.current.src = '';
      }
      return;
    }

    // Criar elemento de áudio oculto para análise
    if (!analysisAudioRef.current) {
      console.log('[MusicStudyModal] Criando novo elemento de áudio...');
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      // IMPORTANTE: Volume 0 pode impedir a análise de frequência em alguns navegadores
      // Vamos usar um volume muito baixo mas não zero
      audio.volume = 0.01; // Volume muito baixo para não interferir, mas não zero
      audio.muted = false; // Não mutar - o volume baixo já é suficiente
      analysisAudioRef.current = audio;
      console.log('[MusicStudyModal] Elemento de áudio criado com volume:', audio.volume);
    }

    const audioUrl = `/api/downloads/${encodeURIComponent(currentFile.name)}`;
    console.log('[MusicStudyModal] Configurando URL do áudio:', audioUrl);
    analysisAudioRef.current.src = audioUrl;
    
    // Não setar isAnalyzing aqui - já está sendo setado pela chamada da API
    // O áudio aqui é apenas para análise complementar do navegador

    // Aguardar carregamento do áudio
    const handleCanPlay = async () => {
      console.log('[MusicStudyModal] 🎵 handleCanPlay chamado', {
        readyState: analysisAudioRef.current?.readyState,
        duration: analysisAudioRef.current?.duration,
        paused: analysisAudioRef.current?.paused,
        src: analysisAudioRef.current?.src?.substring(0, 100)
      });

      // Reproduzir silenciosamente para análise
      if (analysisAudioRef.current) {
        analysisAudioRef.current.volume = 0;
        analysisAudioRef.current.loop = false;
        
        // Aguardar um pouco para garantir que o áudio está pronto
        await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
          console.log('[MusicStudyModal] Tentando reproduzir áudio para análise...', {
            readyState: analysisAudioRef.current.readyState,
            paused: analysisAudioRef.current.paused
          });
          
          // Tentar reproduzir - pode falhar em alguns navegadores devido a políticas de autoplay
          const playPromise = analysisAudioRef.current.play();
          if (playPromise !== undefined) {
            await playPromise.then(() => {
              console.log('[MusicStudyModal] ✅ Áudio reproduzindo para análise');
            }).catch((error) => {
              // Se falhar, tentar novamente após interação do usuário
              console.warn('[MusicStudyModal] ⚠️ Não foi possível reproduzir áudio para análise automaticamente:', error);
              console.warn('[MusicStudyModal] 💡 Dica: O áudio precisa estar tocando para análise funcionar. Tente clicar em play no player principal.');
              // Manter isAnalyzing como true mesmo se não conseguir tocar - a análise pode funcionar com dados carregados
            });
          }
          
          // Verificar se realmente está tocando após tentar play
          setTimeout(() => {
            console.log('[MusicStudyModal] Status após play:', {
              paused: analysisAudioRef.current?.paused,
              ended: analysisAudioRef.current?.ended,
              currentTime: analysisAudioRef.current?.currentTime,
              readyState: analysisAudioRef.current?.readyState,
              volume: analysisAudioRef.current?.volume,
              muted: analysisAudioRef.current?.muted
            });
            
            // Se ainda estiver pausado após tentar play, pode ser problema de autoplay
            if (analysisAudioRef.current?.paused) {
              console.warn('[MusicStudyModal] ⚠️ Áudio ainda pausado após tentar play. Pode ser bloqueio de autoplay do navegador.');
              console.warn('[MusicStudyModal] 💡 Solução: O áudio precisa estar tocando no player principal para análise funcionar.');
            }
          }, 500);
          
          // Verificar novamente após mais tempo para garantir que está tocando
          setTimeout(() => {
            if (analysisAudioRef.current && !analysisAudioRef.current.paused) {
              console.log('[MusicStudyModal] ✅ Áudio confirmado tocando após 1s');
            } else {
              console.warn('[MusicStudyModal] ⚠️ Áudio não está tocando após 1s');
            }
          }, 1000);
          
          // Manter isAnalyzing como true para análise contínua
          // A análise só para quando o modal fechar ou música mudar
        } catch (error) {
          console.warn('[MusicStudyModal] ❌ Erro ao configurar áudio para análise:', error);
          // Não setar isAnalyzing como false aqui - deixar tentar mesmo sem tocar
        }
      }
    };

    const handleLoadedMetadata = () => {
      console.log('[MusicStudyModal] 📋 Metadata carregada', {
        readyState: analysisAudioRef.current?.readyState,
        duration: analysisAudioRef.current?.duration
      });
      // Garantir que o áudio está pronto
      if (analysisAudioRef.current && analysisAudioRef.current.readyState >= 2) {
        console.log('[MusicStudyModal] ✅ ReadyState >= 2, chamando handleCanPlay');
        handleCanPlay();
      } else {
        console.log('[MusicStudyModal] ⏳ ReadyState ainda não está pronto:', analysisAudioRef.current?.readyState);
      }
    };

    const handleError = (event: Event) => {
      console.error('[MusicStudyModal] ❌ Erro ao carregar áudio para análise', {
        error: event,
        errorType: event.type,
        src: analysisAudioRef.current?.src
      });
      setIsAnalyzing(false);
    };

    analysisAudioRef.current.addEventListener('canplay', handleCanPlay);
    analysisAudioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
    analysisAudioRef.current.addEventListener('error', handleError);
    
    // Tentar carregar
    analysisAudioRef.current.load();

    // Se já estiver carregado, iniciar análise imediatamente
    if (analysisAudioRef.current.readyState >= 2) {
      handleCanPlay();
    }

    return () => {
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
        analysisTimeoutRef.current = null;
      }
      if (analysisAudioRef.current) {
        analysisAudioRef.current.removeEventListener('canplay', handleCanPlay);
        analysisAudioRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
        analysisAudioRef.current.removeEventListener('error', handleError);
        analysisAudioRef.current.pause();
      }
    };
  }, [isOpen, currentFile?.name]);

  // Usar análise do navegador como complemento (opcional)
  // A análise principal vem da API, mas podemos complementar com dados em tempo real
  useEffect(() => {
    // Só usar análise do navegador se já temos análise da API
    // Isso serve como complemento/atualização em tempo real
    if (realAnalysis && analysisReady && analysis) {
      console.log('[MusicStudyModal] 📊 Complementando análise com dados do navegador...');
      
      // Atualizar apenas se não temos dados completos da API
      // Ou se queremos atualizar dados em tempo real (como frequências)
      if (realAnalysis.frequencyData) {
        setAnalysis(prev => prev ? {
          ...prev,
          frequencyData: realAnalysis.frequencyData,
          characteristics: realAnalysis.characteristics ? {
            brightness: realAnalysis.characteristics.brightness,
            warmth: realAnalysis.characteristics.warmth,
            punch: realAnalysis.characteristics.punch,
            texture: realAnalysis.characteristics.texture,
            attack: realAnalysis.characteristics.attack,
            sustain: realAnalysis.characteristics.sustain,
            harmonics: realAnalysis.characteristics.harmonics
          } : prev.characteristics,
          arrangement: realAnalysis.arrangement.length > 0 ? realAnalysis.arrangement.map(el => {
            if (el.type === 'synth') {
              if (el.name.includes('Pad') || el.name.includes('Atmosférico')) {
                return { ...el, color: themeColors.primaryLight };
              } else if (el.name.includes('Lead') || el.name.includes('Metálico')) {
                return { ...el, color: themeColors.primary };
              } else if (el.name.includes('Pluck')) {
                return { ...el, color: themeColors.primaryDark };
              }
            }
            return el;
          }) : prev.arrangement
        } : prev);
      }
    }
  }, [realAnalysis, analysisReady, themeColors, analysis]);

  if (!isOpen) return null;

  return (
    <>
      {/* Elemento de áudio oculto para análise */}
      {currentFile && (
        <audio
          ref={analysisAudioRef}
          style={{ display: 'none' }}
          crossOrigin="anonymous"
          preload="auto"
          muted
        />
      )}
      
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        title="Análise de Música Eletrônica"
        maxWidth="max-w-4xl"
        themeColors={themeColors}
      >
      {!currentFile ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg mb-4">
            Nenhuma música tocando
          </div>
          <p className="text-gray-500 text-sm">
            Reproduza uma música para ver a análise
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Header com informações da música */}
          <div className="flex items-center gap-4 pb-4 border-b" style={{ borderColor: themeColors.border }}>
            {currentFile && (
              <>
                <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                  <Image
                    src={getThumbnailUrl(currentFile.name)}
                    alt={currentFile.title || currentFile.displayName}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-white truncate">
                    {currentFile.title || currentFile.displayName}
                  </h3>
                  <p className="text-sm mt-1 truncate" style={{ color: themeColors.primary }}>
                    {currentFile.artist || 'Artista Desconhecido'}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b" style={{ borderColor: themeColors.border }}>
            <button
              onClick={() => setActiveTab('analysis')}
              className={`px-4 py-2 text-sm font-medium transition-all duration-200 border-b-2 ${
                activeTab === 'analysis' ? '' : 'opacity-60 hover:opacity-80'
              }`}
              style={{
                color: activeTab === 'analysis' ? themeColors.primary : 'rgba(255, 255, 255, 0.6)',
                borderBottomColor: activeTab === 'analysis' ? themeColors.primary : 'transparent'
              }}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Análise
              </span>
            </button>
            <button
              onClick={() => setActiveTab('details')}
              className={`px-4 py-2 text-sm font-medium transition-all duration-200 border-b-2 ${
                activeTab === 'details' ? '' : 'opacity-60 hover:opacity-80'
              }`}
              style={{
                color: activeTab === 'details' ? themeColors.primary : 'rgba(255, 255, 255, 0.6)',
                borderBottomColor: activeTab === 'details' ? themeColors.primary : 'transparent'
              }}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Detalhes
              </span>
            </button>
            <button
              onClick={() => setActiveTab('arrangement')}
              className={`px-4 py-2 text-sm font-medium transition-all duration-200 border-b-2 ${
                activeTab === 'arrangement' ? '' : 'opacity-60 hover:opacity-80'
              }`}
              style={{
                color: activeTab === 'arrangement' ? themeColors.primary : 'rgba(255, 255, 255, 0.6)',
                borderBottomColor: activeTab === 'arrangement' ? themeColors.primary : 'transparent'
              }}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Arranjo
              </span>
            </button>
          </div>

          {/* Conteúdo da análise */}
          {isAnalyzing ? (
            <div className="flex flex-col items-center justify-center py-16">
              <LoadingSpinner size="lg" themeColors={themeColors} isLoading={true} />
              <p className="text-gray-400 mt-4 text-sm">
                Analisando elementos da música...
              </p>
            </div>
          ) : analysis ? (
            <>
              {activeTab === 'analysis' && (
                <div className="space-y-6">
              {/* Synths */}
              <div>
                <h4 
                  className="text-lg font-semibold mb-3 flex items-center gap-2"
                  style={{ color: themeColors.primary }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  Synths Identificados
                </h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.synths.map((synth, index) => (
                    <span
                      key={index}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium border"
                      style={{
                        backgroundColor: themeColors.background,
                        color: themeColors.primary,
                        borderColor: themeColors.border
                      }}
                    >
                      {synth}
                    </span>
                  ))}
                </div>
              </div>

              {/* Instrumentos */}
              <div>
                <h4 
                  className="text-lg font-semibold mb-3 flex items-center gap-2"
                  style={{ color: themeColors.primary }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  Instrumentos
                </h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.instruments.map((instrument, index) => (
                    <span
                      key={index}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium border"
                      style={{
                        backgroundColor: themeColors.background,
                        color: themeColors.primary,
                        borderColor: themeColors.border
                      }}
                    >
                      {instrument}
                    </span>
                  ))}
                </div>
              </div>

              {/* Elementos da Bateria */}
              <div>
                <h4 
                  className="text-lg font-semibold mb-3 flex items-center gap-2"
                  style={{ color: themeColors.primary }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  Elementos da Bateria
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(analysis.drumElements).map(([key, value]) => (
                    <div
                      key={key}
                      className={`px-4 py-3 rounded-lg border flex items-center justify-between ${
                        value ? 'opacity-100' : 'opacity-50'
                      }`}
                      style={{
                        backgroundColor: value ? themeColors.background : 'rgba(63, 63, 70, 0.3)',
                        borderColor: themeColors.border
                      }}
                    >
                      <span className="text-sm font-medium text-white capitalize">
                        {key === 'hihat' ? 'Hi-Hat' : key === 'subBass' ? 'Sub Bass' : key === 'midBass' ? 'Mid Bass' : key}
                      </span>
                      {value && (
                        <svg className="w-5 h-5" style={{ color: themeColors.primary }} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Elementos de Bass */}
              <div>
                <h4 
                  className="text-lg font-semibold mb-3 flex items-center gap-2"
                  style={{ color: themeColors.primary }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  Elementos de Bass
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Object.entries(analysis.bassElements).map(([key, value]) => (
                    <div
                      key={key}
                      className={`px-4 py-3 rounded-lg border flex items-center justify-between ${
                        value ? 'opacity-100' : 'opacity-50'
                      }`}
                      style={{
                        backgroundColor: value ? themeColors.background : 'rgba(63, 63, 70, 0.3)',
                        borderColor: themeColors.border
                      }}
                    >
                      <span className="text-sm font-medium text-white capitalize">
                        {key === 'subBass' ? 'Sub Bass' : key === 'midBass' ? 'Mid Bass' : key}
                      </span>
                      {value && (
                        <svg className="w-5 h-5" style={{ color: themeColors.primary }} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Estrutura da Música */}
              <div>
                <h4 
                  className="text-lg font-semibold mb-3 flex items-center gap-2"
                  style={{ color: themeColors.primary }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Estrutura da Música
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(analysis.structure).map(([key, value]) => (
                    <div
                      key={key}
                      className="px-4 py-3 rounded-lg border text-center"
                      style={{
                        backgroundColor: themeColors.background,
                        borderColor: themeColors.border
                      }}
                    >
                      <div className="text-xs text-gray-400 mb-1 capitalize">{key}</div>
                      <div className="text-lg font-bold" style={{ color: themeColors.primary }}>
                        {value}s
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Características do Áudio */}
              {analysis.characteristics && (
                <div>
                  <h4 
                    className="text-lg font-semibold mb-3 flex items-center gap-2"
                    style={{ color: themeColors.primary }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Características do Som
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div 
                      className="p-3 rounded-lg border"
                      style={{
                        backgroundColor: themeColors.background,
                        borderColor: themeColors.border
                      }}
                    >
                      <div className="text-xs text-gray-400 mb-1">Brilho</div>
                      <div className="text-lg font-bold" style={{ color: themeColors.primary }}>
                        {Math.round(analysis.characteristics.brightness)}%
                      </div>
                    </div>
                    <div 
                      className="p-3 rounded-lg border"
                      style={{
                        backgroundColor: themeColors.background,
                        borderColor: themeColors.border
                      }}
                    >
                      <div className="text-xs text-gray-400 mb-1">Calor</div>
                      <div className="text-lg font-bold" style={{ color: themeColors.primary }}>
                        {Math.round(analysis.characteristics.warmth)}%
                      </div>
                    </div>
                    <div 
                      className="p-3 rounded-lg border"
                      style={{
                        backgroundColor: themeColors.background,
                        borderColor: themeColors.border
                      }}
                    >
                      <div className="text-xs text-gray-400 mb-1">Punch</div>
                      <div className="text-lg font-bold" style={{ color: themeColors.primary }}>
                        {Math.round(analysis.characteristics.punch)}%
                      </div>
                    </div>
                    <div 
                      className="p-3 rounded-lg border"
                      style={{
                        backgroundColor: themeColors.background,
                        borderColor: themeColors.border
                      }}
                    >
                      <div className="text-xs text-gray-400 mb-1">Textura</div>
                      <div className="text-sm font-semibold text-white capitalize">
                        {analysis.characteristics.texture === 'metallic' ? 'Metálica' :
                         analysis.characteristics.texture === 'gritty' ? 'Granulada' :
                         analysis.characteristics.texture === 'organic' ? 'Orgânica' :
                         analysis.characteristics.texture === 'digital' ? 'Digital' : 'Suave'}
                      </div>
                    </div>
                    <div 
                      className="p-3 rounded-lg border"
                      style={{
                        backgroundColor: themeColors.background,
                        borderColor: themeColors.border
                      }}
                    >
                      <div className="text-xs text-gray-400 mb-1">Ataque</div>
                      <div className="text-sm font-semibold text-white capitalize">
                        {analysis.characteristics.attack === 'fast' ? 'Rápido' :
                         analysis.characteristics.attack === 'slow' ? 'Lento' : 'Médio'}
                      </div>
                    </div>
                    <div 
                      className="p-3 rounded-lg border"
                      style={{
                        backgroundColor: themeColors.background,
                        borderColor: themeColors.border
                      }}
                    >
                      <div className="text-xs text-gray-400 mb-1">Sustain</div>
                      <div className="text-sm font-semibold text-white capitalize">
                        {analysis.characteristics.sustain === 'long' ? 'Longo' :
                         analysis.characteristics.sustain === 'short' ? 'Curto' : 'Médio'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
              )}

              {activeTab === 'details' && (
                <div className="space-y-6">
                  {/* Informações Técnicas Detalhadas */}
                  <div>
                    <h4 
                      className="text-lg font-semibold mb-4 flex items-center gap-2"
                      style={{ color: themeColors.primary }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Informações Técnicas
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {currentFile.bpm && (
                        <div 
                          className="p-4 rounded-lg border"
                          style={{
                            backgroundColor: themeColors.background,
                            borderColor: themeColors.border
                          }}
                        >
                          <div className="text-xs text-gray-400 mb-1">BPM</div>
                          <div className="text-2xl font-bold" style={{ color: themeColors.primary }}>
                            {currentFile.bpm}
                          </div>
                        </div>
                      )}
                      {currentFile.key && (
                        <div 
                          className="p-4 rounded-lg border"
                          style={{
                            backgroundColor: themeColors.background,
                            borderColor: themeColors.border
                          }}
                        >
                          <div className="text-xs text-gray-400 mb-1">Tonalidade</div>
                          <div className="text-2xl font-bold" style={{ color: themeColors.primary }}>
                            {currentFile.key}
                          </div>
                        </div>
                      )}
                      {currentFile.genre && (
                        <div 
                          className="p-4 rounded-lg border"
                          style={{
                            backgroundColor: themeColors.background,
                            borderColor: themeColors.border
                          }}
                        >
                          <div className="text-xs text-gray-400 mb-1">Gênero</div>
                          <div className="text-lg font-semibold text-white">
                            {currentFile.genre}
                          </div>
                        </div>
                      )}
                      {currentFile.label && (
                        <div 
                          className="p-4 rounded-lg border"
                          style={{
                            backgroundColor: themeColors.background,
                            borderColor: themeColors.border
                          }}
                        >
                          <div className="text-xs text-gray-400 mb-1">Gravadora</div>
                          <div className="text-lg font-semibold text-white">
                            {currentFile.label}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Análise de Frequências */}
                  <div>
                    <h4 
                      className="text-lg font-semibold mb-4 flex items-center gap-2"
                      style={{ color: themeColors.primary }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                      Análise de Frequências
                    </h4>
                    <div className="space-y-3">
                      {analysis.frequencyData ? (
                        <>
                          <div 
                            className="p-4 rounded-lg border"
                            style={{
                              backgroundColor: themeColors.background,
                              borderColor: themeColors.border
                            }}
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm text-gray-400">Sub Bass (20-60 Hz)</span>
                              <span className="text-sm font-semibold" style={{ color: themeColors.primary }}>
                                {analysis.frequencyData.subBass > 120 ? 'Muito Alto' :
                                 analysis.frequencyData.subBass > 80 ? 'Alto' :
                                 analysis.frequencyData.subBass > 50 ? 'Médio' : 'Baixo'}
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-gray-700 overflow-hidden">
                              <div 
                                className="h-full rounded-full transition-all"
                                style={{ 
                                  width: `${Math.min(100, (analysis.frequencyData.subBass / 255) * 100)}%`,
                                  backgroundColor: themeColors.primary
                                }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 mt-1">{Math.round(analysis.frequencyData.subBass)}</div>
                          </div>
                          <div 
                            className="p-4 rounded-lg border"
                            style={{
                              backgroundColor: themeColors.background,
                              borderColor: themeColors.border
                            }}
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm text-gray-400">Bass (60-250 Hz)</span>
                              <span className="text-sm font-semibold" style={{ color: themeColors.primary }}>
                                {analysis.frequencyData.bass > 120 ? 'Muito Alto' :
                                 analysis.frequencyData.bass > 80 ? 'Alto' :
                                 analysis.frequencyData.bass > 50 ? 'Médio' : 'Baixo'}
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-gray-700 overflow-hidden">
                              <div 
                                className="h-full rounded-full transition-all"
                                style={{ 
                                  width: `${Math.min(100, (analysis.frequencyData.bass / 255) * 100)}%`,
                                  backgroundColor: themeColors.primary
                                }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 mt-1">{Math.round(analysis.frequencyData.bass)}</div>
                          </div>
                          <div 
                            className="p-4 rounded-lg border"
                            style={{
                              backgroundColor: themeColors.background,
                              borderColor: themeColors.border
                            }}
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm text-gray-400">Low Mids (250-500 Hz)</span>
                              <span className="text-sm font-semibold" style={{ color: themeColors.primary }}>
                                {analysis.frequencyData.lowMid > 120 ? 'Muito Alto' :
                                 analysis.frequencyData.lowMid > 80 ? 'Alto' :
                                 analysis.frequencyData.lowMid > 50 ? 'Médio' : 'Baixo'}
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-gray-700 overflow-hidden">
                              <div 
                                className="h-full rounded-full transition-all"
                                style={{ 
                                  width: `${Math.min(100, (analysis.frequencyData.lowMid / 255) * 100)}%`,
                                  backgroundColor: themeColors.primary
                                }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 mt-1">{Math.round(analysis.frequencyData.lowMid)}</div>
                          </div>
                          <div 
                            className="p-4 rounded-lg border"
                            style={{
                              backgroundColor: themeColors.background,
                              borderColor: themeColors.border
                            }}
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm text-gray-400">Mids (500-2000 Hz)</span>
                              <span className="text-sm font-semibold" style={{ color: themeColors.primary }}>
                                {analysis.frequencyData.mid > 120 ? 'Muito Alto' :
                                 analysis.frequencyData.mid > 80 ? 'Alto' :
                                 analysis.frequencyData.mid > 50 ? 'Médio' : 'Baixo'}
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-gray-700 overflow-hidden">
                              <div 
                                className="h-full rounded-full transition-all"
                                style={{ 
                                  width: `${Math.min(100, (analysis.frequencyData.mid / 255) * 100)}%`,
                                  backgroundColor: themeColors.primary
                                }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 mt-1">{Math.round(analysis.frequencyData.mid)}</div>
                          </div>
                          <div 
                            className="p-4 rounded-lg border"
                            style={{
                              backgroundColor: themeColors.background,
                              borderColor: themeColors.border
                            }}
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm text-gray-400">High Mids (2000-4000 Hz)</span>
                              <span className="text-sm font-semibold" style={{ color: themeColors.primary }}>
                                {analysis.frequencyData.highMid > 120 ? 'Muito Alto' :
                                 analysis.frequencyData.highMid > 80 ? 'Alto' :
                                 analysis.frequencyData.highMid > 50 ? 'Médio' : 'Baixo'}
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-gray-700 overflow-hidden">
                              <div 
                                className="h-full rounded-full transition-all"
                                style={{ 
                                  width: `${Math.min(100, (analysis.frequencyData.highMid / 255) * 100)}%`,
                                  backgroundColor: themeColors.primary
                                }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 mt-1">{Math.round(analysis.frequencyData.highMid)}</div>
                          </div>
                          <div 
                            className="p-4 rounded-lg border"
                            style={{
                              backgroundColor: themeColors.background,
                              borderColor: themeColors.border
                            }}
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm text-gray-400">Highs (4000-20000 Hz)</span>
                              <span className="text-sm font-semibold" style={{ color: themeColors.primary }}>
                                {analysis.frequencyData.high > 120 ? 'Muito Alto' :
                                 analysis.frequencyData.high > 80 ? 'Alto' :
                                 analysis.frequencyData.high > 50 ? 'Médio' : 'Baixo'}
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-gray-700 overflow-hidden">
                              <div 
                                className="h-full rounded-full transition-all"
                                style={{ 
                                  width: `${Math.min(100, (analysis.frequencyData.high / 255) * 100)}%`,
                                  backgroundColor: themeColors.primary
                                }}
                              />
                            </div>
                            <div className="text-xs text-gray-500 mt-1">{Math.round(analysis.frequencyData.high)}</div>
                          </div>
                        </>
                      ) : (
                        <div className="text-gray-400 text-sm text-center py-4">
                          Carregando análise de frequências...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Estatísticas de Elementos */}
                  <div>
                    <h4 
                      className="text-lg font-semibold mb-4 flex items-center gap-2"
                      style={{ color: themeColors.primary }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Estatísticas de Elementos
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div 
                        className="p-4 rounded-lg border text-center"
                        style={{
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border
                        }}
                      >
                        <div className="text-2xl font-bold mb-1" style={{ color: themeColors.primary }}>
                          {analysis.synths.length}
                        </div>
                        <div className="text-xs text-gray-400">Synths</div>
                      </div>
                      <div 
                        className="p-4 rounded-lg border text-center"
                        style={{
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border
                        }}
                      >
                        <div className="text-2xl font-bold mb-1" style={{ color: themeColors.primary }}>
                          {analysis.instruments.length}
                        </div>
                        <div className="text-xs text-gray-400">Instrumentos</div>
                      </div>
                      <div 
                        className="p-4 rounded-lg border text-center"
                        style={{
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border
                        }}
                      >
                        <div className="text-2xl font-bold mb-1" style={{ color: themeColors.primary }}>
                          {Object.values(analysis.drumElements).filter(Boolean).length}
                        </div>
                        <div className="text-xs text-gray-400">Elementos de Bateria</div>
                      </div>
                      <div 
                        className="p-4 rounded-lg border text-center"
                        style={{
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border
                        }}
                      >
                        <div className="text-2xl font-bold mb-1" style={{ color: themeColors.primary }}>
                          {Object.values(analysis.bassElements).filter(Boolean).length}
                        </div>
                        <div className="text-xs text-gray-400">Elementos de Bass</div>
                      </div>
                    </div>
                  </div>

                  {/* Características Detalhadas */}
                  {analysis.characteristics && (
                    <div>
                      <h4 
                        className="text-lg font-semibold mb-4 flex items-center gap-2"
                        style={{ color: themeColors.primary }}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Análise de Características
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div 
                          className="p-4 rounded-lg border"
                          style={{
                            backgroundColor: themeColors.background,
                            borderColor: themeColors.border
                          }}
                        >
                          <div className="text-sm text-gray-400 mb-2">Harmônicos</div>
                          <div className="text-2xl font-bold mb-2" style={{ color: themeColors.primary }}>
                            {Math.round(analysis.characteristics.harmonics)}%
                          </div>
                          <div className="w-full h-2 rounded-full bg-gray-700 overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all"
                              style={{ 
                                width: `${analysis.characteristics.harmonics}%`,
                                backgroundColor: themeColors.primary
                              }}
                            />
                          </div>
                          <div className="text-xs text-gray-500 mt-2">
                            Riqueza espectral do som
                          </div>
                        </div>
                        <div 
                          className="p-4 rounded-lg border"
                          style={{
                            backgroundColor: themeColors.background,
                            borderColor: themeColors.border
                          }}
                        >
                          <div className="text-sm text-gray-400 mb-2">Perfil Sonoro</div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Textura:</span>
                              <span className="text-white font-semibold capitalize">
                                {analysis.characteristics.texture === 'metallic' ? 'Metálica' :
                                 analysis.characteristics.texture === 'gritty' ? 'Granulada' :
                                 analysis.characteristics.texture === 'organic' ? 'Orgânica' :
                                 analysis.characteristics.texture === 'digital' ? 'Digital' : 'Suave'}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Ataque:</span>
                              <span className="text-white font-semibold capitalize">
                                {analysis.characteristics.attack === 'fast' ? 'Rápido' :
                                 analysis.characteristics.attack === 'slow' ? 'Lento' : 'Médio'}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Sustain:</span>
                              <span className="text-white font-semibold capitalize">
                                {analysis.characteristics.sustain === 'long' ? 'Longo' :
                                 analysis.characteristics.sustain === 'short' ? 'Curto' : 'Médio'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'arrangement' && analysis && analysis.arrangement && (
                <div className="space-y-6">
                  {/* Timeline Header */}
                  <div>
                    <h4 
                      className="text-lg font-semibold mb-4 flex items-center gap-2"
                      style={{ color: themeColors.primary }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Arranjo da Música
                    </h4>
                    
                    {/* Timeline Container */}
                    <div 
                      className="rounded-lg border p-4 overflow-x-auto"
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        borderColor: themeColors.border
                      }}
                    >
                      {/* Time Scale */}
                      <div className="mb-4 flex items-center gap-2">
                        <div className="w-32 flex-shrink-0 text-xs text-gray-400 font-medium">Elemento</div>
                        <div className="flex-1 relative" style={{ minWidth: '600px' }}>
                          {(() => {
                            // Usar duração real da música
                            const realDuration = analysis.structure 
                              ? (analysis.structure.intro + analysis.structure.breakdown + analysis.structure.drop + analysis.structure.outro)
                              : (currentFile?.duration 
                                ? parseFloat(currentFile.duration.split(':').reduce((acc: number, time: string, i: number) => acc + parseFloat(time) * Math.pow(60, 1 - i), 0).toString())
                                : (playerState.duration || 360)); // Default 6 minutos se não tiver
                            
                            // Gerar marcadores de tempo baseados na duração real
                            const interval = realDuration > 300 ? 60 : realDuration > 180 ? 30 : 15; // Intervalos de 15s, 30s ou 60s
                            const markers: number[] = [];
                            for (let t = 0; t <= realDuration; t += interval) {
                              markers.push(t);
                            }
                            if (markers[markers.length - 1] < realDuration) {
                              markers.push(realDuration);
                            }
                            
                            return (
                              <>
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                  {markers.map((time) => (
                                    <span key={time}>
                                      {Math.floor(time / 60)}:{(Math.floor(time % 60)).toString().padStart(2, '0')}
                                    </span>
                                  ))}
                                </div>
                                {/* Time markers */}
                                <div className="relative h-1 bg-gray-700 rounded-full">
                                  {markers.map((time) => {
                                    const position = (time / realDuration) * 100;
                                    return (
                                      <div
                                        key={time}
                                        className="absolute top-0 w-px h-full bg-gray-600"
                                        style={{ left: `${position}%` }}
                                      />
                                    );
                                  })}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Structure Markers */}
                      {analysis.structure && (
                        <div className="mb-4 flex items-center gap-2">
                          <div className="w-32 flex-shrink-0 text-xs text-gray-400 font-medium">Estrutura</div>
                          <div className="flex-1 relative" style={{ minWidth: '600px' }}>
                            <div className="relative h-8 rounded overflow-hidden">
                              {(() => {
                                // Usar duração real
                                const realDuration = analysis.structure 
                                  ? (analysis.structure.intro + analysis.structure.breakdown + analysis.structure.drop + analysis.structure.outro)
                                  : (currentFile?.duration 
                                    ? parseFloat(currentFile.duration.split(':').reduce((acc: number, time: string, i: number) => acc + parseFloat(time) * Math.pow(60, 1 - i), 0).toString())
                                    : (playerState.duration || 360));
                                const intro = analysis.structure.intro;
                                const breakdown = analysis.structure.breakdown;
                                const drop = analysis.structure.drop;
                                const outro = analysis.structure.outro;
                                
                                return (
                                  <>
                                    <div 
                                      className="absolute h-full flex items-center justify-center text-xs font-semibold text-white"
                                      style={{
                                        left: '0%',
                                        width: `${(intro / duration) * 100}%`,
                                        backgroundColor: `${themeColors.primary}40`
                                      }}
                                    >
                                      Intro
                                    </div>
                                    <div 
                                      className="absolute h-full flex items-center justify-center text-xs font-semibold text-white"
                                      style={{
                                        left: `${(intro / duration) * 100}%`,
                                        width: `${(breakdown / duration) * 100}%`,
                                        backgroundColor: `${themeColors.primaryDark}40`
                                      }}
                                    >
                                      Breakdown
                                    </div>
                                    <div 
                                      className="absolute h-full flex items-center justify-center text-xs font-semibold text-white"
                                      style={{
                                        left: `${((intro + breakdown) / duration) * 100}%`,
                                        width: `${(drop / duration) * 100}%`,
                                        backgroundColor: `${themeColors.primary}60`
                                      }}
                                    >
                                      Drop
                                    </div>
                                    <div 
                                      className="absolute h-full flex items-center justify-center text-xs font-semibold text-white"
                                      style={{
                                        left: `${((intro + breakdown + drop) / duration) * 100}%`,
                                        width: `${(outro / duration) * 100}%`,
                                        backgroundColor: `${themeColors.primaryDark}40`
                                      }}
                                    >
                                      Outro
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Tracks */}
                      <div className="space-y-2">
                        {/* Group by type */}
                        {['synth', 'instrument', 'drum', 'bass'].map((type) => {
                          const elements = analysis.arrangement!.filter(el => el.type === type);
                          if (elements.length === 0) return null;
                          
                          return (
                            <div key={type} className="space-y-1">
                              <div className="text-xs font-semibold text-gray-400 mb-2 capitalize px-2">
                                {type === 'synth' ? 'Synths' : type === 'instrument' ? 'Instrumentos' : type === 'drum' ? 'Bateria' : 'Bass'}
                              </div>
                              {elements.map((element, idx) => {
                                // Usar duração real
                                const realDuration = analysis.structure 
                                  ? (analysis.structure.intro + analysis.structure.breakdown + analysis.structure.drop + analysis.structure.outro)
                                  : (currentFile?.duration 
                                    ? parseFloat(currentFile.duration.split(':').reduce((acc: number, time: string, i: number) => acc + parseFloat(time) * Math.pow(60, 1 - i), 0).toString())
                                    : (playerState.duration || 360));
                                const startPercent = (element.startTime / realDuration) * 100;
                                const widthPercent = ((element.endTime - element.startTime) / realDuration) * 100;
                                
                                return (
                                  <div key={idx} className="flex items-center gap-2">
                                    <div className="w-32 flex-shrink-0 text-xs text-white truncate px-2">
                                      {element.name}
                                    </div>
                                    <div className="flex-1 relative h-8" style={{ minWidth: '600px' }}>
                                      <div
                                        className="absolute h-full rounded flex items-center justify-center text-xs font-medium text-white shadow-lg transition-all hover:scale-105 cursor-pointer"
                                        style={{
                                          left: `${startPercent}%`,
                                          width: `${widthPercent}%`,
                                          backgroundColor: element.color || themeColors.primary,
                                          minWidth: '40px'
                                        }}
                                        title={`${element.name}: ${Math.floor(element.startTime / 60)}:${(element.startTime % 60).toString().padStart(2, '0')} - ${Math.floor(element.endTime / 60)}:${(element.endTime % 60).toString().padStart(2, '0')}`}
                                      >
                                        <span className="truncate px-2">{element.name}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Legend */}
                  <div 
                    className="p-4 rounded-lg border"
                    style={{
                      backgroundColor: themeColors.background,
                      borderColor: themeColors.border
                    }}
                  >
                    <h5 className="text-sm font-semibold text-white mb-3">Legenda</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: themeColors.primary }} />
                        <span className="text-gray-400">Synths</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: '#60a5fa' }} />
                        <span className="text-gray-400">Instrumentos</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ef4444' }} />
                        <span className="text-gray-400">Bateria</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: '#3b82f6' }} />
                        <span className="text-gray-400">Bass</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">
                      Passe o mouse sobre os elementos para ver os tempos de início e fim.
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
      </BaseModal>
    </>
  );
}
