'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useDownload } from '../contexts/DownloadContext';

interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: string;
  isPlaylist?: boolean;
  playlistTitle?: string;
  videos?: Array<{
    title: string;
    duration: string;
  }>;
}

export default function DownloadForm() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingInfo, setFetchingInfo] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [playlistStatus, setPlaylistStatus] = useState<any>(null);
  const [notified, setNotified] = useState<string[]>([]);
  const [toasts, setToasts] = useState<{ title: string }[]>([]);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const { 
    addToQueue, 
    updateQueueItem, 
    activeDownloads, 
    maxConcurrentDownloads,
    startDownload,
    finishDownload
  } = useDownload();
  const [currentDownloadId, setCurrentDownloadId] = useState<string | null>(null);

  useEffect(() => {
    const getVideoId = (url: string) => {
      const videoMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^#&?]+)/i);
      if (videoMatch) {
        return videoMatch[1];
      }
      return null;
    };

    const fetchVideoInfo = async () => {
      const videoId = getVideoId(url);
      if (!videoId) return;
      try {
        setFetchingInfo(true);
        setError('');
        const endpoint = `/api/video-info?id=${encodeURIComponent(videoId)}`;
        const response = await fetch(endpoint);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        setVideoInfo({ ...data, isPlaylist: url.includes('list=') });
      } catch (err) {
        setVideoInfo(null);
        setError(err instanceof Error ? err.message : 'Erro ao buscar informações');
      } finally {
        setFetchingInfo(false);
      }
    };

    if (url) {
      const timer = setTimeout(() => {
        fetchVideoInfo();
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setVideoInfo(null);
      setError('');
    }
  }, [url]);

  // Polling do status da playlist
  useEffect(() => {
    if (!loading || !videoInfo?.isPlaylist) return;
    pollingRef.current = setInterval(async () => {
      const res = await fetch('/api/playlist-status');
      const data = await res.json();
      setPlaylistStatus(data);
      // Notificar novas músicas baixadas
      if (data.videos) {
        data.videos.forEach((v: any) => {
          if (v.status === 'success' && !notified.includes(v.title)) {
            setToasts((prev) => [...prev, { title: v.title }]);
            setNotified((prev) => [...prev, v.title]);
            // Atualizar lista de arquivos
            const event = new CustomEvent('refresh-files');
            window.dispatchEvent(event);
          }
        });
      }
      // Parar polling se terminou
      if (data.status === 'done') {
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    }, 2000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [loading, videoInfo?.isPlaylist, notified]);

  // Toast auto-hide
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 4000);
    return () => clearTimeout(timer);
  }, [toasts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);
    setProgress(0);
    setStatus('Iniciando download...');

    try {
      // Adicionar à fila
      const queueItem = {
        url,
        title: videoInfo?.title || 'Download em andamento',
        isPlaylist: videoInfo?.isPlaylist || false,
        playlistItems: videoInfo?.videos?.map(v => ({
          title: v.title,
          status: 'pending' as const,
          progress: 0,
        })),
      };
      const newItem = addToQueue(queueItem);
      setCurrentDownloadId(newItem.id);
      // Limpar imediatamente
      setUrl('');
      setVideoInfo(null);

      // Verificar se podemos iniciar o download imediatamente
      if (activeDownloads < maxConcurrentDownloads) {
        startDownload();
        const endpoint = url.includes('list=') ? 'playlist' : 'download';
        const response = await fetch(`/api/${endpoint}?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Erro ao processar');
        }

        if (endpoint === 'playlist' && data.results) {
          const total = data.results.length;
          const completed = data.results.filter((r: any) => r.status === 'success' || r.status === 'existing').length;
          const errors = data.results.filter((r: any) => r.status === 'error').length;
          setProgress(100);
          setStatus(`Download concluído! ${completed}/${total} músicas baixadas, ${errors} erros`);
          setSuccess(true);
          if (currentDownloadId) {
            // Buscar metadados no MusicBrainz
            let metadata = undefined;
            if (videoInfo?.title) {
              try {
                const mbRes = await fetch('/api/musicbrainz-metadata', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: videoInfo.title, artist: '' })
                });
                const mbMeta = await mbRes.json();
                if (mbMeta && Object.keys(mbMeta).length > 0) {
                  metadata = mbMeta;
                }
              } catch {}
            }
            // Se encontrou metadados, salva; senão, segue fluxo normal
            if (metadata) {
              updateQueueItem(currentDownloadId, { status: 'completed', progress: 100, metadata });
            } else {
              updateQueueItem(currentDownloadId, { status: 'completed', progress: 100 });
            }
          }
        } else {
          for (let i = 0; i <= 100; i += 5) {
            await new Promise(resolve => setTimeout(resolve, 100));
            setProgress(i);
            setStatus(`Processando... ${i}%`);
            if (currentDownloadId) {
              updateQueueItem(currentDownloadId, { status: 'downloading', progress: i });
            }
          }
          setProgress(100);
          setStatus('Download concluído!');
          setSuccess(true);
          if (currentDownloadId) {
            // Buscar metadados no MusicBrainz
            let metadata = undefined;
            if (videoInfo?.title) {
              try {
                const mbRes = await fetch('/api/musicbrainz-metadata', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: videoInfo.title, artist: '' })
                });
                const mbMeta = await mbRes.json();
                if (mbMeta && Object.keys(mbMeta).length > 0) {
                  metadata = mbMeta;
                }
              } catch {}
            }
            // Se encontrou metadados, salva; senão, segue fluxo normal
            if (metadata) {
              updateQueueItem(currentDownloadId, { status: 'completed', progress: 100, metadata });
            } else {
              updateQueueItem(currentDownloadId, { status: 'completed', progress: 100 });
            }
          }
        }
        finishDownload();
        const event = new CustomEvent('refresh-files');
        window.dispatchEvent(event);
      } else {
        setStatus('Download em fila...');
        if (currentDownloadId) {
          updateQueueItem(currentDownloadId, { status: 'queued' });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar');
      setProgress(0);
      setStatus('Erro no download');
      if (currentDownloadId) {
        updateQueueItem(currentDownloadId, { 
          status: 'error', 
          error: err instanceof Error ? err.message : 'Erro ao processar',
          progress: 0 
        });
      }
      finishDownload();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-slide-up">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Cole a URL do YouTube aqui"
            className="w-full rounded-md bg-zinc-800 border-zinc-700 text-white placeholder-gray-400 focus:border-zinc-600 focus:ring-zinc-600 px-3 py-2 text-sm transition-all duration-200 hover:border-zinc-600"
            required
          />
          {fetchingInfo && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
        {videoInfo && (
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-white text-black rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-medium transform hover:scale-105 active:scale-95"
          >
            {loading ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                <span>Processando...</span>
              </div>
            ) : (
              `Baixar ${videoInfo.isPlaylist ? 'Playlist' : 'MP3'}`
            )}
          </button>
        )}
      </div>

      {videoInfo && (
        <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-800 animate-fade-in">
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
        </div>
      )}

      {loading && (
        <div className="space-y-2 animate-fade-in">
          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-white h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-400 text-center animate-pulse-slow">{status}</p>
        </div>
      )}

      {error && (
        <div className="text-red-400 text-xs animate-fade-in flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {success && (
        <div className="text-green-400 text-xs text-center animate-fade-in flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Download concluído com sucesso!
        </div>
      )}

      {loading && playlistStatus && playlistStatus.videos && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toasts.map((toast, idx) => (
            <div key={idx} className="flex items-center bg-zinc-900 text-white px-4 py-2 rounded shadow-lg gap-2 animate-fade-in">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <span className="font-medium">{toast.title}</span>
            </div>
          ))}
        </div>
      )}
    </form>
  );
} 