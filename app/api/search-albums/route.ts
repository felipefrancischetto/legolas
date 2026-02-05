import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import { hasValidCookiesFile } from '../utils/common';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

// Função para buscar TODAS as faixas de uma playlist do YouTube Music
async function fetchAllPlaylistTracks(playlistUrl: string, cookiesFlag: string): Promise<Array<{
  title: string;
  artist: string;
  videoId: string;
  url: string;
}>> {
  try {
    console.log(`🔍 [fetchAllPlaylistTracks] Buscando todas as faixas de: ${playlistUrl}`);
    
    // Lista de métodos de extração (prioridade: Android > iOS > Web > básico)
    // Remover --playlist-end para buscar TODAS as faixas sem limite
    const extractionMethods: string[] = [
      // Método 1: Android client (todas as faixas)
      `yt-dlp --dump-json --flat-playlist --no-playlist-reverse --extractor-args "youtube:player_client=android" ${cookiesFlag}"${playlistUrl}"`,
      // Método 2: iOS client
      `yt-dlp --dump-json --flat-playlist --no-playlist-reverse --extractor-args "youtube:player_client=ios" ${cookiesFlag}"${playlistUrl}"`,
      // Método 3: Web client
      `yt-dlp --dump-json --flat-playlist --no-playlist-reverse --extractor-args "youtube:player_client=web" ${cookiesFlag}"${playlistUrl}"`,
      // Método 4: TV client (pode retornar mais faixas)
      `yt-dlp --dump-json --flat-playlist --no-playlist-reverse --extractor-args "youtube:player_client=tv" ${cookiesFlag}"${playlistUrl}"`,
      // Método 5: Básico sem limite explícito
      `yt-dlp --dump-json --flat-playlist --no-playlist-reverse ${cookiesFlag}"${playlistUrl}"`,
      // Método 6: Com limite muito alto como fallback
      `yt-dlp --dump-json --flat-playlist --no-playlist-reverse --playlist-end 999999 ${cookiesFlag}"${playlistUrl}"`,
      // Método 7: Sem flags de playlist (pode funcionar em alguns casos)
      `yt-dlp --dump-json --flat-playlist ${cookiesFlag}"${playlistUrl}"`
    ];
    
    let bestResult: string[] = [];
    let maxTracksFound = 0;
    
    // Tentar cada método até encontrar um que funcione
    // Não parar prematuramente - tentar todos os métodos para garantir que pegamos o máximo de faixas
    for (let i = 0; i < extractionMethods.length; i++) {
      try {
        const { stdout } = await execAsync(
          extractionMethods[i],
          { maxBuffer: 1024 * 1024 * 20, timeout: 45000 } // Aumentar timeout para playlists maiores
        );
        
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        if (lines.length > maxTracksFound) {
          maxTracksFound = lines.length;
          bestResult = lines;
          console.log(`✅ [fetchAllPlaylistTracks] Método ${i + 1} encontrou ${lines.length} faixas`);
          
          // Continuar tentando outros métodos para garantir que pegamos o máximo possível
          // Não parar prematuramente - pode haver métodos que retornam mais faixas
        }
      } catch (err) {
        console.warn(`⚠️ [fetchAllPlaylistTracks] Método ${i + 1} falhou:`, err);
        // Tentar próximo método
        continue;
      }
    }
    
    if (bestResult.length === 0) {
      console.warn(`⚠️ [fetchAllPlaylistTracks] Nenhum método funcionou para: ${playlistUrl}`);
      return [];
    }
    
    // Processar as faixas encontradas
    const tracks: Array<{
      title: string;
      artist: string;
      videoId: string;
      url: string;
    }> = [];
    
    // Usar Set para evitar duplicatas por videoId
    const seenIds = new Set<string>();
    
    for (const line of bestResult) {
      try {
        const entry = JSON.parse(line);
        if (entry.id && !seenIds.has(entry.id)) {
          seenIds.add(entry.id);
          tracks.push({
            title: entry.title || entry.name || 'Título desconhecido',
            artist: entry.artist || entry.uploader || entry.channel || 'Artista desconhecido',
            videoId: entry.id,
            url: entry.url || entry.webpage_url || `https://www.youtube.com/watch?v=${entry.id}`,
          });
        }
      } catch (err) {
        // Ignorar linhas inválidas, mas logar para debug
        console.warn(`⚠️ [fetchAllPlaylistTracks] Erro ao processar linha:`, err);
        continue;
      }
    }
    
    console.log(`✅ [fetchAllPlaylistTracks] Retornando ${tracks.length} faixas únicas de ${bestResult.length} entradas processadas`);
    
    // Se encontrou poucas faixas mas esperávamos mais, logar aviso
    if (tracks.length < 3 && bestResult.length > 0) {
      console.warn(`⚠️ [fetchAllPlaylistTracks] Apenas ${tracks.length} faixas encontradas - pode haver problema na extração`);
    }
    
    return tracks;
    
  } catch (error) {
    console.error(`❌ [fetchAllPlaylistTracks] Erro:`, error);
    return [];
  }
}

