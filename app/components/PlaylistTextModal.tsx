"use client";

import { useState } from 'react';
import { useDownload } from '../contexts/DownloadContext';
import BaseModal from './BaseModal';

interface PlaylistTextModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PlaylistTextModal({ isOpen, onClose }: PlaylistTextModalProps) {
  const [playlistText, setPlaylistText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedTracks, setParsedTracks] = useState<Array<{ title: string; artist: string }>>([]);
  const { addToQueue } = useDownload();

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setPlaylistText(text);
    
    // Parse tracks from text
    const lines = text.split('\n').filter(line => line.trim());
    const tracks = lines.map(line => {
      const parts = line.split('-').map(part => part.trim());
      return {
        title: parts[1] || parts[0],
        artist: parts[0]
      };
    });
    
    setParsedTracks(tracks);
  };

  const handleDownloadAll = async () => {
    setLoading(true);
    setError(null);

    try {
      for (const track of parsedTracks) {
        await addToQueue(`${track.artist} - ${track.title}`);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao processar playlist');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Importar Playlist"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 sm:space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2 sm:text-xs sm:mb-1">
            Cole o texto da playlist aqui:
          </label>
          <textarea
            value={playlistText}
            onChange={handleTextChange}
            className="w-full h-64 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none custom-scroll sm:h-48 sm:px-2 sm:py-1.5 sm:text-sm"
            placeholder="Cole aqui o texto da playlist com nomes de artistas e músicas..."
          />
        </div>
        
        <div className="flex gap-3 sm:gap-2 sm:flex-col">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-zinc-700 text-white rounded-md hover:bg-zinc-600 transition-colors sm:px-3 sm:py-1.5 sm:text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={handleDownloadAll}
            disabled={loading || !playlistText.trim()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors sm:px-3 sm:py-1.5 sm:text-sm"
          >
            {loading ? 'Processando...' : 'Baixar Todas'}
          </button>
        </div>
      </div>
    </BaseModal>
  );
} 