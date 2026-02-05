'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { useDownload } from '../contexts/DownloadContext';
import { useFile } from '../contexts/FileContext';
import { usePlayer } from '../contexts/PlayerContext';
import DownloadQueue from './DownloadQueue';
import PlaylistTextModal from './PlaylistTextModal';
import YouTubeSearchModal from './YouTubeSearchModal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolderOpen } from '@fortawesome/free-solid-svg-icons';
import { getThumbnailUrl } from '../utils/thumbnailCache';
import { getCachedDominantColor } from '../utils/colorExtractor';
import { useSettings } from '../hooks/useSettings';
import LoadingSpinner from './LoadingSpinner';
import { useQuickPlaylist } from '../contexts/QuickPlaylistContext';
import QuickPlaylistPanel from './QuickPlaylistPanel';
import PlaylistManager from './PlaylistManager';
import { safeSetItem, safeGetItem } from '../utils/localStorage';

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

const STORAGE_KEY_DOWNLOAD_FORM = 'legolas-download-form-state';

interface SavedDownloadFormState {
  url: string;
  format: string;
  enrichWithBeatport: boolean;
  showBeatportPage: boolean;
  showPlaylistModal: boolean;
  showYouTubeSearchModal: boolean;
  showQuickPlaylist: boolean;
}

