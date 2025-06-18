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
      maxWidth="max-w-4xl"
    >
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
              {loading ? 'Processando...' : 'Baixar Todas'}
            </button>
          </div>
        )}
      </div>
    </BaseModal>
  );
} 