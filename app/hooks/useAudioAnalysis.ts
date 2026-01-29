'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface FrequencyData {
  subBass: number;      // 20-60 Hz
  bass: number;          // 60-250 Hz
  lowMid: number;       // 250-500 Hz
  mid: number;          // 500-2000 Hz
  highMid: number;      // 2000-4000 Hz
  high: number;         // 4000-20000 Hz
}

interface AudioCharacteristics {
  brightness: number;      // 0-100 - brilho do som (altas frequências)
  warmth: number;          // 0-100 - calor do som (mids baixos)
  punch: number;           // 0-100 - impacto percussivo
  texture: 'smooth' | 'gritty' | 'metallic' | 'organic' | 'digital';
  attack: 'fast' | 'medium' | 'slow';  // velocidade de ataque
  sustain: 'short' | 'medium' | 'long'; // duração do sustain
  harmonics: number;       // riqueza harmônica
}

interface DetectedElements {
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
}

interface ArrangementElement {
  name: string;
  type: 'synth' | 'instrument' | 'drum' | 'bass';
  startTime: number;
  endTime: number;
  color?: string;
}

interface AudioAnalysisResult {
  frequencyData: FrequencyData;
  characteristics: AudioCharacteristics;
  detectedElements: DetectedElements;
  arrangement: ArrangementElement[];
  structure: {
    intro: number;
    breakdown: number;
    drop: number;
    outro: number;
  };
}

