import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { hasValidCookiesFile } from '../utils/common';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return 'N/A';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

interface AlbumTrack {
  title: string;
  artist: string;
  videoId: string;
  url: string;
  thumbnail: string;
  duration: string;
}

async function searchAlbumOnYouTubeMusic(albumName: string, artistName?: string): Promise<{ tracks: AlbumTrack[]; playlistUrl?: string }> {
  try {
    // Construir query de busca para o álbum
    const query = artistName ? `${artistName} ${albumName} album` : `${albumName} album`;
    
    console.log(`🔍 Buscando álbum: "${query}"`);
    
    // Buscar no YouTube Music usando a API
    const response = await fetch(`https://music.youtube.com/youtubei/v1/search?key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX94`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Origin': 'https://music.youtube.com',
        'Referer': 'https://music.youtube.com/',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': '1.20240101.01.00',
      },
      body: JSON.stringify({
        query,
        params: 'EgWKAQIIAWoKEAMQBBAJEAoQBQ%3D%3D', // Parâmetro para buscar álbuns
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

    const data = await response.json();
    
    // Tentar encontrar um álbum nos resultados
    const tabs = data.contents?.tabbedSearchResultsRenderer?.tabs || [];
    let albumResults: any[] = [];
    
    // Procurar por álbuns nos resultados
    for (const tab of tabs) {
      const content = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      for (const section of content) {
        // Procurar por musicShelfRenderer (resultados de músicas)
        if (section.musicShelfRenderer?.contents) {
          albumResults.push(...section.musicShelfRenderer.contents);
        }
        // Procurar por álbuns específicos
        if (section.musicCarouselShelfRenderer?.contents) {
          for (const item of section.musicCarouselShelfRenderer.contents) {
            if (item.musicTwoRowItemRenderer?.navigationEndpoint?.browseEndpoint?.browseId) {
              // É um álbum, buscar suas faixas
              const albumId = item.musicTwoRowItemRenderer.navigationEndpoint.browseEndpoint.browseId;
              const albumResult = await getAlbumTracks(albumId);
              if (albumResult.tracks.length > 0) {
                // Retornar como objeto com tracks e playlistUrl
                return { tracks: albumResult.tracks, playlistUrl: albumResult.playlistUrl };
              }
            }
          }
        }
      }
    }
    
    // Se não encontrou álbum específico, tentar buscar as primeiras músicas relacionadas
    // e agrupá-las como se fossem do álbum
    if (albumResults.length > 0) {
      const tracks: AlbumTrack[] = [];
      const hasValidCookies = await hasValidCookiesFile();
      const cookiesFlag = hasValidCookies ? '--cookies "cookies.txt" ' : '';
      const playlistUrls = new Map<string, number>(); // Contar quantas faixas têm a mesma playlist
      
      for (const result of albumResults.slice(0, 20)) { // Limitar a 20 faixas
        const item = result.musicResponsiveListItemRenderer;
        if (!item) continue;
        
        const videoId = item?.playlistItemData?.videoId;
        if (!videoId) continue;
        
        try {
          // Buscar informações completas do vídeo
          const { stdout } = await execAsync(
            `yt-dlp --dump-json ${cookiesFlag}"https://www.youtube.com/watch?v=${videoId}"`,
            { maxBuffer: 1024 * 1024 * 10 }
          );
          
          const videoInfo = JSON.parse(stdout);
          
          // Verificar se o vídeo tem informações de álbum nos metadados
          const videoAlbum = videoInfo.album || videoInfo.album_artist;
          if (videoAlbum && videoAlbum.toLowerCase().includes(albumName.toLowerCase())) {
            // Verificar se há uma playlist associada
            const webpageUrl = videoInfo.webpage_url || videoInfo.url || '';
            const playlistMatch = webpageUrl.match(/[?&]list=([^&]+)/);
            if (playlistMatch && playlistMatch[1].startsWith('OLAK5uy')) {
              const playlistId = playlistMatch[1];
              playlistUrls.set(playlistId, (playlistUrls.get(playlistId) || 0) + 1);
            }
            
            tracks.push({
              title: videoInfo.title || item?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '',
              artist: videoInfo.artist || videoInfo.uploader || item?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '',
              videoId: videoInfo.id || videoId,
              url: videoInfo.webpage_url || `https://www.youtube.com/watch?v=${videoId}`,
              thumbnail: videoInfo.thumbnail || videoInfo.thumbnails?.[0]?.url || '',
              duration: formatDuration(videoInfo.duration)
            });
          }
        } catch (err) {
          console.error(`Erro ao buscar informações do vídeo ${videoId}:`, err);
        }
      }
      
      // Se várias faixas têm a mesma playlist, provavelmente é o álbum completo
      if (playlistUrls.size > 0) {
        // Encontrar a playlist mais comum
        let mostCommonPlaylist: string | null = null;
        let maxCount = 0;
        for (const [playlistId, count] of playlistUrls.entries()) {
          if (count > maxCount && count >= 2) { // Pelo menos 2 faixas da mesma playlist
            maxCount = count;
            mostCommonPlaylist = playlistId;
          }
        }
        
        if (mostCommonPlaylist) {
          console.log(`✅ Encontrada playlist comum: ${mostCommonPlaylist} (${maxCount} faixas)`);
          return { tracks, playlistUrl: `https://music.youtube.com/playlist?list=${mostCommonPlaylist}` };
        }
      }
      
      // Tentar extrair playlistUrl diretamente dos metadados dos vídeos
      if (tracks.length > 0) {
        // Verificar se alguma faixa tem playlistUrl nos metadados
        for (const track of tracks.slice(0, 3)) { // Verificar apenas as primeiras 3 (para não demorar muito)
          try {
            // Usar Promise.race para timeout
            const execPromise = execAsync(
              `yt-dlp --dump-json ${cookiesFlag}"${track.url}"`,
              { maxBuffer: 1024 * 1024 * 10 }
            );
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 8000)
            );
            
            const { stdout } = await Promise.race([execPromise, timeoutPromise]) as any;
            const videoInfo = JSON.parse(stdout);
            
            // Tentar extrair playlistId da URL ou dos metadados
            const webpageUrl = videoInfo.webpage_url || videoInfo.url || track.url;
            const playlistMatch = webpageUrl.match(/[?&]list=([^&]+)/);
            if (playlistMatch && playlistMatch[1].startsWith('OLAK5uy')) {
              const playlistId = playlistMatch[1];
              console.log(`✅ Encontrado playlistUrl nos metadados do vídeo: ${playlistId}`);
              return { tracks, playlistUrl: `https://music.youtube.com/playlist?list=${playlistId}` };
            }
            
            // Tentar extrair do campo album_id ou similar
            if (videoInfo.album_id && videoInfo.album_id.startsWith('OLAK5uy')) {
              console.log(`✅ Encontrado playlistUrl no album_id: ${videoInfo.album_id}`);
              return { tracks, playlistUrl: `https://music.youtube.com/playlist?list=${videoInfo.album_id}` };
            }
          } catch (err) {
            // Continuar para o próximo vídeo
            continue;
          }
        }
        
        return { tracks };
      }
    }
    
    // Fallback: tentar encontrar playlist primeiro, depois buscar músicas individuais
    const playlistUrl = await tryFindPlaylistByAlbumName(albumName, artistName);
    if (playlistUrl) {
      // Se encontrou uma playlist, tentar extrair as faixas dela
      try {
        const playlistId = playlistUrl.match(/list=([^&]+)/)?.[1];
        if (playlistId) {
          const playlistResult = await getAlbumTracks(playlistId);
          if (playlistResult.tracks.length > 0) {
            return { tracks: playlistResult.tracks, playlistUrl: playlistResult.playlistUrl || playlistUrl };
          }
        }
      } catch (err) {
        console.error('Erro ao buscar playlist encontrada:', err);
      }
    }
    
    // Fallback final: buscar músicas relacionadas ao álbum usando busca normal
    const fallbackTracks = await searchAlbumTracksFallback(albumName, artistName);
    return { tracks: fallbackTracks, playlistUrl: playlistUrl || undefined };
    
  } catch (error) {
    console.error('Erro ao buscar álbum no YouTube Music:', error);
    // Fallback para busca normal
    const fallbackTracks = await searchAlbumTracksFallback(albumName, artistName);
    return { tracks: fallbackTracks };
  }
}

