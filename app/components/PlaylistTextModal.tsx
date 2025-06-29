"use client";

import { useState } from 'react';
import { useDownload } from '../contexts/DownloadContext';
import { useSettings } from '../hooks/useSettings';
import BaseModal from './BaseModal';

interface PlaylistTextModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeColors?: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    background: string;
    border: string;
  };
}

export default function PlaylistTextModal({ isOpen, onClose, themeColors }: PlaylistTextModalProps) {
  const [playlistText, setPlaylistText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedTracks, setParsedTracks] = useState<Array<{ title: string; artist: string }>>([]);
  const { addToQueue } = useDownload();
  const { settings } = useSettings();

  // Cores padrão caso não sejam fornecidas
  const defaultColors = {
    primary: 'rgb(16, 185, 129)',
    primaryLight: 'rgba(16, 185, 129, 0.9)',
    primaryDark: 'rgba(16, 185, 129, 0.7)',
    background: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)'
  };
  
  // Usar cores padrão se cores dinâmicas estiverem desabilitadas
  const colors = (settings.disableDynamicColors || !themeColors) ? defaultColors : themeColors;

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
      themeColors={colors}
    >
      <div className="space-y-4 sm:space-y-3">
        <div>
          <label 
            className="block text-sm font-medium mb-2 sm:text-xs sm:mb-1"
            style={{ color: colors.primary }}
          >
            Cole o texto da playlist aqui:
          </label>
          <textarea
            value={playlistText}
            onChange={handleTextChange}
            className="w-full h-64 px-3 py-2 bg-black/30 rounded-lg text-white placeholder-gray-400 focus:outline-none resize-none custom-scroll sm:h-48 sm:px-2 sm:py-1.5 sm:text-sm backdrop-blur-sm transition-all duration-200"
            style={{
              border: `1px solid ${colors.border}`,
              boxShadow: playlistText ? `0 0 0 1px ${colors.primaryLight}` : 'none'
            }}
            placeholder="Cole aqui o texto da playlist com nomes de artistas e músicas..."
          />
        </div>
        
        {parsedTracks.length > 0 && (
          <div>
            <p 
              className="text-sm font-medium mb-2"
              style={{ color: colors.primary }}
            >
              {parsedTracks.length} faixas detectadas
            </p>
          </div>
        )}
        
        <div className="flex gap-3 sm:gap-2 sm:flex-col">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-white rounded-lg transition-all duration-200 hover:scale-105 sm:px-3 sm:py-1.5 sm:text-sm"
            style={{
              backgroundColor: 'rgba(63, 63, 70, 0.8)',
              border: '1px solid rgba(82, 82, 91, 0.8)'
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleDownloadAll}
            disabled={loading || !playlistText.trim()}
            className="flex-1 px-4 py-2 text-white rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 sm:px-3 sm:py-1.5 sm:text-sm"
            style={{
              backgroundColor: colors.primary,
              border: `1px solid ${colors.border}`
            }}
          >
            {loading ? 'Processando...' : 'Baixar Todas'}
          </button>
        </div>
      </div>
    </BaseModal>
  );
} 