export default function DownloadForm({ minimized, setMinimized, showQueue, setShowQueue, setSettingsModalOpen }: DownloadFormProps) {
  // Estados iniciais com valores padrão (para evitar hydration mismatch)
  // Os valores salvos serão carregados no useEffect após montagem
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isLoadingVideoInfo, setIsLoadingVideoInfo] = useState(false);
  const [selectedTracks, setSelectedTracks] = useState<number[]>([]);
  const [format, setFormat] = useState('flac');
  const [enrichWithBeatport, setEnrichWithBeatport] = useState(true);
  const [showBeatportPage, setShowBeatportPage] = useState(false);
  const [currentDownloadId, setCurrentDownloadId] = useState<string | null>(null);
  const [toastDismissed, setToastDismissed] = useState<Set<string>>(new Set());
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showYouTubeSearchModal, setShowYouTubeSearchModal] = useState(false);
  const [showQuickPlaylist, setShowQuickPlaylist] = useState(false);
  const [showPlaylistManager, setShowPlaylistManager] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentFolderPath, setCurrentFolderPath] = useState<string>('');
  const [themeColors, setThemeColors] = useState({
    primary: 'rgb(16, 185, 129)',
    primaryLight: 'rgba(16, 185, 129, 0.9)',
    primaryDark: 'rgba(16, 185, 129, 0.7)',
    background: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)'
  });

  const { 
    queue,
    addToQueue, 
    getCurrentDownload,
    getPlaylistProgressData,
    downloadStatus,
    setDownloadStatus,
    toasts,
    removeToast
  } = useDownload();
  const { selectDownloadsFolder, customDownloadsPath } = useFile();
  const { playerState } = usePlayer();
  const { settings } = useSettings();
  const { count: playlistCount } = useQuickPlaylist();

  // Marcar como inicializado após montagem
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Carregar estados salvos do localStorage após montagem (client-side only)
  useEffect(() => {
    const saved = safeGetItem<SavedDownloadFormState>(STORAGE_KEY_DOWNLOAD_FORM);
    if (saved) {
      setUrl(saved.url);
      setFormat(saved.format);
      setEnrichWithBeatport(saved.enrichWithBeatport);
      setShowBeatportPage(saved.showBeatportPage);
      setShowPlaylistModal(saved.showPlaylistModal);
      setShowYouTubeSearchModal(saved.showYouTubeSearchModal);
      setShowQuickPlaylist(saved.showQuickPlaylist);
    }
  }, []);

  // Buscar caminho atual da pasta de downloads
  useEffect(() => {
    const fetchCurrentPath = async () => {
      // Primeiro tentar pegar do localStorage (mais rápido)
      const savedPath = safeGetItem<string>('customDownloadsPath');
      if (savedPath) {
        setCurrentFolderPath(savedPath);
        return;
      }
      
      // Se não houver no localStorage, buscar da API
      try {
        const response = await fetch('/api/get-downloads-path');
        if (response.ok) {
          const data = await response.json();
          setCurrentFolderPath(data.displayPath || data.path || 'downloads');
        }
      } catch (error) {
        console.error('Erro ao buscar caminho da pasta:', error);
        setCurrentFolderPath('downloads');
      }
    };
    
    fetchCurrentPath();
  }, []);

  // Atualizar caminho quando customDownloadsPath mudar
  useEffect(() => {
    if (customDownloadsPath) {
      setCurrentFolderPath(customDownloadsPath);
    } else {
      // Se customDownloadsPath for null, buscar da API
      const fetchPath = async () => {
        try {
          const response = await fetch('/api/get-downloads-path');
          if (response.ok) {
            const data = await response.json();
            setCurrentFolderPath(data.displayPath || data.path || 'downloads');
          }
        } catch (error) {
          console.error('Erro ao buscar caminho da pasta:', error);
        }
      };
      fetchPath();
    }
  }, [customDownloadsPath]);

  // Handler para trocar pasta
  const handleSelectFolder = async () => {
    try {
      await selectDownloadsFolder();
      // Atualizar caminho após seleção - usar o customDownloadsPath do contexto
      // que já é atualizado pelo FileContext quando a pasta é selecionada
      const savedPath = safeGetItem<string>('customDownloadsPath');
      if (savedPath) {
        setCurrentFolderPath(savedPath);
      } else {
        // Se não houver no localStorage, buscar da API
        setTimeout(async () => {
          try {
            const response = await fetch('/api/get-downloads-path');
            if (response.ok) {
              const data = await response.json();
              setCurrentFolderPath(data.displayPath || data.path || 'downloads');
            }
          } catch (error) {
            console.error('Erro ao atualizar caminho da pasta:', error);
          }
        }, 300);
      }
    } catch (error) {
      console.error('Erro ao selecionar pasta:', error);
    }
  };

  // Salvar estados no localStorage quando mudarem (após inicialização)
  useEffect(() => {
    if (!isInitialized) return;
    
    const state: SavedDownloadFormState = {
      url,
      format,
      enrichWithBeatport,
      showBeatportPage,
      showPlaylistModal,
      showYouTubeSearchModal,
      showQuickPlaylist
    };
    safeSetItem(STORAGE_KEY_DOWNLOAD_FORM, state, {
      maxSize: 50 * 1024, // 50KB máximo
      onError: (err: Error) => {
        console.warn('⚠️ Erro ao salvar estado do formulário:', err.message);
      }
    });
  }, [url, format, enrichWithBeatport, showBeatportPage, showPlaylistModal, showYouTubeSearchModal, showQuickPlaylist, isInitialized]);

  // Calcular downloads ativos
  const activeDownloadsCount = useMemo(() => {
    return queue.filter(item => 
      item.status === 'downloading' || item.status === 'pending'
    ).length;
  }, [queue]);

  // Obter dados do download atual - se não houver currentDownloadId, pegar o primeiro download ativo da fila
  const activeDownload = useMemo(() => 
    queue.find(item => 
      item.status === 'downloading' || item.status === 'pending'
    ),
    [queue]
  );
  
  // Usar currentDownloadId se existir, senão usar o primeiro download ativo
  const effectiveDownloadId = useMemo(() => 
    currentDownloadId || activeDownload?.id || null,
    [currentDownloadId, activeDownload?.id]
  );
  
  const currentDownload = useMemo(() => {
    if (!effectiveDownloadId) return null;
    const download = getCurrentDownload(effectiveDownloadId);
    // Se o download não foi encontrado mas há um activeDownload, usar ele diretamente
    if (!download && activeDownload && activeDownload.id === effectiveDownloadId) {
      return activeDownload;
    }
    return download;
  }, [effectiveDownloadId, getCurrentDownload, activeDownload]);
  
  const playlistProgressData = useMemo(() => 
    effectiveDownloadId ? getPlaylistProgressData(effectiveDownloadId) : null,
    [effectiveDownloadId, getPlaylistProgressData]
  );
  
  // Atualizar currentDownloadId quando um novo download ativo aparecer
  useEffect(() => {
    if (activeDownload) {
      // Se não há currentDownloadId ou o currentDownloadId não está mais ativo, atualizar
      // Mas só se o toast não foi fechado manualmente para este download
      if (!toastDismissed.has(activeDownload.id)) {
        if (!currentDownloadId || !currentDownload || (currentDownload.status !== 'downloading' && currentDownload.status !== 'pending')) {
          setCurrentDownloadId(activeDownload.id);
        }
      }
    } else if (currentDownloadId && (!currentDownload || (currentDownload.status !== 'downloading' && currentDownload.status !== 'pending'))) {
      // Se não há mais downloads ativos, limpar o currentDownloadId
      setCurrentDownloadId(null);
    }
  }, [activeDownload, currentDownloadId, currentDownload, toastDismissed]);
  
  // Limpar downloads fechados quando eles são concluídos ou removidos da fila
  useEffect(() => {
    const activeIds = new Set(queue.filter(item => 
      item.status === 'downloading' || item.status === 'pending'
    ).map(item => item.id));
    
    setToastDismissed(prev => {
      const updated = new Set(prev);
      // Remover IDs que não estão mais na fila
      prev.forEach(id => {
        if (!activeIds.has(id)) {
          updated.delete(id);
        }
      });
      return updated;
    });
  }, [queue]);

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

          if (!response.ok) {
            // Tentar extrair mensagem de erro do JSON
            let errorMessage = 'Erro ao buscar informações da playlist';
            try {
              const errorData = await response.json();
              if (errorData.error) {
                errorMessage = errorData.error;
              }
            } catch {
              // Se não conseguir fazer parse, usar mensagem padrão
              errorMessage = `Erro ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
          }

          const data = await response.json().catch((parseError) => {
            console.error('Erro ao fazer parse da resposta da playlist:', parseError);
            throw new Error('Resposta inválida do servidor');
          });
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

          if (!response.ok) {
            // Tentar extrair mensagem de erro do JSON
            let errorMessage = 'Erro ao buscar informações do vídeo';
            try {
              const errorData = await response.json();
              if (errorData.error) {
                errorMessage = errorData.error;
              }
            } catch {
              // Se não conseguir fazer parse, usar mensagem padrão
              errorMessage = `Erro ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
          }

          const data = await response.json().catch((parseError) => {
            console.error('Erro ao fazer parse da resposta do vídeo:', parseError);
            throw new Error('Resposta inválida do servidor');
          });
          if (data.error) throw new Error(data.error);

          setVideoInfo({ ...data, isPlaylist: false });
          console.log(`✅ Video info obtida: ${data.title}`);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error(`❌ Erro ao buscar info:`, err);
          setVideoInfo(null);
          // O erro será logado no console, mas não há UI de toast aqui
          // O DownloadContext pode mostrar toasts se necessário
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

  // Toast auto-hide - removido porque já é gerenciado pelo DownloadContext
  // O DownloadContext já remove toasts automaticamente após 4 segundos

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
      {/* Toast de download atual - fixo acima do header */}
      {(() => {
        const displayDownload = currentDownload || activeDownload;
        const isActive = displayDownload && (displayDownload.status === 'downloading' || displayDownload.status === 'pending');
        
        // Verificar se o toast foi fechado manualmente para este download
        const isDismissed = displayDownload && toastDismissed.has(displayDownload.id);
        
        if (!displayDownload || !isActive || isDismissed) return null;
        
        return (
          <div className="mb-4 mt-4 max-w-7xl mx-auto px-3 md:px-2 sm:px-2">
            <div
              className="backdrop-blur-md border rounded-xl p-4 shadow-lg relative"
              style={{
                background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                border: `1px solid ${themeColors.border}`,
                boxShadow: `0 8px 32px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
              }}
              suppressHydrationWarning
            >
              {/* Botão de fechar */}
              <button
                onClick={() => {
                  if (displayDownload) {
                    setToastDismissed(prev => new Set(prev).add(displayDownload.id));
                    setCurrentDownloadId(null);
                  }
                }}
                className="absolute top-3 right-3 text-white/60 hover:text-white transition-colors duration-200 p-1 rounded-full hover:bg-white/10 z-10"
                title="Fechar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="flex items-start gap-3 pr-6">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: themeColors.primary }}></div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate mb-1.5">
                    {displayDownload.title || 'Download em andamento'}
                  </p>
                  {displayDownload.currentStep && (
                    <p className="text-xs text-white/70 truncate mb-2.5">
                      {displayDownload.currentStep}
                      {displayDownload.currentSubstep && ` • ${displayDownload.currentSubstep}`}
                    </p>
                  )}
                  
                  {/* Barra de progresso - sempre mostrar quando há download ativo */}
                  <div className="w-full bg-black/20 rounded-full h-2 mb-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full transition-all duration-300 ease-out"
                      style={{
                        width: `${Math.max(0, Math.min(100, displayDownload.progress || 0))}%`,
                        background: `linear-gradient(90deg, ${themeColors.primary} 0%, ${themeColors.primaryLight} 100%)`,
                        minWidth: (displayDownload.progress || 0) > 0 ? '2px' : '0',
                        transition: 'width 0.3s ease-out'
                      }}
                    ></div>
                  </div>
                  
                  {/* Informações de progresso */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-mono text-white/80">
                      {displayDownload.progress !== undefined ? `${Math.round(displayDownload.progress)}%` : '0%'}
                    </span>
                    {playlistProgressData ? (
                      <div className="flex items-center gap-2 text-xs text-white/70">
                        <span>
                          {playlistProgressData.completed + playlistProgressData.errors}/{playlistProgressData.total} concluídos
                        </span>
                        <span className="text-white/50">•</span>
                        <span className="text-yellow-400/90 font-medium">
                          {playlistProgressData.total - (playlistProgressData.completed + playlistProgressData.errors + playlistProgressData.downloading)} faltam
                        </span>
                        {playlistProgressData.downloading > 0 && (
                          <>
                            <span className="text-white/50">•</span>
                            <span className="text-emerald-400/90">
                              {playlistProgressData.downloading} baixando
                            </span>
                          </>
                        )}
                      </div>
                    ) : (
                      displayDownload.isPlaylist && displayDownload.playlistItems && (
                        <span className="text-xs text-white/60">
                          {displayDownload.playlistItems.length} faixas na playlist
                        </span>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toasts de notificação (conclusão/erro) */}
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
        suppressHydrationWarning
      >
        <div className="w-full">
          <div 
            className="backdrop-blur-xl border-b transition-all duration-300 overflow-hidden border-t-0"
            style={{
              background: `linear-gradient(135deg, ${themeColors.background}66 0%, ${themeColors.background}88 100%)`,
              borderColor: themeColors.border,
              boxShadow: `0 8px 32px ${themeColors.primary}15`
            }}
            suppressHydrationWarning
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
                    priority
                    className="object-contain absolute top-3 z-10 scale-[1.6] transition-transform duration-300"
                    style={{ width: 'auto', height: 'auto' }}
                    suppressHydrationWarning
                  />
                </div>
                
                {/* Input e botão quando minimizado */}
                {minimized && (
                  <div className="flex items-center gap-3 flex-1 ml-6 mr-2">
                    <div className="flex-1 relative">
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="w-full h-10 px-4 py-2 pr-10 rounded-xl text-white text-sm transition-all duration-200 focus:outline-none backdrop-blur-md placeholder-zinc-400 focus:ring-2 focus:ring-emerald-500/50"
                        style={{
                          background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                          border: `1px solid ${isLoadingVideoInfo ? themeColors.primary : themeColors.border}`,
                          boxShadow: isLoadingVideoInfo
                            ? `0 4px 12px ${themeColors.primary}40, 0 0 0 1px ${themeColors.primaryLight}, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                            : url 
                              ? `0 4px 12px ${themeColors.primary}25, 0 0 0 1px ${themeColors.primaryLight}, inset 0 1px 0 rgba(255, 255, 255, 0.1)` 
                              : `0 4px 12px ${themeColors.primary}15, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                        }}
                        placeholder="Cole a URL do YouTube aqui..."
                        disabled={isLoadingVideoInfo}
                        suppressHydrationWarning
                      />
                      {isLoadingVideoInfo && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <LoadingSpinner size="xs" variant="dots" isLoading={true} themeColors={themeColors} />
                        </div>
                      )}
                    </div>
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
                      suppressHydrationWarning
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
                  suppressHydrationWarning
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
                  onClick={() => setShowYouTubeSearchModal(true)}
                  aria-label="Buscar no YouTube Music"
                  type="button"
                  style={{
                    background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                    color: themeColors.primary,
                    border: `1px solid ${themeColors.border}`,
                    boxShadow: `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                  }}
                  suppressHydrationWarning
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
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
                  suppressHydrationWarning
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
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 backdrop-blur-md hover:shadow-lg relative" 
                  onClick={() => setShowQueue(!showQueue)}
                  aria-label={showQueue ? 'Fechar fila' : 'Abrir fila'}
                  type="button"
                  style={{
                    background: showQueue
                      ? `linear-gradient(135deg, ${themeColors.primary}20 0%, ${themeColors.primaryDark}30 100%)`
                      : `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                    color: themeColors.primary,
                    border: `1px solid ${themeColors.border}`,
                    boxShadow: `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                  }}
                  suppressHydrationWarning
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
                  {activeDownloadsCount > 0 && (
                    <span 
                      className="absolute -top-1.5 -right-1.5 bg-gradient-to-br from-yellow-400 to-yellow-600 text-black text-[10px] font-extrabold rounded-full min-w-[20px] h-5 flex items-center justify-center border-2 border-black shadow-lg animate-pulse"
                      style={{
                        boxShadow: '0 2px 8px rgba(251, 191, 36, 0.6), 0 0 0 2px rgba(0, 0, 0, 0.3)',
                        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                      }}
                      title={`${activeDownloadsCount} ${activeDownloadsCount === 1 ? 'download ativo' : 'downloads ativos'}`}
                    >
                      {activeDownloadsCount > 99 ? '99+' : activeDownloadsCount}
                    </span>
                  )}
                </button>
                <button
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 backdrop-blur-md hover:shadow-lg relative"
                  onClick={() => setShowQuickPlaylist(!showQuickPlaylist)}
                  aria-label={showQuickPlaylist ? 'Fechar Quick Playlist' : 'Abrir Quick Playlist'}
                  type="button"
                  style={{
                    background: showQuickPlaylist
                      ? `linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(251, 191, 36, 0.3) 100%)`
                      : `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                    color: showQuickPlaylist ? '#fbbf24' : themeColors.primary,
                    border: `1px solid ${showQuickPlaylist ? 'rgba(251, 191, 36, 0.4)' : themeColors.border}`,
                    boxShadow: showQuickPlaylist
                      ? `0 4px 12px rgba(251, 191, 36, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                      : `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                  }}
                  suppressHydrationWarning
                  onMouseEnter={(e) => {
                    if (!showQuickPlaylist) {
                      e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                      e.currentTarget.style.boxShadow = `0 8px 24px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!showQuickPlaylist) {
                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                      e.currentTarget.style.boxShadow = `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`;
                    }
                  }}
                >
                  <svg className="w-5 h-5" fill={showQuickPlaylist ? '#fbbf24' : 'currentColor'} stroke={showQuickPlaylist ? '#fbbf24' : 'currentColor'} strokeWidth={showQuickPlaylist ? 0 : 1.5} viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </svg>
                  {playlistCount > 0 && (
                    <span 
                      className="absolute -top-1.5 -right-1.5 bg-gradient-to-br from-yellow-400 to-yellow-600 text-black text-[10px] font-extrabold rounded-full min-w-[20px] h-5 flex items-center justify-center border-2 border-black shadow-lg animate-pulse"
                      style={{
                        boxShadow: '0 2px 8px rgba(251, 191, 36, 0.6), 0 0 0 2px rgba(0, 0, 0, 0.3)',
                        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                      }}
                      title={`${playlistCount} ${playlistCount === 1 ? 'música na playlist' : 'músicas na playlist'}`}
                    >
                      {playlistCount > 99 ? '99+' : playlistCount}
                    </span>
                  )}
                </button>
                <button
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-105 backdrop-blur-md hover:shadow-lg"
                  onClick={() => setShowPlaylistManager(true)}
                  aria-label="Gerenciar playlists"
                  type="button"
                  style={{
                    background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                    color: themeColors.primary,
                    border: `1px solid ${themeColors.border}`,
                    boxShadow: `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                  }}
                  suppressHydrationWarning
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
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
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
                  suppressHydrationWarning
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
            <div className={`transition-all duration-300 max-w-7xl mx-auto ${minimized ? 'h-0 overflow-hidden' : 'p-4 md:p-3 sm:p-2 mt-6 md:mt-5 sm:mt-4'}`}>
              <form onSubmit={handleSubmit} className="space-y-4 md:space-y-3 sm:space-y-2">
                {/* Linha principal - URL e controles */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-3 sm:gap-2 max-w-5xl lg:ml-[74px] md:ml-[64px] sm:ml-0">
                  {/* Campo URL */}
                  <div className="lg:col-span-5">
                    <label className="block text-sm font-medium mb-2 text-white">
                      URL do YouTube
                    </label>
                    <div className="relative">
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="w-full h-11 md:h-10 sm:h-9 px-4 md:px-3 sm:px-2 py-2 pr-10 rounded-xl text-white transition-all duration-200 focus:outline-none backdrop-blur-md placeholder-zinc-400 focus:ring-2 focus:ring-emerald-500/50"
                        style={{
                          background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                          border: `1px solid ${isLoadingVideoInfo ? themeColors.primary : themeColors.border}`,
                          boxShadow: isLoadingVideoInfo
                            ? `0 4px 12px ${themeColors.primary}40, 0 0 0 1px ${themeColors.primaryLight}, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                            : url 
                              ? `0 4px 12px ${themeColors.primary}25, 0 0 0 1px ${themeColors.primaryLight}, inset 0 1px 0 rgba(255, 255, 255, 0.1)` 
                              : `0 4px 12px ${themeColors.primary}15, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                        }}
                        placeholder="https://www.youtube.com/watch?v=..."
                        required
                        disabled={isLoadingVideoInfo}
                        suppressHydrationWarning
                      />
                      {isLoadingVideoInfo && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <LoadingSpinner size="xs" variant="dots" isLoading={true} themeColors={themeColors} />
                        </div>
                      )}
                    </div>
                    {isLoadingVideoInfo && url && (
                      <div className="mt-1.5 text-xs flex items-center gap-1.5" style={{ color: themeColors.primary }}>
                        <LoadingSpinner size="xs" variant="pulse" isLoading={true} themeColors={themeColors} />
                        <span>Buscando informações do vídeo...</span>
                      </div>
                    )}
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
                      suppressHydrationWarning
                    >
                      <option value="flac" style={{ backgroundColor: '#18181b', color: '#ffffff' }} suppressHydrationWarning>FLAC</option>
                      <option value="mp3" style={{ backgroundColor: '#18181b', color: '#ffffff' }} suppressHydrationWarning>MP3</option>
                    </select>
                  </div>

                  {/* Pasta */}
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium mb-2 text-white">
                      Pasta
                    </label>
                    <button
                      type="button"
                      onClick={handleSelectFolder}
                      className="w-full h-11 md:h-10 sm:h-9 flex items-center justify-between gap-2 px-3 md:px-2 rounded-xl transition-all duration-200 hover:scale-105 text-sm font-medium backdrop-blur-md hover:shadow-lg group relative"
                      style={{
                        background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                        color: themeColors.primary,
                        border: `1px solid ${themeColors.border}`,
                        boxShadow: `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                      }}
                      suppressHydrationWarning
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                        e.currentTarget.style.boxShadow = `0 8px 24px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                        e.currentTarget.style.boxShadow = `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`;
                      }}
                      title={currentFolderPath ? `Pasta atual: ${currentFolderPath}\nClique para trocar de pasta` : 'Selecionar pasta de downloads'}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                        <FontAwesomeIcon icon={faFolderOpen} className="w-4 h-4 flex-shrink-0" />
                        <span 
                          className="truncate text-left flex-1 whitespace-nowrap overflow-hidden text-ellipsis" 
                          style={{ fontSize: '0.875rem', lineHeight: '1.25rem' }}
                        >
                          {currentFolderPath || 'Selecionar pasta'}
                        </span>
                      </div>
                      <svg 
                        className="w-4 h-4 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                        style={{ marginLeft: 'auto' }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
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
                      suppressHydrationWarning
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
                        suppressHydrationWarning
                      >
                        <div 
                          className="w-5 h-5 bg-white rounded-full transition-all absolute top-0.5 left-0.5 shadow-lg"
                          style={{
                            transform: enrichWithBeatport ? 'translateX(24px)' : 'translateX(0px)',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.1)'
                          }}
                          suppressHydrationWarning
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
                        suppressHydrationWarning
                      >
                        <div 
                          className="w-5 h-5 bg-white rounded-full transition-all absolute top-0.5 left-0.5 shadow-lg"
                          style={{
                            transform: showBeatportPage ? 'translateX(24px)' : 'translateX(0px)',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.1)'
                          }}
                          suppressHydrationWarning
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
                suppressHydrationWarning
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

          </div>
        </div>
      </div>

      {/* Modal de Importar Playlist - renderizado fora do container com overflow */}
      <PlaylistTextModal
        isOpen={showPlaylistModal}
        onClose={() => setShowPlaylistModal(false)}
        themeColors={themeColors}
      />
      
      {/* Modal de Busca no YouTube Music */}
      <YouTubeSearchModal
        isOpen={showYouTubeSearchModal}
        onClose={() => setShowYouTubeSearchModal(false)}
        themeColors={themeColors}
      />
      
      {/* Quick Playlist Panel */}
      {showQuickPlaylist && (
        <QuickPlaylistPanel 
          isOpen={showQuickPlaylist} 
          onClose={() => setShowQuickPlaylist(false)} 
        />
      )}
      
      {/* Playlist Manager */}
      <PlaylistManager 
        isOpen={showPlaylistManager} 
        onClose={() => setShowPlaylistManager(false)} 
      />
    </div>
  );
} 