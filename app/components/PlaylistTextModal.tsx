"use client";

import { useState } from 'react';
import { useDownload } from '../contexts/DownloadContext';
import { v4 as uuidv4 } from 'uuid';

interface PlaylistTextModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedTrack {
  title: string;
  artist: string;
  timestamp: string;
}

export default function PlaylistTextModal({ isOpen, onClose }: PlaylistTextModalProps) {
  const [playlistText, setPlaylistText] = useState('');
  const [parsedTracks, setParsedTracks] = useState<ParsedTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingTrack, setProcessingTrack] = useState<string | null>(null);

  const { 
    addToQueue, 
    getCurrentDownload,
    getPlaylistProgressData,
    downloadStatus,
    setDownloadStatus,
    toasts,
    removeToast
  } = useDownload();

  const parsePlaylistText = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    const tracks: ParsedTrack[] = [];

    for (const line of lines) {
      // Match pattern: "timestamp - artist, title" or "timestamp - title"
      const match = line.match(/^(\d+:\d+)\s*-\s*(.+)$/);
      if (match) {
        const [_, timestamp, rest] = match;
        const [artist, ...titleParts] = rest.split(',').map(s => s.trim());
        const title = titleParts.join(',').trim();

        tracks.push({
          timestamp,
          artist: artist || 'Artista Desconhecido',
          title: title || rest
        });
      }
    }

    return tracks;
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setPlaylistText(text);
    const tracks = parsePlaylistText(text);
    setParsedTracks(tracks);
  };

  const handleSubmit = async (url: string, title: string) => {
    try {
      setDownloadStatus({ loading: true, error: null, success: false });
      
      const queueItem = {
        url,
        title,
        isPlaylist: false,
        format: "flac",
        enrichWithBeatport: true,
        playlistItems: [],
      };
      
      const newItem = addToQueue(queueItem);
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

  const handleDownload = async (track: ParsedTrack) => {
    try {
      setLoading(true);
      setError(null);
      setProcessingTrack(`${track.artist} - ${track.title}`);

      // 1. Buscar o videoId usando o endpoint local
      const searchRes = await fetch('/api/youtube-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `${track.artist} ${track.title}` })
      });
      const searchData = await searchRes.json();
      if (!searchRes.ok || !searchData.videoId) {
        throw new Error('Nenhum vídeo encontrado no YouTube');
      }
      const videoId = searchData.videoId;

      // 2. Buscar info detalhada pelo endpoint local
      const videoInfoRes = await fetch(`/api/video-info?id=${videoId}`);
      const videoInfo = await videoInfoRes.json();
      if (!videoInfoRes.ok) {
        throw new Error(videoInfo.error || 'Erro ao buscar informações do vídeo');
      }

      // Log para depuração do conteúdo de videoInfo
      console.log('videoInfo retornado:', videoInfo);

      // 3. Iniciar download imediatamente
      if (videoInfo.url) {
        // Chama o endpoint de download
        await fetch(`/api/download?url=${encodeURIComponent(videoInfo.url)}&useBeatport=true`);
        // Adiciona à fila para feedback visual
        addToQueue({ url: videoInfo.url, title: videoInfo.title || `${track.artist} - ${track.title}`, enrichWithBeatport: true });
      } else {
        throw new Error('URL de download não encontrada');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar música');
    } finally {
      setLoading(false);
      setProcessingTrack(null);
    }
  };

  const handleDownloadAll = async () => {
    for (const track of parsedTracks) {
      try {
        setProcessingTrack(`${track.artist} - ${track.title}`);
        const searchRes = await fetch('/api/youtube-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `${track.artist} ${track.title}` })
        });
        const searchData = await searchRes.json();
        if (!searchRes.ok || !searchData.videoId) {
          throw new Error('Nenhum vídeo encontrado no YouTube');
        }
        const videoId = searchData.videoId;

        const videoInfoRes = await fetch(`/api/video-info?id=${videoId}`);
        const videoInfo = await videoInfoRes.json();
        if (!videoInfoRes.ok) {
          throw new Error(videoInfo.error || 'Erro ao buscar informações do vídeo');
        }

        // Log para depuração do conteúdo de videoInfo
        console.log('videoInfo retornado:', videoInfo);

        if (searchData.videoUrl) {
          // Log para depuração
          console.log('Chamando /api/download para', searchData.videoUrl);
          // Chama o endpoint de download para cada música
          await fetch(`/api/download?url=${encodeURIComponent(searchData.videoUrl)}&useBeatport=true`);
          // Adiciona à fila para feedback visual
          addToQueue({ url: searchData.videoUrl, title: videoInfo.title || `${track.artist} - ${track.title}`, enrichWithBeatport: true });
        } else {
          throw new Error('URL de download não encontrada');
        }
      } catch (err) {
        console.error(`Erro ao processar ${track.artist} - ${track.title}:`, err);
        // Log extra para depuração
        console.log('Erro no handleDownloadAll:', err);
      }
    }
    setProcessingTrack(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col animate-fade-in">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">Importar Playlist</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          <div className="mb-4">
            <textarea
              value={playlistText}
              onChange={handleTextChange}
              placeholder="Cole aqui o texto da playlist..."
              className="w-full h-32 p-3 bg-zinc-800 text-white rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="text-red-400 text-center py-4">{error}</div>
          )}

          {parsedTracks.length > 0 && (
            <div className="flex justify-end mb-4">
              <button
                onClick={handleDownloadAll}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processando...' : ''}
              </button>
            </div>
          )}

          <div className="space-y-2">
            {parsedTracks.map((track, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{track.title}</div>
                  <div className="text-gray-400 text-sm truncate">{track.artist}</div>
                  <div className="text-gray-400 text-sm">{track.timestamp}</div>
                </div>
                <button
                  onClick={() => handleDownload(track)}
                  disabled={loading}
                  className="px-4 py-2 bg-zinc-700 text-white rounded hover:bg-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingTrack === `${track.artist} - ${track.title}` ? 'Processando...' : 'Baixar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 