async function getAlbumTracks(albumId: string): Promise<{ tracks: AlbumTrack[]; playlistUrl?: string }> {
  try {
    // Buscar informações do álbum usando yt-dlp
    const hasValidCookies = await hasValidCookiesFile();
    const cookiesFlag = hasValidCookies ? '--cookies "cookies.txt" ' : '';
    
    // Tentar buscar como playlist se o ID começar com "MPRE" ou similar
    const url = `https://music.youtube.com/playlist?list=${albumId}`;
    
    try {
      const { stdout } = await execAsync(
        `yt-dlp --dump-json --flat-playlist ${cookiesFlag}"${url}"`,
        { maxBuffer: 1024 * 1024 * 10 }
      );
      
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      const tracks: AlbumTrack[] = [];
      
      for (const line of lines.slice(0, 50)) { // Limitar a 50 faixas
        try {
          const entry = JSON.parse(line);
          if (entry.id) {
            // Buscar informações completas de cada faixa
            const videoUrl = `https://www.youtube.com/watch?v=${entry.id}`;
            const { stdout: videoStdout } = await execAsync(
              `yt-dlp --dump-json ${cookiesFlag}"${videoUrl}"`,
              { maxBuffer: 1024 * 1024 * 10 }
            );
            
            const videoInfo = JSON.parse(videoStdout);
            tracks.push({
              title: videoInfo.title || entry.title || '',
              artist: videoInfo.artist || videoInfo.uploader || '',
              videoId: videoInfo.id || entry.id,
              url: videoInfo.webpage_url || videoUrl,
              thumbnail: videoInfo.thumbnail || videoInfo.thumbnails?.[0]?.url || '',
              duration: formatDuration(videoInfo.duration)
            });
          }
        } catch (err) {
          console.error('Erro ao processar entrada do álbum:', err);
        }
      }
      
      return { tracks, playlistUrl: url };
    } catch (err) {
      console.error('Erro ao buscar faixas do álbum:', err);
      return { tracks: [] };
    }
  } catch (error) {
    console.error('Erro ao buscar álbum:', error);
    return { tracks: [] };
  }
}

