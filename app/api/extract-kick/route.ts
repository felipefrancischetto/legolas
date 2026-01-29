import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, statSync } from 'fs';
import { getDownloadsPath } from '../utils/common';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface KickCandidate {
  time: number;              // Tempo exato do início do kick (transiente)
  amplitude: number;         // Amplitude do pico (0-1)
  beforeAmplitude: number;   // Amplitude antes do kick (para isolamento)
  attackSpeed: number;       // Velocidade do ataque (quão abrupto é o transiente)
  quality: number;           // Score geral baseado na onda sonora
}

/**
 * Analisa a onda sonora da música inteira para encontrar todos os picos (transientes)
 * Retorna array de picos com tempo e amplitude
 */
async function analyzeWaveformPeaks(filePath: string, duration: number): Promise<Array<{ time: number; amplitude: number }>> {
  const peaks: Array<{ time: number; amplitude: number }> = [];
  
  // Analisar a música em janelas pequenas para detectar picos de amplitude
  // Focar nos primeiros 60 segundos onde kicks são mais limpos
  const maxTime = Math.min(60, duration);
  const windowSize = 0.1; // Janelas de 100ms
  const step = 0.05; // Analisar a cada 50ms para não perder picos
  
  console.log(`[Extract Kick] Analisando onda sonora de 0s até ${maxTime.toFixed(1)}s...`);
  
  for (let t = 1; t < maxTime; t += step) {
    try {
      // Analisar amplitude da onda sonora (time-domain) sem filtros de frequência
      // Usar astats para pegar o peak level que representa a amplitude máxima da onda
      const command = `ffmpeg -i "${filePath}" -ss ${t} -t ${windowSize} -af "astats=metadata=1:reset=1" -f null -`;
      
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 5,
        timeout: 2000
      });
      
      const output = (stdout || '') + (stderr || '');
      const peakMatches = output.match(/Peak level:\s*([-\d.]+)\s*dB/g) || [];
      
      if (peakMatches.length > 0) {
        // Pegar o último peak level (mais recente na janela)
        const peakMatch = peakMatches[peakMatches.length - 1].match(/([-\d.]+)/);
        if (peakMatch) {
          const peakDb = parseFloat(peakMatch[1]);
          
          // Converter dB para amplitude linear (0-1)
          // dB = 20 * log10(amplitude), então amplitude = 10^(dB/20)
          // Normalizar: -60dB = 0.001, 0dB = 1.0
          const amplitude = Math.max(0, Math.min(1, Math.pow(10, peakDb / 20)));
          
          // Só considerar picos significativos (acima de -40dB = amplitude ~0.01)
          if (peakDb > -40) {
            peaks.push({ time: t, amplitude });
          }
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  console.log(`[Extract Kick] Encontrados ${peaks.length} picos de amplitude na onda sonora`);
  return peaks;
}

/**
 * Analisa um pico específico para determinar se é um kick e calcular sua qualidade
 * Verifica isolamento temporal (amplitude antes E depois) e prioriza kicks mais altos e isolados
 */
async function analyzePeakQuality(
  filePath: string,
  peak: { time: number; amplitude: number }
): Promise<KickCandidate | null> {
  try {
    // 1. Analisar amplitude ANTES do pico (0.2s antes) para medir isolamento temporal
    let beforeAmplitude = 0;
    try {
      const beforeCommand = `ffmpeg -i "${filePath}" -ss ${Math.max(0, peak.time - 0.2)} -t 0.15 -af "astats=metadata=1:reset=1" -f null -`;
      const { stdout, stderr } = await execAsync(beforeCommand, {
        maxBuffer: 1024 * 1024 * 5,
        timeout: 2000
      });
      
      const output = (stdout || '') + (stderr || '');
      const beforePeaks = output.match(/Peak level:\s*([-\d.]+)\s*dB/g) || [];
      if (beforePeaks.length > 0) {
        const beforeMatch = beforePeaks[beforePeaks.length - 1].match(/([-\d.]+)/);
        if (beforeMatch) {
          const beforeDb = parseFloat(beforeMatch[1]);
          beforeAmplitude = Math.max(0, Math.min(1, Math.pow(10, beforeDb / 20)));
        }
      }
    } catch (error) {
      beforeAmplitude = 0; // Assumir silêncio antes (bom isolamento)
    }
    
    // 2. Analisar amplitude DEPOIS do pico (0.2s depois) para medir isolamento completo
    let afterAmplitude = 0;
    try {
      const afterCommand = `ffmpeg -i "${filePath}" -ss ${peak.time + 0.05} -t 0.15 -af "astats=metadata=1:reset=1" -f null -`;
      const { stdout, stderr } = await execAsync(afterCommand, {
        maxBuffer: 1024 * 1024 * 5,
        timeout: 2000
      });
      
      const output = (stdout || '') + (stderr || '');
      const afterPeaks = output.match(/Peak level:\s*([-\d.]+)\s*dB/g) || [];
      if (afterPeaks.length > 0) {
        const afterMatch = afterPeaks[afterPeaks.length - 1].match(/([-\d.]+)/);
        if (afterMatch) {
          const afterDb = parseFloat(afterMatch[1]);
          afterAmplitude = Math.max(0, Math.min(1, Math.pow(10, afterDb / 20)));
        }
      }
    } catch (error) {
      afterAmplitude = 0; // Assumir silêncio depois (bom isolamento)
    }
    
    // 3. Analisar velocidade de ataque (quão rápido o pico sobe)
    let attackSpeed = 0;
    try {
      // Antes: 20ms antes do pico
      const beforeAttackCommand = `ffmpeg -i "${filePath}" -ss ${Math.max(0, peak.time - 0.02)} -t 0.01 -af "astats=metadata=1:reset=1" -f null -`;
      const { stdout: beforeAttackOut, stderr: beforeAttackErr } = await execAsync(beforeAttackCommand, {
        maxBuffer: 1024 * 1024 * 5,
        timeout: 2000
      });
      
      const beforeAttackOutput = (beforeAttackOut || '') + (beforeAttackErr || '');
      const beforeAttackPeaks = beforeAttackOutput.match(/Peak level:\s*([-\d.]+)\s*dB/g) || [];
      let beforeAttackDb = -60;
      if (beforeAttackPeaks.length > 0) {
        const match = beforeAttackPeaks[beforeAttackPeaks.length - 1].match(/([-\d.]+)/);
        if (match) beforeAttackDb = parseFloat(match[1]);
      }
      
      // Durante: 10ms no pico
      const duringAttackCommand = `ffmpeg -i "${filePath}" -ss ${peak.time} -t 0.01 -af "astats=metadata=1:reset=1" -f null -`;
      const { stdout: duringAttackOut, stderr: duringAttackErr } = await execAsync(duringAttackCommand, {
        maxBuffer: 1024 * 1024 * 5,
        timeout: 2000
      });
      
      const duringAttackOutput = (duringAttackOut || '') + (duringAttackErr || '');
      const duringAttackPeaks = duringAttackOutput.match(/Peak level:\s*([-\d.]+)\s*dB/g) || [];
      let duringAttackDb = -60;
      if (duringAttackPeaks.length > 0) {
        const match = duringAttackPeaks[duringAttackPeaks.length - 1].match(/([-\d.]+)/);
        if (match) duringAttackDb = parseFloat(match[1]);
      }
      
      // Velocidade de ataque = diferença entre durante e antes (quanto maior, mais abrupto)
      attackSpeed = Math.max(0, duringAttackDb - beforeAttackDb);
    } catch (error) {
      attackSpeed = 10; // Valor padrão
    }
    
    // 4. Calcular isolamento total (média entre antes e depois)
    // Quanto menor a amplitude ao redor, melhor o isolamento
    const avgSurroundingAmplitude = (beforeAmplitude + afterAmplitude) / 2;
    const isolation = peak.amplitude - avgSurroundingAmplitude;
    
    // 5. Score de qualidade PRIORIZANDO AMPLITUDE MÁXIMA e ISOLAMENTO:
    // - Alta amplitude do pico (50%) - PRIORIDADE MÁXIMA
    // - Bom isolamento temporal (40%) - menos elementos ao redor
    // - Velocidade de ataque (10%) - menos importante
    const amplitudeScore = peak.amplitude * 100; // 0-100 (kick mais alto = melhor)
    const isolationScore = Math.min(100, Math.max(0, (isolation / 0.6) * 100)); // Normalizar (quanto maior diferença, melhor)
    const attackScore = Math.min(100, (attackSpeed / 30) * 100); // Normalizar
    
    const quality = (amplitudeScore * 0.5) + (isolationScore * 0.4) + (attackScore * 0.1);
    
    // Critérios mais rigorosos: precisa ter amplitude alta E bom isolamento
    // Reduzir threshold de isolamento para aceitar mais kicks, mas priorizar os melhores
    if (quality > 25 && isolation > 0.05 && peak.amplitude > 0.1) {
      return {
        time: peak.time,
        amplitude: peak.amplitude,
        beforeAmplitude: avgSurroundingAmplitude,
        attackSpeed,
        quality
      };
    }
    
    return null;
  } catch (error) {
    return null;
  }
}


/**
 * Encontra o melhor kick limpo da música analisando a onda sonora
 * Analisa TODA a onda para encontrar picos e seleciona o mais limpo
 */
async function findBestKick(filePath: string, duration: number): Promise<KickCandidate> {
  console.log(`[Extract Kick] 🎵 Analisando onda sonora completa para encontrar picos de kick...`);
  
  // 1. Analisar toda a onda sonora para encontrar todos os picos
  const peaks = await analyzeWaveformPeaks(filePath, duration);
  
  if (peaks.length === 0) {
    console.log('[Extract Kick] Nenhum pico encontrado - usando fallback (2.0s)');
    return {
      time: 2.0,
      amplitude: 0.5,
      beforeAmplitude: 0.1,
      attackSpeed: 15,
      quality: 40
    };
  }
  
  // 2. Filtrar picos muito próximos (manter apenas o maior de cada grupo)
  // Kicks geralmente estão espaçados por pelo menos 0.3s
  const filteredPeaks: Array<{ time: number; amplitude: number }> = [];
  const minDistance = 0.3; // Mínimo 300ms entre kicks
  
  peaks.sort((a, b) => b.amplitude - a.amplitude); // Ordenar por amplitude (maior primeiro)
  
  for (const peak of peaks) {
    // Verificar se não há outro pico muito próximo já adicionado
    const tooClose = filteredPeaks.some(p => Math.abs(p.time - peak.time) < minDistance);
    if (!tooClose) {
      filteredPeaks.push(peak);
    }
  }
  
  console.log(`[Extract Kick] ${filteredPeaks.length} picos únicos após filtrar duplicatas próximas`);
  
  // 3. Analisar qualidade de cada pico (isolamento temporal e velocidade de ataque)
  const candidates: KickCandidate[] = [];
  
  // Priorizar primeiros 45 segundos (kicks introdutórios são mais limpos)
  const priorityPeaks = filteredPeaks.filter(p => p.time <= 45);
  const otherPeaks = filteredPeaks.filter(p => p.time > 45);
  
  // Analisar picos prioritários primeiro
  for (const peak of priorityPeaks.slice(0, 20)) { // Limitar a 20 para não demorar muito
    const candidate = await analyzePeakQuality(filePath, peak);
    if (candidate) {
      // Aumentar qualidade de picos nos primeiros 45s
      candidate.quality *= 1.2;
      candidates.push(candidate);
    }
  }
  
  // Se não encontrou bons candidatos, analisar outros picos
  if (candidates.length < 3) {
    for (const peak of otherPeaks.slice(0, 10)) {
      const candidate = await analyzePeakQuality(filePath, peak);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }
  
  console.log(`[Extract Kick] ${candidates.length} candidatos válidos após análise de qualidade`);
  
  if (candidates.length === 0) {
    // Fallback: usar o pico com maior amplitude
    console.log('[Extract Kick] Nenhum candidato válido - usando pico com maior amplitude');
    const bestPeak = filteredPeaks[0];
    return {
      time: bestPeak.time,
      amplitude: bestPeak.amplitude,
      beforeAmplitude: bestPeak.amplitude * 0.3,
      attackSpeed: 20,
      quality: bestPeak.amplitude * 100
    };
  }
  
  // 4. Ordenar por qualidade (prioriza amplitude máxima + isolamento)
  // Primeiro por qualidade, depois por amplitude como tie-breaker
  candidates.sort((a, b) => {
    if (Math.abs(b.quality - a.quality) < 5) {
      // Se qualidade muito próxima, priorizar amplitude máxima
      return b.amplitude - a.amplitude;
    }
    return b.quality - a.quality;
  });
  
  const bestKick = candidates[0];
  
  console.log(`[Extract Kick] ✅ Melhor kick encontrado (mais alto e isolado):`);
  console.log(`  - Tempo: ${bestKick.time.toFixed(3)}s`);
  console.log(`  - Amplitude: ${(bestKick.amplitude * 100).toFixed(1)}% (kick mais alto)`);
  console.log(`  - Isolamento: ${((bestKick.amplitude - bestKick.beforeAmplitude) * 100).toFixed(1)}% (menos elementos ao redor)`);
  console.log(`  - Velocidade de ataque: ${bestKick.attackSpeed.toFixed(1)}dB`);
  console.log(`  - Qualidade: ${bestKick.quality.toFixed(1)}`);
  
  return bestKick;
}

/**
 * Valida se o arquivo extraído tem áudio
 */
async function validateAudioFile(filePath: string): Promise<boolean> {
  try {
    if (!existsSync(filePath)) {
      return false;
    }
    
    const stats = statSync(filePath);
    if (stats.size < 1000) {
      return false;
    }
    
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_streams "${filePath}"`,
      { maxBuffer: 1024 * 1024, timeout: 5000 }
    );
    
    const probeData = JSON.parse(stdout);
    const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio');
    
    if (!audioStream) {
      return false;
    }
    
    const duration = parseFloat(audioStream.duration || '0');
    const bitrate = parseInt(audioStream.bit_rate || '0', 10);
    
    return duration > 0.1 && bitrate > 0;
  } catch (error) {
    console.error('[Extract Kick] Erro ao validar áudio:', error);
    return false;
  }
}

/**
 * Extrai e processa o kick para sampler
 * Usa o tempo exato encontrado na análise da onda sonora
 */
async function extractKick(
  filePath: string,
  kickCandidate: KickCandidate,
  outputPath: string
): Promise<void> {
  try {
    // Extrair segmento otimizado para sampler:
    // - Começar um pouco antes do pico para capturar o início completo do transiente
    // - Duração de 0.8s para capturar kick completo (ataque + corpo + decay + tail)
    const startTime = Math.max(0, kickCandidate.time - 0.02); // 20ms antes do pico
    const duration = 0.8;
    
    console.log(`[Extract Kick] Extraindo kick de ${startTime.toFixed(3)}s por ${duration}s`);
    
    // Processamento para sampler limpo:
    // 1. Filtrar frequências de kick (20-250Hz) - range amplo para capturar harmônicos do kick
    // 2. Normalizar volume (aumentar se necessário)
    // 3. Fade in/out suave para evitar clicks e pops
    // 4. Usar precisão de seek com -ss antes de -i para melhor precisão
    const command = `ffmpeg -ss ${startTime} -i "${filePath}" -t ${duration} ` +
      `-af "` +
      `highpass=f=20,` +           // Filtro passa-alta para remover ruído sub-sônico
      `lowpass=f=250,` +            // Filtro passa-baixa para isolar kick e harmônicos
      `volume=1.8,` +               // Aumentar volume para sampler
      `afade=t=in:st=0:d=0.005,` +  // Fade in muito curto no início (5ms) para evitar click
      `afade=t=out:st=${duration - 0.08}:d=0.08` + // Fade out suave no final (80ms)
      `" ` +
      `-acodec pcm_s16le -ar 44100 -ac 2 "${outputPath}" -y`;
    
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 10,
      timeout: 30000
    });
    
    // Validar que o arquivo extraído tem áudio válido
    const isValid = await validateAudioFile(outputPath);
    if (!isValid) {
      throw new Error('Arquivo extraído está vazio ou inválido');
    }
    
    // Verificar se o arquivo tem tamanho razoável (pelo menos 50KB para um kick de 0.8s)
    const stats = statSync(outputPath);
    if (stats.size < 50000) {
      throw new Error(`Arquivo extraído muito pequeno (${stats.size} bytes) - possível erro na extração`);
    }
    
    console.log(`[Extract Kick] ✅ Kick processado e salvo: ${outputPath} (${(stats.size / 1024).toFixed(1)}KB)`);
  } catch (error) {
    console.error('[Extract Kick] Erro ao extrair kick:', error);
    throw error;
  }
}

/**
 * POST /api/extract-kick
 * Extrai o melhor kick limpo de uma música para uso como sampler
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

    console.log(`🎵 [Extract Kick] Iniciando busca do melhor kick limpo em: ${filename}`);

    // Obter duração do arquivo
    const { stdout: probeOutput } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format "${filePath}"`,
      { maxBuffer: 1024 * 1024 * 10 }
    );

    const probeData = JSON.parse(probeOutput);
    const duration = parseFloat(probeData.format?.duration || '0');

    if (duration === 0) {
      return NextResponse.json(
        { success: false, error: 'Não foi possível obter duração do arquivo' },
        { status: 400 }
      );
    }

    // Encontrar o melhor kick
    const bestKick = await findBestKick(filePath, duration);

    // Criar pasta para kicks extraídos
    const kicksFolder = join(downloadsPath, 'kicks');
    mkdirSync(kicksFolder, { recursive: true });

    // Gerar nome do arquivo de saída
    const baseName = filename.replace(/\.(mp3|flac|wav|m4a)$/i, '');
    const outputFilename = `${baseName}_kick_${bestKick.time.toFixed(2)}s.wav`;
    const outputPath = join(kicksFolder, outputFilename);

    // Extrair e processar o kick
    await extractKick(filePath, bestKick, outputPath);

    // Calcular isolamento percentual
    const isolationPercent = Math.round((bestKick.amplitude - bestKick.beforeAmplitude) * 100);
    const amplitudePercent = Math.round(bestKick.amplitude * 100);

    return NextResponse.json({
      success: true,
      kick: {
        time: bestKick.time,
        attackTime: bestKick.time,
        quality: Math.round(bestKick.quality),
        isolation: isolationPercent,
        amplitude: amplitudePercent,
        temporalIsolation: isolationPercent,
        filename: outputFilename
      }
    });

  } catch (error) {
    console.error('❌ [Extract Kick] Erro:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao extrair kick'
      },
      { status: 500 }
    );
  }
}
