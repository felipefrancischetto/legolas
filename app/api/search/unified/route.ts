import { NextRequest, NextResponse } from 'next/server';
import { validateUrl, extractVideoId } from '../../utils/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

interface SearchRequest {
  query: string;
  platform?: 'youtube' | 'soundcloud' | 'track101' | 'auto';
  maxResults?: number;
}

interface SearchResult {
  platform: string;
  title: string;
  artist?: string;
  url: string;
  thumbnail?: string;
  duration?: string;
  metadata?: any;
  videoId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SearchRequest = await request.json();
    const { query, platform = 'auto', maxResults = 5 } = body;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    console.log(`🔍 [Unified Search] Searching for: "${query}" on platform: ${platform}`);

    let results: SearchResult[] = [];

    // Determinar plataforma automaticamente se necessário
    const targetPlatform = platform === 'auto' ? 
      (validateUrl(query) ? 'url' : 'youtube') : platform;

    if (targetPlatform === 'url') {
      // Se for uma URL, extrair informações diretamente
      const videoId = extractVideoId(query);
      if (videoId) {
        const videoInfo = await getVideoInfo(videoId);
        if (videoInfo) {
          results.push({
            platform: 'youtube',
            title: videoInfo.title,
            artist: videoInfo.uploader,
            url: query,
            thumbnail: videoInfo.thumbnail,
            duration: videoInfo.duration
          });
        }
      }
    } else if (targetPlatform === 'youtube') {
      // Busca no YouTube Music
      const youtubeResults = await searchYouTube(query, maxResults);
      results.push(...youtubeResults);
    } else if (targetPlatform === 'soundcloud') {
      // Busca no SoundCloud
      const soundcloudResults = await searchSoundCloud(query, maxResults);
      results.push(...soundcloudResults);
    } else if (targetPlatform === 'track101') {
      // Busca no Track101
      const track101Results = await searchTrack101(query, maxResults);
      results.push(...track101Results);
    }

    return NextResponse.json({
      success: true,
      query,
      platform: targetPlatform,
      results,
      totalResults: results.length
    });

  } catch (error) {
    console.error('❌ [Unified Search] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Search failed' 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const platform = searchParams.get('platform') as SearchRequest['platform'] || 'auto';

  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
  }

  // Criar uma nova requisição POST com os parâmetros
  const postRequest = new NextRequest(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, platform })
  });

  return POST(postRequest);
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

async function searchYouTube(query: string, maxResults: number): Promise<SearchResult[]> {
  try {
    console.log(`🔍 [YouTube Search] Buscando: "${query}"`);
    
    const response = await fetch(`https://music.youtube.com/youtubei/v1/search?key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX94`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://music.youtube.com',
        'Referer': 'https://music.youtube.com/',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': '1.20240101.01.00',
      },
      body: JSON.stringify({
        query,
        params: 'EgWKAQIIAWoKEAMQBBAJEAoQBQ%3D%3D',
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240101.01.00',
            hl: 'pt-BR',
            gl: 'BR',
            utcOffsetMinutes: -180,
          },
          user: { lockedSafetyMode: false },
          request: {
            sessionId: '1234567890',
            internalExperimentFlags: [],
            consistencyTokenJars: [],
          },
        },
      }),
    });

    if (!response.ok) {
      console.error(`❌ [YouTube Search] HTTP Error: ${response.status} ${response.statusText}`);
      // Fallback para yt-dlp
      return await searchYouTubeWithYtDlp(query, maxResults);
    }

    const data = await response.json();
    
    // Log da estrutura para debug
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 [YouTube Search] Estrutura da resposta:', JSON.stringify(data).substring(0, 500));
    }
    
    // Tentar diferentes caminhos na estrutura de resposta
    let videoResults = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.musicShelfRenderer?.contents;
    
    // Tentar caminho alternativo
    if (!videoResults || videoResults.length === 0) {
      videoResults = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicShelfRenderer?.contents;
    }
    
    // Tentar outro caminho alternativo
    if (!videoResults || videoResults.length === 0) {
      const sections = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
      if (sections && sections.length > 0) {
        for (const section of sections) {
          if (section.musicShelfRenderer?.contents) {
            videoResults = section.musicShelfRenderer.contents;
            break;
          }
        }
      }
    }
    
    if (!videoResults || videoResults.length === 0) {
      console.log('⚠️ [YouTube Search] Nenhum resultado encontrado na estrutura esperada, tentando fallback com yt-dlp...');
      return await searchYouTubeWithYtDlp(query, maxResults);
    }

    console.log(`✅ [YouTube Search] Encontrados ${videoResults.length} resultados`);
    
    const results: SearchResult[] = [];
    const limitedResults = videoResults.slice(0, maxResults);

    for (const result of limitedResults) {
      const item = result.musicResponsiveListItemRenderer;
      const videoId = item?.playlistItemData?.videoId;
      const title = item?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
      const artist = item?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
      
      // Tentar extrair thumbnail da resposta
      let thumbnail: string | undefined;
      const thumbnailData = item?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
      if (thumbnailData && thumbnailData.length > 0) {
        // Pegar a thumbnail de maior qualidade
        thumbnail = thumbnailData[thumbnailData.length - 1].url;
      } else if (videoId) {
        // Fallback: usar padrão do YouTube
        thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }

      if (videoId && title) {
        results.push({
          platform: 'youtube',
          title,
          artist,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail,
          videoId,
        });
      }
    }

    if (results.length === 0) {
      console.log('⚠️ [YouTube Search] Nenhum resultado válido extraído, tentando fallback com yt-dlp...');
      return await searchYouTubeWithYtDlp(query, maxResults);
    }

    return results;
  } catch (error) {
    console.error('❌ [YouTube Search] Erro:', error);
    // Fallback para yt-dlp em caso de erro
    return await searchYouTubeWithYtDlp(query, maxResults);
  }
}

