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
            className="block text-sm font-medium mb-2 sm:text-xs sm:mb-1 text-white"
          >
            Cole o texto da playlist aqui:
          </label>
          <textarea
            value={playlistText}
            onChange={handleTextChange}
            className="w-full h-64 px-4 py-3 rounded-xl text-white placeholder-zinc-400 focus:outline-none resize-none custom-scroll sm:h-48 sm:px-3 sm:py-2 sm:text-sm backdrop-blur-md transition-all duration-200 focus:ring-2 focus:ring-emerald-500/50"
            style={{
              background: `linear-gradient(135deg, ${colors.background} 0%, ${colors.background.replace('0.15', '0.25')} 100%)`,
              border: `1px solid ${colors.border}`,
              boxShadow: playlistText 
                ? `0 4px 12px ${colors.primary}25, 0 0 0 1px ${colors.primaryLight}, inset 0 1px 0 rgba(255, 255, 255, 0.1)` 
                : `0 4px 12px ${colors.primary}15, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
            }}
            placeholder="Cole aqui o texto da playlist com nomes de artistas e músicas..."
          />
        </div>
        
        {parsedTracks.length > 0 && (
          <div>
            <p 
              className="text-sm font-medium mb-2 text-white"
            >
              {parsedTracks.length} faixas detectadas
            </p>
          </div>
        )}
        
        <div className="flex gap-3 sm:gap-2 sm:flex-col">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-white rounded-xl transition-all duration-200 hover:scale-105 sm:px-3 sm:py-2 sm:text-sm backdrop-blur-md hover:shadow-lg"
            style={{
              background: 'linear-gradient(135deg, rgba(63, 63, 70, 0.8) 0%, rgba(63, 63, 70, 0.9) 100%)',
              border: '1px solid rgba(82, 82, 91, 0.5)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleDownloadAll}
            disabled={loading || !playlistText.trim()}
            className="flex-1 px-4 py-2.5 text-white rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 sm:px-3 sm:py-2 sm:text-sm backdrop-blur-md hover:shadow-lg"
            style={{
              background: loading || !playlistText.trim()
                ? 'linear-gradient(135deg, rgba(82, 82, 91, 0.8) 0%, rgba(82, 82, 91, 0.9) 100%)'
                : `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
              border: `1px solid ${loading || !playlistText.trim() ? 'rgba(82, 82, 91, 0.5)' : colors.border}`,
              boxShadow: loading || !playlistText.trim()
                ? '0 4px 12px rgba(82, 82, 91, 0.3)'
                : `0 4px 12px ${colors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.2)`
            }}
            onMouseEnter={(e) => {
              if (!loading && playlistText.trim()) {
                e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                e.currentTarget.style.boxShadow = `0 8px 24px ${colors.primary}40, inset 0 1px 0 rgba(255, 255, 255, 0.25)`;
              }
            }}
            onMouseLeave={(e) => {
              if (!loading && playlistText.trim()) {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = `0 4px 12px ${colors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.2)`;
              }
            }}
          >
            {loading ? 'Processando...' : 'Baixar Todas'}
          </button>
        </div>
      </div>
    </BaseModal>
  );
} 