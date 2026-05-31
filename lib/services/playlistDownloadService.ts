import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, access, readFile, readdir, stat, rename } from 'fs/promises';
import { join } from 'path';
import { constants } from 'fs';
import { existsSync } from 'fs';
import NodeID3 from 'node-id3';
import { metadataAggregator } from './metadataService';
import { logger } from '../utils/logger';
import { scrapeTracklist } from '../tracklistScraper';
import { sendProgressEvent } from '../utils/progressEventService';
import {
  getDownloadsPath,
  ensureValidCookies,
  hasValidCookiesFile,
  runFfmpegCopyWithMetadata,
  type FfmpegMetadataEntry,
} from '@/app/api/utils/common';

const execAsync = promisify(exec);

export interface PlaylistDownloadOptions {
  format?: 'mp3' | 'flac' | 'wav';
  quality?: string;
  enhanceMetadata?: boolean;
  maxConcurrent?: number;
  useBeatport?: boolean;
  showBeatportPage?: boolean;
  downloadId?: string; // Para eventos SSE
}

export interface PlaylistDownloadResult {
  success: boolean;
  totalTracks: number;
  processedTracks: number;
  enhancedTracks: number;
  errors: string[];
  downloadPath: string;
  beatportTracksFound?: number;
  tracklistScraping?: any[];
}

// getDownloadsPath agora é importado de @/app/api/utils/common