async function searchYouTubeWithYtDlp(query: string, maxResults: number): Promise<SearchResult[]> {
  try {
    console.log(`🔄 [YouTube Search] Usando fallback yt-dlp para: "${query}"`);

    // Verificar se cookies existem
    const cookiesPath = path.join(process.cwd(), 'cookies.txt');
    let hasValidCookies = false;
    try {
      const cookiesStat = await fs.access(cookiesPath).then(() => true).catch(() => false);
      if (cookiesStat) {
        const cookiesContent = await fs.readFile(cookiesPath, 'utf-8');
        hasValidCookies = cookiesContent.trim().length > 0 && !cookiesContent.includes('does not look like a Netscape format');
      }
    } catch (err) {
      // Ignorar erro
    }

    const cookiesFlag = hasValidCookies ? '--cookies "cookies.txt" ' : '';
    const command = `yt-dlp --dump-json ${cookiesFlag}--default-search "ytsearch${maxResults}:${query}" --no-playlist`;
    
    console.log(`📝 [YouTube Search] Executando yt-dlp: ${command.substring(0, 100)}...`);
    
    const { stdout } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    
    const lines = stdout.trim().split('\n').filter(line => line.trim());
    const results: SearchResult[] = [];
    
    for (const line of lines.slice(0, maxResults)) {
      try {
        const videoInfo = JSON.parse(line);
        const videoId = videoInfo.id;
        
        if (videoId) {
          results.push({
            platform: 'youtube',
            title: videoInfo.title || query,
            artist: videoInfo.uploader || videoInfo.channel || undefined,
            url: videoInfo.webpage_url || `https://www.youtube.com/watch?v=${videoId}`,
            thumbnail: videoInfo.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            duration: videoInfo.duration ? formatDuration(videoInfo.duration) : undefined,
            videoId,
          });
        }
      } catch (parseError) {
        console.error('❌ [YouTube Search] Erro ao parsear resultado do yt-dlp:', parseError);
      }
    }
    
    console.log(`✅ [YouTube Search] yt-dlp retornou ${results.length} resultados`);
    return results;
  } catch (error) {
    console.error('❌ [YouTube Search] Erro no fallback yt-dlp:', error);
    return [];
  }
}

async function searchSoundCloud(query: string, maxResults: number): Promise<SearchResult[]> {
  try {
    const searchUrl = `https://soundcloud.com/search/sounds?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LegolasDownloader/1.0)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    
    const html = await res.text();
    const matches = html.match(/<a href="(\/[^\"]+)"\s*title="Play"/g);
    
    if (!matches) return [];

    const results: SearchResult[] = [];
    const limitedMatches = matches.slice(0, maxResults);

    for (const match of limitedMatches) {
      const urlMatch = match.match(/href="([^"]+)"/);
      if (urlMatch) {
        const url = `https://soundcloud.com${urlMatch[1]}`;
        results.push({
          platform: 'soundcloud',
          title: query, // SoundCloud não fornece título na busca
          url
        });
      }
    }

    return results;
  } catch (error) {
    console.error('SoundCloud search error:', error);
    return [];
  }
}

async function searchTrack101(query: string, maxResults: number): Promise<SearchResult[]> {
  try {
    const searchUrl = `https://track101.com/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LegolasDownloader/1.0)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    
    const html = await res.text();
    const musicBlocks = html.match(/<div class="track-result"[\s\S]*?<\/div>\s*<\/div>/g) || [];
    
    const results: SearchResult[] = [];
    const limitedBlocks = musicBlocks.slice(0, maxResults);

    for (const block of limitedBlocks) {
      const titleMatch = block.match(/<div class="track-title">([^<]+)<\/div>/);
      const title = titleMatch ? titleMatch[1].trim() : '';
      
      if (title) {
        // Procurar por links do YouTube primeiro
        const ytMatch = block.match(/href="(https:\/\/www.youtube.com\/watch[^"]+)"/);
        if (ytMatch) {
          results.push({
            platform: 'youtube',
            title,
            url: ytMatch[1]
          });
        } else {
          // Fallback para busca no YouTube
          results.push({
            platform: 'youtube',
            title,
            url: `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`
          });
        }
      }
    }

    return results;
  } catch (error) {
    console.error('Track101 search error:', error);
    return [];
  }
}

async function getVideoInfo(videoId: string): Promise<any> {
  try {
    const response = await fetch(`/api/video-info?id=${videoId}`);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error('Error getting video info:', error);
  }
  return null;
} 