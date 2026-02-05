/**
 * Serviço unificado para busca no YouTube Music
 * Implementa busca recursiva e múltiplas estratégias de fallback
 */

interface YouTubeSearchResult {
  title: string;
  artist?: string;
  videoId: string;
  thumbnail?: string;
  duration?: string;
  url: string;
  source: 'youtube-music' | 'youtube';
}

interface SearchOptions {
  maxResults?: number;
  preferMusic?: boolean;
}

// Versão atualizada do cliente (atualizar periodicamente)
const YOUTUBE_CLIENT_VERSION = '1.20250203.00.00'; // Atualizado para fevereiro 2025
const YOUTUBE_API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX94'; // Considerar mover para env

/**
 * Busca recursiva em objeto JSON por chaves específicas
 */
function findInObject(obj: any, keys: string[]): any[] {
  const results: any[] = [];
  
  if (!obj || typeof obj !== 'object') {
    return results;
  }
  
  // Verificar se o objeto atual contém alguma das chaves procuradas
  for (const key of keys) {
    if (key in obj) {
      results.push(obj[key]);
    }
  }
  
  // Buscar recursivamente em arrays e objetos
  if (Array.isArray(obj)) {
    for (const item of obj) {
      results.push(...findInObject(item, keys));
    }
  } else {
    for (const value of Object.values(obj)) {
      results.push(...findInObject(value, keys));
    }
  }
  
  return results;
}

/**
 * Extrai resultados de música da estrutura de resposta do YouTube Music
 */
function extractMusicResults(data: any): any[] {
  const results: any[] = [];
  
  // Buscar recursivamente por musicResponsiveListItemRenderer
  const musicItems = findInObject(data, ['musicResponsiveListItemRenderer']);
  
  for (const item of musicItems) {
    // Tentar múltiplos caminhos para extrair videoId
    const videoId = 
      item?.playlistItemData?.videoId ||
      item?.videoId ||
      item?.navigationEndpoint?.watchEndpoint?.videoId ||
      item?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
    
    if (!videoId) continue;
    
    // Extrair título
    const titleRuns = item?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
    const title = titleRuns?.[0]?.text || 
                  item?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.simpleText ||
                  item?.title?.runs?.[0]?.text;
    
    if (!title) continue;
    
    // Extrair artista
    const artistRuns = item?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
    const artist = artistRuns?.[0]?.text || 
                   item?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.simpleText ||
                   item?.subtitle?.runs?.[0]?.text;
    
    // Extrair thumbnail
    let thumbnail: string | undefined;
    const thumbnailData = item?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
                          item?.thumbnail?.thumbnails;
    if (thumbnailData && Array.isArray(thumbnailData) && thumbnailData.length > 0) {
      thumbnail = thumbnailData[thumbnailData.length - 1].url;
    }
    
    results.push({
      videoId,
      title,
      artist,
      thumbnail
    });
  }
  
  return results;
}

/**
 * Busca no YouTube Music usando a API interna
 */
export async function searchYouTubeMusicAPI(
  query: string, 
  options: SearchOptions = {}
): Promise<YouTubeSearchResult[]> {
  const { maxResults = 5, preferMusic = true } = options;
  
  try {
    console.log(`🎵 [YouTube Music API] Buscando: "${query}"`);
    
    // Parâmetros para buscar apenas músicas
    const params = preferMusic 
      ? 'EgWKAQIIAWoKEAMQBBAJEAoQBQ%3D%3D' 
      : '';
    
    const response = await fetch(
      `https://music.youtube.com/youtubei/v1/search?key=${YOUTUBE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Origin': 'https://music.youtube.com',
          'Referer': 'https://music.youtube.com/',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'X-YouTube-Client-Name': '67',
          'X-YouTube-Client-Version': YOUTUBE_CLIENT_VERSION,
        },
        body: JSON.stringify({
          query,
          params,
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: YOUTUBE_CLIENT_VERSION,
              hl: 'pt-BR',
              gl: 'BR',
              utcOffsetMinutes: -180,
            },
            user: { lockedSafetyMode: false },
            request: {
              sessionId: Math.random().toString(36).substring(2, 15),
              internalExperimentFlags: [],
              consistencyTokenJars: [],
            },
          },
        }),
      }
    );

    if (!response.ok) {
      console.warn(`⚠️ [YouTube Music API] Resposta não OK: ${response.status}`);
      return [];
    }

    const data = await response.json();
    
    // Usar busca recursiva para encontrar resultados
    const musicResults = extractMusicResults(data);
    
    if (musicResults.length === 0) {
      console.warn(`⚠️ [YouTube Music API] Nenhum resultado encontrado na estrutura`);
      return [];
    }

    console.log(`✅ [YouTube Music API] Encontrados ${musicResults.length} resultados`);
    
    // Limitar resultados e formatar
    return musicResults.slice(0, maxResults).map(result => ({
      title: result.title,
      artist: result.artist,
      videoId: result.videoId,
      thumbnail: result.thumbnail || `https://img.youtube.com/vi/${result.videoId}/maxresdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${result.videoId}`,
      source: 'youtube-music' as const
    }));
    
  } catch (error) {
    console.error('❌ [YouTube Music API] Erro ao buscar:', error);
    return [];
  }
}