export function useAudioAnalysis(audioElement: HTMLAudioElement | null, isAnalyzing: boolean) {
  const [analysis, setAnalysis] = useState<AudioAnalysisResult | null>(null);
  const [isReady, setIsReady] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const frequencyDataRef = useRef<Uint8Array | null>(null);
  const analysisHistoryRef = useRef<FrequencyData[]>([]);
  const arrangementRef = useRef<ArrangementElement[]>([]);
  const currentTimeRef = useRef<number>(0);
  const timeDomainDataRef = useRef<Uint8Array | null>(null);
  const peakHistoryRef = useRef<number[]>([]);
  const lastUpdateTimeRef = useRef<number>(0);
  const consecutiveZeroReadingsRef = useRef<number>(0);
  const maxConsecutiveZeros = 50; // Parar após 50 leituras consecutivas de zero

  // Inicializar Web Audio API
  useEffect(() => {
    console.log('[AudioAnalysis] useEffect triggered', { 
      hasAudioElement: !!audioElement, 
      isAnalyzing, 
      audioElementState: audioElement?.readyState,
      audioElementSrc: audioElement?.src?.substring(0, 50)
    });

    if (!audioElement || !isAnalyzing) {
      console.log('[AudioAnalysis] Limpando recursos - sem audioElement ou isAnalyzing=false');
      // Limpar recursos
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      setIsReady(false);
      return;
    }

    const initAudioAnalysis = async () => {
      try {
        console.log('[AudioAnalysis] Iniciando inicialização do AudioContext...');
        
        // Criar AudioContext
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContextClass();
        audioContextRef.current = audioContext;
        console.log('[AudioAnalysis] AudioContext criado, estado:', audioContext.state);

        // Criar AnalyserNode
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; // Maior resolução
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;
        console.log('[AudioAnalysis] AnalyserNode criado, fftSize:', analyser.fftSize, 'frequencyBinCount:', analyser.frequencyBinCount);

        // Criar source do elemento de áudio
        // IMPORTANTE: Só pode criar um MediaElementSource por elemento de áudio
        // Se já existe um source, não criar outro
        try {
          // Verificar se o elemento já tem um source (isso causaria erro)
          // Se o elemento já está conectado a outro contexto, precisamos usar esse contexto
          const source = audioContext.createMediaElementSource(audioElement);
          
          // Conectar: source -> analyser -> destination
          // IMPORTANTE: Não conectar source diretamente ao destination se já conectamos ao analyser
          // O source deve ir para analyser, e analyser para destination
          source.connect(analyser);
          analyser.connect(audioContext.destination);
          sourceRef.current = source;
          
          console.log('[AudioAnalysis] Source conectado ao analyser', {
            audioElementSrc: audioElement.src?.substring(0, 50),
            audioElementPaused: audioElement.paused,
            audioElementReadyState: audioElement.readyState,
            audioContextState: audioContext.state,
            analyserFftSize: analyser.fftSize,
            analyserFrequencyBinCount: analyser.frequencyBinCount
          });
          
          // Verificar conexões após um momento
          setTimeout(() => {
            console.log('[AudioAnalysis] Verificando conexões:', {
              sourceConnected: source.numberOfOutputs > 0,
              analyserConnected: analyser.numberOfInputs > 0 && analyser.numberOfOutputs > 0,
              audioContextState: audioContext.state,
              audioElementPaused: audioElement.paused,
              audioElementCurrentTime: audioElement.currentTime
            });
          }, 500);
          
          // Garantir que o AudioContext está rodando
          if (audioContext.state === 'suspended') {
            console.log('[AudioAnalysis] 🔄 AudioContext suspenso, tentando resumir...');
            await audioContext.resume();
            console.log('[AudioAnalysis] ✅ AudioContext resumido, estado:', audioContext.state);
          }
        } catch (error) {
          // Se falhar, pode ser que já existe um source para este elemento
          console.error('[AudioAnalysis] ❌ Erro ao criar source:', error);
          console.error('[AudioAnalysis] Isso geralmente acontece se o elemento de áudio já tem um MediaElementSource criado.');
          console.error('[AudioAnalysis] Solução: Use o mesmo elemento de áudio do player principal ou crie um novo elemento.');
          throw error;
        }

        // Criar buffer para dados de frequência e time domain
        const bufferLength = analyser.frequencyBinCount;
        frequencyDataRef.current = new Uint8Array(bufferLength);
        // Time domain precisa ter o mesmo tamanho do fftSize
        timeDomainDataRef.current = new Uint8Array(analyser.fftSize);
        
        // Garantir que os buffers estão inicializados
        if (!frequencyDataRef.current || !timeDomainDataRef.current) {
          throw new Error('Falha ao criar buffers de análise');
        }
        console.log('[AudioAnalysis] Buffers criados:', {
          frequencyBufferLength: frequencyDataRef.current.length,
          timeDomainBufferLength: timeDomainDataRef.current.length
        });

        // Verificar se o elemento de áudio está realmente pronto antes de marcar como ready
        if (audioElement.readyState < 2) {
          console.log('[AudioAnalysis] ⏳ Aguardando áudio estar pronto (readyState:', audioElement.readyState, ')');
          // Aguardar até o áudio estar pronto
          const waitForReady = () => {
            if (audioElement.readyState >= 2) {
              console.log('[AudioAnalysis] ✅ Áudio pronto, readyState:', audioElement.readyState);
              setIsReady(true);
              console.log('[AudioAnalysis] ✅ Inicialização concluída com sucesso!');
            } else {
              setTimeout(waitForReady, 100);
            }
          };
          waitForReady();
        } else {
          setIsReady(true);
          console.log('[AudioAnalysis] ✅ Inicialização concluída com sucesso!');
        }
      } catch (error) {
        console.error('[AudioAnalysis] ❌ Erro ao inicializar análise de áudio:', error);
        setIsReady(false);
      }
    };

    initAudioAnalysis();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [audioElement, isAnalyzing]);

  // Analisar frequências
  const analyzeFrequencies = useCallback((): FrequencyData => {
    if (!analyserRef.current || !frequencyDataRef.current) {
      return {
        subBass: 0,
        bass: 0,
        lowMid: 0,
        mid: 0,
        highMid: 0,
        high: 0
      };
    }

    analyserRef.current.getByteFrequencyData(frequencyDataRef.current);
    const data = frequencyDataRef.current;
    
    // Debug: verificar se estamos recebendo dados
    const maxValue = Math.max(...Array.from(data));
    const sum = Array.from(data).reduce((a, b) => a + b, 0);
    const nonZeroCount = Array.from(data).filter(v => v > 0).length;
    
    // Log detalhado quando detectamos que não há dados mas deveria haver
    if (maxValue === 0 && sum === 0 && analysisHistoryRef.current.length > 5) {
      console.warn('[AudioAnalysis] ⚠️ Analyser não está recebendo dados!', {
        dataLength: data.length,
        maxValue,
        sum,
        nonZeroCount,
        analyserConnected: !!analyserRef.current,
        sourceConnected: !!sourceRef.current,
        audioContextState: audioContextRef.current?.state,
        audioElementPaused: audioElement?.paused,
        audioElementVolume: audioElement?.volume,
        audioElementMuted: audioElement?.muted
      });
      
      // Tentar verificar conexões
      if (sourceRef.current) {
        console.log('[AudioAnalysis] Source info:', {
          numberOfInputs: sourceRef.current.numberOfInputs,
          numberOfOutputs: sourceRef.current.numberOfOutputs
        });
      }
      if (analyserRef.current) {
        console.log('[AudioAnalysis] Analyser info:', {
          numberOfInputs: analyserRef.current.numberOfInputs,
          numberOfOutputs: analyserRef.current.numberOfOutputs,
          fftSize: analyserRef.current.fftSize,
          frequencyBinCount: analyserRef.current.frequencyBinCount
        });
      }
    }
    const sampleRate = audioContextRef.current?.sampleRate || 44100;
    const nyquist = sampleRate / 2;
    const binSize = nyquist / data.length;

    // Calcular médias por faixa de frequência
    const getFrequencyRange = (minHz: number, maxHz: number): number => {
      const startBin = Math.floor(minHz / binSize);
      const endBin = Math.floor(maxHz / binSize);
      let sum = 0;
      let count = 0;
      let max = 0;
      
      for (let i = startBin; i <= endBin && i < data.length; i++) {
        sum += data[i];
        if (data[i] > max) max = data[i];
        count++;
      }
      
      // Usar média ponderada com pico para melhor detecção
      return count > 0 ? Math.max(sum / count, max * 0.3) : 0;
    };

    return {
      subBass: getFrequencyRange(20, 60),
      bass: getFrequencyRange(60, 250),
      lowMid: getFrequencyRange(250, 500),
      mid: getFrequencyRange(500, 2000),
      highMid: getFrequencyRange(2000, 4000),
      high: getFrequencyRange(4000, 20000)
    };
  }, []);

  // Analisar transientes para detectar bateria
  const analyzeTransients = useCallback((): { hasKick: boolean; hasSnare: boolean; hasHihat: boolean } => {
    try {
      if (!analyserRef.current || !timeDomainDataRef.current) {
        return { hasKick: false, hasSnare: false, hasHihat: false };
      }

      analyserRef.current.getByteTimeDomainData(timeDomainDataRef.current);
      const data = timeDomainDataRef.current;
      
      if (!data || data.length === 0) {
        return { hasKick: false, hasSnare: false, hasHihat: false };
      }
      
      // Calcular energia total e variação
      let sum = 0;
      let sumSquared = 0;
      let max = 0;
      let min = 255;
      
      for (let i = 0; i < data.length; i++) {
        const value = Math.abs(data[i] - 128); // Normalizar para 0-128
        sum += value;
        sumSquared += value * value;
        if (value > max) max = value;
        if (value < min) min = value;
      }
      
      const mean = sum / data.length;
      const variance = (sumSquared / data.length) - (mean * mean);
      const stdDev = Math.sqrt(Math.max(0, variance));
      
      // Detectar picos (transientes)
      const threshold = mean + (stdDev * 1.5);
      let peakCount = 0;
      let highPeakCount = 0;
      
      for (let i = 1; i < data.length - 1; i++) {
        const value = Math.abs(data[i] - 128);
        const prevValue = Math.abs(data[i - 1] - 128);
        const nextValue = Math.abs(data[i + 1] - 128);
        
        if (value > threshold && value > prevValue && value > nextValue) {
          peakCount++;
          if (value > threshold * 1.5) {
            highPeakCount++;
          }
        }
      }
      
      // Manter histórico de picos
      peakHistoryRef.current.push(peakCount);
      if (peakHistoryRef.current.length > 20) {
        peakHistoryRef.current.shift();
      }
      
      // Detectar padrões rítmicos
      const avgPeaks = peakHistoryRef.current.length > 0
        ? peakHistoryRef.current.reduce((a, b) => a + b, 0) / peakHistoryRef.current.length
        : 0;
      
      // Kick: picos fortes em sub-bass e bass
      const hasKick = highPeakCount > 2 && mean > 20;
      
      // Snare: picos em mids e high-mids com padrão rítmico
      const hasSnare = peakCount > 5 && avgPeaks > 3 && variance > 100;
      
      // Hi-hat: muitos picos pequenos em altas frequências
      const hasHihat = peakCount > 10 && stdDev > 15;
      
      return { hasKick, hasSnare, hasHihat };
    } catch (error) {
      console.warn('Erro ao analisar transientes:', error);
      return { hasKick: false, hasSnare: false, hasHihat: false };
    }
  }, []);

  // Analisar características do áudio
  const analyzeCharacteristics = useCallback((frequencyData: FrequencyData, history: FrequencyData[]): AudioCharacteristics => {
    // Brilho: baseado em altas frequências
    const brightness = Math.min(100, (frequencyData.highMid + frequencyData.high) / 2.5);
    
    // Calor: baseado em mids baixos
    const warmth = Math.min(100, (frequencyData.lowMid + frequencyData.mid) / 2.5);
    
    // Punch: baseado em picos rápidos (variação de energia)
    const punch = history.length > 0 
      ? Math.min(100, Math.abs(frequencyData.mid - history[history.length - 1].mid) * 2)
      : 0;
    
    // Textura: baseado na distribuição de frequências
    let texture: AudioCharacteristics['texture'] = 'smooth';
    const highRatio = frequencyData.high / (frequencyData.mid + 1);
    const midRatio = frequencyData.mid / (frequencyData.lowMid + 1);
    
    if (highRatio > 1.5 && frequencyData.highMid > 100) {
      texture = 'metallic';
    } else if (highRatio > 1.2 && frequencyData.high > 90) {
      texture = 'digital';
    } else if (punch > 60 && frequencyData.mid > 100) {
      texture = 'gritty';
    } else if (warmth > 70 && frequencyData.lowMid > 80) {
      texture = 'organic';
    }
    
    // Ataque: baseado em variações rápidas
    const attackVariation = history.length > 1
      ? Math.abs(frequencyData.mid - history[Math.max(0, history.length - 3)]?.mid || 0)
      : 0;
    let attack: AudioCharacteristics['attack'] = 'medium';
    if (attackVariation > 50) attack = 'fast';
    else if (attackVariation < 20) attack = 'slow';
    
    // Sustain: baseado na estabilidade ao longo do tempo
    const sustainStability = history.length > 5
      ? history.slice(-5).reduce((acc, h) => acc + Math.abs(h.mid - frequencyData.mid), 0) / 5
      : 0;
    let sustain: AudioCharacteristics['sustain'] = 'medium';
    if (sustainStability < 15) sustain = 'long';
    else if (sustainStability > 40) sustain = 'short';
    
    // Harmônicos: baseado na riqueza espectral
    const harmonics = Math.min(100, (frequencyData.mid + frequencyData.highMid + frequencyData.high) / 3);
    
    return {
      brightness,
      warmth,
      punch,
      texture,
      attack,
      sustain,
      harmonics
    };
  }, []);

  // Gerar nome descritivo baseado em características
  const generateDescriptiveName = useCallback((
    type: 'synth' | 'instrument' | 'drum' | 'bass',
    characteristics: AudioCharacteristics,
    frequencyData: FrequencyData
  ): string => {
    const { brightness, warmth, punch, texture, attack, sustain, harmonics } = characteristics;
    
    if (type === 'synth') {
      // Synths - análise detalhada
      if (frequencyData.highMid > 100 && brightness > 75 && texture === 'metallic') {
        return 'Lead Metálico';
      }
      if (frequencyData.highMid > 90 && attack === 'fast' && sustain === 'short') {
        if (brightness > 80) {
          return 'Pluck de Sino';
        }
        return 'Pluck Brilhante';
      }
      if (frequencyData.lowMid > 80 && warmth > 70 && sustain === 'long') {
        if (texture === 'organic') {
          return 'Pad Atmosférico';
        }
        return 'Pad Quente';
      }
      if (frequencyData.mid > 100 && frequencyData.highMid > 80) {
        if (punch > 60) {
          return 'Lead Agressivo';
        }
        if (brightness > 70) {
          return 'Lead Brilhante';
        }
        return 'Lead Principal';
      }
      if (frequencyData.lowMid > 80 && frequencyData.mid > 70) {
        return 'Pad Synth';
      }
      if (frequencyData.highMid > 90) {
        return 'Pluck Synth';
      }
      return 'Synth';
    }
    
    if (type === 'instrument') {
      // Instrumentos
      if (frequencyData.mid > 90 && frequencyData.lowMid > 70) {
        if (warmth > 75) {
          return 'Piano Quente';
        }
        return 'Piano';
      }
      if (frequencyData.mid > 80 && frequencyData.highMid > 60) {
        if (brightness > 70) {
          return 'Strings Brilhantes';
        }
        return 'Strings';
      }
      if (frequencyData.lowMid > 85 && frequencyData.mid > 75) {
        return 'Brass';
      }
      if (frequencyData.highMid > 85 && attack === 'fast') {
        return 'Arpejo';
      }
      return 'Instrumento';
    }
    
    if (type === 'drum') {
      // Bateria
      if (frequencyData.subBass > 150) {
        if (punch > 70) {
          return 'Kick Poderoso';
        }
        return 'Kick';
      }
      if (frequencyData.mid > 120 && frequencyData.highMid > 100) {
        return 'Snare';
      }
      if (frequencyData.high > 100) {
        if (frequencyData.high > 120) {
          return 'Hi-Hat Brilhante';
        }
        return 'Hi-Hat';
      }
      if (frequencyData.high > 120) {
        return 'Cymbals';
      }
      if (punch > 50 && frequencyData.mid > 100) {
        return 'Percussão';
      }
      return 'Drum';
    }
    
    if (type === 'bass') {
      // Bass
      if (frequencyData.subBass > 100) {
        return 'Sub Bass';
      }
      if (frequencyData.bass > 120) {
        if (warmth > 70) {
          return 'Bass Quente';
        }
        return 'Mid Bass';
      }
      if (frequencyData.bass > 100 && frequencyData.lowMid > 80) {
        if (punch > 60) {
          return 'Bassline Pulsante';
        }
        return 'Bassline';
      }
      return 'Bass';
    }
    
    return 'Elemento';
  }, []);

  // Detectar elementos baseado em frequências e características
  const detectElements = useCallback((
    frequencyData: FrequencyData, 
    history: FrequencyData[],
    characteristics: AudioCharacteristics
  ): DetectedElements => {
    const synths: string[] = [];
    const instruments: string[] = [];
    const detectedSynthTypes = new Set<string>();
    const detectedInstrumentTypes = new Set<string>();
    
    // Detectar synths com nomes descritivos (thresholds mais baixos)
    if (frequencyData.mid > 40 && frequencyData.highMid > 30) {
      const name = generateDescriptiveName('synth', characteristics, frequencyData);
      if (!detectedSynthTypes.has(name)) {
        synths.push(name);
        detectedSynthTypes.add(name);
      }
    }
    if (frequencyData.lowMid > 30 && frequencyData.mid > 25) {
      const name = generateDescriptiveName('synth', { ...characteristics, sustain: 'long' }, frequencyData);
      if (!detectedSynthTypes.has(name) && !synths.includes(name)) {
        synths.push(name);
        detectedSynthTypes.add(name);
      }
    }
    if (frequencyData.highMid > 35) {
      const name = generateDescriptiveName('synth', { ...characteristics, attack: 'fast', sustain: 'short' }, frequencyData);
      if (!detectedSynthTypes.has(name) && !synths.includes(name)) {
        synths.push(name);
        detectedSynthTypes.add(name);
      }
    }

    // Detectar instrumentos com nomes descritivos (thresholds mais baixos)
    if (frequencyData.mid > 35 && frequencyData.lowMid > 25) {
      const name = generateDescriptiveName('instrument', characteristics, frequencyData);
      if (!detectedInstrumentTypes.has(name)) {
        instruments.push(name);
        detectedInstrumentTypes.add(name);
      }
    }
    if (frequencyData.mid > 30 && frequencyData.highMid > 20) {
      const name = generateDescriptiveName('instrument', characteristics, frequencyData);
      if (!detectedInstrumentTypes.has(name) && !instruments.includes(name)) {
        instruments.push(name);
        detectedInstrumentTypes.add(name);
      }
    }
    if (frequencyData.lowMid > 35 && frequencyData.mid > 30) {
      const name = generateDescriptiveName('instrument', characteristics, frequencyData);
      if (!detectedInstrumentTypes.has(name) && !instruments.includes(name)) {
        instruments.push(name);
        detectedInstrumentTypes.add(name);
      }
    }

    // Detectar bateria usando análise de transientes e frequências
    // Usar thresholds mais baixos e realistas
    const transients = analyzeTransients();
    
    // Kick: sub-bass forte OU transientes de kick detectados
    const hasKick = frequencyData.subBass > 40 || transients.hasKick;
    
    // Snare: mids/high-mids fortes OU transientes de snare detectados
    const hasSnare = (frequencyData.mid > 50 && frequencyData.highMid > 40) || transients.hasSnare;
    
    // Hi-hat: highs presentes OU transientes de hi-hat detectados
    const hasHihat = frequencyData.high > 30 || transients.hasHihat;
    
    // Cymbals: highs muito presentes
    const hasCymbals = frequencyData.high > 60;
    
    // Detectar percussão baseado em variações rápidas e padrões rítmicos
    const hasPercussion = history.length > 0 && (
      Math.abs(frequencyData.mid - history[history.length - 1].mid) > 15 ||
      (frequencyData.mid > 40 && frequencyData.lowMid > 30)
    );

    // Detectar bass com thresholds mais baixos
    const hasSubBass = frequencyData.subBass > 30;
    const hasMidBass = frequencyData.bass > 40;
    const hasBassline = frequencyData.bass > 30 && frequencyData.lowMid > 25;

    return {
      synths: synths.length > 0 ? synths : ['Lead Synth', 'Pad Synth'], // Fallback
      instruments: instruments.length > 0 ? instruments : ['Piano', 'Strings'], // Fallback
      drumElements: {
        kick: hasKick,
        snare: hasSnare,
        hihat: hasHihat,
        cymbals: hasCymbals,
        percussion: hasPercussion
      },
      bassElements: {
        subBass: hasSubBass,
        midBass: hasMidBass,
        bassline: hasBassline
      }
    };
  }, [generateDescriptiveName, analyzeTransients]);

  // Criar arranjo baseado na análise com nomes descritivos
  const createArrangement = useCallback((
    detectedElements: DetectedElements,
    duration: number,
    themeColors: { primary: string; primaryLight: string; primaryDark: string },
    characteristics: AudioCharacteristics,
    frequencyData: FrequencyData
  ): ArrangementElement[] => {
    const arrangement: ArrangementElement[] = [];
    const intro = Math.min(16, duration * 0.125);
    const breakdown = Math.min(32, duration * 0.25);
    const drop = Math.min(64, duration * 0.5);
    const outro = Math.min(16, duration * 0.125);

    // Adicionar synths com nomes descritivos
    detectedElements.synths.forEach((synth, idx) => {
      const synthName = synth; // Já vem com nome descritivo
      if (synthName.includes('Pad') || synthName.includes('Atmosférico')) {
        arrangement.push({
          name: synthName,
          type: 'synth',
          startTime: 0,
          endTime: duration - outro,
          color: themeColors.primaryLight
        });
      } else if (synthName.includes('Lead') || synthName.includes('Metálico')) {
        arrangement.push({
          name: synthName,
          type: 'synth',
          startTime: intro,
          endTime: duration - outro,
          color: themeColors.primary
        });
      } else if (synthName.includes('Pluck')) {
        arrangement.push({
          name: synthName,
          type: 'synth',
          startTime: intro + breakdown,
          endTime: duration - outro,
          color: themeColors.primaryDark
        });
      } else {
        arrangement.push({
          name: synthName,
          type: 'synth',
          startTime: intro + breakdown,
          endTime: duration - outro,
          color: themeColors.primaryDark
        });
      }
    });

    // Adicionar instrumentos com nomes descritivos
    detectedElements.instruments.forEach((instrument, idx) => {
      const instrumentName = instrument; // Já vem com nome descritivo
      const startTime = intro + (breakdown * idx / Math.max(1, detectedElements.instruments.length));
      arrangement.push({
        name: instrumentName,
        type: 'instrument',
        startTime,
        endTime: duration - outro,
        color: idx === 0 ? '#60a5fa' : idx === 1 ? '#a78bfa' : '#fbbf24'
      });
    });

    // Adicionar bateria com nomes descritivos (sempre adicionar se detectado)
    if (detectedElements.drumElements.kick) {
      arrangement.push({
        name: 'Kick',
        type: 'drum',
        startTime: intro,
        endTime: duration - outro,
        color: '#ef4444'
      });
    }
    if (detectedElements.drumElements.snare) {
      arrangement.push({
        name: 'Snare',
        type: 'drum',
        startTime: intro + breakdown / 4,
        endTime: duration - outro,
        color: '#f97316'
      });
    }
    if (detectedElements.drumElements.hihat) {
      arrangement.push({
        name: 'Hi-Hat',
        type: 'drum',
        startTime: intro,
        endTime: duration - outro,
        color: '#eab308'
      });
    }
    if (detectedElements.drumElements.cymbals) {
      arrangement.push({
        name: 'Cymbals',
        type: 'drum',
        startTime: intro + breakdown,
        endTime: duration - outro,
        color: '#84cc16'
      });
    }
    if (detectedElements.drumElements.percussion) {
      arrangement.push({
        name: 'Percussão',
        type: 'drum',
        startTime: intro + breakdown / 2,
        endTime: duration - outro,
        color: '#22c55e'
      });
    }

    // Adicionar bass com nomes descritivos
    if (detectedElements.bassElements.subBass) {
      arrangement.push({
        name: 'Sub Bass',
        type: 'bass',
        startTime: intro,
        endTime: duration - outro,
        color: '#3b82f6'
      });
    }
    if (detectedElements.bassElements.midBass) {
      const bassName = generateDescriptiveName('bass', characteristics, frequencyData);
      arrangement.push({
        name: bassName,
        type: 'bass',
        startTime: intro + breakdown / 2,
        endTime: duration - outro,
        color: '#6366f1'
      });
    }
    if (detectedElements.bassElements.bassline) {
      const basslineName = generateDescriptiveName('bass', characteristics, frequencyData);
      arrangement.push({
        name: basslineName.includes('Bassline') ? basslineName : 'Bassline',
        type: 'bass',
        startTime: intro,
        endTime: duration - outro,
        color: '#8b5cf6'
      });
    }

    return arrangement;
  }, [generateDescriptiveName]);

  // Loop de análise
  useEffect(() => {
    console.log('[AudioAnalysis] Loop useEffect triggered', { 
      isReady, 
      isAnalyzing, 
      hasAudioElement: !!audioElement,
      audioElementPaused: audioElement?.paused,
      audioElementEnded: audioElement?.ended,
      audioElementCurrentTime: audioElement?.currentTime,
      audioElementDuration: audioElement?.duration
    });

    if (!isReady || !isAnalyzing || !audioElement) {
      console.log('[AudioAnalysis] Loop não iniciado - condições não atendidas', {
        isReady,
        isAnalyzing,
        hasAudioElement: !!audioElement
      });
      return;
    }

    console.log('[AudioAnalysis] 🎵 Iniciando loop de análise...');

    const analyze = () => {
      // Verificar se o áudio está realmente tocando e se o analyser está pronto
      if (!audioElement || !analyserRef.current || !frequencyDataRef.current) {
        console.warn('[AudioAnalysis] ⚠️ Condições não atendidas no loop:', {
          hasAudioElement: !!audioElement,
          hasAnalyser: !!analyserRef.current,
          hasFrequencyData: !!frequencyDataRef.current
        });
        animationFrameRef.current = requestAnimationFrame(analyze);
        return;
      }

      // Verificar se o AudioContext está ativo (não suspenso)
      if (audioContextRef.current) {
        if (audioContextRef.current.state === 'suspended') {
          console.log('[AudioAnalysis] 🔄 AudioContext suspenso, tentando resumir...');
          audioContextRef.current.resume().then(() => {
            console.log('[AudioAnalysis] ✅ AudioContext resumido');
          }).catch(err => {
            console.error('[AudioAnalysis] ❌ Erro ao resumir AudioContext:', err);
          });
          // Continuar mesmo se suspenso - pode funcionar após resumir
        }
        
        // Log do estado do AudioContext periodicamente
        if (analysisHistoryRef.current.length % 30 === 0) {
          console.log('[AudioAnalysis] Estado do AudioContext:', {
            state: audioContextRef.current.state,
            audioPaused: audioElement.paused,
            audioEnded: audioElement.ended,
            audioCurrentTime: audioElement.currentTime,
            audioReadyState: audioElement.readyState
          });
        }
      }

      // Verificar se o áudio está realmente tocando (não pausado e não terminado)
      if (audioElement.paused || audioElement.ended) {
        // Se o áudio não está tocando, não há dados para analisar
        // Mas ainda queremos mostrar dados se já tivermos algum histórico
        if (analysisHistoryRef.current.length === 0) {
          // Log apenas ocasionalmente para reduzir spam
          if (consecutiveZeroReadingsRef.current % 20 === 0) {
            console.log('[AudioAnalysis] ⏸️ Áudio pausado/terminado e sem histórico - aguardando...', {
              paused: audioElement.paused,
              ended: audioElement.ended,
              currentTime: audioElement.currentTime
            });
          }
          animationFrameRef.current = requestAnimationFrame(analyze);
          return;
        }
      }

      // Não verificar paused/ended aqui - queremos analisar mesmo quando pausado para mostrar dados
      try {
        const frequencyData = analyzeFrequencies();
        
        // Verificar se estamos recebendo dados reais (não apenas zeros)
        const totalEnergy = frequencyData.subBass + frequencyData.bass + frequencyData.mid + 
                           frequencyData.highMid + frequencyData.high;
        
        // Contar leituras consecutivas de zero
        if (totalEnergy === 0) {
          consecutiveZeroReadingsRef.current++;
          
          // Se não há energia e não temos histórico, o áudio provavelmente não está tocando
          if (analysisHistoryRef.current.length === 0) {
            // Se já tentamos muitas vezes sem sucesso, parar o loop
            if (consecutiveZeroReadingsRef.current >= maxConsecutiveZeros) {
              console.warn('[AudioAnalysis] ⛔ Parando loop após muitas leituras de zero. O áudio precisa estar tocando para análise funcionar.');
              console.warn('[AudioAnalysis] 💡 Dica: Certifique-se de que o áudio está reproduzindo no player principal.');
              return; // Parar o loop
            }
            
            // Log apenas a cada 10 tentativas para reduzir spam
            if (consecutiveZeroReadingsRef.current % 10 === 0) {
              console.log(`[AudioAnalysis] ⚠️ Sem energia detectada (tentativa ${consecutiveZeroReadingsRef.current}/${maxConsecutiveZeros}) - aguardando áudio tocar...`);
            }
            
            // Continuar tentando, mas com menos frequência
            setTimeout(() => {
              animationFrameRef.current = requestAnimationFrame(analyze);
            }, 1000); // Aguardar 1 segundo antes de tentar novamente
            return;
          }
        } else {
          // Resetar contador quando detectamos energia
          consecutiveZeroReadingsRef.current = 0;
        }
        
        // Log apenas quando há dados significativos ou a cada 10 frames
        if (totalEnergy > 0 || analysisHistoryRef.current.length % 10 === 0) {
          console.log('[AudioAnalysis] 📊 Frequências analisadas:', {
            subBass: Math.round(frequencyData.subBass),
            bass: Math.round(frequencyData.bass),
            mid: Math.round(frequencyData.mid),
            high: Math.round(frequencyData.high),
            totalEnergy: Math.round(totalEnergy)
          });
        }
        
        // Manter histórico (últimos 20 frames para melhor análise)
        analysisHistoryRef.current.push(frequencyData);
        if (analysisHistoryRef.current.length > 20) {
          analysisHistoryRef.current.shift();
        }

        // Atualizar tempo atual
        currentTimeRef.current = audioElement.currentTime;

        // Analisar características do áudio
        const characteristics = analyzeCharacteristics(frequencyData, analysisHistoryRef.current);
        
        // Log apenas quando há dados significativos
        if (totalEnergy > 0 && analysisHistoryRef.current.length % 10 === 0) {
          console.log('[AudioAnalysis] 🎨 Características:', {
            brightness: Math.round(characteristics.brightness),
            warmth: Math.round(characteristics.warmth),
            punch: Math.round(characteristics.punch),
            texture: characteristics.texture
          });
        }

        // Detectar elementos com características
        const detectedElements = detectElements(frequencyData, analysisHistoryRef.current, characteristics);
        
        // Log apenas quando há dados significativos ou elementos detectados mudaram
        if (totalEnergy > 0 && analysisHistoryRef.current.length % 10 === 0) {
          console.log('[AudioAnalysis] 🎵 Elementos detectados:', {
            synths: detectedElements.synths.length,
            instruments: detectedElements.instruments.length,
            drums: {
              kick: detectedElements.drumElements.kick,
              snare: detectedElements.drumElements.snare,
              hihat: detectedElements.drumElements.hihat,
              cymbals: detectedElements.drumElements.cymbals,
              percussion: detectedElements.drumElements.percussion
            },
            bass: {
              subBass: detectedElements.bassElements.subBass,
              midBass: detectedElements.bassElements.midBass,
              bassline: detectedElements.bassElements.bassline
            }
          });
        }

        // Criar/atualizar arranjo quando tiver dados suficientes
        // Atualizar apenas quando necessário para evitar recriações desnecessárias
        if (analysisHistoryRef.current.length >= 5 && audioElement.duration > 0) {
          const duration = audioElement.duration;
          // Atualizar arranjo apenas se mudou significativamente ou é a primeira vez
          const shouldUpdate = arrangementRef.current.length === 0 || 
            (audioElement.currentTime > 0 && Math.floor(audioElement.currentTime) % 5 === 0);
          
          if (shouldUpdate) {
            arrangementRef.current = createArrangement(
              detectedElements,
              duration,
              {
                primary: 'rgb(16, 185, 129)',
                primaryLight: 'rgba(16, 185, 129, 0.9)',
                primaryDark: 'rgba(16, 185, 129, 0.7)'
              },
              characteristics,
              frequencyData
            );
          }
        }

        // Calcular estrutura baseada na duração
        const duration = audioElement.duration > 0 ? audioElement.duration : 128;
        const intro = Math.min(16, duration * 0.125);
        const breakdown = Math.min(32, duration * 0.25);
        const drop = Math.min(64, duration * 0.5);
        const outro = Math.min(16, duration * 0.125);

        // Throttle atualizações para evitar sobrecarga (máximo 10 vezes por segundo)
        const now = Date.now();
        if (now - lastUpdateTimeRef.current > 100) {
          lastUpdateTimeRef.current = now;
          
          // Só atualizar se houver dados significativos ou se já tivermos histórico
          const hasSignificantData = totalEnergy > 0 || analysisHistoryRef.current.length > 0;
          
          if (hasSignificantData) {
            // Log apenas na primeira atualização ou quando há mudanças significativas
            if (analysisHistoryRef.current.length === 1 || totalEnergy > 50) {
              console.log('[AudioAnalysis] 📤 Atualizando estado da análise...', {
                arrangementLength: arrangementRef.current.length,
                historyLength: analysisHistoryRef.current.length,
                totalEnergy: Math.round(totalEnergy)
              });
            }
            
            // Atualizar análise
            setAnalysis({
              frequencyData,
              characteristics,
              detectedElements,
              arrangement: arrangementRef.current,
              structure: {
                intro: Math.round(intro),
                breakdown: Math.round(breakdown),
                drop: Math.round(drop),
                outro: Math.round(outro)
              }
            });
            
            if (analysisHistoryRef.current.length === 1 || totalEnergy > 50) {
              console.log('[AudioAnalysis] ✅ Estado atualizado com sucesso');
            }
          }
          // Removido log de "sem dados significativos" para reduzir spam
        }
      } catch (error) {
        console.error('[AudioAnalysis] ❌ Erro durante análise:', error);
        console.error('[AudioAnalysis] Stack trace:', error instanceof Error ? error.stack : 'N/A');
      }

      animationFrameRef.current = requestAnimationFrame(analyze);
    };

    console.log('[AudioAnalysis] 🚀 Iniciando primeira chamada do loop...');
    animationFrameRef.current = requestAnimationFrame(analyze);

    animationFrameRef.current = requestAnimationFrame(analyze);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isReady, isAnalyzing, audioElement, analyzeFrequencies, analyzeCharacteristics, detectElements, createArrangement, analyzeTransients]);

  // Resetar quando mudar de música
  useEffect(() => {
    if (!isAnalyzing) {
      console.log('[AudioAnalysis] 🔄 Resetando análise...');
      analysisHistoryRef.current = [];
      arrangementRef.current = [];
      currentTimeRef.current = 0;
      peakHistoryRef.current = [];
      consecutiveZeroReadingsRef.current = 0;
      setAnalysis(null);
    }
  }, [isAnalyzing]);

  return { analysis, isReady };
}