async function tryFindPlaylistByAlbumName(albumName: string, artistName?: string): Promise<string | null> {
  try {
    // Tentar buscar uma playlist do YouTube Music que corresponda ao álbum
    const query = artistName ? `${artistName} ${albumName}` : albumName;
    const hasValidCookies = await hasValidCookiesFile();
    const cookiesFlag = hasValidCookies ? '--cookies "cookies.txt" ' : '';
    
    // Primeiro, buscar algumas músicas do álbum
    const { stdout } = await execAsync(
      `yt-dlp --dump-json --default-search "ytsearch10:${query} album" ${cookiesFlag}`,
      { maxBuffer: 1024 * 1024 * 10 }
    );
    
    const lines = stdout.trim().split('\n').filter(line => line.trim());
    const albumLower = albumName.toLowerCase();
    
    // Verificar se alguma das músicas tem informação de playlist nos metadados
    for (const line of lines) {
      try {
        const videoInfo = JSON.parse(line);
        
        // Verificar se o vídeo tem informação de álbum que corresponde
        const videoAlbum = (videoInfo.album || videoInfo.album_artist || '').toLowerCase();
        const videoTitle = (videoInfo.title || '').toLowerCase();
        const videoArtist = (videoInfo.artist || videoInfo.uploader || '').toLowerCase();
        
        // Verificar correspondência com álbum
        const albumMatches = videoAlbum.includes(albumLower) || albumLower.includes(videoAlbum) || 
                            videoTitle.includes(albumLower);
        
        // Verificar correspondência com artista (se fornecido)
        const artistMatches = !artistName || videoArtist.toLowerCase().includes(artistName.toLowerCase());
        
        if (albumMatches && artistMatches) {
          // Tentar extrair playlist URL dos metadados
          // Verificar se há informação de playlist no vídeo
          if (videoInfo.availability === 'public' || videoInfo.availability === 'unlisted') {
            // Tentar buscar informações completas para ver se há playlist associada
            try {
              // Verificar se há uma playlist associada na URL ou nos metadados
              const webpageUrl = videoInfo.webpage_url || videoInfo.url;
              if (webpageUrl) {
                // Tentar extrair da URL se houver
                const playlistMatch = webpageUrl.match(/[?&]list=([^&]+)/);
                if (playlistMatch && playlistMatch[1].startsWith('OLAK5uy')) {
                  // É uma playlist do YouTube Music (começa com OLAK5uy)
                  return `https://music.youtube.com/playlist?list=${playlistMatch[1]}`;
                }
              }
              
              // Verificar se há informação de álbum que pode ser uma playlist
              // Tentar buscar diretamente no YouTube Music usando o nome do álbum
              const musicUrl = `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
              // Não podemos fazer scraping aqui, mas podemos tentar usar yt-dlp para buscar
            } catch (err) {
              // Continuar
            }
          }
        }
      } catch (err) {
        // Continuar para o próximo
      }
    }
    
    // Tentar buscar diretamente no YouTube Music usando yt-dlp
    try {
      // Tentar buscar como playlist no YouTube Music
      const musicQuery = `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
      // Isso não funciona diretamente, então vamos tentar outra abordagem
      
      // Tentar buscar playlists que contenham o nome do álbum
      const playlistSearchQuery = `${query} playlist`;
      const { stdout: playlistStdout } = await execAsync(
        `yt-dlp --dump-json --flat-playlist --default-search "ytsearch5:${playlistSearchQuery}" ${cookiesFlag}`,
        { maxBuffer: 1024 * 1024 * 10 }
      );
      
      const playlistLines = playlistStdout.trim().split('\n').filter(line => line.trim());
      for (const line of playlistLines) {
        try {
          const playlistInfo = JSON.parse(line);
          const playlistTitle = (playlistInfo.title || '').toLowerCase();
          if (playlistTitle.includes(albumLower) && playlistInfo.url) {
            const playlistMatch = playlistInfo.url.match(/[?&]list=([^&]+)/);
            if (playlistMatch && playlistMatch[1].startsWith('OLAK5uy')) {
              return `https://music.youtube.com/playlist?list=${playlistMatch[1]}`;
            }
          }
        } catch (err) {
          // Continuar
        }
      }
    } catch (err) {
      // Ignorar erros
    }
    
    return null;
  } catch (error) {
    console.error('Erro ao tentar encontrar playlist:', error);
    return null;
  }
}

async function searchAlbumTracksFallback(albumName: string, artistName?: string): Promise<AlbumTrack[]> {
  try {
    const query = artistName ? `${artistName} ${albumName}` : albumName;
    const hasValidCookies = await hasValidCookiesFile();
    const cookiesFlag = hasValidCookies ? '--cookies "cookies.txt" ' : '';
    
    // Buscar usando yt-dlp com busca de álbum
    const { stdout } = await execAsync(
      `yt-dlp --dump-json --default-search "ytsearch20:${query} album" ${cookiesFlag}`,
      { maxBuffer: 1024 * 1024 * 20 }
    );
    
    const lines = stdout.trim().split('\n').filter(line => line.trim());
    const tracks: AlbumTrack[] = [];
    
    for (const line of lines.slice(0, 20)) {
      try {
        const videoInfo = JSON.parse(line);
        
        // Verificar se o vídeo menciona o álbum
        const title = (videoInfo.title || '').toLowerCase();
        const description = (videoInfo.description || '').toLowerCase();
        const albumLower = albumName.toLowerCase();
        
        if (title.includes(albumLower) || description.includes(albumLower)) {
          tracks.push({
            title: videoInfo.title || '',
            artist: videoInfo.artist || videoInfo.uploader || '',
            videoId: videoInfo.id,
            url: videoInfo.webpage_url || `https://www.youtube.com/watch?v=${videoInfo.id}`,
            thumbnail: videoInfo.thumbnail || videoInfo.thumbnails?.[0]?.url || '',
            duration: formatDuration(videoInfo.duration)
          });
        }
      } catch (err) {
        console.error('Erro ao processar resultado:', err);
      }
    }
    
    return tracks;
  } catch (error) {
    console.error('Erro no fallback de busca de álbum:', error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const albumName = searchParams.get('album');
    const artistName = searchParams.get('artist');
    
    if (!albumName) {
      return NextResponse.json(
        { error: 'Nome do álbum é obrigatório' },
        { status: 400 }
      );
    }

    console.log(`🔍 Buscando álbum: "${albumName}"${artistName ? ` por "${artistName}"` : ''}`);

    const result = await searchAlbumOnYouTubeMusic(albumName, artistName || undefined);

    if (result.tracks.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma faixa do álbum encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      album: albumName,
      artist: artistName || null,
      tracks: result.tracks,
      playlistUrl: result.playlistUrl,
      totalTracks: result.tracks.length
    });

  } catch (error) {
    console.error('❌ Erro ao buscar álbum:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    
    return NextResponse.json(
      { error: `Erro ao buscar álbum: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { album, artist } = body;
    
    if (!album) {
      return NextResponse.json(
        { error: 'Nome do álbum é obrigatório' },
        { status: 400 }
      );
    }

    // Criar uma nova URL com os parâmetros
    const url = new URL(request.url);
    url.searchParams.set('album', album);
    if (artist) {
      url.searchParams.set('artist', artist);
    }

    // Criar uma nova requisição GET
    const getRequest = new NextRequest(url, {
      method: 'GET',
      headers: request.headers,
    });

    return GET(getRequest);
  } catch (error) {
    console.error('❌ Erro ao processar requisição POST:', error);
    return NextResponse.json(
      { error: 'Erro ao processar requisição' },
      { status: 500 }
    );
  }
}





