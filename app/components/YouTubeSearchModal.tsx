"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useDownload } from '../contexts/DownloadContext';
import { useSettings } from '../hooks/useSettings';
import BaseModal from './BaseModal';
import { safeSetItem, safeGetItem, safeRemoveItem } from '../utils/localStorage';

interface YouTubeSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeColors?: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    background: string;
    border: string;
  };
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

export default function YouTubeSearchModal({ isOpen, onClose, themeColors }: YouTubeSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [albumResults, setAlbumResults] = useState<AlbumSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedAlbum, setExpandedAlbum] = useState<string | null>(null);
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set());
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { addToQueue, addToast } = useDownload();
  const { settings } = useSettings();

  // Cores padrão caso não sejam fornecidas
  const defaultColors = {
    primary: 'rgb(16, 185, 129)',
    primaryLight: 'rgba(16, 185, 129, 0.9)',
    primaryDark: 'rgba(16, 185, 129, 0.7)',
    background: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)'
  };
  
  // Usar cores padrão se cores dinâmicas estiverem desabilitadas
  const colors = (settings.disableDynamicColors || !themeColors) ? defaultColors : themeColors;

  // Extrair videoId da URL do YouTube
  const extractVideoId = (url: string): string | null => {
    // Se já tiver videoId no resultado, usar ele
    if (url.includes('watch?v=')) {
      const match = url.match(/[?&]v=([^&\n?#]+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  };

  // Gerar link do YouTube Music para copiar rapidamente
  const buildMusicUrl = (videoId: string | null, fallback: string) => {
    return videoId ? `https://music.youtube.com/watch?v=${videoId}` : fallback;
  };

  // Copiar link do álbum para a área de transferência
  const handleCopyLink = async (album: AlbumSearchResult) => {
    const targetUrl = album.playlistUrl || `https://music.youtube.com/search?q=${encodeURIComponent(`${album.artist} ${album.album}`)}`;

    try {
      await navigator.clipboard.writeText(targetUrl);
      addToast({ title: '🔗 Link do álbum copiado!' });
    } catch (error) {
      // Fallback simples caso o clipboard API falhe
      const textarea = document.createElement('textarea');
      textarea.value = targetUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      addToast({ title: '🔗 Link do álbum copiado!' });
    }
  };

  // Buscar álbuns no YouTube Music
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setAlbumResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setExpandedAlbum(null);

    try {
      const response = await fetch('/api/search-albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          maxResults: 10
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json().catch((parseError) => {
        console.error('Erro ao fazer parse da resposta da busca:', parseError);
        throw new Error('Resposta inválida do servidor');
      });
      
      console.log('📊 [YouTubeSearchModal] Resposta da API de álbuns:', {
        success: data.success,
        totalResults: data.totalResults,
        resultsLength: data.results?.length,
        query: data.query
      });
      
      if (data.success && data.results) {
        setAlbumResults(data.results);
        
        if (data.results.length === 0) {
          setError('Nenhum álbum encontrado. Tente uma busca diferente.');
        } else {
          setError(null);
        }
      } else {
        const errorMsg = data.error || 'Erro ao buscar álbuns';
        console.error('❌ [YouTubeSearchModal] Erro na resposta:', errorMsg);
        throw new Error(errorMsg);
      }
    } catch (err: any) {
      console.error('❌ [YouTubeSearchModal] Erro na busca:', err);
      const errorMessage = err.message || 'Erro ao buscar álbuns. Verifique sua conexão e tente novamente.';
      setError(errorMessage);
      setAlbumResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce na busca
  useEffect(() => {
    // Limpar timeout anterior
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Se não tem texto, limpar resultados imediatamente
    if (!searchQuery.trim()) {
      setAlbumResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    // Mostrar loading após um pequeno delay para evitar flicker em digitação rápida
    const loadingTimeout = setTimeout(() => {
      if (searchQuery.trim()) {
        setLoading(true);
      }
    }, 300);

    // Executar busca após debounce
    searchTimeoutRef.current = setTimeout(() => {
      clearTimeout(loadingTimeout);
      handleSearch(searchQuery);
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      clearTimeout(loadingTimeout);
    };
  }, [searchQuery, handleSearch]);

  // Salvar pesquisa no localStorage quando mudar
  useEffect(() => {
    if (searchQuery.trim() || albumResults.length > 0) {
      const limitedResults = albumResults.slice(0, 20);
      
      safeSetItem('youtube-search-modal-data', {
        searchQuery,
        albumResults: limitedResults
      }, {
        maxSize: 1 * 1024 * 1024,
        onError: (err) => {
          console.warn('⚠️ Erro ao salvar dados do modal de busca:', err.message);
        }
      });
    }
  }, [searchQuery, albumResults]);

  // Carregar pesquisa salva quando o modal abrir
  useEffect(() => {
    if (isOpen) {
      const data = safeGetItem<{ searchQuery?: string; albumResults?: any[] }>('youtube-search-modal-data');
      if (data) {
        if (data.searchQuery) {
          setSearchQuery(data.searchQuery || '');
        }
        if (data.albumResults && data.albumResults.length > 0) {
          setAlbumResults(data.albumResults || []);
        }
      }
    }
  }, [isOpen]);

  // Limpar ao fechar o modal (mas manter dados salvos)
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setExpandedAlbum(null);
      setFailedThumbnails(new Set());
    }
  }, [isOpen]);

  // Limpar pesquisa salva
  const handleClearSaved = () => {
    safeRemoveItem('youtube-search-modal-data');
    setSearchQuery('');
    setAlbumResults([]);
    setError(null);
    setExpandedAlbum(null);
    addToast({ title: '🗑️ Pesquisa limpa' });
  };

  // Abrir pesquisa no YouTube Music
  const handleOpenInYouTubeMusic = () => {
    if (!searchQuery.trim()) {
      return;
    }
    const searchUrl = `https://music.youtube.com/search?q=${encodeURIComponent(searchQuery.trim())}`;
    window.open(searchUrl, '_blank', 'noopener,noreferrer');
  };


  // Extrair ID da playlist da URL
  const extractPlaylistId = (playlistUrl: string): string | null => {
    const match = playlistUrl.match(/[?&]list=([^&]+)/);
    return match ? match[1] : null;
  };

  // Buscar todas as faixas do álbum se tiver playlistUrl
  const fetchAllAlbumTracks = async (album: AlbumSearchResult): Promise<AlbumSearchResult> => {
    // Se já tem tracks e não tem playlistUrl, retornar como está
    if (album.tracks && album.tracks.length > 0 && !album.playlistUrl) {
      return album;
    }
    
    // Se tem playlistUrl, SEMPRE buscar TODAS as faixas (substituir qualquer lista parcial)
    if (album.playlistUrl) {
      try {
        const playlistId = extractPlaylistId(album.playlistUrl);
        if (!playlistId) {
          console.warn(`⚠️ [YouTubeSearchModal] Não foi possível extrair ID da playlist: ${album.playlistUrl}`);
          return album;
        }
        
        console.log(`🔄 [YouTubeSearchModal] Buscando todas as faixas da playlist: ${playlistId}`);
        
        // Usar o endpoint GET com playlistId para buscar TODAS as faixas
        const response = await fetch(`/api/search-albums?playlistId=${encodeURIComponent(playlistId)}`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.tracks && data.tracks.length > 0) {
            console.log(`✅ [YouTubeSearchModal] Encontradas ${data.tracks.length} faixas completas (substituindo ${album.tracks?.length || 0} faixas parciais)`);
            // SEMPRE substituir as tracks parciais pelas completas da playlist
            return {
              ...album,
              tracks: data.tracks,
              totalTracks: data.tracks.length,
            };
          } else {
            console.warn(`⚠️ [YouTubeSearchModal] Nenhuma faixa retornada da API para playlist ${playlistId}`);
          }
        } else {
          console.warn(`⚠️ [YouTubeSearchModal] Erro na resposta da API: ${response.status}`);
        }
        
        // Fallback: usar playlist-info endpoint
        const playlistInfoResponse = await fetch(`/api/playlist-info?id=${encodeURIComponent(playlistId)}`);
        if (playlistInfoResponse.ok) {
          const playlistData = await playlistInfoResponse.json();
          if (playlistData.videos && playlistData.videos.length > 0) {
            // Buscar informações completas de cada vídeo para obter URL e ID
            const tracksWithDetails = await Promise.all(
              playlistData.videos.slice(0, 100).map(async (video: any, index: number) => {
                // Tentar obter ID do vídeo da playlist original se disponível
                // Por enquanto, vamos usar um método alternativo
                return {
                  title: video.title || '',
                  artist: album.artist || '',
                  videoId: '', // Será preenchido depois se necessário
                  url: '', // Será preenchido depois se necessário
                };
              })
            );
            
            // Se temos tracks originais, tentar mapear
            if (album.tracks && album.tracks.length > 0) {
              // Usar as tracks originais e adicionar as novas encontradas
              const existingTitles = new Set(album.tracks.map(t => t.title.toLowerCase()));
              const newTracks = playlistData.videos
                .filter((v: any) => !existingTitles.has(v.title?.toLowerCase()))
                .map((v: any) => ({
                  title: v.title || '',
                  artist: album.artist || '',
                  videoId: '',
                  url: '',
                }));
              
              return {
                ...album,
                tracks: [...album.tracks, ...newTracks],
                totalTracks: (album.tracks.length + newTracks.length),
              };
            }
          }
        }
      } catch (err) {
        console.error('❌ [YouTubeSearchModal] Erro ao buscar faixas:', err);
      }
    }
    
    return album;
  };

  // Baixar álbum completo
  const handleDownloadAlbum = async (album: AlbumSearchResult) => {
    // Buscar todas as faixas antes de baixar
    const albumWithAllTracks = await fetchAllAlbumTracks(album);
    
    if (!albumWithAllTracks.tracks || albumWithAllTracks.tracks.length === 0) {
      addToast({ title: '❌ Álbum sem faixas disponíveis' });
      return;
    }
    
    try {
      const totalTracks = albumWithAllTracks.tracks.length;
      addToast({ title: `📥 Encontradas ${totalTracks} faixa${totalTracks !== 1 ? 's' : ''} do álbum "${albumWithAllTracks.album}". Adicionando à fila...` });
      
      let addedCount = 0;
      for (const track of albumWithAllTracks.tracks) {
        addToQueue({
          url: track.url,
          title: track.title,
          format: 'flac',
          enrichWithBeatport: true,
          showBeatportPage: false,
          isPlaylist: false,
          albumName: albumWithAllTracks.album,
          albumArtist: albumWithAllTracks.artist,
          status: 'pending' as const,
          steps: []
        });
        addedCount++;
        
        // Atualizar toast a cada 5 faixas adicionadas
        if (addedCount % 5 === 0 || addedCount === totalTracks) {
          addToast({ 
            title: `📥 Adicionando faixas do álbum "${albumWithAllTracks.album}"... (${addedCount}/${totalTracks})` 
          });
        }
      }
      
      addToast({ 
        title: `✅ ${addedCount} faixa${addedCount !== 1 ? 's' : ''} do álbum "${albumWithAllTracks.album}" adicionada${addedCount !== 1 ? 's' : ''} à fila` 
      });
    } catch (err: any) {
      console.error('❌ [YouTubeSearchModal] Erro ao baixar álbum:', err);
      addToast({ 
        title: `❌ Erro ao baixar álbum: ${err.message || 'Erro desconhecido'}` 
      });
    }
  };

  // Toggle de expansão do álbum
  const toggleExpandAlbum = async (albumKey: string, album: AlbumSearchResult) => {
    if (expandedAlbum === albumKey) {
      // Fechar
      setExpandedAlbum(null);
    } else {
      // Abrir - SEMPRE buscar todas as faixas se tiver playlistUrl
      setExpandedAlbum(albumKey);
      
      // Se tem playlistUrl, SEMPRE buscar TODAS as faixas (mesmo que já tenha algumas)
      if (album.playlistUrl) {
        try {
          console.log(`🔄 [YouTubeSearchModal] Buscando todas as faixas ao expandir (atualmente tem ${album.tracks?.length || 0})`);
          const albumWithAllTracks = await fetchAllAlbumTracks(album);
          // Atualizar o álbum na lista de resultados
          setAlbumResults(prev => prev.map(a => 
            a.album === album.album && a.artist === album.artist 
              ? albumWithAllTracks 
              : a
          ));
        } catch (err) {
          console.error('❌ [YouTubeSearchModal] Erro ao buscar faixas:', err);
        }
      }
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Buscar Álbuns no YouTube Music"
      maxWidth="max-w-6xl"
      themeColors={colors}
    >
      <div className="space-y-6 sm:space-y-5">
        {/* Campo de busca */}
        <div className="space-y-3 sm:space-y-2">
          <div
            className="rounded-2xl border bg-gradient-to-r from-zinc-900/70 via-zinc-900/60 to-zinc-900/40 backdrop-blur-xl shadow-lg transition-all duration-200 hover:border-white/10"
            style={{ borderColor: colors.border }}
          >
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Digite o nome do álbum ou artista..."
                disabled={loading}
                className={`w-full px-5 py-4 pl-12 pr-28 rounded-2xl text-white placeholder-zinc-400 focus:outline-none transition-all duration-200 sm:px-4 sm:py-3 sm:pl-10 sm:text-sm bg-transparent ${
                  loading ? 'opacity-70 cursor-wait' : ''
                }`}
              />
              <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 flex items-center">
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                )}
              </div>
              {!!searchQuery && !loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button
                    onClick={handleOpenInYouTubeMusic}
                    className="h-9 px-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300 hover:text-red-200 hover:bg-red-500/30 transition text-xs font-semibold flex items-center gap-1.5"
                    title="Abrir pesquisa no YouTube Music"
                    type="button"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10 6v2H5v11h11v-5h2v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6zm11-3v8h-2V6.413l-7.793 7.794-1.414-1.414L17.585 5H13V3h8z"/>
                    </svg>
                    Abrir no YouTube Music
                  </button>
                  <button
                    onClick={handleClearSaved}
                    className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-white/80 hover:text-white hover:bg-white/10 transition text-xs font-semibold"
                    title="Limpar pesquisa"
                    type="button"
                  >
                    Limpar
                  </button>
                </div>
              )}
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <span className="text-xs text-zinc-400 font-medium">Buscando...</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-4 pb-3 pt-2 text-xs text-zinc-400 sm:text-[11px]">
              <div className="flex items-center gap-2">
                <span className={`flex h-2 w-2 rounded-full transition-all ${loading ? 'animate-pulse' : ''}`} style={{ backgroundColor: colors.primary }} />
                <span>{loading ? 'Buscando álbuns...' : 'Busca focada em álbuns'}</span>
              </div>
              {!loading && albumResults.length > 0 && (
                <span className="text-white/80 font-medium">
                  {albumResults.length} álbum{albumResults.length !== 1 ? 's' : ''} encontrado{albumResults.length !== 1 ? 's' : ''}
                </span>
              )}
              {loading && searchQuery.trim() && (
                <span className="text-white/60 font-medium animate-pulse">
                  Aguarde...
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/20 border border-red-500/50 backdrop-blur-sm">
              <p className="text-sm text-red-300 sm:text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </p>
            </div>
          )}
        </div>

        {/* Estado de loading */}
        {loading && searchQuery.trim() && albumResults.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-white/5 bg-white/5">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4" />
            <p className="text-base text-zinc-300 mb-1">Buscando álbuns...</p>
            <p className="text-sm text-zinc-400">Isso pode levar alguns segundos</p>
          </div>
        )}

        {/* Resultados da busca */}
        {!loading && albumResults.length > 0 && (
          <div className="space-y-4 sm:space-y-3 animate-in fade-in duration-300">
            <div className="space-y-4 max-h-[600px] overflow-y-auto custom-scroll pr-2">
              {albumResults.map((album, index) => {
                const albumKey = `${album.album}::${album.artist}::${index}`;
                const isExpanded = expandedAlbum === albumKey;
                const hasPlaylistUrl = !!album.playlistUrl;
                const trackCount = album.totalTracks || album.tracks?.length || 0;

                return (
                  <div
                    key={albumKey}
                    className="relative rounded-2xl border overflow-hidden backdrop-blur-xl transition-all duration-200 hover:-translate-y-[1px] shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
                    style={{
                      background: `linear-gradient(135deg, ${colors.background}55 0%, ${colors.background}88 100%)`,
                      borderColor: hasPlaylistUrl ? colors.border : 'rgba(82, 82, 91, 0.35)',
                      boxShadow: hasPlaylistUrl
                        ? `0 12px 40px ${colors.primary}25, inset 0 0 0 1px ${colors.border}`
                        : '0 12px 40px rgba(0,0,0,0.35)'
                    }}
                  >
                    <div className="p-5 md:p-4 sm:p-3">
                      <div className="flex items-start gap-5 md:gap-4 sm:gap-3">
                        {/* Thumbnail do álbum */}
                        <div className="relative flex-shrink-0">
                          {album.thumbnail && !failedThumbnails.has(albumKey) ? (
                            <div className="relative w-[140px] h-[140px] md:w-28 md:h-28 sm:w-24 sm:h-24 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg bg-zinc-800">
                              <Image
                                src={album.thumbnail}
                                alt={album.album}
                                width={140}
                                height={140}
                                className="rounded-xl object-cover w-full h-full"
                                onError={() => {
                                  // Marcar esta thumbnail como falha
                                  setFailedThumbnails(prev => new Set(prev).add(albumKey));
                                }}
                                unoptimized
                              />
                            </div>
                          ) : (
                            <div className="w-[140px] h-[140px] md:w-28 md:h-28 sm:w-24 sm:h-24 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center border-2 border-white/20 shadow-lg">
                              <svg className="w-10 h-10 md:w-8 md:h-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                              </svg>
                            </div>
                          )}
                          {hasPlaylistUrl && (
                            <span className="absolute top-2 right-2 text-[10px] px-2 py-1 rounded-full bg-emerald-500/90 text-black font-semibold shadow-lg border border-emerald-400/50">
                              ✓ Link
                            </span>
                          )}
                        </div>

                        {/* Informações do álbum */}
                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="flex flex-col gap-2">
                            <div>
                              <h3 className="font-bold text-white text-xl md:text-lg sm:text-base mb-1 line-clamp-2">
                                {album.album}
                              </h3>
                              <p className="text-zinc-300 text-base md:text-sm sm:text-xs mb-2">
                                {album.artist || 'Artista desconhecido'}
                              </p>
                              {trackCount > 0 && (
                                <div className="inline-flex items-center gap-2 text-xs mb-2 flex-wrap">
                                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 font-medium text-emerald-300">
                                    {trackCount} faixa{trackCount !== 1 ? 's' : ''}
                                  </span>
                                  <span className={`px-2.5 py-1 rounded-full font-medium border ${
                                    (album.source || 'youtube-music') === 'youtube-music'
                                      ? 'bg-red-500/15 border-red-500/30 text-red-300'
                                      : 'bg-orange-500/15 border-orange-500/30 text-orange-300'
                                  }`}>
                                    {(album.source || 'youtube-music') === 'youtube-music' ? '🎵 YouTube Music' : '▶️ YouTube'}
                                  </span>
                                  {hasPlaylistUrl && (
                                    <span className="px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 font-medium text-blue-300">
                                      Link disponível
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Botões de ação */}
                            <div className="flex flex-wrap gap-2 mt-3">
                              {hasPlaylistUrl && (
                                <button
                                  onClick={() => handleCopyLink(album)}
                                  className="h-10 px-4 rounded-lg text-xs font-semibold border border-blue-500/50 bg-blue-600/90 text-white hover:bg-blue-600 hover:-translate-y-[1px] transition-all flex items-center gap-2 shadow-lg"
                                  title="Copiar link do álbum para YouTube Music"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                  Copiar Link do Álbum
                                </button>
                              )}
                              {album.tracks && album.tracks.length > 0 && (
                                <>
                                  <button
                                    onClick={() => handleDownloadAlbum(album)}
                                    className="h-10 px-4 rounded-lg text-xs font-semibold border border-emerald-500/50 bg-emerald-500 text-black hover:bg-emerald-400 hover:-translate-y-[1px] transition-all flex items-center gap-2 shadow-lg font-bold"
                                    title={`Baixar todas as ${trackCount} faixas do álbum`}
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Baixar Álbum ({trackCount})
                                  </button>
                                  <button
                                    onClick={() => toggleExpandAlbum(albumKey, album)}
                                    className="h-10 px-4 rounded-lg text-xs font-semibold border border-white/20 bg-white/5 text-white/90 hover:bg-white/10 hover:-translate-y-[1px] transition-all flex items-center gap-2"
                                  >
                                    <svg 
                                      className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                                      fill="none" 
                                      stroke="currentColor" 
                                      viewBox="0 0 24 24"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                    {isExpanded ? 'Ocultar' : 'Ver'} Faixas
                                  </button>
                                </>
                              )}
                            </div>

                            {/* Lista de faixas (expandida) */}
                            {isExpanded && album.tracks && album.tracks.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-white/10">
                                <h4 className="text-sm font-semibold text-white/90 mb-3">Faixas do álbum:</h4>
                                <div className="space-y-2 max-h-64 overflow-y-auto custom-scroll pr-2">
                                  {album.tracks.map((track, trackIndex) => (
                                    <div
                                      key={trackIndex}
                                      className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                                    >
                                      <span className="text-xs text-zinc-400 font-mono w-6">{trackIndex + 1}</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white truncate">{track.title}</p>
                                        {track.artist && (
                                          <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mensagem quando não há resultados */}
        {!loading && searchQuery.trim() && albumResults.length === 0 && !error && (
          <div className="text-center py-12 rounded-2xl border border-white/5 bg-white/5 text-zinc-300 animate-in fade-in duration-300">
            <svg className="w-12 h-12 mx-auto mb-3 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <p className="text-base">Nenhum álbum encontrado.</p>
            <p className="text-sm text-zinc-400 mt-1">Tente buscar por nome do álbum ou artista.</p>
          </div>
        )}
      </div>
    </BaseModal>
  );
}