// Função auxiliar para verificar se um texto parece ser um título válido (não estatísticas)
function isValidAlbumTitle(text: string): boolean {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  // Rejeitar textos que parecem ser estatísticas ou métricas
  const invalidPatterns = [
    /tocou\s+\d+/i,
    /tocou\s+\d+[.,]?\d*\s*(mil|k|m)?\s*vezes/i, // "Tocou 2,5 mil vezes"
    /visualizações/i,
    /inscritos/i,
    /mil\s+vezes/i,
    /\d+\s*(mil|k|m)\s*(visualizações|views|plays|vezes)/i,
    /há\s+\d+/i,
    /há\s+[a-z]+/i,
    /^\d+\s*(mil|k|m)?$/i, // Apenas números
    /^\d+[.,]?\d*\s*(mil|k|m)\s*vezes$/i, // "2,5 mil vezes"
    /^\d+[.,]?\d*\s*(mil|k|m)$/i, // "2,5 mil"
  ];
  return !invalidPatterns.some(pattern => pattern.test(lowerText));
}

// Função auxiliar para extrair título válido de múltiplos runs
function extractValidTitleFromRuns(runs: any[] | undefined): string | null {
  if (!runs || !Array.isArray(runs)) return null;
  
  // Tentar cada run até encontrar um título válido
  for (const run of runs) {
    const text = run?.text || '';
    if (text && isValidAlbumTitle(text)) {
      return text;
    }
  }
  
  return null;
}

// Função recursiva para buscar álbuns em qualquer lugar da estrutura
function findAlbumsRecursively(obj: any, albums: AlbumSearchResult[], maxResults: number, seenIds: Set<string>, depth: number = 0): void {
  // Limitar profundidade para evitar loops infinitos ou buscas muito profundas
  if (!obj || typeof obj !== 'object' || albums.length >= maxResults || depth > 10) return;
  
  // Verificar se é um objeto que representa um álbum
  if (obj.navigationEndpoint?.browseEndpoint?.browseId) {
    const browseId = obj.navigationEndpoint.browseEndpoint.browseId;
    // IDs de álbum geralmente começam com MPRE ou OLAK5uy
    if ((browseId.startsWith('MPRE') || browseId.startsWith('OLAK5uy')) && !seenIds.has(browseId)) {
      // Tentar extrair título de múltiplas fontes
      let title: string | null = null;
      
      // 1. Tentar extrair de todos os runs do título
      if (obj.title?.runs) {
        title = extractValidTitleFromRuns(obj.title.runs);
      } else if (obj.title?.text && isValidAlbumTitle(obj.title.text)) {
        title = obj.title.text;
      }
      
      // 2. Se não encontrou, tentar usar título do browseEndpoint
      if (!title && obj.navigationEndpoint?.browseEndpoint?.title) {
        const browseTitle = obj.navigationEndpoint.browseEndpoint.title;
        if (isValidAlbumTitle(browseTitle)) {
          title = browseTitle;
        }
      }
      
      // 3. Se ainda não encontrou, tentar usar o subtitle
      if (!title && obj.subtitle?.runs) {
        const subtitleTitle = extractValidTitleFromRuns(obj.subtitle.runs);
        if (subtitleTitle) {
          title = subtitleTitle;
        }
      }
      
      // Se ainda não encontrou título válido, pular este resultado
      if (!title) {
        const firstTitleText = obj.title?.runs?.[0]?.text || obj.title?.text || 'sem título';
        console.warn(`⚠️ [Album Search] Pulando álbum com título inválido (recursivo): "${firstTitleText}"`);
        return;
      }
      
      // Extrair subtitle completo
      const subtitle = obj.subtitle?.runs?.map((r: any) => r?.text || '').join(' ') || 
                       obj.subtitle?.runs?.[0]?.text || 
                       obj.subtitle?.text || '';
      
      seenIds.add(browseId);
      console.log(`✅ [Album Search] Álbum encontrado (recursivo): "${title}" por "${subtitle}" (ID: ${browseId})`);
      
      let thumbnail: string | undefined;
      const thumbnailData = obj.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
                            obj.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
      if (thumbnailData && thumbnailData.length > 0) {
        thumbnail = thumbnailData[thumbnailData.length - 1].url;
      }
      
      // Extrair artista do subtitle
      let artist = '';
      if (subtitle.includes('•')) {
        artist = subtitle.split('•')[0]?.trim() || '';
      } else if (subtitle && !isValidAlbumTitle(subtitle)) {
        artist = subtitle.trim();
      }
      
      const playlistUrl = `https://music.youtube.com/playlist?list=${browseId}`;
      
      albums.push({
        album: title,
        artist: artist,
        thumbnail: thumbnail,
        playlistUrl: playlistUrl,
        source: 'youtube-music',
      });
    }
  }
  
  // Continuar buscando recursivamente
  if (Array.isArray(obj)) {
    for (const item of obj) {
      findAlbumsRecursively(item, albums, maxResults, seenIds, depth + 1);
    }
  } else if (typeof obj === 'object') {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        findAlbumsRecursively(obj[key], albums, maxResults, seenIds, depth + 1);
      }
    }
  }
}

