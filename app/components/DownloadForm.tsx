'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useDownload } from '../contexts/DownloadContext';
import { useFile } from '../contexts/FileContext';
import { usePlayer } from '../contexts/PlayerContext';
import DownloadQueue from './DownloadQueue';
import DownloadStatusIndicator from './DownloadStatusIndicator';
import PlaylistTextModal from './PlaylistTextModal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolderOpen } from '@fortawesome/free-solid-svg-icons';
import { getThumbnailUrl } from '../utils/thumbnailCache';
import { getCachedDominantColor } from '../utils/colorExtractor';
import { useSettings } from '../hooks/useSettings';
import LoadingSpinner from './LoadingSpinner';

interface DownloadFormProps {
  minimized: boolean;
  setMinimized: (minimized: boolean) => void;
  showQueue: boolean;
  setShowQueue: (showQueue: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;
}

interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: string;
  isPlaylist?: boolean;
  playlistTitle?: string;
  artist?: string;
  videos?: Array<{
    title: string;
    duration: string;
    artist?: string;
    youtubeUrl?: string;
    id?: string;
  }>;
}

export default function DownloadForm({ minimized, setMinimized, showQueue, setShowQueue, setSettingsModalOpen }: DownloadFormProps) {
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isLoadingVideoInfo, setIsLoadingVideoInfo] = useState(false);
  const [selectedTracks, setSelectedTracks] = useState<number[]>([]);
  const [format, setFormat] = useState('flac');
  const [enrichWithBeatport, setEnrichWithBeatport] = useState(true); // Sempre ativo por padrão
  const [showBeatportPage, setShowBeatportPage] = useState(false); // Desmarcado por padrão
  const [currentDownloadId, setCurrentDownloadId] = useState<string | null>(null);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [themeColors, setThemeColors] = useState({
    primary: 'rgb(16, 185, 129)',
    primaryLight: 'rgba(16, 185, 129, 0.9)',
    primaryDark: 'rgba(16, 185, 129, 0.7)',
    background: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)'
  });

  const { 
    addToQueue, 
    getCurrentDownload,
    getPlaylistProgressData,
    downloadStatus,
    setDownloadStatus,
    toasts,
    removeToast
  } = useDownload();
  const { selectDownloadsFolder } = useFile();
  const { playerState } = usePlayer();
  const { settings } = useSettings();

  // Obter dados do download atual
  const currentDownload = currentDownloadId ? getCurrentDownload(currentDownloadId) : null;
  const playlistProgressData = currentDownloadId ? getPlaylistProgressData(currentDownloadId) : null;

  // Extrair cores do tema baseadas na música atual (respeitando configurações)
  useEffect(() => {
    const extractThemeColors = async () => {
      // Usar cores padrão se cores dinâmicas estiverem desabilitadas
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

      if (playerState.currentFile) {
        try {
          const thumbnailUrl = getThumbnailUrl(playerState.currentFile.name);
          const colorData = await getCachedDominantColor(thumbnailUrl);
          setThemeColors({
            primary: `rgb(${colorData.r}, ${colorData.g}, ${colorData.b})`,
            primaryLight: `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.9)`,
            primaryDark: `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.7)`,
            background: `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.15)`,
            border: `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.4)`
          });
        } catch (error) {
          console.warn('Erro ao extrair cores do tema:', error);
          // Manter cores padrão em caso de erro
          setThemeColors({
            primary: 'rgb(16, 185, 129)',
            primaryLight: 'rgba(16, 185, 129, 0.9)',
            primaryDark: 'rgba(16, 185, 129, 0.7)',
            background: 'rgba(16, 185, 129, 0.15)',
            border: 'rgba(16, 185, 129, 0.4)'
          });
        }
      }
    };

    extractThemeColors();
  }, [playerState.currentFile?.name, settings.disableDynamicColors]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const getVideoId = (url: string) => {
      const videoMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^#&?]+)/i);
      if (videoMatch) {
        return videoMatch[1];
      }
      return null;
    };
    const getPlaylistId = (url: string) => {
      const match = url.match(/[?&]list=([^#&]+)/);
      return match ? match[1] : null;
    };

    const fetchVideoInfo = async () => {
      console.log(`🔍 Buscando informações para URL: ${url}`);
      const isPlaylist = url.includes('list=');
      
      setIsLoadingVideoInfo(true);
      setVideoInfo(null);

      try {
        if (isPlaylist) {
          const playlistId = getPlaylistId(url);
          if (!playlistId) {
            setIsLoadingVideoInfo(false);
            return;
          }

          console.log(`📋 Chamando playlist-info para ID: ${playlistId}`);
          const endpoint = `/api/playlist-info?id=${encodeURIComponent(playlistId)}`;
          const response = await fetch(endpoint, { signal });
          if (signal.aborted) return;

          const data = await response.json();
          if (data.error) throw new Error(data.error);

          setVideoInfo({ ...data, isPlaylist: true });
          console.log(`✅ Playlist info obtida: ${data.title}`);
        } else {
          const videoId = getVideoId(url);
          if (!videoId) {
            setIsLoadingVideoInfo(false);
            return;
          }

                      // Chamando video-info para ID
          const endpoint = `/api/video-info?id=${encodeURIComponent(videoId)}`;
          const response = await fetch(endpoint, { signal });
          if (signal.aborted) return;

          const data = await response.json();
          if (data.error) throw new Error(data.error);

          setVideoInfo({ ...data, isPlaylist: false });
          console.log(`✅ Video info obtida: ${data.title}`);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error(`❌ Erro ao buscar info:`, err);
          setVideoInfo(null);
        }
      } finally {
        if (!signal.aborted) {
          setIsLoadingVideoInfo(false);
        }
      }
    };

    if (url) {
      console.log(`⏳ Buscando info imediatamente para: ${url}`);
      fetchVideoInfo();
    } else {
      setVideoInfo(null);
    }

    return () => {
      console.log(`🧹 Abortando fetch para: ${url}`);
      controller.abort();
    };
  }, [url]);

  // Toast auto-hide
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      removeToast(toasts[0].id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toasts.length, removeToast]);

  // Resetar seleção ao mudar de playlist
  useEffect(() => {
    if (videoInfo?.isPlaylist && videoInfo.videos) {
      setSelectedTracks(videoInfo.videos.map((_, idx) => idx));
    } else {
      setSelectedTracks([]);
    }
  }, [videoInfo]);

  function toggleTrack(idx: number) {
    setSelectedTracks(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  }

  function extractYoutubeId(url: string) {
    const match = url.match(/(?:youtu.be\/|youtube.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^#&?]+)/i);
    return match ? match[1] : '';
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setDownloadStatus({ loading: true, error: null, success: false });
      
      // Adicionar à fila usando o contexto
      const queueItem = {
        url,
        title: videoInfo?.title || 'Download em andamento',
        isPlaylist: videoInfo?.isPlaylist || false,
        format,
        enrichWithBeatport,
        showBeatportPage,
        status: 'pending' as const,
        steps: [] as any[],
        playlistItems: videoInfo?.videos?.map(v => ({
          title: v.title,
          status: 'pending' as const,
          progress: 0,
          steps: [] as any[],
        })),
      };
      
      console.log('📝 Item da fila criado:', {
        url,
        isPlaylist: videoInfo?.isPlaylist,
        format,
        enrichWithBeatport,
        showBeatportPage,
        totalVideos: videoInfo?.videos?.length
      });
      
      const newItem = addToQueue(queueItem);
      setCurrentDownloadId(newItem.id);
      
      console.log(`🚀 Download adicionado à fila: ${newItem.id} - ${videoInfo?.title}`);
      
      // Limpar formulário
      setUrl('');
      setVideoInfo(null);
      
      // O DownloadContext agora gerencia automaticamente a fila
      setDownloadStatus({ loading: false, success: true });
      
    } catch (err) {
      console.error('❌ Erro ao adicionar download:', err);
      setDownloadStatus({
        error: err instanceof Error ? err.message : 'Erro ao processar',
        loading: false,
        success: false
      });
    }
  };

  return (
    <div className="w-full transition-all duration-300">
      {/* Status de download usando dados do contexto */}
      {currentDownload && (
        <DownloadStatusIndicator
          type={currentDownload.isPlaylist ? 'playlist' : 'individual'}
          status={currentDownload.status}
          title={currentDownload.title || 'Download em andamento'}
          currentStep={currentDownload.currentStep}
          currentSubstep={currentDownload.currentSubstep}
          detail={currentDownload.detail}
          progress={currentDownload.progress || 0}
          playlistProgress={playlistProgressData ? {
            current: playlistProgressData.current,
            total: playlistProgressData.total,
            completed: playlistProgressData.completed,
            errors: playlistProgressData.errors,
            downloading: playlistProgressData.downloading
          } : undefined}
          error={currentDownload.error}
          loading={currentDownload.status === 'downloading' || currentDownload.status === 'pending'}
          isConnected={true} // Sempre conectado via contexto
          allowMinimize={true}
          autoMinimizeAfter={currentDownload.isPlaylist ? 10 : 5}
          onClose={() => {
            setCurrentDownloadId(null);
            setDownloadStatus({ loading: false, error: null, success: false });
          }}
        />
      )}

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="backdrop-blur-md border rounded-xl p-4 shadow-lg animate-slide-down"
              style={{
                background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                border: `1px solid ${themeColors.border}`,
                boxShadow: `0 8px 32px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
              }}
            >
              <p className="text-white text-sm font-medium">{toast.title}</p>
            </div>
          ))}
        </div>
      )}

      {/* Container principal ocupando toda largura */}
      <div 
        className="w-full backdrop-blur-xl transition-all duration-300 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${themeColors.background}aa 0%, ${themeColors.background}cc 100%)`,
          borderColor: themeColors.border,
          boxShadow: `0 8px 32px ${themeColors.primary}20`
        }}
      >
        <div className="w-full">
          <div 
            className="backdrop-blur-xl border-b transition-all duration-300 overflow-hidden border-t-0"
            style={{
              background: `linear-gradient(135deg, ${themeColors.background}66 0%, ${themeColors.background}88 100%)`,
              borderColor: themeColors.border,
              boxShadow: `0 8px 32px ${themeColors.primary}15`
            }}
          >
            {/* Header com controles de minimizar */}
            <div className="flex items-center justify-between max-w-7xl mx-auto p-3 md:p-2 sm:p-2">
              <div className="flex items-center gap-3 md:gap-2 flex-1">
                <div className="flex-shrink-0 w-[50px] h-[50px] relative overflow-visible">
                  <Image
                    src="/legolas_thumb.png"
                    alt="Legolas"
                    width={50}
                    height={50}
                    className="object-contain absolute top-3 z-10 scale-[1.6] transition-transform duration-300"
                  />
                </div>
                
                {/* Input e botão quando minimizado */}
                {minimized && (
                  <div className="flex items-center gap-3 flex-1 ml-6 mr-2">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="flex-1 h-10 px-4 py-2 rounded-xl text-white text-sm transition-all duration-200 focus:outline-none backdrop-blur-md placeholder-zinc-400 focus:ring-2 focus:ring-emerald-500/50"
                      style={{
                        background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                        border: `1px solid ${themeColors.border}`,
                        boxShadow: url 
                          ? `0 4px 12px ${themeColors.primary}25, 0 0 0 1px ${themeColors.primaryLight}, inset 0 1px 0 rgba(255, 255, 255, 0.1)` 
                          : `0 4px 12px ${themeColors.primary}15, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                      }}
                      placeholder="Cole a URL do YouTube aqui..."
                    />
                    <button
                      type="submit"
                      onClick={handleSubmit}
                      disabled={downloadStatus.loading || !videoInfo || !url.trim()}
                      className="h-10 px-4 flex items-center justify-center gap-2 text-white rounded-xl transition-all duration-200 shadow disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 text-sm font-medium whitespace-nowrap min-w-[100px] backdrop-blur-md"
                      style={{
                        background: (downloadStatus.loading || !videoInfo || !url.trim()) 
                          ? 'linear-gradient(135deg, rgba(82, 82, 91, 0.8) 0%, rgba(82, 82, 91, 0.9) 100%)'
                          : `linear-gradient(135deg, ${themeColors.primary} 0%, ${themeColors.primaryDark} 100%)`,
                        border: `1px solid ${(downloadStatus.loading || !videoInfo || !url.trim()) ? 'rgba(82, 82, 91, 0.5)' : themeColors.border}`,
                        boxShadow: (downloadStatus.loading || !videoInfo || !url.trim()) 
                          ? '0 4px 12px rgba(82, 82, 91, 0.3)'
                          : `0 4px 12px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.2)`
                      }}
                      onMouseEnter={(e) => {
                        if (!downloadStatus.loading && videoInfo && url.trim()) {
                          e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                          e.currentTarget.style.boxShadow = `0 8px 24px ${themeColors.primary}40, inset 0 1px 0 rgba(255, 255, 255, 0.25)`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!downloadStatus.loading && videoInfo && url.trim()) {
                          e.currentTarget.style.transform = 'translateY(0) scale(1)';
                          e.currentTarget.style.boxShadow = `0 4px 12px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.2)`;
                        }
                      }}
                    >
                      {downloadStatus.loading ? (
                        <LoadingSpinner size="xs" variant="music" isLoading={true} />
                      ) : isLoadingVideoInfo ? (
                        <LoadingSpinner size="xs" variant="dots" isLoading={true} />
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                          </svg>
                          <span>Baixar</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
                
                {/* Badge de vídeo detectado quando não minimizado */}
                {!minimized && videoInfo && (
                  <span 
                    className="px-2 py-1 rounded-full text-xs font-medium backdrop-blur-sm"
                    style={{
                      backgroundColor: themeColors.background,
                      color: themeColors.primary,
                      border: `1px solid ${themeColors.border}`
                    }}
                  >
                    {videoInfo.isPlaylist ? 'Playlist' : 'Vídeo'} detectado
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 backdrop-blur-md hover:shadow-lg" 
                  onClick={() => setSettingsModalOpen(true)}
                  aria-label="Configurações"
                  type="button"
                  style={{
                    background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                    color: themeColors.primary,
                    border: `1px solid ${themeColors.border}`,
                    boxShadow: `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                    e.currentTarget.style.boxShadow = `0 8px 24px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`;
                  }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <button
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 backdrop-blur-md hover:shadow-lg" 
                  onClick={() => setShowPlaylistModal(true)}
                  aria-label="Importar playlist"
                  type="button"
                  style={{
                    background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                    color: themeColors.primary,
                    border: `1px solid ${themeColors.border}`,
                    boxShadow: `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                    e.currentTarget.style.boxShadow = `0 8px 24px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`;
                  }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
                <button
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 backdrop-blur-md hover:shadow-lg" 
                  onClick={() => setShowQueue(!showQueue)}
                  aria-label={showQueue ? 'Fechar fila' : 'Abrir fila'}
                  type="button"
                  style={{
                    background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                    color: themeColors.primary,
                    border: `1px solid ${themeColors.border}`,
                    boxShadow: `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                    e.currentTarget.style.boxShadow = `0 8px 24px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`;
                  }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                </button>
                <button
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 backdrop-blur-md hover:shadow-lg"
                  onClick={() => setMinimized(!minimized)}
                  aria-label={minimized ? 'Expandir' : 'Minimizar'}
                  type="button"
                  style={{
                    background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                    color: themeColors.primary,
                    border: `1px solid ${themeColors.border}`,
                    boxShadow: `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                    e.currentTarget.style.boxShadow = `0 8px 24px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`;
                  }}
                >
                  {minimized ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Indicador de vídeo detectado quando minimizado */}
            {minimized && videoInfo && (
              <div 
                className="px-3 py-2 border-t"
                style={{ borderColor: themeColors.border }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: themeColors.primary }}></div>
                  <span className="text-xs" style={{ color: themeColors.primary }}>
                    {videoInfo.isPlaylist ? `Playlist detectada (${videoInfo.videos?.length} vídeos)` : 'Vídeo detectado'}
                  </span>
                </div>
              </div>
            )}

            {/* Formulário principal */}
            <div className={`transition-all duration-300 max-w-7xl mx-auto ${minimized ? 'h-0 overflow-hidden' : 'p-4 md:p-3 sm:p-2'}`}>
              <form onSubmit={handleSubmit} className="space-y-4 md:space-y-3 sm:space-y-2">
                {/* Linha principal - URL e controles */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-3 sm:gap-2">
                  {/* Campo URL */}
                  <div className="lg:col-span-6">
                    <label className="block text-sm font-medium mb-2 text-white">
                      URL do YouTube
                    </label>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="w-full h-11 md:h-10 sm:h-9 px-4 md:px-3 sm:px-2 py-2 rounded-xl text-white transition-all duration-200 focus:outline-none backdrop-blur-md placeholder-zinc-400 focus:ring-2 focus:ring-emerald-500/50"
                      style={{
                        background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                        border: `1px solid ${themeColors.border}`,
                        boxShadow: url 
                          ? `0 4px 12px ${themeColors.primary}25, 0 0 0 1px ${themeColors.primaryLight}, inset 0 1px 0 rgba(255, 255, 255, 0.1)` 
                          : `0 4px 12px ${themeColors.primary}15, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                      }}
                      placeholder="https://www.youtube.com/watch?v=..."
                      required
                    />
                  </div>

                  {/* Formato */}
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium mb-2 text-white">
                      Formato
                    </label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                      className="w-full h-11 md:h-10 sm:h-9 px-4 md:px-3 sm:px-2 py-2 rounded-xl text-white transition-all duration-200 focus:outline-none backdrop-blur-md cursor-pointer appearance-none"
                      style={{
                        background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                        border: `1px solid ${themeColors.border}`,
                        boxShadow: `0 4px 12px ${themeColors.primary}15, inset 0 1px 0 rgba(255, 255, 255, 0.1)`,
                        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='${themeColors.primary.replace('#', '%23')}' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                        backgroundPosition: 'right 12px center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '16px'
                      }}
                    >
                      <option value="flac" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>FLAC</option>
                      <option value="mp3" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>MP3</option>
                    </select>
                  </div>

                  {/* Pasta */}
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium mb-2 text-white">
                      Pasta
                    </label>
                    <button
                      type="button"
                      onClick={selectDownloadsFolder}
                      className="w-full h-11 md:h-10 sm:h-9 flex items-center justify-center gap-2 rounded-xl transition-all duration-200 hover:scale-105 text-sm font-medium backdrop-blur-md hover:shadow-lg"
                      style={{
                        background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                        color: themeColors.primary,
                        border: `1px solid ${themeColors.border}`,
                        boxShadow: `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                        e.currentTarget.style.boxShadow = `0 8px 24px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                        e.currentTarget.style.boxShadow = `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`;
                      }}
                    >
                      <FontAwesomeIcon icon={faFolderOpen} className="w-4 h-4" />
                      <span className="hidden md:inline">Pasta</span>
                    </button>
                  </div>

                  {/* Botão Download */}
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium mb-2 text-transparent">
                      Download
                    </label>
                    <button
                      type="submit"
                      disabled={downloadStatus.loading || !videoInfo}
                      className="w-full h-11 md:h-10 sm:h-9 flex items-center justify-center gap-2 text-white rounded-xl transition-all duration-200 shadow disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 text-sm font-medium backdrop-blur-md"
                      style={{
                        background: downloadStatus.loading || !videoInfo 
                          ? 'linear-gradient(135deg, rgba(82, 82, 91, 0.8) 0%, rgba(82, 82, 91, 0.9) 100%)'
                          : `linear-gradient(135deg, ${themeColors.primary} 0%, ${themeColors.primaryDark} 100%)`,
                        border: `1px solid ${downloadStatus.loading || !videoInfo ? 'rgba(82, 82, 91, 0.5)' : themeColors.border}`,
                        boxShadow: downloadStatus.loading || !videoInfo
                          ? '0 4px 12px rgba(82, 82, 91, 0.3)'
                          : `0 4px 12px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.2)`
                      }}
                      onMouseEnter={(e) => {
                        if (!downloadStatus.loading && videoInfo) {
                          e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                          e.currentTarget.style.boxShadow = `0 8px 24px ${themeColors.primary}40, inset 0 1px 0 rgba(255, 255, 255, 0.25)`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!downloadStatus.loading && videoInfo) {
                          e.currentTarget.style.transform = 'translateY(0) scale(1)';
                          e.currentTarget.style.boxShadow = `0 4px 12px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.2)`;
                        }
                      }}
                    >
                      {downloadStatus.loading ? (
                        <>
                          <LoadingSpinner size="sm" variant="wave" isLoading={true} />
                          <span className="hidden sm:inline">Baixando...</span>
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                          </svg>
                          <span className="hidden sm:inline">Baixar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Toggle Beatport */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enrichWithBeatport}
                        onChange={(e) => setEnrichWithBeatport(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div 
                        className="w-12 h-6 rounded-full transition-all relative backdrop-blur-sm"
                        style={{
                          background: enrichWithBeatport 
                            ? `linear-gradient(135deg, ${themeColors.primary} 0%, ${themeColors.primaryDark} 100%)` 
                            : 'linear-gradient(135deg, rgba(63, 63, 70, 0.8) 0%, rgba(63, 63, 70, 0.9) 100%)',
                          border: `1px solid ${enrichWithBeatport ? themeColors.border : 'rgba(82, 82, 91, 0.5)'}`,
                          boxShadow: enrichWithBeatport 
                            ? `0 2px 8px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.1)` 
                            : '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                        }}
                      >
                        <div 
                          className="w-5 h-5 bg-white rounded-full transition-all absolute top-0.5 left-0.5 shadow-lg"
                          style={{
                            transform: enrichWithBeatport ? 'translateX(24px)' : 'translateX(0px)',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.1)'
                          }}
                        ></div>
                      </div>
                      <span className="ml-3 text-sm font-medium text-white">
                        Enriquecer com dados do Beatport
                      </span>
                    </label>
                  </div>
                </div>

                {/* Toggle Exibir página Beatport */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showBeatportPage}
                        onChange={(e) => setShowBeatportPage(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div 
                        className="w-12 h-6 rounded-full transition-all relative backdrop-blur-sm"
                        style={{
                          background: showBeatportPage 
                            ? `linear-gradient(135deg, ${themeColors.primary} 0%, ${themeColors.primaryDark} 100%)` 
                            : 'linear-gradient(135deg, rgba(63, 63, 70, 0.8) 0%, rgba(63, 63, 70, 0.9) 100%)',
                          border: `1px solid ${showBeatportPage ? themeColors.border : 'rgba(82, 82, 91, 0.5)'}`,
                          boxShadow: showBeatportPage 
                            ? `0 2px 8px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.1)` 
                            : '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                        }}
                      >
                        <div 
                          className="w-5 h-5 bg-white rounded-full transition-all absolute top-0.5 left-0.5 shadow-lg"
                          style={{
                            transform: showBeatportPage ? 'translateX(24px)' : 'translateX(0px)',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.1)'
                          }}
                        ></div>
                      </div>
                      <span className="ml-3 text-sm font-medium text-white">
                        Exibir página beatport
                      </span>
                    </label>
                  </div>
                </div>
              </form>
            </div>

            {/* Preview do vídeo/playlist */}
            {videoInfo && !minimized && (
              <div 
                className="mt-2 rounded-lg border overflow-hidden backdrop-blur-sm"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.background}44 0%, ${themeColors.background}66 100%)`,
                  borderColor: themeColors.border
                }}
              >
                <div className="p-3 md:p-2 sm:p-2">
                  <div className="flex items-start gap-4 md:gap-3 sm:gap-2">
                    {videoInfo.thumbnail && (
                      <Image
                        src={videoInfo.thumbnail}
                        alt={videoInfo.title}
                        width={120}
                        height={90}
                        className="rounded-lg object-cover flex-shrink-0 w-24 h-18 md:w-20 md:h-15 sm:w-16 sm:h-12"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-white truncate text-sm md:text-xs">
                        {videoInfo.title}
                      </h4>
                      <p className="text-zinc-400 text-sm md:text-xs mt-1">
                        Duração: {videoInfo.duration}
                        {videoInfo.isPlaylist && videoInfo.videos && (
                          <span className="ml-2">• {videoInfo.videos.length} vídeos</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal de Importar Playlist */}
            <PlaylistTextModal
              isOpen={showPlaylistModal}
              onClose={() => setShowPlaylistModal(false)}
              themeColors={themeColors}
            />
          </div>
        </div>
      </div>
    </div>
  );
} 