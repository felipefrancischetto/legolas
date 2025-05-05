"use client";

import { useState } from "react";

interface Track {
  title: string;
  youtubeId: string | null;
  youtubeUrl: string | null;
  ignored: boolean;
}

interface PlaylistTracklistModalProps {
  open: boolean;
  onClose: () => void;
}

interface DownloadStatus {
  id: string;
  title: string;
  status: 'pending' | 'downloading' | 'success' | 'error';
  progress?: number;
}

export default function PlaylistTracklistModal({ open, onClose }: PlaylistTracklistModalProps) {
  const [playlistText, setPlaylistText] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<string[]>([]);
  const [downloadStatuses, setDownloadStatuses] = useState<DownloadStatus[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    setError("");
    setTracks([]);
    
    try {
      const trackTitles = playlistText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      const searchPromises = trackTitles.map(async (title) => {
        const res = await fetch("/api/youtube-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: title }),
        });
        const data = await res.json();
        return {
          title,
          youtubeId: data.videoId,
          youtubeUrl: data.videoUrl,
          ignored: false
        };
      });

      const results = await Promise.all(searchPromises);
      setTracks(results);
    } catch (err) {
      setError("Erro ao buscar as músicas.");
    }
    
    setLoading(false);
  };

  const toggleIgnore = (index: number) => {
    setTracks(prev => prev.map((track, i) => 
      i === index ? { ...track, ignored: !track.ignored } : track
    ));
  };

  const updateDownloadStatus = (id: string, status: Partial<DownloadStatus>) => {
    setDownloadStatuses(prev => 
      prev.map(s => s.id === id ? { ...s, ...status } : s)
    );
  };

  const handleDownload = async (track: Track) => {
    if (!track.youtubeUrl || track.ignored) return;
    
    const downloadId = `${track.title}-${Date.now()}`;
    setDownloadStatuses(prev => [...prev, {
      id: downloadId,
      title: track.title,
      status: 'pending'
    }]);
    
    try {
      updateDownloadStatus(downloadId, { status: 'downloading' });
      const response = await fetch(`/api/download?url=${encodeURIComponent(track.youtubeUrl)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao processar');
      }

      updateDownloadStatus(downloadId, { status: 'success' });
      const event = new CustomEvent('refresh-files');
      window.dispatchEvent(event);
    } catch (err) {
      updateDownloadStatus(downloadId, { 
        status: 'error'
      });
      setError(`Erro ao baixar ${track.title}`);
    }
  };

  const handleDownloadAll = async () => {
    const tracksToDownload = tracks.filter(t => t.youtubeUrl && !t.ignored);
    if (tracksToDownload.length === 0) return;

    // Inicializar status para todas as músicas
    const initialStatuses = tracksToDownload.map(track => ({
      id: `${track.title}-${Date.now()}`,
      title: track.title,
      status: 'pending' as const
    }));
    setDownloadStatuses(initialStatuses);

    // Enviar todas as requisições de uma vez
    const downloadPromises = tracksToDownload.map((track, index) => {
      const statusId = initialStatuses[index].id;
      return fetch(`/api/download?url=${encodeURIComponent(track.youtubeUrl!)}`)
        .then(async response => {
          updateDownloadStatus(statusId, { status: 'downloading' });
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Erro ao processar');
          }
          updateDownloadStatus(statusId, { status: 'success' });
          return { track, success: true };
        })
        .catch(error => {
          updateDownloadStatus(statusId, { status: 'error' });
          return { track, success: false, error };
        });
    });

    try {
      await Promise.all(downloadPromises);
      const event = new CustomEvent('refresh-files');
      window.dispatchEvent(event);
    } catch (err) {
      setError('Erro ao iniciar download em lote');
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-fade-in">
        <div className="w-full max-w-4xl max-h-[90vh] bg-zinc-900 rounded-xl border border-zinc-800 p-6 shadow-lg relative animate-slide-up overflow-hidden flex flex-col">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl"
            aria-label="Fechar"
          >
            ×
          </button>
          <h1 className="text-2xl font-bold text-white mb-6">Importar Playlist</h1>
          
          <div className="flex flex-col gap-4 flex-1 overflow-hidden">
            <textarea
              value={playlistText}
              onChange={e => setPlaylistText(e.target.value)}
              placeholder="Cole aqui a lista de músicas (uma por linha)"
              className="w-full h-32 p-3 rounded-md bg-zinc-800 border border-zinc-700 text-white placeholder-gray-400 focus:border-zinc-600 focus:ring-zinc-600 transition-all duration-200"
            />
            
            <button
              onClick={handleSearch}
              disabled={loading || !playlistText.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all font-medium shadow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Buscando..." : "Buscar músicas"}
            </button>

            {error && <div className="text-red-400">{error}</div>}

            {tracks.length > 0 && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-white">Músicas encontradas:</h2>
                  <button
                    onClick={handleDownloadAll}
                    disabled={downloading.length > 0}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-all font-medium shadow disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloading.length > 0 ? "Baixando..." : "Baixar selecionadas"}
                  </button>
                </div>
                
                <div className="space-y-4 overflow-y-auto flex-1 pr-2">
                  {tracks.map((track, i) => (
                    <div key={i} className={`flex flex-col gap-2 bg-zinc-800 rounded p-4 ${track.ignored ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!track.ignored}
                            onChange={() => toggleIgnore(i)}
                            disabled={!track.youtubeId}
                            className="sr-only peer"
                          />
                          <div className={`w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 ${!track.youtubeId ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
                        </label>
                        <span className="text-gray-300 font-medium">{track.title}</span>
                      </div>
                      <button
                        onClick={() => handleDownload(track)}
                        disabled={!track.youtubeUrl || downloading.includes(track.title) || track.ignored}
                        className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {downloading.includes(track.title) ? "Baixando..." : "Baixar"}
                      </button>
                      {track.youtubeId && (
                        <div className="w-full max-w-md mx-auto aspect-video">
                          <iframe
                            src={`https://www.youtube.com/embed/${track.youtubeId}`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="w-full h-full rounded"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Painel de status de download */}
      {downloadStatuses.length > 0 && (
        <div className={`fixed right-4 top-4 z-50 flex flex-col gap-2 transition-all duration-300 ${isMinimized ? 'translate-y-[-90%]' : ''}`}>
          <div className="bg-zinc-900 rounded-lg shadow-lg p-4 w-80">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-white font-medium">Downloads em andamento</h3>
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="text-gray-400 hover:text-white"
              >
                {isMinimized ? '▼' : '▲'}
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {downloadStatuses.map(status => (
                <div key={status.id} className="flex items-center gap-2 text-sm">
                  <div className={`w-2 h-2 rounded-full ${
                    status.status === 'success' ? 'bg-green-500' :
                    status.status === 'error' ? 'bg-red-500' :
                    status.status === 'downloading' ? 'bg-blue-500' :
                    'bg-gray-500'
                  }`} />
                  <span className="text-gray-300 truncate flex-1">{status.title}</span>
                  <span className={`text-xs ${
                    status.status === 'success' ? 'text-green-500' :
                    status.status === 'error' ? 'text-red-500' :
                    status.status === 'downloading' ? 'text-blue-500' :
                    'text-gray-500'
                  }`}>
                    {status.status === 'success' ? 'Concluído' :
                     status.status === 'error' ? 'Erro' :
                     status.status === 'downloading' ? 'Baixando...' :
                     'Pendente'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
} 