function sanitizeTitle(title: string): string {
  // Preservar caracteres especiais importantes para música, mas remover caracteres problemáticos para arquivos
  // O caractere '+' é válido em nomes de arquivo no Windows, então vamos mantê-lo
  // Mas vamos garantir que não há problemas com múltiplos '+' consecutivos
  return title
    .replace(/[<>:"/\\|?*]/g, '') // Remover apenas caracteres inválidos para nomes de arquivo
    .replace(/\+\+/g, '+') // Normalizar múltiplos '+' consecutivos
    .replace(/\s+/g, ' ') // Normalizar espaços múltiplos
    .trim();
}

function escapePathForWindows(path: string): string {
  // Escapar caminho para uso no Windows/PowerShell
  // PowerShell usa "" para escapar aspas duplas dentro de strings entre aspas
  return path.replace(/"/g, '""');
}

function deduplicateLabel(label: string): string {
  if (!label) return '';
  
  // Primeiro, limpar e normalizar o label
  let cleaned = label.trim();
  
  // Casos específicos conhecidos de duplicação
  const specificCases = [
    { pattern: /BMG Rights Management \(UK\) LimitedBMG Limited/gi, replacement: 'BMG Rights Management (UK) Limited' },
    { pattern: /Sony Music EntertainmentSony Music/gi, replacement: 'Sony Music Entertainment' },
    { pattern: /Warner Music GroupWarner Music/gi, replacement: 'Warner Music Group' }
  ];
  
  // Aplicar correções específicas
  for (const case_ of specificCases) {
    cleaned = cleaned.replace(case_.pattern, case_.replacement);
  }
  
  // Detectar e remover duplicação específica como "LimitedBMG Limited"
  // Padrão: palavra seguida imediatamente pela mesma palavra (sem espaço)
  cleaned = cleaned.replace(/([A-Z][a-z]+)\1/g, '$1');
  
  // Detectar e remover duplicação no final (como "LimitedBMG Limited")
  // Padrão: palavra seguida imediatamente pela mesma palavra
  const match = cleaned.match(/^(.+?)([A-Z][a-z]+)\2$/);
  if (match) {
    cleaned = match[1] + match[2];
  }
  
  // Remover duplicação de palavras consecutivas
  cleaned = cleaned
    .replace(/(\w+)\s+\1/gi, '$1') // Remove palavras consecutivas duplicadas
    .replace(/\s+/g, ' ') // Normalize espaços
    .trim();
  
  // Se ainda houver duplicação óbvia, tentar uma abordagem mais agressiva
  const words = cleaned.split(/\s+/);
  const uniqueWords: string[] = [];
  
  for (const word of words) {
    // Verificar se a palavra já existe (case-insensitive)
    const exists = uniqueWords.some(existing => 
      existing.toLowerCase() === word.toLowerCase()
    );
    if (!exists) {
      uniqueWords.push(word);
    }
  }
  
  return uniqueWords.join(' ').trim();
}

function cleanArtistName(artist: string): string {
  if (!artist) return '';
  // Remove sufixos comuns do YouTube e plataformas
  return artist
    .replace(/\s*[-–—]\s*(Topic|Official|Subject|Channel|VEVO| - .*|\(.*\)|\[.*\])$/gi, '')
    .replace(/\s*\(.*?\)$/g, '')
    .replace(/\s*\[.*?\]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class PlaylistDownloadService {
  async downloadPlaylist(
    url: string, 
    options: PlaylistDownloadOptions = {}
  ): Promise<PlaylistDownloadResult & { tracklistScraping?: any[] }> {
    const {
      format = 'flac',
      quality = '10',
      enhanceMetadata = true,
      maxConcurrent = 3,
      useBeatport = false,
      showBeatportPage = false,
      downloadId
    } = options;

    logger.info(`🎵 Playlist download options:`, {
      format,
      enhanceMetadata,
      useBeatport,
      showBeatportPage,
      maxConcurrent
    });

    // Obter o caminho de downloads
    let downloadsFolder: string;
    try {
      downloadsFolder = await getDownloadsPath();
      logger.info(`📁 [Playlist] Caminho de downloads obtido: ${downloadsFolder}`);
    } catch (pathError) {
      const errorMsg = pathError instanceof Error ? pathError.message : String(pathError);
      logger.error(`❌ [Playlist] Erro ao obter caminho de downloads: ${errorMsg}`);
      throw new Error(`Erro ao obter caminho de downloads: ${errorMsg}`);
    }

    // Criar pasta de downloads se não existir
    try {
      await mkdir(downloadsFolder, { recursive: true });
      // Verificar se a pasta foi criada e é acessível
      await access(downloadsFolder, constants.F_OK);
      await readdir(downloadsFolder);
      logger.info(`✅ [Playlist] Pasta de downloads criada/verificada: ${downloadsFolder}`);
    } catch (mkdirError) {
      const errorMsg = mkdirError instanceof Error ? mkdirError.message : String(mkdirError);
      logger.error(`❌ [Playlist] Erro ao criar/verificar pasta de downloads: ${downloadsFolder}`);
      logger.error(`   Erro: ${errorMsg}`);
      throw new Error(`Não foi possível criar ou acessar a pasta de downloads: ${downloadsFolder}. Erro: ${errorMsg}`);
    }

    // Verificar e garantir cookies válidos antes de iniciar downloads
    logger.info(`🍪 [Playlist] Verificando cookies do YouTube...`);
    const hasValidCookies = await hasValidCookiesFile();
    if (!hasValidCookies) {
      logger.warn(`⚠️ [Playlist] Cookies não encontrados - tentando extrair automaticamente do browser...`);
      if (downloadId) {
        sendProgressEvent(downloadId, {
          type: 'info',
          step: 'Extraindo cookies do browser...',
          progress: 5,
          substep: 'Isso pode levar alguns segundos'
        });
      }
      const cookiesExtracted = await ensureValidCookies();
      if (cookiesExtracted) {
        logger.info(`✅ [Playlist] Cookies extraídos com sucesso!`);
      } else {
        logger.warn(`⚠️ [Playlist] Não foi possível extrair cookies automaticamente. Downloads podem falhar.`);
        logger.warn(`💡 [Playlist] Dica: Execute manualmente: yt-dlp --cookies-from-browser chrome --cookies cookies.txt "https://www.youtube.com/watch?v=dQw4w9WgXcQ"`);
      }
    } else {
      logger.info(`✅ [Playlist] Cookies válidos encontrados`);
    }

    const result: PlaylistDownloadResult = {
      success: false,
      totalTracks: 0,
      processedTracks: 0,
      enhancedTracks: 0,
      errors: [],
      downloadPath: downloadsFolder,
      beatportTracksFound: 0
    };

    let scrapedTracklist: any[] = [];

    try {
      // Get playlist info to determine number of tracks
      logger.info('🔍 Getting playlist information...');
      
      if (downloadId) {
        sendProgressEvent(downloadId, {
          type: 'info',
          step: 'Extraindo informações da playlist...',
          progress: 20,
          substep: 'Conectando com YouTube'
        });
      }
      
      // Usar comando melhorado para garantir que todas as faixas sejam extraídas
      // Sem --playlist-end significa sem limite (todas as faixas)
      // --no-playlist-reverse mantém a ordem original
      let playlistInfo = '';
      let playlistStderr = '';
      
      // REMOVIDO: Verificação de cookies - usando apenas métodos sem cookies (mais rápido)
      logger.info(`[DEBUG] Usando métodos SEM cookies (mais rápido)`);
      
      // Lista de métodos de extração SEM cookies (prioridade: Android > iOS > Web > básico)
      const extractionMethods: string[] = [
        // Método 1: Android client (menos detectável)
        `yt-dlp --dump-json --flat-playlist --no-playlist-reverse --extractor-args "youtube:player_client=android" "${url}"`,
        // Método 2: iOS client
        `yt-dlp --dump-json --flat-playlist --no-playlist-reverse --extractor-args "youtube:player_client=ios" "${url}"`,
        // Método 3: Web client
        `yt-dlp --dump-json --flat-playlist --no-playlist-reverse --extractor-args "youtube:player_client=web" "${url}"`,
        // Método 4: Básico sem limite
        `yt-dlp --dump-json --flat-playlist --no-playlist-reverse "${url}"`,
        // Método 5: Básico com limite alto
        `yt-dlp --dump-json --flat-playlist --no-playlist-reverse --playlist-end 999999 "${url}"`,
        // Método 6: Comando básico
        `yt-dlp --dump-json --flat-playlist "${url}"`
      ];
      
      let extractionSuccess = false;
      let bestMethodIndex = -1;
      let maxLinesFound = 0;
      
      // Tentar todos os métodos e escolher o que retornar mais linhas
      for (let methodIndex = 0; methodIndex < extractionMethods.length; methodIndex++) {
        try {
          const methodType = 'SEM cookies';
          logger.info(`[DEBUG] Tentando método de extração ${methodIndex + 1}/${extractionMethods.length} (${methodType})...`);
          
          const result = await execAsync(
            extractionMethods[methodIndex],
            { maxBuffer: 1024 * 1024 * 100 } // 100MB buffer para playlists muito grandes
          );
          
          const testInfo = result.stdout;
          const testStderr = result.stderr || '';
          
          // Verificar se obtivemos resultados
          const testLines = testInfo.split('\n').filter(l => l.trim()).length;
          logger.info(`[DEBUG] Método ${methodIndex + 1} retornou ${testLines} linhas`);
          
          // Se este método retornou mais linhas que os anteriores, usar ele
          if (testLines > maxLinesFound) {
            maxLinesFound = testLines;
            bestMethodIndex = methodIndex;
            playlistInfo = testInfo;
            playlistStderr = testStderr;
            extractionSuccess = true;
            logger.info(`✅ Método ${methodIndex + 1} é o melhor até agora com ${testLines} linhas`);
          }
          
          // Se retornou muitas linhas (mais de 10), provavelmente pegou todas
          // Mas continuar testando todos os métodos para garantir que pegamos o máximo possível
          if (testLines > 10) {
            logger.info(`✅ Método ${methodIndex + 1} retornou ${testLines} linhas - bom resultado! Continuando para verificar se há mais...`);
          }
        } catch (error: any) {
          const errorMsg = error instanceof Error ? error.message.substring(0, 100) : 'Unknown error';
          logger.warn(`⚠️ Método ${methodIndex + 1} falhou: ${errorMsg}`);
          
          // Se for erro de cookies inválidos, continuar para próximo método
          if (errorMsg.includes('does not look like a Netscape format') || errorMsg.includes('cookie')) {
            logger.warn(`⚠️ Erro de cookies detectado, tentando próximo método...`);
            continue;
          }
          
          if (methodIndex === extractionMethods.length - 1 && !extractionSuccess) {
            // Se todos os métodos falharam, lançar erro
            logger.error(`❌ Todos os métodos de extração falharam`);
            throw error;
          }
        }
      }
      
      // Usar o melhor método encontrado
      if (bestMethodIndex >= 0) {
        logger.info(`✅ Usando método ${bestMethodIndex + 1} que retornou ${maxLinesFound} linhas`);
        
        // ⚠️ AVISO CRÍTICO: Se encontrou poucas faixas, pode ser um problema
        if (maxLinesFound <= 4) {
          logger.warn(`⚠️ ATENÇÃO: Apenas ${maxLinesFound} faixas encontradas!`);
          logger.warn(`⚠️ Isso pode indicar que o YouTube está limitando o acesso.`);
          logger.warn(`⚠️ URL testada: ${url}`);
        }
      }
      
      if (!extractionSuccess || !playlistInfo) {
        throw new Error('Falha ao extrair informações da playlist após tentar todos os métodos');
      }

      // Log do stderr para debug
      if (playlistStderr) {
        logger.info(`[DEBUG] yt-dlp stderr: ${playlistStderr.substring(0, 500)}`);
      }

      // Processar linhas JSON - algumas podem estar vazias ou inválidas
      const rawLines = playlistInfo.split('\n');
      logger.info(`[DEBUG] Total de linhas brutas recebidas: ${rawLines.length}`);
      
      const playlistEntries = rawLines
        .map((line, index) => {
          const trimmed = line.trim();
          if (!trimmed) return null;
          
          try {
            const parsed = JSON.parse(trimmed);
            // Verificar se é uma entrada válida (deve ter id e title)
            if (parsed && (parsed.id || parsed.url)) {
              return parsed;
            }
            return null;
          } catch (parseError) {
            // Log apenas se não for linha vazia
            if (trimmed.length > 0) {
              logger.warn(`[DEBUG] Erro ao fazer parse da linha ${index + 1}: ${trimmed.substring(0, 100)}`);
            }
            return null;
          }
        })
        .filter(entry => entry !== null && entry !== undefined);

      result.totalTracks = playlistEntries.length;
      logger.info(`📊 Found ${result.totalTracks} tracks in playlist (de ${rawLines.length} linhas brutas)`);
      
      // ⚠️ AVISO: Se encontrou poucas faixas, pode ser um problema de limite do yt-dlp
      if (result.totalTracks <= 4 && rawLines.length <= 4) {
        logger.warn(`⚠️ ATENÇÃO: Apenas ${result.totalTracks} faixas encontradas. Isso pode indicar um limite do yt-dlp ou problema de acesso.`);
        logger.warn(`⚠️ Se o álbum tem mais faixas, pode haver restrições do YouTube.`);
      }
      
      // Verificar se há entradas duplicadas ou problemas
      const uniqueIds = new Set(playlistEntries.map(e => e.id || e.url));
      if (uniqueIds.size !== playlistEntries.length) {
        logger.warn(`⚠️ Detectadas ${playlistEntries.length - uniqueIds.size} entradas duplicadas na playlist`);
      }
      
      // Log detalhado das entradas para debug
      if (playlistEntries.length > 0) {
        logger.info(`[DEBUG] Primeira entrada: ${JSON.stringify(playlistEntries[0]).substring(0, 200)}`);
        if (playlistEntries.length > 1) {
          logger.info(`[DEBUG] Última entrada: ${JSON.stringify(playlistEntries[playlistEntries.length - 1]).substring(0, 200)}`);
        }
        // Log de todas as entradas se houver poucas (para debug)
        if (playlistEntries.length <= 10) {
          logger.info(`[DEBUG] Todas as ${playlistEntries.length} entradas encontradas:`);
          playlistEntries.forEach((entry, idx) => {
            logger.info(`[DEBUG]   ${idx + 1}. ${entry.title || entry.id || 'sem título'} (ID: ${entry.id || 'N/A'})`);
          });
        }
      } else {
        logger.error(`❌ NENHUMA entrada válida encontrada na playlist!`);
      }
      
      if (downloadId) {
        sendProgressEvent(downloadId, {
          type: 'info',
          step: 'Informações da playlist extraídas',
          progress: 25,
          detail: `${result.totalTracks} faixas encontradas`,
          metadata: {
            totalTracks: result.totalTracks,
            format: format
          }
        });
      }
      // **NOVO FLUXO: Download + Metadata por música individual**
      logger.info('🎵 Starting sequential download with real-time metadata enhancement...');
      
      if (downloadId) {
        sendProgressEvent(downloadId, {
          type: 'download',
          step: 'Iniciando downloads sequenciais...',
          progress: 30,
          substep: 'Preparando processamento das faixas'
        });
      }
      
      await this.downloadAndProcessTracksSequentially(
        url,
        playlistEntries,
        downloadsFolder,
        format,
        quality,
        enhanceMetadata,
        useBeatport,
        showBeatportPage,
        result,
        downloadId // Passar downloadId
      );

      result.success = true;
      logger.info(`Playlist download completed. Enhanced ${result.enhancedTracks}/${result.totalTracks} tracks (Beatport: ${result.beatportTracksFound})`);

      // Evento final de conclusão - SEMPRE enviar
      if (downloadId) {
        const finalMetadata = {
          totalTracks: result.totalTracks,
          downloadedTracks: result.processedTracks,
          processedTracks: result.enhancedTracks, // Faixas totalmente concluídas
          enhancedTracks: result.enhancedTracks,
          beatportTracksFound: result.beatportTracksFound,
          errors: result.errors.length,
          currentTrack: result.totalTracks,
          isProcessingMetadata: false,
          isCompleted: true
        };

        console.log(`🎯 Enviando evento COMPLETE final da playlist para downloadId: ${downloadId}`);
        sendProgressEvent(downloadId, {
          type: 'complete',
          step: 'Playlist concluída com sucesso! 🎉',
          progress: 100,
          substep: 'Download finalizado',
          detail: `${result.processedTracks}/${result.totalTracks} faixas baixadas, ${result.enhancedTracks} com metadados`,
          metadata: finalMetadata
        });

        // 🔧 Aguardar um pouco para garantir que o evento seja processado
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log(`✅ Evento COMPLETE da playlist enviado com sucesso para: ${downloadId}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(errorMessage);
      logger.error('Playlist download failed:', error);
      
      // 🔧 Evento de erro com informações mais detalhadas
      if (downloadId) {
        console.log(`❌ Enviando evento ERROR da playlist para downloadId: ${downloadId}`);
        sendProgressEvent(downloadId, {
          type: 'error',
          step: 'Erro no download da playlist',
          progress: 0,
          detail: errorMessage,
          metadata: {
            totalTracks: result.totalTracks,
            processedTracks: result.processedTracks,
            errors: result.errors.length
          }
        });
      }
    }

    // Retorna também o scraping da tracklist junto do resultado
    return { ...result, tracklistScraping: scrapedTracklist };
  }

  private async downloadAndProcessTracksSequentially(
    playlistUrl: string,
    playlistEntries: any[],
    downloadsFolder: string,
    format: string,
    quality: string,
    enhanceMetadata: boolean,
    useBeatport: boolean,
    showBeatportPage: boolean,
    result: PlaylistDownloadResult,
    downloadId?: string
  ): Promise<void> {
    logger.info(`🚀 Processing ${playlistEntries.length} tracks sequentially...`);
    
    // Verificação crítica: garantir que temos entradas válidas
    if (!playlistEntries || playlistEntries.length === 0) {
      logger.error(`❌ Nenhuma entrada válida na playlist!`);
      result.errors.push('Playlist vazia ou sem entradas válidas');
      return;
    }
    
    // Log detalhado das entradas - CRÍTICO para debug
    logger.info(`[DEBUG] ==========================================`);
    logger.info(`[DEBUG] INÍCIO DO PROCESSAMENTO DA PLAYLIST`);
    logger.info(`[DEBUG] Total de entradas para processar: ${playlistEntries.length}`);
    logger.info(`[DEBUG] ==========================================`);
    
    // Listar TODAS as entradas se houver 10 ou menos, ou as primeiras e últimas se houver mais
    if (playlistEntries.length <= 10) {
      logger.info(`[DEBUG] TODAS as ${playlistEntries.length} entradas encontradas:`);
      playlistEntries.forEach((entry, idx) => {
        logger.info(`[DEBUG]   ${idx + 1}. ID: ${entry.id || 'N/A'}, Título: ${entry.title || 'sem título'}, URL: ${entry.url || 'N/A'}`);
      });
    } else {
      logger.info(`[DEBUG] Primeiras 5 entradas:`);
      playlistEntries.slice(0, 5).forEach((entry, idx) => {
        logger.info(`[DEBUG]   ${idx + 1}. ID: ${entry.id || 'N/A'}, Título: ${entry.title || 'sem título'}`);
      });
      logger.info(`[DEBUG] ... (${playlistEntries.length - 10} entradas omitidas) ...`);
      logger.info(`[DEBUG] Últimas 5 entradas:`);
      playlistEntries.slice(-5).forEach((entry, idx) => {
        const realIdx = playlistEntries.length - 5 + idx;
        logger.info(`[DEBUG]   ${realIdx + 1}. ID: ${entry.id || 'N/A'}, Título: ${entry.title || 'sem título'}`);
      });
    }
    logger.info(`[DEBUG] ==========================================`);

    // Contador para verificar se todas as faixas foram processadas
    let tracksProcessed = 0;
    let tracksSkipped = 0;
    let tracksFailed = 0;

    for (let i = 0; i < playlistEntries.length; i++) {
      const entry = playlistEntries[i];
      const trackNumber = i + 1;
      const totalTracks = playlistEntries.length;
      
      // Verificar se a entrada é válida antes de processar
      if (!entry || (!entry.id && !entry.url)) {
        logger.warn(`⚠️ Entrada ${trackNumber} inválida (sem ID ou URL), pulando...`);
        tracksSkipped++;
        continue;
      }
      
      logger.info(`\n🎵 [${trackNumber}/${totalTracks}] Processing: "${entry.title || entry.id || 'Unknown'}" (ID: ${entry.id || 'N/A'})`);
      tracksProcessed++;

      // Calcular progresso baseado na faixa atual (30-90%)
      const trackProgress = 30 + Math.round((trackNumber / totalTracks) * 60);
      
      if (downloadId) {
        sendProgressEvent(downloadId, {
          type: 'download',
          step: `Iniciando faixa ${trackNumber}/${totalTracks}`,
          progress: trackProgress,
          substep: `"${entry.title}"`,
          detail: `Preparando download`,
          playlistIndex: i,
          metadata: {
            totalTracks: totalTracks,
            downloadedTracks: result.processedTracks,
            processedTracks: result.enhancedTracks,
            enhancedTracks: result.enhancedTracks,
            beatportTracksFound: result.beatportTracksFound || 0,
            errors: result.errors.length,
            currentTrack: trackNumber,
            isProcessingMetadata: false
          }
        });
      }

      try {
        // 1. Download individual track
        const trackUrl = `https://www.youtube.com/watch?v=${entry.id}`;
        
        // Nome temporário para o download inicial - INCLUIR ID para evitar conflitos entre versões
        const baseTitle = sanitizeTitle(entry.title || 'Unknown');
        const tempFilename = `${baseTitle} [${entry.id}]`; // Incluir ID para garantir unicidade
        
        // Construir o caminho de saída sem aspas (serão adicionadas no comando)
        // Usar barras normais / que funcionam tanto no Windows quanto no Linux/Mac
        const outputPath = `${downloadsFolder.replace(/\\/g, '/')}/${tempFilename}.%(ext)s`;
        
        logger.info(`   📝 Título original: "${entry.title}"`);
        logger.info(`   📝 Título sanitizado: "${baseTitle}"`);
        logger.info(`   📝 Nome do arquivo temporário: ${tempFilename}.${format}`);
        logger.info(`   📝 Caminho de saída: ${outputPath}`);
        logger.info(`   📝 Caminho de saída (raw): ${downloadsFolder}/${tempFilename}.%(ext)s`);

        logger.info(`   ⬇️ Downloading track ${trackNumber}...`);
        
        // Estratégia diferente: Tentar múltiplos métodos com diferentes clientes do YouTube
        let downloadOutput = '';
        let downloadSuccess = false;
        let hadYouTubeIssues = false;
        
        // Verificar se há cookies disponíveis
        const { hasValidCookiesFile } = await import('@/app/api/utils/common');
        const hasValidCookies = await hasValidCookiesFile();
        const cookiesFlag = hasValidCookies ? '--cookies "cookies.txt" ' : '';
        
        logger.info(`   🍪 Cookies disponíveis: ${hasValidCookies ? 'Sim' : 'Não'}`);
        
        // Lista de estratégias de download (com cookies se disponíveis)
        // Escapar o outputPath para uso seguro em comandos (escapar aspas duplas)
        const escapedOutputPath = outputPath.replace(/"/g, '\\"');
        const downloadStrategies = [
          // Estratégia 1: Cliente Android (menos detectável) - COM cookies se disponíveis
          {
            name: 'Android Client',
            command: `yt-dlp -x --audio-format ${format} --audio-quality ${quality} ` +
              `${cookiesFlag}` +
              `--embed-thumbnail --convert-thumbnails jpg ` +
              `--add-metadata ` +
              `--extractor-args "youtube:player_client=android" ` +
              `--sleep-interval 1 --max-sleep-interval 2 ` +
              `--no-playlist ` +
              `-o "${escapedOutputPath}" ` +
              `--no-part --force-overwrites "${trackUrl}"`
          },
          // Estratégia 2: Cliente iOS - COM cookies se disponíveis
          {
            name: 'iOS Client',
            command: `yt-dlp -x --audio-format ${format} --audio-quality ${quality} ` +
              `${cookiesFlag}` +
              `--embed-thumbnail --convert-thumbnails jpg ` +
              `--add-metadata ` +
              `--extractor-args "youtube:player_client=ios" ` +
              `--sleep-interval 1 --max-sleep-interval 2 ` +
              `--no-playlist ` +
              `-o "${escapedOutputPath}" ` +
              `--no-part --force-overwrites "${trackUrl}"`
          },
          // Estratégia 3: Cliente Web (padrão) - COM cookies se disponíveis
          {
            name: 'Web Client',
            command: `yt-dlp -x --audio-format ${format} --audio-quality ${quality} ` +
              `${cookiesFlag}` +
              `--embed-thumbnail --convert-thumbnails jpg ` +
              `--add-metadata ` +
              `--extractor-args "youtube:player_client=web" ` +
              `--sleep-interval 1 --max-sleep-interval 2 ` +
              `--no-playlist ` +
              `-o "${escapedOutputPath}" ` +
              `--no-part --force-overwrites "${trackUrl}"`
          }
        ];
        
        // Tentar cada estratégia até uma funcionar
        for (let strategyIndex = 0; strategyIndex < downloadStrategies.length; strategyIndex++) {
          const strategy = downloadStrategies[strategyIndex];
          
          try {
            logger.info(`   🔄 Tentando estratégia ${strategyIndex + 1}/${downloadStrategies.length}: ${strategy.name}...`);
            
            // Delay mínimo apenas se não for a primeira estratégia (reduzido para acelerar)
            if (strategyIndex > 0) {
              const delay = 500; // 500ms apenas - suficiente para não sobrecarregar
              await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            const { stdout, stderr } = await execAsync(
              strategy.command,
              { maxBuffer: 1024 * 1024 * 20, timeout: 120000 } // 2 minutos timeout (reduzido)
            );
            
            downloadOutput = stdout;
            
            // Log do stderr para debug (pode conter informações sobre o arquivo salvo)
            if (stderr) {
              logger.info(`   📋 yt-dlp stderr: ${stderr.substring(0, 500)}`);
            }
            
            // Verificar se há mensagem de sucesso no stdout
            if (stdout.includes('[download]') || stdout.includes('100%') || stdout.includes('Deleting original file')) {
              downloadSuccess = true;
              logger.info(`   ✅ Download successful com estratégia: ${strategy.name}`);
              logger.info(`   📄 Output do yt-dlp: ${stdout.substring(0, 300)}`);
              break; // Sucesso, sair do loop
            } else {
              // Mesmo sem mensagem clara, considerar sucesso se não houve erro
              downloadSuccess = true;
              logger.info(`   ✅ Download successful com estratégia: ${strategy.name} (sem mensagem explícita)`);
              break; // Sucesso, sair do loop
            }
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Log detalhado do erro para debug
            logger.error(`   ❌ Erro na estratégia ${strategy.name}:`);
            logger.error(`      Mensagem: ${errorMessage}`);
            if (error instanceof Error && error.stack) {
              logger.error(`      Stack: ${error.stack.substring(0, 500)}`);
            }
            
            // Verificar se o erro está relacionado ao nome do arquivo ou caminho
            if (errorMessage.includes('filename') || errorMessage.includes('path') || 
                errorMessage.includes('invalid') || errorMessage.includes('character')) {
              logger.error(`   ⚠️ Possível problema com nome do arquivo ou caminho: "${tempFilename}"`);
              logger.error(`   ⚠️ Caminho completo: ${outputPath}`);
            }
            
            // Log do erro mas continuar para próxima estratégia
            if (strategyIndex < downloadStrategies.length - 1) {
              logger.warn(`   ⚠️ Estratégia ${strategy.name} falhou: ${errorMessage.substring(0, 200)}`);
              logger.info(`   🔄 Tentando próxima estratégia...`);
              continue; // Tentar próxima estratégia
            } else {
              // Última estratégia falhou
              logger.error(`   ❌ Todas as estratégias falharam para track ${trackNumber}`);
              logger.error(`   ❌ Último erro: ${errorMessage.substring(0, 200)}`);
              
              // Verificar se é erro relacionado a cookies ou bloqueio
              if (errorMessage.includes('Sign in to confirm') || 
                  errorMessage.includes('not a bot') || 
                  errorMessage.includes('bot') ||
                  errorMessage.includes('blocked') ||
                  errorMessage.includes('403') ||
                  errorMessage.includes('Forbidden') ||
                  errorMessage.includes('PO Token')) {
                hadYouTubeIssues = true;
                logger.warn(`   ⚠️ YouTube está bloqueando downloads - provavelmente falta de cookies válidos`);
                logger.warn(`   💡 Solução: Execute: yt-dlp --cookies-from-browser chrome --cookies cookies.txt "https://www.youtube.com/watch?v=dQw4w9WgXcQ"`);
                logger.warn(`   💡 Ou faça login no YouTube no seu browser e tente novamente`);
              }
              
              throw error; // Re-throw o erro
            }
          }
        }
        
        // Se chegou aqui sem sucesso, lançar erro
        if (!downloadSuccess) {
          throw new Error('Todas as estratégias de download falharam');
        }

        // Verificar se o download foi realmente bem-sucedido
        if (!downloadSuccess) {
          const errorMsg = `Download não foi marcado como bem-sucedido para track ${trackNumber}`;
          logger.error(`   ❌ ${errorMsg}`);
          result.errors.push(errorMsg);
          result.processedTracks++; // Contar como processado mesmo com erro
          continue; // Continuar com próxima faixa
        }

        // Aguardar um pouco para garantir que o arquivo foi escrito no disco (reduzido para acelerar)
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms é suficiente

        // Verificar se o arquivo foi realmente criado e encontrar o nome correto
        let finalFilePath = `${downloadsFolder}/${tempFilename}.${format}`;
        
        logger.info(`   🔍 Verificando se arquivo existe: ${finalFilePath}`);
        
        // Se o arquivo não existe com o nome esperado, tentar encontrar o arquivo real
        if (!existsSync(finalFilePath)) {
          logger.warn(`   ⚠️ Arquivo não encontrado com nome esperado: ${finalFilePath}`);
          logger.info(`   🔍 Procurando arquivo baixado na pasta: ${downloadsFolder}`);
          
          try {
            const files = await readdir(downloadsFolder);
            logger.info(`   📁 Total de arquivos na pasta: ${files.length}`);
            
            // Listar todos os arquivos do formato correto criados recentemente (otimizado)
            const now = Date.now();
            const recentFormatFiles = [];
            const searchVideoId = entry.id; // Usar nome diferente para evitar conflito
            
            // Buscar primeiro por ID do vídeo (mais rápido e preciso)
            for (const file of files) {
              const fileExt = file.split('.').pop()?.toLowerCase();
              if (fileExt === format && searchVideoId && file.includes(searchVideoId)) {
                try {
                  const filePath = join(downloadsFolder, file);
                  const stats = await stat(filePath);
                  const age = now - stats.mtimeMs;
                  if (age < 120000) { // Apenas últimos 2 minutos
                    recentFormatFiles.push({ file, filePath, age, mtime: stats.mtimeMs });
                  }
                } catch {}
              }
            }
            
            // Se não encontrou por ID, buscar por nome parcial (mais lento)
            if (recentFormatFiles.length === 0) {
              for (const file of files) {
                const fileExt = file.split('.').pop()?.toLowerCase();
                if (fileExt === format) {
                  try {
                    const filePath = join(downloadsFolder, file);
                    const stats = await stat(filePath);
                    const age = now - stats.mtimeMs;
                    if (age < 120000) { // Apenas últimos 2 minutos
                      recentFormatFiles.push({ file, filePath, age, mtime: stats.mtimeMs });
                    }
                  } catch {}
                }
              }
            }
            
            logger.info(`   📊 Arquivos ${format} encontrados: ${recentFormatFiles.length}`);
            if (recentFormatFiles.length > 0) {
              logger.info(`   📋 Últimos 5 arquivos ${format}:`);
              recentFormatFiles
                .sort((a, b) => b.mtime - a.mtime)
                .slice(0, 5)
                .forEach(f => {
                  logger.info(`      - ${f.file} (${Math.round(f.age / 1000)}s atrás)`);
                });
            }
            
            // Procurar por arquivos que correspondam ao formato e tenham parte do título OU o ID do vídeo
            const matchingFiles = recentFormatFiles.filter(({ file }) => {
              const baseName = file.replace(/\.[^/.]+$/, '').toLowerCase();
              
              // PRIORIDADE 1: Buscar por ID do vídeo (mais confiável - garante que é o arquivo correto)
              if (searchVideoId && baseName.includes(searchVideoId.toLowerCase())) {
                logger.info(`   🎯 Arquivo encontrado por ID do vídeo: ${file}`);
                return true;
              }
              
              // PRIORIDADE 2: Buscar por nome parcial (primeiros 20 caracteres do título base)
              const searchBase = baseTitle.toLowerCase().substring(0, Math.min(20, baseTitle.length));
              if (searchBase && baseName.includes(searchBase)) {
                logger.info(`   🎯 Arquivo encontrado por nome parcial: ${file}`);
                return true;
              }
              
              return false;
            });
            
            logger.info(`   🎯 Arquivos com nome correspondente ou ID ${searchVideoId}: ${matchingFiles.length}`);
            
            if (matchingFiles.length > 0) {
              // Ordenar por idade (mais recente primeiro) e priorizar arquivos com ID
              matchingFiles.sort((a, b) => {
                // PRIORIDADE 1: Arquivos que contêm o ID do vídeo (mais confiável)
                const aHasId = searchVideoId && a.file.toLowerCase().includes(searchVideoId.toLowerCase());
                const bHasId = searchVideoId && b.file.toLowerCase().includes(searchVideoId.toLowerCase());
                if (aHasId !== bHasId) return aHasId ? -1 : 1;
                
                // PRIORIDADE 2: Arquivos criados nos últimos 2 minutos
                const aRecent = a.age < 120000;
                const bRecent = b.age < 120000;
                if (aRecent !== bRecent) return aRecent ? -1 : 1;
                
                // PRIORIDADE 3: Data de modificação (mais recente primeiro)
                return b.mtime - a.mtime;
              });
              
              finalFilePath = matchingFiles[0].filePath;
              const foundById = searchVideoId && matchingFiles[0].file.toLowerCase().includes(searchVideoId.toLowerCase());
              logger.info(`   ✅ Arquivo encontrado${foundById ? ' por ID' : ' por nome'}: ${matchingFiles[0].file}`);
            } else {
              // Se não encontrou por nome, procurar o arquivo mais recente do formato correto
              logger.warn(`   ⚠️ Nenhum arquivo correspondente encontrado por nome, procurando arquivo mais recente...`);
              
              if (recentFormatFiles.length > 0) {
                // Pegar o arquivo mais recente (últimos 2 minutos)
                recentFormatFiles.sort((a, b) => {
                  const aRecent = a.age < 120000;
                  const bRecent = b.age < 120000;
                  if (aRecent !== bRecent) return aRecent ? -1 : 1;
                  return b.mtime - a.mtime;
                });
                
                if (recentFormatFiles[0] && recentFormatFiles[0].age < 120000) {
                  finalFilePath = recentFormatFiles[0].filePath;
                  logger.info(`   ✅ Usando arquivo mais recente: ${recentFormatFiles[0].file}`);
                } else {
                  // Se não há arquivo recente, tentar o mais recente mesmo assim
                  if (recentFormatFiles.length > 0) {
                    finalFilePath = recentFormatFiles[0].filePath;
                    logger.warn(`   ⚠️ Usando arquivo mais recente (pode não ser o correto): ${recentFormatFiles[0].file}`);
                  } else {
                    throw new Error(`Arquivo não encontrado após download: ${tempFilename}.${format}`);
                  }
                }
              } else {
                throw new Error(`Arquivo não encontrado após download: ${tempFilename}.${format}`);
              }
            }
          } catch (fileError) {
            const errorMsg = `Failed to locate downloaded file for track ${trackNumber}: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`;
            logger.error(`   ❌ ${errorMsg}`);
            result.errors.push(errorMsg);
            result.processedTracks++; // Contar como processado mesmo com erro
            continue; // Continuar com próxima faixa
          }
        }
        
        // Verificar novamente se o arquivo existe antes de processar
        if (!existsSync(finalFilePath)) {
          const errorMsg = `Downloaded file does not exist: ${finalFilePath}`;
          logger.error(`   ❌ ${errorMsg}`);
          result.errors.push(errorMsg);
          result.processedTracks++; // Contar como processado mesmo com erro
          continue; // Continuar com próxima faixa
        }
        
        // 2. Enhance metadata immediately after download
        if (enhanceMetadata) {
          logger.info(`   🔍 Enhancing metadata for track ${trackNumber}...`);
          
          // Enviar evento indicando processamento de metadados
          if (downloadId) {
            sendProgressEvent(downloadId, {
              type: 'download',
              step: `Processando metadados ${trackNumber}/${totalTracks}`,
              progress: Math.min(30 + Math.round((result.processedTracks / totalTracks) * 35) + Math.round((result.enhancedTracks / totalTracks) * 35), 95),
              substep: `"${entry.title}" - Buscando informações musicais`,
              detail: `${result.processedTracks} baixadas, ${result.enhancedTracks} processadas`,
              playlistIndex: i,
              metadata: {
                totalTracks: totalTracks,
                downloadedTracks: result.processedTracks,
                processedTracks: result.enhancedTracks,
                enhancedTracks: result.enhancedTracks,
                beatportTracksFound: result.beatportTracksFound || 0,
                errors: result.errors.length,
                currentTrack: trackNumber,
                isProcessingMetadata: true
              }
            });
          }
          
          try {
            // Remover ID do vídeo do filename antes de passar para enhanceFileMetadata
            // O ID está no formato "Título [VIDEO_ID]", precisamos remover a parte "[VIDEO_ID]"
            const filenameWithoutId = baseTitle; // Usar baseTitle que já não tem o ID
            logger.info(`   📝 Filename para metadata (sem ID): ${filenameWithoutId}`);
            
            const enhanced = await this.enhanceFileMetadata(
              finalFilePath, 
              filenameWithoutId, // Passar sem o ID do vídeo
              useBeatport, 
              showBeatportPage,
              entry
            );

            if (enhanced.success) {
              result.enhancedTracks++;
              if (enhanced.fromBeatport) {
                result.beatportTracksFound = (result.beatportTracksFound || 0) + 1;
              }
              logger.info(`   ✅ Metadata enhanced successfully!`);
            } else {
              logger.warn(`   ⚠️ Failed to enhance metadata`);
            }
            
            // Mover arquivo para pasta nao-normalizadas se não foi normalizado pelo Beatport
            if (useBeatport && (!enhanced.success || !enhanced.fromBeatport)) {
              try {
                await this.moveToNonNormalizedFolder(finalFilePath, downloadsFolder);
                logger.info(`   📁 Arquivo movido para pasta nao-normalizadas (não normalizado pelo Beatport)`);
              } catch (moveError) {
                logger.warn(`   ⚠️ Erro ao mover arquivo para pasta nao-normalizadas: ${moveError instanceof Error ? moveError.message : 'Unknown error'}`);
                // Não falhar o download por causa disso
              }
            }
          } catch (metadataError) {
            const errorMsg = `Failed to enhance metadata for track ${trackNumber}: ${metadataError instanceof Error ? metadataError.message : 'Unknown error'}`;
            logger.error(`   ❌ ${errorMsg}`);
            result.errors.push(errorMsg);
            // Continuar mesmo se falhar metadata enhancement
          }
        }

        result.processedTracks++;
        logger.info(`   ✅ Track ${trackNumber} completed! Progress: ${result.processedTracks}/${totalTracks}`);

        // ⚡ Calcular progresso real baseado em downloads + metadados concluídos
        const downloadProgress = Math.round((result.processedTracks / totalTracks) * 50); // 50% para downloads
        const metadataProgress = Math.round((result.enhancedTracks / totalTracks) * 50); // 50% para metadados
        const totalProgress = 30 + downloadProgress + metadataProgress; // 30% inicial + 70% real
        
        if (downloadId) {
          sendProgressEvent(downloadId, {
            type: 'download',
            step: `Download ${trackNumber}/${totalTracks}: "${entry.title}"`,
            progress: Math.min(totalProgress, 95), // Máximo 95% até finalizar tudo
            substep: enhanceMetadata ? 'Baixado, processando metadados...' : 'Download concluído',
            detail: `${result.processedTracks} baixadas, ${result.enhancedTracks} com metadados`,
            playlistIndex: i,
            metadata: {
              totalTracks: totalTracks,
              downloadedTracks: result.processedTracks, // Faixas baixadas
              processedTracks: result.enhancedTracks, // Faixas totalmente processadas (download + metadata)
              enhancedTracks: result.enhancedTracks, // Para compatibilidade
              beatportTracksFound: result.beatportTracksFound || 0,
              errors: result.errors.length,
              currentTrack: trackNumber,
              isProcessingMetadata: enhanceMetadata
            }
          });
        }

        // Progress report every 5 tracks
        if (trackNumber % 5 === 0) {
          const successRate = ((result.enhancedTracks / result.processedTracks) * 100).toFixed(1);
          logger.info(`📊 Progress Report: ${result.processedTracks}/${totalTracks} processed, ${result.enhancedTracks} enhanced (${successRate}%), ${result.beatportTracksFound || 0} from Beatport`);
        }

        // Delay mínimo entre tracks (reduzido para acelerar)
        if (trackNumber < totalTracks) {
          if (hadYouTubeIssues) {
            // Delay maior apenas se houver problemas do YouTube
            logger.info(`   ⏳ Delay (3s) devido a problemas do YouTube...`);
            await new Promise(resolve => setTimeout(resolve, 3000)); // Reduzido de 8s para 3s
          } else {
            // Delay mínimo normal
            await new Promise(resolve => setTimeout(resolve, 300)); // Reduzido de 1s para 300ms
          }
        }

      } catch (error) {
        tracksFailed++;
        const errorMessage = `Failed to process track ${trackNumber} ("${entry.title || entry.id || 'Unknown'}"): ${error instanceof Error ? error.message : 'Unknown error'}`;
        const errorStack = error instanceof Error ? error.stack : undefined;
        result.errors.push(errorMessage);
        logger.error(`   ❌ ${errorMessage}`);
        if (errorStack) {
          logger.error(`   📋 Stack trace: ${errorStack}`);
        }
        
        // Enviar evento de erro para esta faixa específica
        if (downloadId) {
          sendProgressEvent(downloadId, {
            type: 'error',
            step: `Erro ao processar faixa ${trackNumber}/${totalTracks}`,
            progress: Math.round((trackNumber / totalTracks) * 90),
            detail: errorMessage,
            playlistIndex: i,
            metadata: {
              totalTracks: totalTracks,
              downloadedTracks: result.processedTracks,
              processedTracks: result.enhancedTracks,
              errors: result.errors.length,
              currentTrack: trackNumber
            }
          });
        }
        
        // Incrementar contador mesmo em caso de erro para manter progresso correto
        result.processedTracks++;
        
        // Continue with next track instead of failing entire playlist
        logger.info(`   ⏭️ Continuando com próxima faixa... (${result.processedTracks}/${totalTracks} processadas até agora)`);
        continue;
      }
    }
    
    // Log final detalhado
    logger.info(`\n[DEBUG] ==========================================`);
    logger.info(`[DEBUG] FIM DO PROCESSAMENTO DA PLAYLIST`);
    logger.info(`[DEBUG] ==========================================`);
    logger.info(`[DEBUG] Estatísticas do loop:`);
    logger.info(`[DEBUG]   - Entradas na playlist: ${playlistEntries.length}`);
    logger.info(`[DEBUG]   - Tracks processadas (iniciadas): ${tracksProcessed}`);
    logger.info(`[DEBUG]   - Tracks puladas (inválidas): ${tracksSkipped}`);
    logger.info(`[DEBUG]   - Tracks com falha: ${tracksFailed}`);
    logger.info(`[DEBUG]   - Tracks completadas: ${result.processedTracks}`);
    logger.info(`[DEBUG] ==========================================`);
    
    logger.info(`\n✅ Loop de download concluído. Processadas ${result.processedTracks}/${playlistEntries.length} faixas.`);

    // Verificar discrepância
    if (result.processedTracks < playlistEntries.length) {
      const missing = playlistEntries.length - result.processedTracks;
      logger.warn(`⚠️ ATENÇÃO: ${missing} faixa(s) não foram processadas!`);
      logger.warn(`⚠️ Esperado: ${playlistEntries.length}, Processado: ${result.processedTracks}`);
      logger.warn(`⚠️ Puladas: ${tracksSkipped}, Falhas: ${tracksFailed}`);
    }

    // Final summary
    const successRate = result.totalTracks > 0 ? ((result.enhancedTracks / result.totalTracks) * 100).toFixed(1) : '0';
    logger.info(`\n🎉 Sequential processing completed!`);
    logger.info(`📊 Final Statistics:`);
    logger.info(`   - Total tracks: ${result.totalTracks}`);
    logger.info(`   - Successfully processed: ${result.processedTracks}`);
    logger.info(`   - Enhanced with metadata: ${result.enhancedTracks} (${successRate}%)`);
    logger.info(`   - Enhanced with Beatport: ${result.beatportTracksFound || 0}`);
    logger.info(`   - Errors: ${result.errors.length}`);
  }

  private async enhancePlaylistMetadata(
    downloadsFolder: string,
    format: string,
    playlistEntries: any[],
    maxConcurrent: number,
    result: PlaylistDownloadResult,
    useBeatport: boolean = false,
    showBeatportPage: boolean = false
  ): Promise<void> {
    logger.info(`Starting metadata enhancement... (Beatport mode: ${useBeatport})`);

    // Get list of downloaded files with their creation times
    const files = await readdir(downloadsFolder);
    const audioFiles = files.filter(file => file.endsWith(`.${format}`));

    // **NOVO: Criar mapeamento de arquivos com suas informações originais**
    const { stat } = require('fs/promises');
    const fileInfos = await Promise.all(
      audioFiles.map(async (filename, index) => {
        const filePath = join(downloadsFolder, filename);
        const stats = await stat(filePath);
        
        // Tentar associar com playlistEntry correspondente
        const baseTitle = filename.replace(/\.(mp3|flac|wav)$/i, '');
        const matchingEntry = playlistEntries.find(entry => 
          entry.title && baseTitle.includes(entry.title.substring(0, 30))
        );
        const info = {
          filename,
          filePath,
          created: stats.birthtimeMs,
          modified: stats.mtimeMs,
          baseTitle,
          matchingEntryTitle: matchingEntry?.title,
          matchingEntryUploader: matchingEntry?.uploader,
          matchingEntryChannel: matchingEntry?.channel,
          matchingEntry
        };
        logger.info(`[DEBUG] fileInfo: ${JSON.stringify(info)}`);
        return info;
      })
    );

    // **NOVO: Ordenar pelos índices originais da playlist para manter ordem**
    fileInfos.sort((a, b) => a.created - b.created);

    logger.info(`Processing ${fileInfos.length} files sequentially in ORIGINAL PLAYLIST ORDER - Beatport: ${useBeatport}`);

    // **PROCESSAMENTO SEQUENCIAL mantendo ordem original da playlist**
    for (let i = 0; i < fileInfos.length; i++) {
      const fileInfo = fileInfos[i];
      logger.info(`Processing file ${i + 1}/${fileInfos.length}: ${fileInfo.filename} (Original position: ${i + 1}) - Beatport: ${useBeatport}`);

      try {
        // **PRESERVAR data de criação original antes da modificação**
        const originalCreationTime = fileInfo.created;
        
        const enhanced = await this.enhanceFileMetadata(fileInfo.filePath, fileInfo.filename, useBeatport, showBeatportPage, fileInfo.matchingEntry);
        
        if (enhanced.success) {
          result.enhancedTracks++;
          if (enhanced.fromBeatport) {
            result.beatportTracksFound = (result.beatportTracksFound || 0) + 1;
          }

          // **NOVO: Restaurar timestamp original após modificação**
          try {
            const { utimes } = require('fs/promises');
            // Manter a data de criação original para preservar ordem
            await utimes(fileInfo.filePath, originalCreationTime, originalCreationTime);
            logger.info(`✅ Restored original timestamp for: ${fileInfo.filename}`);
          } catch (timestampError) {
            logger.warn(`⚠️  Could not restore timestamp for ${fileInfo.filename}: ${timestampError}`);
          }
        }
        
        // Mover arquivo para pasta nao-normalizadas se não foi normalizado pelo Beatport
        if (useBeatport && (!enhanced.success || !enhanced.fromBeatport)) {
          try {
            await this.moveToNonNormalizedFolder(fileInfo.filePath, downloadsFolder);
            logger.info(`   📁 Arquivo movido para pasta nao-normalizadas (não normalizado pelo Beatport)`);
          } catch (moveError) {
            logger.warn(`   ⚠️ Erro ao mover arquivo para pasta nao-normalizadas: ${moveError instanceof Error ? moveError.message : 'Unknown error'}`);
            // Não falhar o processamento por causa disso
          }
        }
        
        result.processedTracks++;

      } catch (error) {
        const errorMessage = `Failed to enhance ${fileInfo.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMessage);
        logger.error(errorMessage);
      }

      // Delay mínimo entre arquivos (reduzido para acelerar)
      if (i < fileInfos.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200)); // Reduzido de 1s para 200ms
      }
    }
  }

  private async enhanceFileMetadata(
    filePath: string, 
    filename: string, 
    useBeatport: boolean = false,
    showBeatportPage: boolean = false,
    playlistEntry?: any
  ): Promise<{ success: boolean; fromBeatport: boolean }> {
    logger.info(`[DEBUG] Iniciando enhanceFileMetadata para: ${filename}`);
    // Read existing metadata
    const existingTags = NodeID3.read(filePath);
    logger.info(`[DEBUG] existingTags: ${JSON.stringify(existingTags)}`);
    const title = existingTags.title || filename.replace(/\.[^/.]+$/, '');
    
    // **MELHORADO: Usar múltiplas fontes para extrair artista**
    let artist = existingTags.artist || '';
    logger.info(`[DEBUG] Artista inicial extraído dos tags: ${artist}`);
    
    // Tentar extrair artista das informações da playlist se disponível
    if (!artist && playlistEntry) {
      if (playlistEntry.uploader && playlistEntry.uploader !== 'Unknown') {
        artist = playlistEntry.uploader;
        logger.info(`[DEBUG] Artist extracted from playlist entry: ${artist}`);
      } else if (playlistEntry.channel && playlistEntry.channel !== 'Unknown') {
        artist = playlistEntry.channel;
        logger.info(`[DEBUG] Artist extracted from channel: ${artist}`);
      }
    }

    // Clean up title (remove common YouTube suffixes)
    const cleanTitle = this.cleanTrackTitle(title);
    let cleanArtist = this.extractArtistFromTitle(cleanTitle, artist);
    cleanArtist = cleanArtistName(cleanArtist);
    logger.info(`[DEBUG] cleanTitle: ${cleanTitle}, cleanArtist: ${cleanArtist}`);

    // **MELHORADO: Normalizar para padrão 'Artista - Título' antes de buscar metadados**
    function extractArtistAndTitle(str: string) {
      // Padrão "Artist - Title"
      const dashMatch = str.match(/^(.+?)\s*-\s*(.+)$/);
      if (dashMatch) {
        return { artist: dashMatch[1].trim(), title: dashMatch[2].trim() };
      }
      
      // Padrão "Title feat. Artist"
      const featMatch = str.match(/(.+?)\s+(?:feat\.?|featuring|ft\.?|by)\s+(.+?)(?:\s*\(|$)/i);
      if (featMatch) {
        return { artist: featMatch[2].trim(), title: featMatch[1].trim() };
      }
      
      // Padrão "Title (Artist)"
      const parenMatch = str.match(/(.+?)\s*\(([^)]+?)\)$/);
      if (parenMatch) {
        const possibleArtist = parenMatch[2].trim();
        // Verificar se não é um tipo de mix/edit
        if (!/(remix|edit|mix|version|vocal|dub|bootleg|rework|extended|club|radio|original)/i.test(possibleArtist)) {
          return { artist: possibleArtist, title: parenMatch[1].trim() };
        }
      }
      
      return { artist: '', title: str };
    }

    // Extrair artista/título do padrão se possível
    let normArtist = cleanArtist;
    let normTitle = cleanTitle;
    const extracted = extractArtistAndTitle(cleanTitle);
    if (extracted.artist && extracted.title) {
      normArtist = extracted.artist;
      normTitle = extracted.title;
      logger.info(`[DEBUG] Extraído do título: artist='${normArtist}', title='${normTitle}'`);
    } else {
      logger.info(`[DEBUG] Usando dados originais: artist='${normArtist}', title='${normTitle}'`);
    }

    // **MELHORADO: Tentar múltiplas variações de busca**
    let metadata = null;
    
    // Primeira tentativa: com dados normalizados
    if (normArtist && normTitle) {
      logger.info(`[DEBUG] Tentativa 1: Buscando com dados normalizados`);
      metadata = await metadataAggregator.searchMetadata(
        normTitle,
        normArtist,
        { useBeatport, showBeatportPage }
      );
    }
    
    // Segunda tentativa: se não encontrou, tentar com dados originais
    if (!metadata || (!metadata.bpm && !metadata.key && !metadata.genre && !metadata.label)) {
      logger.info(`[DEBUG] Tentativa 2: Buscando com dados originais`);
      const originalMetadata = await metadataAggregator.searchMetadata(
        cleanTitle,
        cleanArtist,
        { useBeatport, showBeatportPage }
      );
      
      // Mesclar resultados se necessário
      if (originalMetadata && (originalMetadata.bpm || originalMetadata.key || originalMetadata.genre || originalMetadata.label)) {
        metadata = { ...metadata, ...originalMetadata };
        logger.info(`[DEBUG] Dados originais forneceram metadados adicionais`);
      }
    }
    
    // Terceira tentativa: limpar ainda mais o título (remover versões)
    if (!metadata || (!metadata.bpm && !metadata.key && !metadata.genre && !metadata.label)) {
      const strippedTitle = normTitle.replace(/\s*\([^)]*\)/g, '').trim();
      if (strippedTitle !== normTitle) {
        logger.info(`[DEBUG] Tentativa 3: Buscando com título limpo: '${strippedTitle}'`);
        const strippedMetadata = await metadataAggregator.searchMetadata(
          strippedTitle,
          normArtist,
          { useBeatport, showBeatportPage }
        );
        
        if (strippedMetadata && (strippedMetadata.bpm || strippedMetadata.key || strippedMetadata.genre || strippedMetadata.label)) {
          metadata = { ...metadata, ...strippedMetadata };
          logger.info(`[DEBUG] Título limpo forneceu metadados adicionais`);
        }
      }
    }
    logger.info(`[DEBUG] metadataAggregator.searchMetadata retornou: ${JSON.stringify(metadata)}`);

    // Check if we got useful enhanced data
    const hasEnhancedData = metadata && (metadata.bpm || metadata.key || metadata.label || 
                           metadata.genre || metadata.album || metadata.artist || metadata.year);

    if (!hasEnhancedData) {
      logger.warn(`[DEBUG] No enhanced metadata found for: ${normTitle} - ${normArtist}`);
      return { success: false, fromBeatport: false };
    }

    const fromBeatport = metadata?.sources?.includes('Beatport') || false;

    // Usar artista/título do Beatport se disponíveis
    let finalArtist = metadata?.artist || normArtist || artist;
    let finalTitle = metadata?.title || normTitle;
    finalArtist = cleanArtistName(finalArtist);
    finalTitle = finalTitle.trim();
    logger.info(`[DEBUG] Final artist determined: "${finalArtist}" (from Beatport: ${!!metadata?.artist})`);
    logger.info(`[DEBUG] Final title determined: "${finalTitle}" (from Beatport: ${!!metadata?.title})`);

    // Evitar duplicidade de sufixos/remix/version
    function removeDuplicateSuffix(title: string) {
      // Remove duplicidade de (Remix), (Edit), etc.
      return title.replace(/(\([^)]*\))(?=.*\1)/gi, '').replace(/\s+/g, ' ').trim();
    }
    finalTitle = removeDuplicateSuffix(finalTitle);

    // Extrair versão se existir
    let version = '';
    const versionMatch = finalTitle.match(/\((.*?)\)/);
    if (versionMatch) {
      version = versionMatch[1];
    }

    // Montar nome do arquivo sem duplicidade de versão
    let fileBase = `${finalArtist} - ${finalTitle}`;
    if (version && !finalTitle.endsWith(`(${version})`)) {
      fileBase += ` (${version})`;
    }
    if (metadata?.label) {
      const deduplicatedLabel = deduplicateLabel(metadata.label);
      if (deduplicatedLabel) {
        fileBase += ` [${deduplicatedLabel}]`;
      }
    }
    const sanitizedNewFilename = sanitizeTitle(fileBase);

    // Renomear o arquivo com o novo nome formatado
    const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));
    const fileExt = filePath.split('.').pop();
    const newFilePath = `${fileDir}/${sanitizedNewFilename}.${fileExt}`;
    
    // Verificar se o arquivo de destino já existe (pode ser versão diferente)
    if (existsSync(newFilePath) && newFilePath !== filePath) {
      logger.warn(`   ⚠️ Arquivo com nome similar já existe: ${sanitizedNewFilename}.${fileExt}`);
      logger.warn(`   ⚠️ Mantendo arquivo original para evitar sobrescrita de versão diferente`);
      // Não renomear se já existe - pode ser uma versão diferente
      return { success: true, fromBeatport };
    }
    
    try {
      const { rename } = require('fs/promises');
      await rename(filePath, newFilePath);
      filePath = newFilePath; // Atualizar o caminho do arquivo para as operações subsequentes
    } catch (error) {
      logger.warn(`Failed to rename file with new format: ${error}`);
    }

    // Detect file format
    const fileExtension = filePath.split('.').pop()?.toLowerCase();
    let success = false;

    if (fileExtension === 'mp3') {
      // Use NodeID3 for MP3 files
      const deduplicatedLabel = metadata?.label ? deduplicateLabel(metadata.label) : '';
              const enhancedTags = {
          title: metadata?.title || finalTitle,
          artist: finalArtist,
          album: existingTags.album || '',
          year: metadata?.year?.toString() || existingTags.year || '',
          genre: metadata?.genre || existingTags.genre || '',
          publisher: deduplicatedLabel || existingTags.publisher || '',
          bpm: metadata?.bpm?.toString() || '',
          initialkey: metadata?.key || '',
          comment: {
            language: 'por',
            text: `Enhanced metadata -- BPM: ${metadata?.bpm || 'N/A'} -- Key: ${metadata?.key || 'N/A'} -- Genre: ${metadata?.genre || 'N/A'} -- Album: ${existingTags.album || 'N/A'} -- Label: ${deduplicatedLabel || 'N/A'} -- Published: ${metadata?.publishedDate || 'N/A'} -- Sources: ${metadata?.sources?.join(', ') || 'None'}`
          }
        };
      logger.info(`[DEBUG] enhancedTags a serem escritos: ${JSON.stringify(enhancedTags)}`);
      const writeResult = NodeID3.write(enhancedTags, filePath);
      success = writeResult === true;
      logger.info(`[DEBUG] Resultado NodeID3.write: ${success}`);

    } else if (fileExtension === 'flac') {
      // Use ffmpeg for FLAC files  
      logger.info(`[DEBUG] Chamando writeFlacMetadata para FLAC: ${filePath}`);
      success = await this.writeFlacMetadata(filePath, metadata, finalTitle, finalArtist, useBeatport, existingTags);
      logger.info(`[DEBUG] Resultado writeFlacMetadata: ${success}`);
    } else {
      logger.warn(`[DEBUG] Unsupported file format for metadata writing: ${fileExtension}`);
      return { success: false, fromBeatport: false };
    }

    return { success, fromBeatport };
  }

  private async writeFlacMetadata(
    filePath: string, 
    metadata: any, 
    cleanTitle: string, 
    cleanArtist: string, 
    useBeatport: boolean,
    existingTags: any
  ): Promise<boolean> {
    try {
      const tempPath = filePath.replace('.flac', '_temp.flac');

      const flacMetadata: FfmpegMetadataEntry[] = [
        { key: 'title', value: metadata.title || cleanTitle },
        { key: 'artist', value: metadata.artist || cleanArtist },
      ];

      if (existingTags.album) {
        flacMetadata.push({ key: 'album', value: existingTags.album });
      }
      if (metadata.year) {
        flacMetadata.push({ key: 'date', value: String(metadata.year) });
      }
      if (metadata.publishedDate) {
        flacMetadata.push({ key: 'publisher_date', value: metadata.publishedDate });
      }
      if (metadata.genre) {
        flacMetadata.push({ key: 'genre', value: metadata.genre });
        flacMetadata.push({ key: 'Genre', value: metadata.genre });
      }
      if (metadata.label) {
        const deduplicatedLabel = deduplicateLabel(metadata.label);
        if (deduplicatedLabel) {
          flacMetadata.push({ key: 'publisher', value: deduplicatedLabel });
          flacMetadata.push({ key: 'label', value: deduplicatedLabel });
        }
      }
      if (metadata.bpm) {
        flacMetadata.push({ key: 'BPM', value: String(metadata.bpm) });
        flacMetadata.push({ key: 'bpm', value: String(metadata.bpm) });
      }
      if (metadata.key) {
        flacMetadata.push({ key: 'key', value: metadata.key });
        flacMetadata.push({ key: 'initialKey', value: metadata.key });
        flacMetadata.push({ key: 'INITIALKEY', value: metadata.key });
        flacMetadata.push({ key: 'initialkey', value: metadata.key });
      }

      const deduplicatedLabelComment = metadata.label ? deduplicateLabel(metadata.label) : '';
      const commentText = `Enhanced metadata -- BPM: ${metadata.bpm || 'N/A'} -- Key: ${metadata.key || 'N/A'} -- Genre: ${metadata.genre || 'N/A'} -- Album: ${existingTags.album || 'N/A'} -- Label: ${deduplicatedLabelComment || 'N/A'} -- Published: ${metadata.publishedDate || 'N/A'} -- Sources: ${metadata.sources?.join(', ') || 'None'}`;
      flacMetadata.push({ key: 'comment', value: commentText });

      logger.info(`Writing FLAC metadata for: ${cleanTitle}`);
      await runFfmpegCopyWithMetadata(filePath, tempPath, flacMetadata, {
        format: 'flac',
        timeoutMs: 120000,
      });

      await rename(tempPath, filePath);
      
      logger.info(`✅ FLAC metadata written successfully for: ${cleanTitle}`);
      return true;

    } catch (error) {
      logger.error(`❌ Failed to write FLAC metadata: ${error instanceof Error ? error.message : error}`);
      
      // Clean up temp file if it exists
      try {
        const { unlink } = require('fs/promises');
        const tempPath = filePath.replace('.flac', '_temp.flac');
        await unlink(tempPath);
      } catch (e) {
        // Ignore cleanup errors
      }
      
      return false;
    }
  }

  private cleanTrackTitle(title: string): string {
    // Remove common YouTube/platform suffixes and patterns
    return title
      .replace(/\s*\(Official.*?\)/gi, '')
      .replace(/\s*\[Official.*?\]/gi, '')
      .replace(/\s*-\s*Official.*$/gi, '')
      .replace(/\s*\(Audio\)/gi, '')
      .replace(/\s*\[Audio\]/gi, '')
      .replace(/\s*\(Music Video\)/gi, '')
      .replace(/\s*\[Music Video\]/gi, '')
      .replace(/\s*\(HD\)/gi, '')
      .replace(/\s*\[HD\]/gi, '')
      .replace(/\s*\(4K\)/gi, '')
      .replace(/\s*\[4K\]/gi, '')
      .replace(/\s*\(Lyric.*?\)/gi, '')
      .replace(/\s*\[Lyric.*?\]/gi, '')
      .replace(/\s*\(Visualizer\)/gi, '')
      .replace(/\s*\[Visualizer\]/gi, '')
      // **MELHORADO: Preservar Extended Mix, Remix, Edit, etc. mas limpar duplicatas**
      .replace(/\s*\(Extended Mix\)\s*\(Extended Mix\)/gi, ' (Extended Mix)')
      .replace(/\s*\(Remix\)\s*\(Remix\)/gi, ' (Remix)')
      .replace(/\s*\(Edit\)\s*\(Edit\)/gi, ' (Edit)')
      .replace(/\s*\(Original Mix\)\s*\(Original Mix\)/gi, ' (Original Mix)')
      .replace(/\s*\(Club Mix\)\s*\(Club Mix\)/gi, ' (Club Mix)')
      .replace(/\s*\(Radio Edit\)\s*\(Radio Edit\)/gi, ' (Radio Edit)')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractArtistFromTitle(title: string, existingArtist: string): string {
    if (existingArtist && existingArtist !== 'Unknown' && existingArtist.trim() !== '') {
      return existingArtist;
    }

    // **MELHORADO: Extrair artista de padrões mais complexos**
    
    // 1. Padrão "Artist - Title"
    const dashMatch = title.match(/^([^-]+?)\s*-\s*(.+)$/);
    if (dashMatch) {
      const possibleArtist = dashMatch[1].trim();
      // Verificar se parece um nome de artista válido
      if (possibleArtist.length <= 50 && /[a-zA-Z]/.test(possibleArtist) && 
          !/(remix|edit|mix|version|vocal|dub|bootleg|rework|extended|club|radio)/i.test(possibleArtist)) {
        return possibleArtist;
      }
    }

    // 2. Padrão "Title feat. Artist" ou "Title by Artist"
    const featMatch = title.match(/(.+?)\s+(?:feat\.?|featuring|ft\.?|by)\s+([^-]+?)(?:\s*\(|$)/i);
    if (featMatch) {
      const possibleArtist = featMatch[2].trim();
      if (possibleArtist.length <= 50 && /[a-zA-Z]/.test(possibleArtist)) {
        return possibleArtist;
      }
    }

    // 3. Padrão "Title (Artist)" - mas evitar remixes/edits
    const parenMatch = title.match(/(.+?)\s*\(([^)]+?)\)$/);
    if (parenMatch) {
      const possibleArtist = parenMatch[2].trim();
      // Verificar se não é um tipo de mix/edit
      if (possibleArtist.length <= 50 && 
          /[a-zA-Z]/.test(possibleArtist) && 
          !/(remix|edit|mix|version|vocal|dub|bootleg|rework|extended|club|radio|original)/i.test(possibleArtist)) {
        return possibleArtist;
      }
    }

    // 4. Padrão "Artist & Artist" ou "Artist vs Artist"
    const collabMatch = title.match(/^([^&\-]+?)\s*(?:&|vs|feat\.?|featuring)\s+([^&\-]+?)(?:\s*\(|$)/i);
    if (collabMatch) {
      const artist1 = collabMatch[1].trim();
      const artist2 = collabMatch[2].trim();
      if (artist1.length <= 30 && artist2.length <= 30 && 
          /[a-zA-Z]/.test(artist1) && /[a-zA-Z]/.test(artist2)) {
        return `${artist1} & ${artist2}`;
      }
    }

    return existingArtist || '';
  }

  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Move um arquivo para a pasta nao-normalizadas se ele não foi normalizado pelo Beatport
   */
  private async moveToNonNormalizedFolder(filePath: string, downloadsFolder: string): Promise<void> {
    try {
      // Verificar se o arquivo já está na pasta nao-normalizadas
      if (filePath.includes('nao-normalizadas')) {
        logger.info(`   📁 Arquivo já está na pasta nao-normalizadas: ${filePath}`);
        return;
      }

      // Criar pasta nao-normalizadas se não existir
      const naoNormalizadasDir = join(downloadsFolder, 'nao-normalizadas');
      if (!existsSync(naoNormalizadasDir)) {
        await mkdir(naoNormalizadasDir, { recursive: true });
        logger.info(`   ✅ Pasta nao-normalizadas criada: ${naoNormalizadasDir}`);
      }

      // Obter nome do arquivo
      const fileName = filePath.split(/[/\\]/).pop() || '';
      if (!fileName) {
        logger.warn(`   ⚠️ Não foi possível extrair nome do arquivo de: ${filePath}`);
        return;
      }

      // Caminho de destino
      let newFilePath = join(naoNormalizadasDir, fileName);

      // Se já existe um arquivo com o mesmo nome, adicionar timestamp
      if (existsSync(newFilePath)) {
        const timestamp = Date.now();
        const fileExt = fileName.substring(fileName.lastIndexOf('.'));
        const fileBase = fileName.substring(0, fileName.lastIndexOf('.'));
        const newFileNameWithTimestamp = `${fileBase}_${timestamp}${fileExt}`;
        newFilePath = join(naoNormalizadasDir, newFileNameWithTimestamp);
        logger.warn(`   ⚠️ Arquivo já existe, usando nome com timestamp: ${newFileNameWithTimestamp}`);
      }

      // Mover arquivo
      let attempts = 0;
      const maxAttempts = 5;
      const delayBetweenAttempts = 800;

      while (attempts < maxAttempts) {
        try {
          await rename(filePath, newFilePath);
          logger.info(`   ✅ Arquivo movido para nao-normalizadas: ${fileName} -> ${newFilePath.split(/[/\\]/).pop()}`);
          return;
        } catch (renameErr: any) {
          attempts++;
          if (attempts >= maxAttempts) {
            logger.error(`   ❌ Falha ao mover arquivo após ${maxAttempts} tentativas: ${renameErr.message}`);
            throw renameErr;
          }
          await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
        }
      }
    } catch (error) {
      logger.error(`   ❌ Erro ao mover arquivo para pasta nao-normalizadas: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
}

// Singleton instance
export const playlistDownloadService = new PlaylistDownloadService(); 