interface AlbumSearchResult {
  album: string;
  artist: string;
  thumbnail?: string;
  playlistUrl?: string;
  totalTracks?: number;
  source?: 'youtube-music' | 'youtube';
  tracks?: Array<{
    title: string;
    artist: string;
    videoId: string;
    url: string;
  }>;
}

async function searchAlbumsOnYouTubeMusic(query: string, maxResults: number = 10): Promise<AlbumSearchResult[]> {
  try {
    console.log(`🔍 [Album Search] Buscando álbuns para: "${query}"`);
    
    // Adicionar "album" à query se não estiver presente e não contiver termos relacionados
    const queryLower = query.toLowerCase();
    const hasAlbumTerm = queryLower.includes('album') || queryLower.includes('ep') || queryLower.includes('lp');
    const searchQuery = hasAlbumTerm ? query : `${query} album`;
    
    console.log(`🔍 [Album Search] Query final: "${searchQuery}"`);
    
    // Buscar no YouTube Music usando a API
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
        query: searchQuery,
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

    if (!response.ok) {
      console.warn(`⚠️ [Album Search] HTTP Error: ${response.status}`);
      return await searchAlbumsWithYtDlp(query, maxResults);
    }

    const data = await response.json();
    
    // Procurar por álbuns nos resultados
    const tabs = data.contents?.tabbedSearchResultsRenderer?.tabs || [];
    const albums: AlbumSearchResult[] = [];
    
    console.log(`📊 [Album Search] Encontradas ${tabs.length} tabs na resposta`);
    
    for (const tab of tabs) {
      const content = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      
      for (const section of content) {
        
        // Procurar por álbuns específicos (musicCarouselShelfRenderer)
        if (section.musicCarouselShelfRenderer?.contents) {
          console.log(`✅ [Album Search] Encontrado musicCarouselShelfRenderer com ${section.musicCarouselShelfRenderer.contents.length} itens`);
          for (const item of section.musicCarouselShelfRenderer.contents) {
            const albumItem = item.musicTwoRowItemRenderer;
            if (albumItem?.navigationEndpoint?.browseEndpoint?.browseId) {
              const albumId = albumItem.navigationEndpoint.browseEndpoint.browseId;
              
              // Tentar extrair título de múltiplas fontes
              let albumTitle: string | null = null;
              
              // 1. Tentar extrair de todos os runs do título (não apenas o primeiro)
              if (albumItem.title?.runs) {
                albumTitle = extractValidTitleFromRuns(albumItem.title.runs);
              }
              
              // 2. Se não encontrou, tentar usar título do browseEndpoint
              if (!albumTitle) {
                const browseTitle = albumItem.navigationEndpoint?.browseEndpoint?.title;
                if (browseTitle && isValidAlbumTitle(browseTitle)) {
                  albumTitle = browseTitle;
                }
              }
              
              // 3. Se ainda não encontrou, tentar usar o subtitle (pode conter o nome do álbum quando title tem estatísticas)
              if (!albumTitle && albumItem.subtitle?.runs) {
                // Verificar se algum run do subtitle parece ser um título válido
                const subtitleTitle = extractValidTitleFromRuns(albumItem.subtitle.runs);
                if (subtitleTitle) {
                  albumTitle = subtitleTitle;
                }
              }
              
              // 4. Se ainda não encontrou título válido, pular este item
              if (!albumTitle) {
                const firstTitleText = albumItem.title?.runs?.[0]?.text || 'sem título';
                console.warn(`⚠️ [Album Search] Título inválido ignorado (carousel): "${firstTitleText}"`);
                continue;
              }
              
              // Extrair subtitle completo para obter artista
              const albumSubtitle = albumItem.subtitle?.runs?.map((r: any) => r?.text || '').join(' ') || 
                                    albumItem.subtitle?.runs?.[0]?.text || '';
              
              console.log(`✅ [Album Search] Álbum encontrado: "${albumTitle}" por "${albumSubtitle}" (ID: ${albumId})`);
              
              // Extrair thumbnail de maior qualidade disponível
              let thumbnail: string | undefined;
              const thumbnailData = albumItem.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails;
              if (thumbnailData && thumbnailData.length > 0) {
                // Pegar a thumbnail de maior qualidade (última do array)
                thumbnail = thumbnailData[thumbnailData.length - 1].url;
              }
              
              // Extrair artista do subtitle (geralmente está no formato "Artista • Ano" ou similar)
              // Se o subtitle contém o título do álbum, tentar extrair o artista de outra forma
              let artist = '';
              if (albumSubtitle.includes('•')) {
                // Se tem separador, pegar a primeira parte antes do primeiro •
                artist = albumSubtitle.split('•')[0]?.trim() || '';
              } else if (albumSubtitle && !isValidAlbumTitle(albumSubtitle)) {
                // Se o subtitle não é um título válido, pode ser o artista
                artist = albumSubtitle.trim();
              }
              
              // Construir URL da playlist do álbum
              const playlistUrl = `https://music.youtube.com/playlist?list=${albumId}`;
              
              albums.push({
                album: albumTitle,
                artist: artist,
                thumbnail: thumbnail,
                playlistUrl: playlistUrl,
                source: 'youtube-music',
              });
              
              if (albums.length >= maxResults) break;
            }
          }
        }
        
        // Procurar por álbuns em outras estruturas possíveis
        // musicCardShelfRenderer - outra estrutura comum para álbuns
        if (section.musicCardShelfRenderer?.contents) {
          console.log(`✅ [Album Search] Encontrado musicCardShelfRenderer com ${section.musicCardShelfRenderer.contents.length} itens`);
          for (const item of section.musicCardShelfRenderer.contents) {
            const cardRenderer = item.musicCardShelfRenderer || item.musicTwoRowItemRenderer;
            if (cardRenderer?.navigationEndpoint?.browseEndpoint?.browseId) {
              const albumId = cardRenderer.navigationEndpoint.browseEndpoint.browseId;
              
              // Tentar extrair título de múltiplas fontes
              let albumTitle: string | null = null;
              
              // 1. Tentar extrair de todos os runs do título
              if (cardRenderer.title?.runs) {
                albumTitle = extractValidTitleFromRuns(cardRenderer.title.runs);
              } else if (cardRenderer.title?.text && isValidAlbumTitle(cardRenderer.title.text)) {
                albumTitle = cardRenderer.title.text;
              }
              
              // 2. Se não encontrou, tentar usar título do browseEndpoint
              if (!albumTitle) {
                const browseTitle = cardRenderer.navigationEndpoint?.browseEndpoint?.title;
                if (browseTitle && isValidAlbumTitle(browseTitle)) {
                  albumTitle = browseTitle;
                }
              }
              
              // 3. Se ainda não encontrou, tentar usar o subtitle
              if (!albumTitle && cardRenderer.subtitle?.runs) {
                const subtitleTitle = extractValidTitleFromRuns(cardRenderer.subtitle.runs);
                if (subtitleTitle) {
                  albumTitle = subtitleTitle;
                }
              }
              
              // 4. Se ainda não encontrou título válido, pular este item
              if (!albumTitle) {
                const firstTitleText = cardRenderer.title?.runs?.[0]?.text || cardRenderer.title?.text || 'sem título';
                console.warn(`⚠️ [Album Search] Título inválido ignorado (card): "${firstTitleText}"`);
                continue;
              }
              
              // Extrair subtitle completo
              const albumSubtitle = cardRenderer.subtitle?.runs?.map((r: any) => r?.text || '').join(' ') || 
                                    cardRenderer.subtitle?.runs?.[0]?.text || 
                                    cardRenderer.subtitle?.text || '';
              
              if ((albumId.startsWith('MPRE') || albumId.startsWith('OLAK5uy'))) {
                console.log(`✅ [Album Search] Álbum encontrado (card): "${albumTitle}" por "${albumSubtitle}" (ID: ${albumId})`);
                
                let thumbnail: string | undefined;
                const thumbnailData = cardRenderer.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
                                      cardRenderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
                if (thumbnailData && thumbnailData.length > 0) {
                  thumbnail = thumbnailData[thumbnailData.length - 1].url;
                }
                
                // Extrair artista do subtitle
                let artist = '';
                if (albumSubtitle.includes('•')) {
                  artist = albumSubtitle.split('•')[0]?.trim() || '';
                } else if (albumSubtitle && !isValidAlbumTitle(albumSubtitle)) {
                  artist = albumSubtitle.trim();
                }
                
                const playlistUrl = `https://music.youtube.com/playlist?list=${albumId}`;
                
                albums.push({
                  album: albumTitle,
                  artist: artist,
                  thumbnail: thumbnail,
                  playlistUrl: playlistUrl,
                  source: 'youtube-music',
                });
                
                if (albums.length >= maxResults) break;
              }
            }
          }
        }
        
        // Verificar também em musicResponsiveListItemRenderer diretamente (pode conter álbuns)
        if (section.musicShelfRenderer?.contents) {
          console.log(`✅ [Album Search] Encontrado musicShelfRenderer com ${section.musicShelfRenderer.contents.length} itens`);
          // Verificar se algum item é um álbum (tem browseEndpoint com ID de álbum)
          for (const track of section.musicShelfRenderer.contents) {
            const item = track.musicResponsiveListItemRenderer;
            if (!item) continue;
            
            // Verificar se tem navigationEndpoint que aponta para um álbum
            const browseEndpoint = item.navigationEndpoint?.browseEndpoint;
            if (browseEndpoint?.browseId && (browseEndpoint.browseId.startsWith('MPRE') || browseEndpoint.browseId.startsWith('OLAK5uy'))) {
              const albumId = browseEndpoint.browseId;
              
              // Tentar extrair título de múltiplas fontes
              let title = '';
              let subtitle = '';
              
              // 1. Tentar usar o título do navigationEndpoint se disponível
              if (browseEndpoint.title && isValidAlbumTitle(browseEndpoint.title)) {
                title = browseEndpoint.title;
              }
              
              // 2. Tentar extrair das flexColumns, verificando cada coluna e todos os runs
              if (!title && item.flexColumns) {
                for (const col of item.flexColumns) {
                  const colRuns = col?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
                  if (colRuns && Array.isArray(colRuns)) {
                    // Tentar extrair título válido de todos os runs desta coluna
                    const validTitle = extractValidTitleFromRuns(colRuns);
                    if (validTitle) {
                      if (!title) {
                        title = validTitle;
                      } else if (!subtitle) {
                        subtitle = validTitle;
                        break;
                      }
                    }
                  } else {
                    // Fallback: tentar simpleText se não tiver runs
                    const colText = col?.musicResponsiveListItemFlexColumnRenderer?.text?.simpleText || '';
                    if (colText && isValidAlbumTitle(colText)) {
                      if (!title) {
                        title = colText;
                      } else if (!subtitle) {
                        subtitle = colText;
                        break;
                      }
                    }
                  }
                }
              }
              
              // 3. Se ainda não encontrou título válido, tentar usar o primeiro texto disponível mas logar aviso
              if (!title && item.flexColumns?.[0]) {
                const firstColRuns = item.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
                if (firstColRuns && Array.isArray(firstColRuns)) {
                  const validTitle = extractValidTitleFromRuns(firstColRuns);
                  if (validTitle) {
                    title = validTitle;
                  } else {
                    const firstColText = firstColRuns[0]?.text || '';
                    console.warn(`⚠️ [Album Search] Título suspeito ignorado: "${firstColText}" (parece ser estatística)`);
                    // Tentar próxima coluna
                    if (item.flexColumns?.[1]) {
                      const secondColRuns = item.flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
                      if (secondColRuns && Array.isArray(secondColRuns)) {
                        const validTitle2 = extractValidTitleFromRuns(secondColRuns);
                        if (validTitle2) {
                          title = validTitle2;
                        }
                      }
                    }
                  }
                }
              }
              
              // Extrair subtitle se ainda não foi extraído
              if (!subtitle && item.flexColumns) {
                for (const col of item.flexColumns) {
                  const colRuns = col?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
                  if (colRuns && Array.isArray(colRuns)) {
                    // Pegar todos os textos da coluna
                    const colTexts = colRuns.map((r: any) => r?.text || '').join(' ').trim();
                    if (colTexts && colTexts !== title && !isValidAlbumTitle(colTexts)) {
                      // Se não é um título válido, provavelmente é o subtitle (artista/info)
                      subtitle = colTexts;
                      break;
                    }
                  }
                }
              }
              
              if (title && isValidAlbumTitle(title)) {
                console.log(`✅ [Album Search] Álbum encontrado (shelf): "${title}" por "${subtitle}" (ID: ${albumId})`);
                
                let thumbnail: string | undefined;
                const thumbnailData = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
                if (thumbnailData && thumbnailData.length > 0) {
                  thumbnail = thumbnailData[thumbnailData.length - 1].url;
                }
                
                const artist = subtitle.split('•')[0]?.trim() || '';
                const playlistUrl = `https://music.youtube.com/playlist?list=${albumId}`;
                
                albums.push({
                  album: title,
                  artist: artist,
                  thumbnail: thumbnail,
                  playlistUrl: playlistUrl,
                  source: 'youtube-music',
                });
                
                if (albums.length >= maxResults) break;
              }
            }
          }
        }
        
        // Procurar por músicas e tentar agrupar por álbum
        if (section.musicShelfRenderer?.contents) {
          const tracks = section.musicShelfRenderer.contents;
          const albumMap = new Map<string, AlbumSearchResult>();
          
          for (const track of tracks.slice(0, 30)) {
            const item = track.musicResponsiveListItemRenderer;
            if (!item) continue;
            
            // Verificar primeiro se é um álbum direto (não uma música)
            const browseEndpoint = item.navigationEndpoint?.browseEndpoint;
            if (browseEndpoint?.browseId && (browseEndpoint.browseId.startsWith('MPRE') || browseEndpoint.browseId.startsWith('OLAK5uy'))) {
              // Já foi processado acima, pular
              continue;
            }
            
            const videoId = item.playlistItemData?.videoId;
            const title = item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
            const artist = item.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
            
            // Tentar extrair nome do álbum dos metadados adicionais
            const albumInfo = item.flexColumns?.[2]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
            
            if (!videoId || !title) continue;
            
            // Tentar extrair thumbnail de múltiplas formas
            let thumbnail: string | undefined;
            const thumbnailData = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
            if (thumbnailData && thumbnailData.length > 0) {
              // Pegar a thumbnail de maior qualidade disponível
              thumbnail = thumbnailData[thumbnailData.length - 1].url;
            } else if (videoId) {
              // Fallback: usar padrão do YouTube
              thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
            }
            
            // Tentar extrair nome do álbum do título ou usar a query como base
            // Normalizar título para tentar encontrar álbum
            const normalizedTitle = title
              .replace(/\s*\(.*?\)/g, '')
              .replace(/\s*\[.*?\]/g, '')
              .replace(/[-–—]/g, ' ')
              .replace(/\b(remix|edit|mix|extended|vip|dub|version|remastered)\b/gi, '')
              .trim();
            
            // Usar informação de álbum dos metadados se disponível, senão usar título normalizado ou query
            const albumName = albumInfo || normalizedTitle || query;
            const albumKey = `${albumName}::${artist || ''}`;
            
            if (!albumMap.has(albumKey)) {
              albumMap.set(albumKey, {
                album: albumName,
                artist: artist || '',
                thumbnail: thumbnail,
                tracks: [],
                source: 'youtube-music',
              });
            }
            
            const album = albumMap.get(albumKey)!;
            // Se o álbum não tem thumbnail mas esta faixa tem, usar ela
            if (!album.thumbnail && thumbnail) {
              album.thumbnail = thumbnail;
            }
            
            if (album.tracks) {
              album.tracks.push({
                title: title,
                artist: artist || '',
                videoId: videoId,
                url: `https://www.youtube.com/watch?v=${videoId}`,
              });
            }
          }
          
          // Converter map para array e adicionar aos resultados
          for (const album of albumMap.values()) {
            if (album.tracks && album.tracks.length >= 2) {
              album.totalTracks = album.tracks.length;
              albums.push(album);
              if (albums.length >= maxResults) break;
            }
          }
        }
        
        if (albums.length >= maxResults) break;
      }
      if (albums.length >= maxResults) break;
    }
    
    // Se não encontrou álbuns nas estruturas principais, tentar busca recursiva
    if (albums.length === 0) {
      console.log(`🔄 [Album Search] Nenhum álbum encontrado nas estruturas principais, tentando busca recursiva...`);
      const seenIds = new Set<string>();
      findAlbumsRecursively(data, albums, maxResults, seenIds);
      console.log(`📊 [Album Search] Busca recursiva encontrou ${albums.length} álbuns`);
      
      // Se ainda não encontrou, tentar buscar sem o filtro de álbum
      if (albums.length === 0) {
        console.log(`🔄 [Album Search] Tentando busca sem filtro de álbum...`);
        try {
          const fallbackResponse = await fetch(`https://music.youtube.com/youtubei/v1/search?key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX94`, {
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
              query: searchQuery,
              // Sem o parâmetro de filtro de álbum
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
          
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            const seenIdsFallback = new Set<string>();
            findAlbumsRecursively(fallbackData, albums, maxResults, seenIdsFallback);
            console.log(`📊 [Album Search] Busca sem filtro encontrou ${albums.length} álbuns`);
          }
        } catch (err) {
          console.error('❌ [Album Search] Erro na busca sem filtro:', err);
        }
      }
    }
    
    // Se encontrou álbuns, tentar buscar playlistUrl e melhorar thumbnails
    // E buscar TODAS as faixas se houver playlistUrl
    if (albums.length > 0) {
      const hasValidCookies = await hasValidCookiesFile();
      const cookiesFlag = hasValidCookies ? '--cookies "cookies.txt" ' : '';
      
      for (const album of albums.slice(0, 10)) { // Aumentar limite para garantir que buscamos mais álbuns
        // Se já tem playlistUrl, SEMPRE buscar TODAS as faixas da playlist (substituir qualquer lista parcial)
        if (album.playlistUrl) {
          try {
            console.log(`🔄 [Album Search] Buscando TODAS as faixas da playlist: ${album.playlistUrl} (atualmente tem ${album.tracks?.length || 0} faixas)`);
            const playlistTracks = await fetchAllPlaylistTracks(album.playlistUrl, cookiesFlag);
            if (playlistTracks.length > 0) {
              console.log(`✅ [Album Search] Encontradas ${playlistTracks.length} faixas na playlist (substituindo ${album.tracks?.length || 0} faixas anteriores)`);
              // SEMPRE substituir as tracks parciais pelas completas da playlist
              album.tracks = playlistTracks;
              album.totalTracks = playlistTracks.length;
            } else {
              console.warn(`⚠️ [Album Search] Nenhuma faixa encontrada na playlist ${album.playlistUrl}, mantendo ${album.tracks?.length || 0} faixas existentes`);
            }
          } catch (err) {
            console.error(`❌ [Album Search] Erro ao buscar faixas da playlist:`, err);
            // Se falhou, manter as faixas que já tinha (se houver)
            if (!album.tracks || album.tracks.length === 0) {
              console.warn(`⚠️ [Album Search] Álbum ${album.album} não tem faixas após erro na busca`);
            }
          }
        } else if (album.tracks && album.tracks.length > 0) {
          // Se não tem playlistUrl, tentar encontrar usando a primeira faixa
          try {
            const firstTrack = album.tracks[0];
            const { stdout } = await execAsync(
              `yt-dlp --dump-json ${cookiesFlag}"${firstTrack.url}"`,
              { maxBuffer: 1024 * 1024 * 10, timeout: 8000 }
            ).catch(() => ({ stdout: '' }));
            
            if (stdout) {
              try {
                const videoInfo = JSON.parse(stdout);
                
                // Buscar playlistUrl
                const webpageUrl = videoInfo.webpage_url || videoInfo.url || firstTrack.url;
                const playlistMatch = webpageUrl.match(/[?&]list=([^&]+)/);
                if (playlistMatch && playlistMatch[1].startsWith('OLAK5uy')) {
                  album.playlistUrl = `https://music.youtube.com/playlist?list=${playlistMatch[1]}`;
                  // Agora buscar todas as faixas da playlist encontrada
                  console.log(`🔄 [Album Search] Playlist encontrada, buscando todas as faixas: ${album.playlistUrl}`);
                  const playlistTracks = await fetchAllPlaylistTracks(album.playlistUrl, cookiesFlag);
                  if (playlistTracks.length > 0) {
                    console.log(`✅ [Album Search] Encontradas ${playlistTracks.length} faixas na playlist`);
                    album.tracks = playlistTracks;
                    album.totalTracks = playlistTracks.length;
                  }
                } else if (videoInfo.album_id && videoInfo.album_id.startsWith('OLAK5uy')) {
                  album.playlistUrl = `https://music.youtube.com/playlist?list=${videoInfo.album_id}`;
                  // Buscar todas as faixas
                  console.log(`🔄 [Album Search] Playlist encontrada via album_id, buscando todas as faixas: ${album.playlistUrl}`);
                  const playlistTracks = await fetchAllPlaylistTracks(album.playlistUrl, cookiesFlag);
                  if (playlistTracks.length > 0) {
                    console.log(`✅ [Album Search] Encontradas ${playlistTracks.length} faixas na playlist`);
                    album.tracks = playlistTracks;
                    album.totalTracks = playlistTracks.length;
                  }
                }
                
                // Melhorar thumbnail se não tiver ou se a atual for inválida
                if (!album.thumbnail || !album.thumbnail.includes('i.ytimg.com')) {
                  if (videoInfo.thumbnail) {
                    album.thumbnail = videoInfo.thumbnail;
                  } else if (videoInfo.thumbnails && videoInfo.thumbnails.length > 0) {
                    // Pegar a thumbnail de maior qualidade
                    album.thumbnail = videoInfo.thumbnails[videoInfo.thumbnails.length - 1].url;
                  } else if (firstTrack.videoId) {
                    // Fallback: usar padrão do YouTube
                    album.thumbnail = `https://img.youtube.com/vi/${firstTrack.videoId}/maxresdefault.jpg`;
                  }
                }
              } catch (err) {
                // Ignorar erro de parse
              }
            }
          } catch (err) {
            // Continuar para o próximo álbum
          }
        }
      }
    }
    
    console.log(`✅ [Album Search] Encontrados ${albums.length} álbuns`);
    return albums.slice(0, maxResults);
    
  } catch (error) {
    console.error('❌ [Album Search] Erro:', error);
    return await searchAlbumsWithYtDlp(query, maxResults);
  }
}

async function searchAlbumsWithYtDlp(query: string, maxResults: number): Promise<AlbumSearchResult[]> {
  try {
    console.log(`🔄 [Album Search] Usando fallback yt-dlp para: "${query}"`);
    
    const searchQuery = query.toLowerCase().includes('album') ? query : `${query} album`;
    const hasValidCookies = await hasValidCookiesFile();
    const cookiesFlag = hasValidCookies ? '--cookies "cookies.txt" ' : '';
    
    // Buscar músicas relacionadas
    const { stdout } = await execAsync(
      `yt-dlp --dump-json --default-search "ytsearch${maxResults * 3}:${searchQuery}" ${cookiesFlag}`,
      { maxBuffer: 1024 * 1024 * 20, timeout: 15000 }
    ).catch(() => ({ stdout: '' }));
    
    if (!stdout) return [];
    
    const lines = stdout.trim().split('\n').filter(line => line.trim());
    const albumMap = new Map<string, AlbumSearchResult>();
    
    for (const line of lines) {
      try {
        const videoInfo = JSON.parse(line);
        const videoId = videoInfo.id;
        const title = videoInfo.title || '';
        const artist = videoInfo.artist || videoInfo.uploader || '';
        const album = videoInfo.album || '';
        
        if (!videoId || !title) continue;
        
        // Normalizar título
        const normalizedTitle = title
          .replace(/\s*\(.*?\)/g, '')
          .replace(/\s*\[.*?\]/g, '')
          .replace(/[-–—]/g, ' ')
          .replace(/\b(remix|edit|mix|extended|vip|dub|version|remastered)\b/gi, '')
          .trim();
        
        // Usar álbum dos metadados ou criar um baseado na query
        const albumName = album || normalizedTitle || query;
        const albumKey = `${albumName}::${artist}`;
        
        // Extrair thumbnail de forma robusta
        let thumbnail: string | undefined;
        if (videoInfo.thumbnail) {
          thumbnail = videoInfo.thumbnail;
        } else if (videoInfo.thumbnails && videoInfo.thumbnails.length > 0) {
          // Pegar a thumbnail de maior qualidade
          thumbnail = videoInfo.thumbnails[videoInfo.thumbnails.length - 1].url;
        } else if (videoId) {
          // Fallback: usar padrão do YouTube
          thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        }
        
        if (!albumMap.has(albumKey)) {
          albumMap.set(albumKey, {
            album: albumName,
            artist: artist,
            thumbnail: thumbnail,
            tracks: [],
            source: 'youtube',
          });
        }
        
        const albumData = albumMap.get(albumKey)!;
        // Se o álbum não tem thumbnail mas esta faixa tem, usar ela
        if (!albumData.thumbnail && thumbnail) {
          albumData.thumbnail = thumbnail;
        }
        
        if (albumData.tracks) {
          albumData.tracks.push({
            title: title,
            artist: artist,
            videoId: videoId,
            url: videoInfo.webpage_url || `https://www.youtube.com/watch?v=${videoId}`,
          });
          
          // Tentar extrair playlistUrl
          if (!albumData.playlistUrl) {
            const webpageUrl = videoInfo.webpage_url || videoInfo.url || '';
            const playlistMatch = webpageUrl.match(/[?&]list=([^&]+)/);
            if (playlistMatch && playlistMatch[1].startsWith('OLAK5uy')) {
              albumData.playlistUrl = `https://music.youtube.com/playlist?list=${playlistMatch[1]}`;
            } else if (videoInfo.album_id && videoInfo.album_id.startsWith('OLAK5uy')) {
              albumData.playlistUrl = `https://music.youtube.com/playlist?list=${videoInfo.album_id}`;
            }
          }
        }
      } catch (err) {
        // Continuar
      }
    }
    
    // Converter para array e filtrar álbuns com pelo menos 2 faixas
    const albums: AlbumSearchResult[] = [];
    for (const album of albumMap.values()) {
      if (album.tracks && album.tracks.length >= 2) {
        album.totalTracks = album.tracks.length;
        albums.push(album);
      }
    }
    
    console.log(`✅ [Album Search] yt-dlp retornou ${albums.length} álbuns`);
    return albums.slice(0, maxResults);
    
  } catch (error) {
    console.error('❌ [Album Search] Erro no fallback yt-dlp:', error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, maxResults = 10 } = body;
    
    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }
    
    console.log(`🔍 [Album Search API] Buscando álbuns para: "${query}"`);
    
    const albums = await searchAlbumsOnYouTubeMusic(query, maxResults);
    
    return NextResponse.json({
      success: true,
      query,
      results: albums,
      totalResults: albums.length
    });
    
  } catch (error) {
    console.error('❌ [Album Search API] Erro:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const maxResults = parseInt(searchParams.get('maxResults') || '10');
  const playlistId = searchParams.get('playlistId');
  
  // Se tem playlistId, buscar TODAS as faixas dessa playlist
  if (playlistId) {
    try {
      console.log(`🔍 [Album Search API GET] Buscando TODAS as faixas da playlist: ${playlistId}`);
      const hasValidCookies = await hasValidCookiesFile();
      const cookiesFlag = hasValidCookies ? '--cookies "cookies.txt" ' : '';
      const playlistUrl = `https://music.youtube.com/playlist?list=${playlistId}`;
      
      const tracks = await fetchAllPlaylistTracks(playlistUrl, cookiesFlag);
      
      console.log(`✅ [Album Search API GET] Retornando ${tracks.length} faixas da playlist ${playlistId}`);
      
      return NextResponse.json({
        success: true,
        tracks: tracks,
        totalTracks: tracks.length
      });
    } catch (error) {
      console.error('❌ [Album Search API] Erro ao buscar faixas da playlist:', error);
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch playlist tracks'
      }, { status: 500 });
    }
  }
  
  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
  }
  
  const postRequest = new NextRequest(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, maxResults })
  });
  
  return POST(postRequest);
}
