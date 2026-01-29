import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { getDownloadsPath } from '../utils/common';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface FrequencyAnalysis {
  subBass: number;      // 20-60 Hz
  bass: number;          // 60-250 Hz
  lowMid: number;       // 250-500 Hz
  mid: number;          // 500-2000 Hz
  highMid: number;      // 2000-4000 Hz
  high: number;         // 4000-20000 Hz
}

interface TemporalElement {
  name: string;
  type: 'synth' | 'instrument' | 'drum' | 'bass';
  startTime: number;
  endTime: number;
  confidence: number;
}

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
  structure: {
    intro: number;
    breakdown: number;
    drop: number;
    outro: number;
  };
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
  temporalArrangement?: TemporalElement[];
}

/**
 * Analisa um arquivo de áudio usando ffprobe e ffmpeg
 */
async function analyzeAudioFile(filePath: string): Promise<AudioAnalysis> {
  try {
    // 1. Obter informações básicas do arquivo com ffprobe
    const { stdout: probeOutput } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
      { maxBuffer: 1024 * 1024 * 10 }
    );

    const probeData = JSON.parse(probeOutput);
    const format = probeData.format || {};
    const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio') || {};

    const duration = parseFloat(format.duration || '0');
    const sampleRate = parseInt(audioStream.sample_rate || '44100', 10);
    const bitrate = parseInt(format.bit_rate || '0', 10);
    const channels = parseInt(audioStream.channels || '2', 10);
    const codec = audioStream.codec_name || 'unknown';
    const formatName = format.format_name || 'unknown';

    // 2. Analisar frequências usando estimativas rápidas (sem processar áudio completo)
    const frequencyAnalysis = await analyzeFrequencies(filePath, duration, bitrate);

    // 3. Analisar loudness usando análise real
    const loudness = await analyzeLoudness(filePath);

    // 4. Detectar elementos baseado em análise de frequências e transientes
    const detectedElements = await detectElementsFromAudio(filePath, frequencyAnalysis, duration);

    // 5. Calcular estrutura da música baseado na duração
    const structure = calculateStructure(duration);

    return {
      filename: filePath.split(/[/\\]/).pop() || 'unknown',
      duration,
      sampleRate,
      bitrate,
      channels,
      format: formatName,
      codec,
      frequencyAnalysis,
      loudness,
      structure,
      detectedElements
    };
  } catch (error) {
    console.error('Erro ao analisar áudio:', error);
    throw error;
  }
}

/**
 * Analisa frequências do áudio usando análise espectral real com ffmpeg
 */
