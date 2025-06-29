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
  const [selectedTracks, setSelectedTracks] = useState<number[]>([]);
  const [format, setFormat] = useState('flac');
  const [enrichWithBeatport, setEnrichWithBeatport] = useState(true); // Sempre ativo por padrão
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

      try {
        if (isPlaylist) {
          const playlistId = getPlaylistId(url);
          if (!playlistId) return;

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
          if (!videoId) return;

          console.log(`🎵 Chamando video-info para ID: ${videoId}`);
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
  }, [toasts, removeToast]);

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
        playlistItems: videoInfo?.videos?.map(v => ({
          title: v.title,
          status: 'pending' as const,
          progress: 0,
        })),
      };
      
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
    <div className="w-full mx-auto transition-all duration-300">
      {/* Status de download usando dados do contexto */}
      {currentDownload && (
        <div className="mb-3">
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
            loading={currentDownload.status === 'downloading'}
            isConnected={true} // Sempre conectado via contexto
            allowMinimize={true}
            autoMinimizeAfter={currentDownload.isPlaylist ? 10 : 5}
            onClose={() => {
              setCurrentDownloadId(null);
              setDownloadStatus({ loading: false, error: null, success: false });
            }}
          />
        </div>
      )}

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 shadow-lg animate-slide-down"
            >
              <p className="text-white text-sm">{toast.title}</p>
            </div>
          ))}
        </div>
      )}

      {/* Container principal com transparência */}
      <div 
        className="rounded-2xl backdrop-blur-xl border transition-all duration-300 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(39, 39, 42, 0.7) 0%, rgba(24, 24, 27, 0.8) 100%)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
        }}
      >
        {/* Header com controles de minimizar */}
        <div className="flex items-center justify-between p-3 md:p-2 sm:p-2 border-b border-white/10">
          <div className="flex items-center gap-3 md:gap-2">
            <Image
              src="/legolas_thumb.png"
              alt="Legolas"
              width={24}
              height={24}
              className="object-contain w-6 h-6 md:w-5 md:h-5 sm:w-4 sm:h-4"
            />
            <h3 className="text-lg font-semibold bg-gradient-to-r from-white via-gray-200 to-emerald-200 bg-clip-text text-transparent md:text-base sm:text-sm">
              Legolas
            </h3>
            {videoInfo && (
              <span 
                className="px-2 py-1 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: themeColors.background,
                  color: themeColors.primary
                }}
              >
                {videoInfo.isPlaylist ? 'Playlist' : 'Vídeo'} detectado
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-full p-2 transition-all duration-200 hover:scale-105" 
              onClick={() => setSettingsModalOpen(true)}
              aria-label="Configurações"
              type="button"
              style={{
                backgroundColor: themeColors.background,
                color: themeColors.primary,
                border: `1px solid ${themeColors.border}`
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              className="rounded-full p-2 transition-all duration-200 hover:scale-105" 
              onClick={() => setShowPlaylistModal(true)}
              aria-label="Importar playlist"
              type="button"
              style={{
                backgroundColor: themeColors.background,
                color: themeColors.primary,
                border: `1px solid ${themeColors.border}`
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
            <button
              className="rounded-full p-2 transition-all duration-200 hover:scale-105" 
              onClick={() => setShowQueue(!showQueue)}
              aria-label={showQueue ? 'Fechar fila' : 'Abrir fila'}
              type="button"
              style={{
                backgroundColor: themeColors.background,
                color: themeColors.primary,
                border: `1px solid ${themeColors.border}`
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
            <button
              className="rounded-full p-2 transition-all duration-200 hover:scale-105"
              onClick={() => setMinimized(!minimized)}
              aria-label={minimized ? 'Expandir' : 'Minimizar'}
              type="button"
              style={{
                backgroundColor: themeColors.background,
                color: themeColors.primary,
                border: `1px solid ${themeColors.border}`
              }}
            >
              {minimized ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Formulário principal */}
        <div className={`transition-all duration-300 ${minimized ? 'h-0 overflow-hidden' : 'p-4 md:p-3 sm:p-2'}`}>
          <form onSubmit={handleSubmit} className="space-y-4 md:space-y-3 sm:space-y-2">
            {/* Linha principal - URL e controles */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-3 sm:gap-2">
              {/* Campo URL */}
              <div className="lg:col-span-6">
                <label className="block text-sm font-medium mb-2" style={{ color: themeColors.primary }}>
                  URL do YouTube
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full h-11 md:h-10 sm:h-9 px-4 md:px-3 sm:px-2 py-2 bg-black/30 rounded-lg text-white transition-all duration-200 focus:outline-none backdrop-blur-sm"
                  style={{
                    border: `1px solid ${themeColors.border}`,
                    boxShadow: url ? `0 0 0 1px ${themeColors.primaryLight}` : 'none'
                  }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  required
                />
              </div>

              {/* Formato */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium mb-2" style={{ color: themeColors.primary }}>
                  Formato
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full h-11 md:h-10 sm:h-9 px-4 md:px-3 sm:px-2 py-2 bg-black/30 rounded-lg text-white transition-all duration-200 focus:outline-none backdrop-blur-sm"
                  style={{
                    border: `1px solid ${themeColors.border}`
                  }}
                >
                  <option value="flac">FLAC</option>
                  <option value="mp3">MP3</option>
                </select>
              </div>

              {/* Pasta */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium mb-2" style={{ color: themeColors.primary }}>
                  Pasta
                </label>
                <button
                  type="button"
                  onClick={selectDownloadsFolder}
                  className="w-full h-11 md:h-10 sm:h-9 flex items-center justify-center gap-2 rounded-lg transition-all duration-200 hover:scale-105 text-sm font-medium"
                  style={{
                    backgroundColor: themeColors.background,
                    color: themeColors.primary,
                    border: `1px solid ${themeColors.border}`
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
                  className="w-full h-11 md:h-10 sm:h-9 flex items-center justify-center gap-2 text-white rounded-lg transition-all duration-200 shadow disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 text-sm font-medium"
                  style={{
                    backgroundColor: themeColors.primary,
                    border: `1px solid ${themeColors.border}`
                  }}
                >
                  {downloadStatus.loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
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
                    className="w-11 h-6 rounded-full transition-all relative"
                    style={{
                      backgroundColor: enrichWithBeatport ? themeColors.primary : 'rgb(63, 63, 70)',
                      border: `1px solid ${enrichWithBeatport ? themeColors.border : 'rgb(82, 82, 91)'}`
                    }}
                  >
                    <div 
                      className="w-5 h-5 bg-white rounded-full transition-all absolute top-0.5 left-0.5 shadow-md"
                      style={{
                        transform: enrichWithBeatport ? 'translateX(20px)' : 'translateX(0px)'
                      }}
                    ></div>
                  </div>
                  <span className="ml-3 text-sm font-medium" style={{ color: themeColors.primary }}>
                    Enriquecer com dados do Beatport
                  </span>
                </label>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Preview do vídeo/playlist */}
      {videoInfo && !minimized && (
        <div className="mt-2 rounded-xl border border-white/10 overflow-hidden backdrop-blur-sm"
          style={{
            background: 'linear-gradient(135deg, rgba(39, 39, 42, 0.6) 0%, rgba(24, 24, 27, 0.7) 100%)'
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
  );
} 