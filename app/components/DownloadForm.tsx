'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useDownload } from '../contexts/DownloadContext';
import DownloadQueue from './DownloadQueue';

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
  // Estado para seleção de faixas na playlist (preview)
  const [selectedTracks, setSelectedTracks] = useState<number[]>([]);
  const [format, setFormat] = useState('mp3');
  const [enrichWithBeatport, setEnrichWithBeatport] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  // Adicionar novo estado para steps detalhados
  const [downloadSteps, setDownloadSteps] = useState<string[]>([]);
  const [playerOpen, setPlayerOpen] = useState(false);

  const selectDownloadsFolder = async () => {
    try {
      // @ts-ignore - showDirectoryPicker é uma API experimental
      const directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads'
      });
      // Salvar a preferência no localStorage
      localStorage.setItem('customDownloadsPath', directoryHandle.name);
      // Atualizar a API com o novo caminho
      await fetch('/api/set-downloads-path', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: directoryHandle.name }),
      });
      // Recarregar a lista de arquivos
      window.dispatchEvent(new CustomEvent('refresh-files'));
    } catch (error) {
      console.error('Erro ao selecionar pasta:', error);
    }
  };

  useEffect(() => {
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
      const isPlaylist = url.includes('list=');
      if (isPlaylist) {
        const playlistId = getPlaylistId(url);
        if (!playlistId) return;
        try {
          setFetchingInfo(true);
          setError('');
          const endpoint = `/api/playlist-info?id=${encodeURIComponent(playlistId)}`;
          const response = await fetch(endpoint);
          const data = await response.json();
          if (data.error) throw new Error(data.error);
          setVideoInfo({ ...data, isPlaylist: true });
        } catch (err) {
          setVideoInfo(null);
          setError(err instanceof Error ? err.message : 'Erro ao buscar informações');
        } finally {
          setFetchingInfo(false);
        }
      } else {
        const videoId = getVideoId(url);
        if (!videoId) return;
        try {
          setFetchingInfo(true);
          setError('');
          const endpoint = `/api/video-info?id=${encodeURIComponent(videoId)}`;
          const response = await fetch(endpoint);
          const data = await response.json();
          if (data.error) throw new Error(data.error);
          setVideoInfo({ ...data, isPlaylist: false });
        } catch (err) {
          setVideoInfo(null);
          setError(err instanceof Error ? err.message : 'Erro ao buscar informações');
        } finally {
          setFetchingInfo(false);
        }
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
      // Atualize o status detalhado durante o polling
      if (data.videos) {
        const total = data.videos.length;
        const completed = data.videos.filter((v: any) => v.status === 'success' || v.status === 'existing').length;
        const errors = data.videos.filter((v: any) => v.status === 'error').length;
        setStatus(`Baixando playlist: ${completed}/${total} concluídos, ${errors} erros`);
        setDownloadSteps(prev => {
          // Evita adicionar passos duplicados
          const newStep = `Baixando playlist: ${completed}/${total} concluídos, ${errors} erros`;
          if (prev[prev.length - 1] !== newStep) {
            return [...prev, newStep];
          }
          return prev;
        });
      }
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
        setLoading(false);
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

  // Resetar seleção ao mudar de playlist
  useEffect(() => {
    if (videoInfo?.isPlaylist && videoInfo.videos) {
      setSelectedTracks(videoInfo.videos.map((_, idx) => idx)); // Seleciona todas por padrão
    } else {
      setSelectedTracks([]);
    }
  }, [videoInfo]);

  // Função para alternar seleção
  function toggleTrack(idx: number) {
    setSelectedTracks(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  }

  // Função auxiliar para extrair YouTube ID de uma URL
  function extractYoutubeId(url: string) {
    const match = url.match(/(?:youtu.be\/|youtube.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^#&?]+)/i);
    return match ? match[1] : '';
  }

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
      // Limpar imediatamente
      setUrl('');
      setVideoInfo(null);

      // Verificar se podemos iniciar o download imediatamente
      if (activeDownloads < maxConcurrentDownloads) {
        startDownload();
        window.dispatchEvent(new CustomEvent('open-download-queue'));
        const endpoint = url.includes('list=') ? 'playlist' : 'download';
        if (endpoint === 'download') {
          setDownloadSteps(prev => [...prev, "Baixando áudio..."]);
        }
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
          setDownloadSteps(prev => [...prev, `Baixando playlist: ${completed}/${total} concluídos, ${errors} erros`]);
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
          setDownloadSteps([]);
        } else {
          // Download individual
          for (let i = 0; i <= 100; i += 5) {
            await new Promise(resolve => setTimeout(resolve, 100));
            setProgress(i);
            setStatus(`Processando... ${i}%`);
            if (currentDownloadId) {
              updateQueueItem(currentDownloadId, { status: 'downloading', progress: i });
            }
          }
          setDownloadSteps(prev => [...prev, "Gravando metadados..."]);
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
          setDownloadSteps(prev => [...prev, "Concluído!"]);
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
      setDownloadSteps(prev => [...prev, "Erro no download"]);
      if (currentDownloadId) {
        updateQueueItem(currentDownloadId, { 
          status: 'error', 
          error: err instanceof Error ? err.message : 'Erro ao processar',
          progress: 0 
        });
      }
      finishDownload();
    } finally {
      // Para downloads individuais, pode setar loading false aqui
      if (!videoInfo?.isPlaylist) setLoading(false);
      // Para playlists, loading será setado no polling
    }
  };

  // No useEffect do componente, garantir showQueue = false ao montar
  useEffect(() => { setShowQueue(false); }, []);

  return (
    <div
      className={`w-full mx-auto transition-all duration-300 rounded-2xl bg-zinc-900 relative ${minimized ? '' : ''}`}
    >
      <div className="flex flex-row gap-2 items-start justify-between">
            {/* Status detalhado logo abaixo do campo de URL */}
            {(status || downloadSteps.length > 0 || (videoInfo?.isPlaylist && loading)) && (
              <div className="mt-2">
                {/* Sempre mostra o status principal */}
                {status && (
                  <div className={`text-sm flex items-center gap-2 ${success ? 'text-green-400' : error ? 'text-red-400' : 'text-blue-400'}`}>{status}</div>
                )}
                {/* Passos detalhados para playlist ou individual */}
                {downloadSteps.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    {downloadSteps[downloadSteps.length - 1]}
                  </div>
                )}
              </div>
            )}
        {/* Barra/status de download sempre visível */}
        <div className="flex-1 min-w-0 flex items-center gap-3">
          {/* Playlist: label de progresso à esquerda da barra de status */}
          {videoInfo?.isPlaylist && (
            <div className="flex items-center gap-2 min-w-[180px]">
              {loading && (
                <span className="flex items-center gap-1 text-blue-400 text-sm">
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /></svg>
                  {playlistStatus?.videos ? (
                    <span>
                      Baixando {playlistStatus.videos.filter((v: any) => v.status === 'success' || v.status === 'existing').length} de {playlistStatus.videos.length}
                    </span>
                  ) : (
                    <span>Obtendo informações...</span>
                  )}
                </span>
              )}
              {!loading && playlistStatus?.status === 'done' && (
                <span className="flex items-center gap-1 text-green-400 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Concluído!
                </span>
              )}
            </div>
          )}
          {/* Mensagem de status sempre acima do input */}
          {status && (
            <div className={`text-sm p-3 rounded-md mb-2 flex-1 ${success ? 'text-green-500 bg-green-900/20' : error ? 'text-red-500 bg-red-900/20' : 'text-blue-400 bg-blue-900/20'}`}>
              {status}
            </div>
          )}
          {error && !status && (
            <div className="text-red-500 text-sm bg-red-900/20 p-3 rounded-md mb-2 flex-1">
              <p className="font-medium">Erro:</p>
              <p>{error}</p>
            </div>
          )}
        </div>
        <div className="flex gap-2 items-center flex-shrink-0">
          <button
            className="bg-zinc-800 rounded-full p-2 hover:bg-zinc-700 transition" 
            onClick={() => setShowQueue((q) => !q)}
            aria-label={showQueue ? 'Fechar fila de downloads' : 'Abrir fila de downloads'}
            type="button"
          >
            {/* Ícone de lista/fila */}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" /></svg>
          </button>
          <button
            className="bg-zinc-800 rounded-full p-2 hover:bg-zinc-700 transition"
            onClick={() => setMinimized((m) => !m)}
            aria-label={minimized ? 'Expandir' : 'Minimizar'}
            type="button"
          >
            {/* Ícone de minimizar/expandir */}
            {minimized ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            )}
          </button>
        </div>
      </div>
      {/* Linha principal do motor de busca e campos */}
      {!minimized && (
        <form onSubmit={handleSubmit} className="flex flex-row gap-1 items-stretch mt-2 w-full"> {/* mt-2 para espaçamento após os botões */}
          <div className="flex-[3] flex flex-col justify-end">
            <label className="block text-xs font-medium text-gray-300 mb-1">URL do YouTube</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full h-11 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white"
              placeholder="https://www.youtube.com/watch?v=..."
              required
            />
          </div>
          <div className="flex-[0_0_auto] flex flex-col justify-end min-w-[120px]">
            <label className="block text-xs font-medium text-gray-300 mb-1">Formato</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="h-11 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white"
            >
              <option value="mp3">MP3 (AAC)</option>
              <option value="flac">FLAC (Lossless)</option>
              <option value="aiff">AIFF (Lossless)</option>
              <option value="wav">WAV (Lossless)</option>
            </select>
          </div>
          <div className="flex-[0_0_auto] flex flex-col justify-end">
            <label className="block text-xs font-medium text-gray-300 mb-1">Pasta</label>
            <button
              onClick={selectDownloadsFolder}
              className="h-11 px-4 py-2 rounded-md text-sm font-medium bg-zinc-700 text-white hover:bg-zinc-600 transition-all duration-200 flex items-center gap-2"
              title="Selecionar pasta de downloads"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              Selecionar Pasta
            </button>
          </div>
          {/* Ajuste do toggle Beatport para alinhar corretamente */}
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
              disabled={loading}
              className="h-9 px-4 flex flex-row items-center justify-center gap-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all shadow disabled:opacity-50"
              aria-label="Baixar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
              </svg>
              <span className="text-sm font-medium">Baixar</span>
            </button>
          </div>
        </form>
      )}



      {/* Quando expandido, mostra o preview do vídeo/playlist e toasts normalmente */}
      {!minimized && (
        <>
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
              {/* Embed do vídeo - exibe apenas UM embed se não for playlist */}
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
              {/* Preview para playlist - renderiza só os embeds das faixas, se houver youtubeUrl */}
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
                        {/* Embed do vídeo se houver YouTube ID */}
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

          {videoInfo?.isPlaylist && loading && playlistStatus && playlistStatus.videos && (
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
        </>
      )}

      {/* Exemplo de exibição da fila de downloads (pode ser substituído pelo seu componente real) */}
      {showQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <DownloadQueue onClose={() => setShowQueue(false)} playerOpen={playerOpen} />
        </div>
      )}
    </div>
  );
} 