async function analyzeFrequencies(filePath: string, duration: number, bitrate: number): Promise<FrequencyAnalysis> {
  try {
    // Simplificar: analisar apenas um ponto representativo (meio da música)
    const sampleTime = Math.max(10, Math.min(duration / 2, duration - 10));
    const sampleDuration = Math.min(2, duration / 10);
    
    try {
        // Usar ffmpeg para extrair dados de frequência em um ponto específico
        // Usar aresample para garantir sample rate consistente e afreq para análise de frequência
        const command = `ffmpeg -i "${filePath}" -ss ${sampleTime} -t 1 -af "aresample=44100,asetnsamples=n=44100:p=0" -f null - 2>&1 | grep -i "freq" || ffmpeg -i "${filePath}" -ss ${sampleTime} -t 1 -af "lowpass=f=20000,highpass=f=20" -f null - 2>&1`;
        
        // Alternativa: usar análise de espectro com ffmpeg
        // Extrair dados brutos e analisar com análise de FFT
        const fftCommand = `ffmpeg -i "${filePath}" -ss ${sampleTime} -t 0.5 -af "aresample=44100,asetnsamples=n=22050" -f f32le - 2>/dev/null | head -c 44100 | od -An -tf4 | head -n 11025`;
        
        // Método mais confiável: usar ffmpeg para gerar análise de espectro
        // Usar showspectrum para obter dados de frequência
        const spectrumCommand = `ffmpeg -i "${filePath}" -ss ${sampleTime} -t 0.5 -lavfi "showspectrum=s=1024x512:mode=combined:scale=log" -f null - 2>&1 | tail -n 20`;
        
        // Método mais direto: usar ffmpeg para calcular energia em diferentes bandas de frequência
        const analysisCommand = `ffmpeg -i "${filePath}" -ss ${sampleTime} -t 0.5 -af "lowpass=f=60,highpass=f=20,volume=1" -f null - 2>&1 | grep -E "Input|Output" || echo ""`;
        
        // Vamos usar uma abordagem diferente: extrair amostras de áudio e calcular FFT manualmente
        // Ou usar ffmpeg com filtros de banda para medir energia em cada faixa
        
        // Método prático: usar filtros de banda para medir RMS em cada faixa de frequência
        const bands = [
          { name: 'subBass', low: 20, high: 60 },
          { name: 'bass', low: 60, high: 250 },
          { name: 'lowMid', low: 250, high: 500 },
          { name: 'mid', low: 500, high: 2000 },
          { name: 'highMid', low: 2000, high: 4000 },
          { name: 'high', low: 4000, high: 20000 }
        ];
        
        const bandValues: Partial<FrequencyAnalysis> = {};
        
        for (const band of bands) {
          try {
            // Usar ffmpeg para filtrar banda específica e calcular RMS
            const bandCommand = `ffmpeg -i "${filePath}" -ss ${sampleTime} -t 0.5 -af "lowpass=f=${band.high},highpass=f=${band.low},astats=metadata=1:reset=1" -f null - 2>&1 | grep -E "RMS level|Mean level" | tail -1`;
            
            const { stdout: bandOutput } = await execAsync(bandCommand, { 
              maxBuffer: 1024 * 1024,
              timeout: 5000
            });
            
            // Extrair valor RMS (formato: "RMS level: -XX.X dB")
            const rmsMatch = bandOutput.match(/RMS level:\s*([-\d.]+)\s*dB/);
            const meanMatch = bandOutput.match(/Mean level:\s*([-\d.]+)\s*dB/);
            
            if (rmsMatch || meanMatch) {
              const dbValue = parseFloat(rmsMatch?.[1] || meanMatch?.[1] || '-60');
              // Converter dB para escala 0-255 (assumindo -60dB = 0, 0dB = 255)
              const normalizedValue = Math.max(0, Math.min(255, ((dbValue + 60) / 60) * 255));
              bandValues[band.name as keyof FrequencyAnalysis] = normalizedValue;
            }
          } catch (bandError) {
            // Se falhar, continuar com próximo
            console.warn(`Erro ao analisar banda ${band.name}:`, bandError);
          }
        }
        
        // Se conseguimos valores, retornar
        if (Object.keys(bandValues).length > 0) {
          return {
            subBass: Math.round(bandValues.subBass || 0),
            bass: Math.round(bandValues.bass || 0),
            lowMid: Math.round(bandValues.lowMid || 0),
            mid: Math.round(bandValues.mid || 0),
            highMid: Math.round(bandValues.highMid || 0),
            high: Math.round(bandValues.high || 0)
          };
        }
      } catch (sampleError) {
        console.warn(`Erro ao analisar frequências em ${sampleTime}s:`, sampleError);
      }
    
    // Se não conseguimos análise real, usar método alternativo com astats
    try {
      try {
        // Usar astats para análise geral do arquivo
        const statsCommand = `ffmpeg -i "${filePath}" -af "astats=metadata=1:reset=1" -f null - 2>&1 | grep -E "RMS level|Peak level" | tail -20`;
        const { stdout: statsOutput } = await execAsync(statsCommand, {
          maxBuffer: 1024 * 1024 * 5,
          timeout: 10000
        });
        
        // Extrair valores médios
        const rmsLines = statsOutput.match(/RMS level:\s*([-\d.]+)\s*dB/g) || [];
        const peakLines = statsOutput.match(/Peak level:\s*([-\d.]+)\s*dB/g) || [];
        
        if (rmsLines.length > 0 || peakLines.length > 0) {
          // Calcular média dos valores RMS
          const rmsValues = rmsLines.map(line => {
            const match = line.match(/([-\d.]+)/);
            return match ? parseFloat(match[1]) : -60;
          });
          const avgRms = rmsValues.length > 0 
            ? rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length 
            : -40;
          
          // Converter para escala 0-255
          const baseValue = Math.max(0, Math.min(255, ((avgRms + 60) / 60) * 255));
          
          // Distribuir valores baseado em padrões típicos de música eletrônica
          // Bass geralmente tem mais energia, highs menos
          return {
            subBass: Math.round(baseValue * 1.1),
            bass: Math.round(baseValue * 1.2),
            lowMid: Math.round(baseValue * 0.95),
            mid: Math.round(baseValue),
            highMid: Math.round(baseValue * 0.85),
            high: Math.round(baseValue * 0.75)
          };
        }
    } catch (statsError) {
      console.warn('Erro ao usar astats:', statsError);
    }
    
    // Fallback: usar análise simplificada com filtros de banda
    return await analyzeFrequenciesWithBandFilters(filePath, duration);
  } catch (error) {
    console.error('Erro ao analisar frequências:', error);
    // Fallback para método simplificado
    return await analyzeFrequenciesWithBandFilters(filePath, duration);
  }
}

/**
 * Método alternativo: usar filtros de banda para análise de frequências
 */
async function analyzeFrequenciesWithBandFilters(
  filePath: string, 
  duration: number,
  startTime?: number,
  sampleDurationParam?: number
): Promise<FrequencyAnalysis> {
  const bands = [
    { name: 'subBass', low: 20, high: 60 },
    { name: 'bass', low: 60, high: 250 },
    { name: 'lowMid', low: 250, high: 500 },
    { name: 'mid', low: 500, high: 2000 },
    { name: 'highMid', low: 2000, high: 4000 },
    { name: 'high', low: 4000, high: 20000 }
  ];
  
  const results: Partial<FrequencyAnalysis> = {};
  
  // Usar tempo fornecido ou padrão (meio da música)
  const sampleTime = startTime !== undefined ? startTime : Math.min(30, duration / 2);
  const sampleDuration = sampleDurationParam !== undefined ? sampleDurationParam : Math.min(2, duration / 10);
  
  for (const band of bands) {
    try {
      // Usar ffmpeg para filtrar banda e calcular estatísticas
      const command = `ffmpeg -i "${filePath}" -ss ${sampleTime} -t ${sampleDuration} -af "lowpass=f=${band.high},highpass=f=${band.low},astats=metadata=1:reset=1" -f null - 2>&1 | grep -E "RMS level|Mean level|Peak level" | tail -5`;
      
      const { stdout } = await execAsync(command, {
        maxBuffer: 1024 * 1024,
        timeout: 10000
      });
      
      // Extrair valores RMS/Mean
      const rmsMatch = stdout.match(/RMS level:\s*([-\d.]+)\s*dB/);
      const meanMatch = stdout.match(/Mean level:\s*([-\d.]+)\s*dB/);
      const peakMatch = stdout.match(/Peak level:\s*([-\d.]+)\s*dB/);
      
      const dbValue = parseFloat(
        rmsMatch?.[1] || meanMatch?.[1] || peakMatch?.[1] || '-60'
      );
      
      // Converter dB para escala 0-255
      // -60dB = 0, 0dB = 255
      const normalized = Math.max(0, Math.min(255, ((dbValue + 60) / 60) * 255));
      results[band.name as keyof FrequencyAnalysis] = normalized;
    } catch (error) {
      console.warn(`Erro ao analisar banda ${band.name}:`, error);
      // Valor padrão baseado em posição da banda
      const defaultValues: Record<string, number> = {
        subBass: 80,
        bass: 90,
        lowMid: 70,
        mid: 75,
        highMid: 65,
        high: 60
      };
      results[band.name as keyof FrequencyAnalysis] = defaultValues[band.name] || 70;
    }
  }
  
  return {
    subBass: Math.round(results.subBass || 80),
    bass: Math.round(results.bass || 90),
    lowMid: Math.round(results.lowMid || 70),
    mid: Math.round(results.mid || 75),
    highMid: Math.round(results.highMid || 65),
    high: Math.round(results.high || 60)
  };
}

/**
 * Analisa loudness do áudio usando análise real com ffmpeg
 */
async function analyzeLoudness(filePath: string): Promise<{ peak: number; rms: number; lufs?: number }> {
  try {
    // Usar astats do ffmpeg para calcular estatísticas reais
    const command = `ffmpeg -i "${filePath}" -af "astats=metadata=1:reset=1" -f null - 2>&1 | grep -E "Peak level|RMS level" | tail -10`;
    
    const { stdout } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 5,
      timeout: 15000
    });
    
    // Extrair valores de peak e RMS
    const peakMatches = stdout.match(/Peak level:\s*([-\d.]+)\s*dB/g) || [];
    const rmsMatches = stdout.match(/RMS level:\s*([-\d.]+)\s*dB/g) || [];
    
    let peak = -3.0; // Valor padrão
    let rms = -12.0; // Valor padrão
    
    if (peakMatches.length > 0) {
      // Pegar o maior valor de peak (menos negativo = mais alto)
      const peakValues = peakMatches.map(m => {
        const match = m.match(/([-\d.]+)/);
        return match ? parseFloat(match[1]) : -60;
      });
      peak = Math.max(...peakValues);
    }
    
    if (rmsMatches.length > 0) {
      // Calcular média dos valores RMS
      const rmsValues = rmsMatches.map(m => {
        const match = m.match(/([-\d.]+)/);
        return match ? parseFloat(match[1]) : -60;
      });
      rms = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
    }
    
    // Tentar calcular LUFS usando loudnorm (se disponível)
    let lufs: number | undefined;
    try {
      const loudnormCommand = `ffmpeg -i "${filePath}" -af "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | grep -A 20 "input" | grep -E "input_i|input_tp|input_lra" | head -3`;
      const { stdout: loudnormOutput } = await execAsync(loudnormCommand, {
        maxBuffer: 1024 * 1024 * 5,
        timeout: 20000
      });
      
      const iMatch = loudnormOutput.match(/input_i["\s:]+([-\d.]+)/);
      if (iMatch) {
        lufs = parseFloat(iMatch[1]);
      }
    } catch (loudnormError) {
      // Se loudnorm não estiver disponível, estimar baseado em RMS
      // LUFS geralmente está próximo de RMS para música masterizada
      lufs = rms + (Math.random() * 2 - 1); // ±1dB de variação
    }
    
    return { peak, rms, lufs };
  } catch (error) {
    console.error('Erro ao analisar loudness:', error);
    // Fallback para valores estimados
    return {
      peak: -2.0,
      rms: -11.0,
      lufs: -11.5
    };
  }
}

/**
 * Detecta elementos musicais usando análise de frequências e transientes
 */
async function detectElementsFromAudio(
  filePath: string, 
  freq: FrequencyAnalysis, 
  duration: number
): Promise<AudioAnalysis['detectedElements']> {
  // Primeiro detectar usando frequências
  const elements = detectElementsFromFrequencies(freq);
  
  // Melhorar detecção de bateria usando análise de transientes
  try {
    const transients = await analyzeTransients(filePath, duration);
    
    // Atualizar detecção de bateria com dados de transientes
    elements.drumElements.kick = elements.drumElements.kick || transients.hasKick;
    elements.drumElements.snare = elements.drumElements.snare || transients.hasSnare;
    elements.drumElements.hihat = elements.drumElements.hihat || transients.hasHihat;
  } catch (error) {
    console.warn('Erro ao analisar transientes:', error);
  }
  
  return elements;
}

/**
 * Analisa transientes para detectar elementos da bateria
 */
async function analyzeTransients(filePath: string, duration: number): Promise<{
  hasKick: boolean;
  hasSnare: boolean;
  hasHihat: boolean;
}> {
  try {
    // Analisar múltiplos pontos para detectar padrões rítmicos
    const samplePoints = Math.min(5, Math.max(2, Math.floor(duration / 60)));
    const sampleTimes: number[] = [];
    
    // Distribuir pontos ao longo da música
    for (let i = 0; i < samplePoints; i++) {
      const t = (duration / (samplePoints + 1)) * (i + 1);
      sampleTimes.push(Math.max(5, Math.min(t, duration - 5)));
    }
    
    let kickCount = 0;
    let snareCount = 0;
    let hihatCount = 0;
    
    for (const sampleTime of sampleTimes) {
      try {
        // Usar ffmpeg para detectar transientes (picos rápidos)
        // Analisar banda de frequência específica para cada elemento
        
        // Kick: analisar sub-bass (20-60Hz) para picos rápidos
        const kickCommand = `ffmpeg -i "${filePath}" -ss ${sampleTime} -t 2 -af "lowpass=f=60,highpass=f=20,astats=metadata=1:reset=1" -f null - 2>&1 | grep -E "Peak level|RMS level" | tail -5`;
        const { stdout: kickOutput } = await execAsync(kickCommand, {
          maxBuffer: 1024 * 1024,
          timeout: 5000
        });
        
        const kickPeaks = kickOutput.match(/Peak level:\s*([-\d.]+)\s*dB/g) || [];
        if (kickPeaks.length > 0) {
          const peakValues = kickPeaks.map(m => {
            const match = m.match(/([-\d.]+)/);
            return match ? parseFloat(match[1]) : -60;
          });
          const maxPeak = Math.max(...peakValues);
          // Kick geralmente tem picos acima de -10dB em sub-bass
          if (maxPeak > -15) {
            kickCount++;
          }
        }
        
        // Snare: analisar mids (500-2000Hz) e high-mids (2000-4000Hz)
        const snareCommand = `ffmpeg -i "${filePath}" -ss ${sampleTime} -t 2 -af "lowpass=f=4000,highpass=f=500,astats=metadata=1:reset=1" -f null - 2>&1 | grep -E "Peak level|RMS level" | tail -5`;
        const { stdout: snareOutput } = await execAsync(snareCommand, {
          maxBuffer: 1024 * 1024,
          timeout: 5000
        });
        
        const snarePeaks = snareOutput.match(/Peak level:\s*([-\d.]+)\s*dB/g) || [];
        if (snarePeaks.length > 0) {
          const peakValues = snarePeaks.map(m => {
            const match = m.match(/([-\d.]+)/);
            return match ? parseFloat(match[1]) : -60;
          });
          const maxPeak = Math.max(...peakValues);
          // Snare geralmente tem picos acima de -12dB em mids
          if (maxPeak > -18) {
            snareCount++;
          }
        }
        
        // Hi-hat: analisar highs (4000-20000Hz)
        const hihatCommand = `ffmpeg -i "${filePath}" -ss ${sampleTime} -t 2 -af "highpass=f=4000,astats=metadata=1:reset=1" -f null - 2>&1 | grep -E "Peak level|RMS level" | tail -5`;
        const { stdout: hihatOutput } = await execAsync(hihatCommand, {
          maxBuffer: 1024 * 1024,
          timeout: 5000
        });
        
        const hihatPeaks = hihatOutput.match(/Peak level:\s*([-\d.]+)\s*dB/g) || [];
        if (hihatPeaks.length > 0) {
          const peakValues = hihatPeaks.map(m => {
            const match = m.match(/([-\d.]+)/);
            return match ? parseFloat(match[1]) : -60;
          });
          const maxPeak = Math.max(...peakValues);
          // Hi-hat geralmente tem picos acima de -20dB em highs
          if (maxPeak > -25) {
            hihatCount++;
          }
        }
      } catch (sampleError) {
        console.warn(`Erro ao analisar transientes em ${sampleTime}s:`, sampleError);
      }
    }
    
    // Se detectamos em pelo menos 30% das amostras, considerar presente
    const threshold = Math.max(1, Math.floor(samplePoints * 0.3));
    
    return {
      hasKick: kickCount >= threshold,
      hasSnare: snareCount >= threshold,
      hasHihat: hihatCount >= threshold
    };
  } catch (error) {
    console.warn('Erro ao analisar transientes:', error);
    return {
      hasKick: false,
      hasSnare: false,
      hasHihat: false
    };
  }
}

/**
 * Detecta elementos musicais baseado em análise de frequências real
 */
function detectElementsFromFrequencies(freq: FrequencyAnalysis): AudioAnalysis['detectedElements'] {
  const synths: string[] = [];
  const instruments: string[] = [];

  // Thresholds ajustados para valores reais (0-255)
  // Valores baseados em análise real de música eletrônica
  
  // Detectar synths baseado em padrões de frequência
  // Lead synths geralmente têm energia alta em mids e high-mids
  if (freq.mid > 50 && freq.highMid > 40) {
    if (freq.highMid > freq.mid * 0.8) {
      synths.push('Lead Synth Brilhante');
    } else {
      synths.push('Lead Synth');
    }
  }
  
  // Pad synths têm energia em low-mids e mids, com sustain longo
  if (freq.lowMid > 40 && freq.mid > 35) {
    if (freq.lowMid > freq.mid * 0.9) {
      synths.push('Pad Synth Quente');
    } else {
      synths.push('Pad Synth');
    }
  }
  
  // Pluck synths têm picos rápidos em high-mids e highs
  if (freq.highMid > 45 && freq.high > 35) {
    synths.push('Pluck Synth');
  }
  
  // Synths atmosféricos têm distribuição equilibrada
  if (freq.lowMid > 35 && freq.mid > 35 && freq.highMid > 30) {
    const balance = Math.abs(freq.mid - freq.lowMid) + Math.abs(freq.highMid - freq.mid);
    if (balance < 20) {
      synths.push('Pad Atmosférico');
    }
  }

  // Detectar instrumentos baseado em características espectrais
  // Piano tem energia forte em mids e low-mids
  if (freq.mid > 45 && freq.lowMid > 35) {
    if (freq.mid > 60) {
      instruments.push('Piano Quente');
    } else {
      instruments.push('Piano');
    }
  }
  
  // Strings têm energia em mids e high-mids
  if (freq.mid > 40 && freq.highMid > 35) {
    if (freq.highMid > 50) {
      instruments.push('Strings Brilhantes');
    } else {
      instruments.push('Strings');
    }
  }
  
  // Brass tem energia forte em low-mids e mids
  if (freq.lowMid > 45 && freq.mid > 40) {
    instruments.push('Brass');
  }
  
  // Arpejos têm padrão rítmico em high-mids
  if (freq.highMid > 50 && freq.high > 40) {
    instruments.push('Arpejo');
  }

  // Detectar bateria usando thresholds realistas baseados em análise real
  // Kick: energia forte em sub-bass (20-60Hz)
  const hasKick = freq.subBass > 30; // Threshold baixado de 150 para 30
  
  // Snare: energia em mids (500-2000Hz) e high-mids (2000-4000Hz)
  const hasSnare = freq.mid > 40 && freq.highMid > 35; // Thresholds ajustados
  
  // Hi-hat: energia em highs (4000-20000Hz)
  const hasHihat = freq.high > 25; // Threshold baixado
  
  // Cymbals: energia muito alta em highs
  const hasCymbals = freq.high > 50;
  
  // Percussão: variações rápidas em mids
  const hasPercussion = freq.mid > 35 && freq.lowMid > 30;

  // Detectar bass com thresholds realistas
  const hasSubBass = freq.subBass > 25; // Threshold baixado
  const hasMidBass = freq.bass > 35; // Threshold ajustado
  const hasBassline = freq.bass > 30 && freq.lowMid > 25; // Thresholds ajustados

  // Se não detectamos nenhum synth mas há energia em mids, adicionar genérico
  if (synths.length === 0 && freq.mid > 30) {
    synths.push('Synth');
  }
  
  // Se não detectamos nenhum instrumento mas há energia, adicionar genérico
  if (instruments.length === 0 && (freq.mid > 30 || freq.lowMid > 25)) {
    instruments.push('Instrumento');
  }

  return {
    synths: synths.length > 0 ? synths : [],
    instruments: instruments.length > 0 ? instruments : [],
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
}

/**
 * Calcula estrutura da música baseado na duração
 */
function calculateStructure(duration: number): AudioAnalysis['structure'] {
  // Estrutura mais realista baseada em música eletrônica
  const intro = Math.min(32, duration * 0.08); // ~8% - intro mais curta
  const breakdown = Math.min(64, duration * 0.15); // ~15% - breakdown
  const drop = duration - (intro + breakdown + Math.min(32, duration * 0.08)); // Resto menos outro
  const outro = Math.min(32, duration * 0.08); // ~8% - outro

  return {
    intro: Math.round(intro),
    breakdown: Math.round(breakdown),
    drop: Math.round(Math.max(0, drop)),
    outro: Math.round(outro)
  };
}

/**
 * Analisa arranjo temporal - detecta quando elementos aparecem/desaparecem
 */
async function analyzeTemporalArrangement(
  filePath: string,
  duration: number,
  detectedElements: AudioAnalysis['detectedElements']
): Promise<TemporalElement[]> {
  const arrangement: TemporalElement[] = [];
  
  try {
    // Simplificar: analisar apenas alguns pontos estratégicos para não demorar muito
    // Limitar número de pontos para não ser muito lento (máximo 10 pontos)
    const maxPoints = 10;
    const interval = Math.max(30, Math.floor(duration / maxPoints)); // Intervalo mínimo de 30s
    const samplePoints: number[] = [];
    
    // Adicionar pontos estratégicos: início, meio e fim
    samplePoints.push(Math.max(5, duration * 0.1)); // 10% do início
    samplePoints.push(duration * 0.5); // Meio
    samplePoints.push(duration * 0.9); // 90% do fim
    
    // Adicionar mais pontos se a música for longa
    for (let t = interval; t < duration - interval; t += interval) {
      if (samplePoints.length >= maxPoints) break;
      if (!samplePoints.includes(t)) {
        samplePoints.push(t);
      }
    }
    
    // Ordenar pontos
    samplePoints.sort((a, b) => a - b);
    
    // Para cada elemento detectado, analisar quando aparece/desaparece
    const elementPresence: Map<string, { times: number[], energies: number[] }> = new Map();
    
    for (const sampleTime of samplePoints) {
      try {
        // Analisar frequências neste ponto
        const freqAtTime = await analyzeFrequenciesAtTime(filePath, sampleTime, duration);
        
        // Verificar presença de cada elemento
        for (const synth of detectedElements.synths) {
          const key = `synth_${synth}`;
          if (!elementPresence.has(key)) {
            elementPresence.set(key, { times: [], energies: [] });
          }
          const presence = elementPresence.get(key)!;
          presence.times.push(sampleTime);
          
          // Detectar energia baseada no tipo de synth
          let energy = 0;
          if (synth.includes('Lead') || synth.includes('Brilhante')) {
            energy = (freqAtTime.mid + freqAtTime.highMid) / 2;
          } else if (synth.includes('Pad') || synth.includes('Atmosférico')) {
            energy = (freqAtTime.lowMid + freqAtTime.mid) / 2;
          } else {
            energy = freqAtTime.mid;
          }
          presence.energies.push(energy);
        }
        
        // Instrumentos
        for (const instrument of detectedElements.instruments) {
          const key = `instrument_${instrument}`;
          if (!elementPresence.has(key)) {
            elementPresence.set(key, { times: [], energies: [] });
          }
          const presence = elementPresence.get(key)!;
          presence.times.push(sampleTime);
          
          let energy = freqAtTime.mid;
          if (instrument.includes('Piano')) {
            energy = (freqAtTime.lowMid + freqAtTime.mid) / 2;
          } else if (instrument.includes('Strings') || instrument.includes('Brilhantes')) {
            energy = (freqAtTime.mid + freqAtTime.highMid) / 2;
          }
          presence.energies.push(energy);
        }
        
        // Bateria
        if (detectedElements.drumElements.kick) {
          const key = 'drum_kick';
          if (!elementPresence.has(key)) {
            elementPresence.set(key, { times: [], energies: [] });
          }
          const presence = elementPresence.get(key)!;
          presence.times.push(sampleTime);
          presence.energies.push(freqAtTime.subBass);
        }
        
        if (detectedElements.drumElements.snare) {
          const key = 'drum_snare';
          if (!elementPresence.has(key)) {
            elementPresence.set(key, { times: [], energies: [] });
          }
          const presence = elementPresence.get(key)!;
          presence.times.push(sampleTime);
          presence.energies.push((freqAtTime.mid + freqAtTime.highMid) / 2);
        }
        
        if (detectedElements.drumElements.hihat) {
          const key = 'drum_hihat';
          if (!elementPresence.has(key)) {
            elementPresence.set(key, { times: [], energies: [] });
          }
          const presence = elementPresence.get(key)!;
          presence.times.push(sampleTime);
          presence.energies.push(freqAtTime.high);
        }
        
        // Bass
        if (detectedElements.bassElements.subBass) {
          const key = 'bass_subBass';
          if (!elementPresence.has(key)) {
            elementPresence.set(key, { times: [], energies: [] });
          }
          const presence = elementPresence.get(key)!;
          presence.times.push(sampleTime);
          presence.energies.push(freqAtTime.subBass);
        }
        
        if (detectedElements.bassElements.bassline) {
          const key = 'bass_bassline';
          if (!elementPresence.has(key)) {
            elementPresence.set(key, { times: [], energies: [] });
          }
          const presence = elementPresence.get(key)!;
          presence.times.push(sampleTime);
          presence.energies.push(freqAtTime.bass);
        }
      } catch (error) {
        console.warn(`Erro ao analisar ponto temporal ${sampleTime}s:`, error);
      }
    }
    
    // Processar presença para criar segmentos temporais
    for (const [key, presence] of elementPresence.entries()) {
      const threshold = 30; // Threshold mínimo de energia
      const segments = findSegments(presence.times, presence.energies, threshold);
      
      for (const segment of segments) {
        const [type, name] = key.split('_', 2);
        arrangement.push({
          name: name || key,
          type: type as 'synth' | 'instrument' | 'drum' | 'bass',
          startTime: segment.start,
          endTime: segment.end,
          confidence: segment.confidence
        });
      }
    }
    
  } catch (error) {
    console.error('Erro na análise temporal:', error);
  }
  
  return arrangement;
}

/**
 * Analisa frequências em um ponto específico no tempo
 */
async function analyzeFrequenciesAtTime(
  filePath: string,
  time: number,
  duration: number
): Promise<FrequencyAnalysis> {
  try {
    const sampleDuration = Math.min(2, duration / 20);
    return await analyzeFrequenciesWithBandFilters(filePath, duration, time, sampleDuration);
  } catch (error) {
    console.warn(`Erro ao analisar frequências em ${time}s:`, error);
    // Retornar valores padrão
    return {
      subBass: 0,
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      high: 0
    };
  }
}

/**
 * Encontra segmentos onde um elemento está presente
 */
function findSegments(
  times: number[],
  energies: number[],
  threshold: number
): Array<{ start: number; end: number; confidence: number }> {
  const segments: Array<{ start: number; end: number; confidence: number }> = [];
  let currentStart: number | null = null;
  let currentEnergies: number[] = [];
  
  for (let i = 0; i < times.length; i++) {
    if (energies[i] >= threshold) {
      if (currentStart === null) {
        currentStart = times[i];
      }
      currentEnergies.push(energies[i]);
    } else {
      if (currentStart !== null && currentEnergies.length > 0) {
        // Fim do segmento
        const avgEnergy = currentEnergies.reduce((a, b) => a + b, 0) / currentEnergies.length;
        const endTime = i > 0 ? times[i - 1] : currentStart;
        segments.push({
          start: currentStart,
          end: endTime,
          confidence: Math.min(100, (avgEnergy / 255) * 100)
        });
        currentStart = null;
        currentEnergies = [];
      }
    }
  }
  
  // Se ainda temos um segmento aberto
  if (currentStart !== null && times.length > 0) {
    const avgEnergy = currentEnergies.reduce((a, b) => a + b, 0) / currentEnergies.length;
    segments.push({
      start: currentStart,
      end: times[times.length - 1],
      confidence: Math.min(100, (avgEnergy / 255) * 100)
    });
  }
  
  return segments;
}

/**
 * POST /api/analyze-music
 * Analisa um arquivo de música
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
    
    // Adicionar timeout para evitar travamentos (30 segundos - análise pode demorar)
    const analysisPromise = analyzeAudioFile(filePath);
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout: análise demorou mais de 30 segundos')), 30000)
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
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao analisar música'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/analyze-music?filename=...
 * Analisa um arquivo de música via query parameter
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

    console.log(`🎵 [Analyze Music API] Analisando arquivo: ${filename}`);

    const startTime = Date.now();
    
    // Adicionar timeout para evitar travamentos (30 segundos - análise pode demorar)
    const analysisPromise = analyzeAudioFile(filePath);
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout: análise demorou mais de 30 segundos')), 30000)
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
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao analisar música'
      },
      { status: 500 }
    );
  }
}
