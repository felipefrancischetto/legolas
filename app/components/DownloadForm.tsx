'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useDownload } from '../contexts/DownloadContext';
import { useFile } from '../contexts/FileContext';
import DownloadQueue from './DownloadQueue';
import DownloadStatusIndicator from './DownloadStatusIndicator';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolderOpen } from '@fortawesome/free-solid-svg-icons';

interface DownloadFormProps {
  minimized: boolean;
  setMinimized: (minimized: boolean) => void;
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

export default function DownloadForm({ minimized, setMinimized }: DownloadFormProps) {
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<number[]>([]);
  const [format, setFormat] = useState('flac');
  const [enrichWithBeatport, setEnrichWithBeatport] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [currentDownloadId, setCurrentDownloadId] = useState<string | null>(null);

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

  // Obter dados do download atual
  const currentDownload = currentDownloadId ? getCurrentDownload(currentDownloadId) : null;
  const playlistProgressData = currentDownloadId ? getPlaylistProgressData(currentDownloadId) : null;

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

  useEffect(() => { setShowQueue(false); }, []);

  return (
    <div className={`w-full mx-auto transition-all duration-300 rounded-2xl bg-zinc-900 relative ${minimized ? '' : ''}`}>
      {/* Status de download usando dados do contexto */}
      {currentDownload && (
        <div className="mb-4">
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

      <div className={`flex flex-row gap-2 items-start justify-between${minimized ? ' hidden' : ''}`}>
        <div className="flex-1 min-w-0"></div>
        <div className="flex gap-2 items-center flex-shrink-0">
          <button
            className="bg-zinc-800 rounded-full p-2 hover:bg-zinc-700 transition" 
            onClick={() => setShowQueue((q) => !q)}
            aria-label={showQueue ? 'Fechar fila de downloads' : 'Abrir fila de downloads'}
            type="button"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" /></svg>
          </button>
          <button
            className="bg-zinc-800 rounded-full p-2 hover:bg-zinc-700 transition"
            onClick={() => setMinimized(!minimized)}
            aria-label={minimized ? 'Expandir' : 'Minimizar'}
            type="button"
          >
            {minimized ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            )}
          </button>
        </div>
      </div>
      
      {/* Formulário principal OU header compacto minimizado */}
      {!minimized ? (
        <form onSubmit={handleSubmit} className="flex flex-row gap-1 items-stretch mt-2 w-full">
          <div className="flex-[3] flex flex-col justify-end">
            <label className="block text-xs font-medium text-gray-300 mb-1">URL do YouTube</label>
            <div className="relative">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full h-11 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white pr-10"
                placeholder="https://www.youtube.com/watch?v=..."
                required
              />
            </div>
          </div>
          <div className="flex-[0_0_auto] flex flex-col justify-end min-w-[120px]">
            <label className="block text-xs font-medium text-gray-300 mb-1">Formato</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="h-11 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white"
            >
              <option value="flac">FLAC</option>
              <option value="mp3">MP3</option>
            </select>
          </div>
          <div className="flex-[0_0_auto] flex flex-col justify-end">
            <label className="block text-xs font-medium text-gray-300 mb-1">Pasta</label>
            <div className="relative flex-grow min-w-[150px]">
              <button
                type="button"
                onClick={selectDownloadsFolder}
                className="w-full flex items-center justify-between bg-zinc-700 text-white px-4 py-2 rounded-md hover:bg-zinc-600 transition-all duration-200 text-sm"
              >
                <FontAwesomeIcon icon={faFolderOpen} className="mr-2" />
                Selecionar Pasta
              </button>
            </div>
          </div>
          <div className="flex-[0_0_auto] flex flex-col justify-end min-w-[110px]">
            <label className="block text-xs font-medium text-gray-300 mb-1 sr-only">Beatport</label>
            <div className="flex items-center h-11">
              <label className="relative inline-flex items-center cursor-pointer h-6 m-0">
                <input
                  type="checkbox"
                  checked={enrichWithBeatport}
                  onChange={(e) => setEnrichWithBeatport(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:bg-blue-600 peer-focus:outline-none transition-all relative">
                  <div className={`w-5 h-5 bg-white rounded-full transition-all absolute top-0.5 left-0.5 ${enrichWithBeatport ? 'translate-x-5' : ''}`}></div>
                </div>
                <span className="ml-2 text-sm font-medium text-gray-300">Beatport</span>
              </label>
            </div>
          </div>
          <div className="flex-[0_0_auto] flex flex-col justify-end min-w-[150px]">
            <label className="block text-xs font-medium text-gray-300 mb-1 sr-only">Iniciar</label>
            <button
              type="submit"
              disabled={downloadStatus.loading || !videoInfo}
              className="h-9 px-4 flex flex-row items-center justify-center gap-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Baixar"
            >
              {downloadStatus.loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm font-medium">Adicionando...</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                  </svg>
                  <span className="text-sm font-medium">Baixar</span>
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="fixed top-0 left-0 w-full z-50 bg-black pointer-events-none border-b border-zinc-800" style={{ boxShadow: 'none' }}>
          <div className="w-full flex justify-center">
            <form
              onSubmit={handleSubmit}
              className="flex flex-row items-center gap-3 w-full max-w-6xl px-4 py-2 pointer-events-auto animate-slide-down"
              style={{ minHeight: 75 }}
            >
              <div className="flex items-center gap-2 mr-2">
                <img src="/legolas_thumb.png" alt="Legolas" className="w-8 h-8 object-contain" />
                <span className="text-lg font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent select-none">Legolas</span>
              </div>
              <div className="flex-1">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full h-10 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white"
                  placeholder="https://www.youtube.com/watch?v=..."
                  required
                />
              </div>
              <button
                type="submit"
                disabled={downloadStatus.loading || !videoInfo}
                className="h-9 px-4 flex flex-row items-center justify-center gap-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Baixar"
              >
                {downloadStatus.loading ? (
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                  </svg>
                )}
              </button>
              <div className="flex gap-2 items-center flex-shrink-0 ml-2">
                <button
                  className="bg-zinc-800 rounded-full p-2 hover:bg-zinc-700 transition"
                  onClick={() => setShowQueue((q) => !q)}
                  aria-label={showQueue ? 'Fechar fila de downloads' : 'Abrir fila de downloads'}
                  type="button"
                  tabIndex={0}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" /></svg>
                </button>
                <button
                  className="bg-zinc-800 rounded-full p-2 hover:bg-zinc-700 transition"
                  onClick={() => setMinimized(!minimized)}
                  aria-label={minimized ? 'Expandir' : 'Minimizar'}
                  type="button"
                  tabIndex={0}
                >
                  {minimized ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview do vídeo/playlist */}
      {!minimized && videoInfo && (
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-800 animate-fade-in mt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative w-full sm:w-24 h-24 flex-shrink-0">
              <Image
                src={videoInfo.thumbnail}
                alt={videoInfo.title}
                fill
                className="rounded-lg object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-white text-sm truncate">{videoInfo.title}</h3>
              {videoInfo.isPlaylist ? (
                <p className="text-xs text-gray-400 mt-1">
                  Playlist com {videoInfo.videos?.length} músicas
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">
                  Duração: {videoInfo.duration}
                </p>
              )}
            </div>
          </div>
          
          {/* Embed do vídeo individual */}
          {!videoInfo.isPlaylist && (
            <div className="w-full max-w-2xl mx-auto aspect-video mt-4">
              <iframe
                src={`https://www.youtube.com/embed/${(() => {
                  const match = url.match(/(?:youtu.be\/|youtube.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^#&?]+)/i);
                  return match ? match[1] : '';
                })()}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full rounded"
              />
            </div>
          )}
          
          {/* Preview da playlist */}
          {videoInfo.isPlaylist && videoInfo.videos && videoInfo.videos.length > 0 && (
            <div className="space-y-4 mt-2">
              {videoInfo.videos.map((track, idx) => {
                const youtubeId = track.youtubeUrl ? extractYoutubeId(track.youtubeUrl) : '';
                const key = track.youtubeUrl || track.title || idx;
                return (
                  <div key={key} className={`bg-zinc-900 border border-zinc-700 rounded p-3 ${!selectedTracks.includes(idx) ? 'opacity-50' : ''}`}> 
                    <div className="flex items-center gap-2 mb-2">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTracks.includes(idx)}
                          onChange={() => toggleTrack(idx)}
                          className="sr-only peer"
                        />
                        <div className={`w-8 h-4 bg-zinc-700 rounded-full peer-focus:outline-none peer-checked:bg-blue-600 transition-all relative`}>
                          <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-all ${selectedTracks.includes(idx) ? 'translate-x-4' : ''}`}></div>
                        </div>
                      </label>
                      <div className="font-semibold text-white text-xs truncate flex-1">{track.title}</div>
                      <div className="text-xs text-gray-400">{track.duration}</div>
                    </div>
                    {youtubeId && (
                      <div className="w-full max-w-2xl mx-auto aspect-video mb-2">
                        <iframe
                          src={`https://www.youtube.com/embed/${youtubeId}`}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full rounded"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Fila de downloads */}
      {showQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <DownloadQueue onClose={() => setShowQueue(false)} />
        </div>
      )}
    </div>
  );
} 