/**
 * Busca usando yt-dlp com estratégias específicas para YouTube Music
 */
export async function searchYouTubeMusicWithYtDlp(
  query: string,
  options: SearchOptions = {}
): Promise<YouTubeSearchResult[]> {
  const { maxResults = 5 } = options;
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const { hasValidCookiesFile } = await import('@/app/api/utils/common');
  
  try {
    console.log(`🔄 [yt-dlp] Buscando: "${query}"`);
    
    const hasValidCookies = await hasValidCookiesFile();
    const cookiesFlag = hasValidCookies ? '--cookies "cookies.txt" ' : '';
    
    // Estratégias de busca (tentar múltiplas)
    const strategies = [
      // Estratégia 1: Busca normal com filtro de música
      `yt-dlp --dump-json ${cookiesFlag}--default-search "ytsearch${maxResults}:${query}" --no-playlist --extractor-args "youtube:player_client=android"`,
      // Estratégia 2: Busca no YouTube Music diretamente
      `yt-dlp --dump-json ${cookiesFlag}"ytsearch${maxResults}:${query}" --no-playlist --extractor-args "youtube:player_client=ios"`,
      // Estratégia 3: Busca básica
      `yt-dlp --dump-json ${cookiesFlag}--default-search "ytsearch${maxResults}:${query}" --no-playlist`,
    ];
    
    for (const command of strategies) {
      try {
        console.log(`📝 [yt-dlp] Tentando: ${command.substring(0, 100)}...`);
        
        const { stdout } = await execAsync(command, {
          maxBuffer: 1024 * 1024 * 10,
          timeout: 15000
        });
        
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        if (lines.length === 0) continue;
        
        const results: YouTubeSearchResult[] = [];
        
        for (const line of lines.slice(0, maxResults)) {
          try {
            const videoInfo = JSON.parse(line);
            const videoId = videoInfo.id;
            
            if (videoId) {
              results.push({
                title: videoInfo.title || query,
                artist: videoInfo.uploader || videoInfo.channel,
                videoId,
                thumbnail: videoInfo.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                duration: videoInfo.duration ? formatDuration(videoInfo.duration) : undefined,
                url: videoInfo.webpage_url || `https://www.youtube.com/watch?v=${videoId}`,
                source: 'youtube' as const
              });
            }
          } catch (parseError) {
            console.error('❌ [yt-dlp] Erro ao parsear resultado:', parseError);
          }
        }
        
        if (results.length > 0) {
          console.log(`✅ [yt-dlp] Encontrados ${results.length} resultados`);
          return results;
        }
      } catch (error) {
        console.warn(`⚠️ [yt-dlp] Estratégia falhou, tentando próxima...`);
        continue;
      }
    }
    
    return [];
  } catch (error) {
    console.error('❌ [yt-dlp] Erro geral:', error);
    return [];
  }
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Busca unificada com fallback automático
 */
export async function searchYouTubeMusic(
  query: string,
  options: SearchOptions = {}
): Promise<YouTubeSearchResult[]> {
  // Tentar primeiro com API do YouTube Music
  const apiResults = await searchYouTubeMusicAPI(query, options);
  
  if (apiResults.length > 0) {
    return apiResults;
  }
  
  // Fallback para yt-dlp
  console.log('⚠️ API não retornou resultados, tentando yt-dlp...');
  return await searchYouTubeMusicWithYtDlp(query, options);
}
