'use client';

import { useState, useEffect } from 'react';
import { getCachedDominantColor } from '../utils/colorExtractor';
import LoadingSpinner from './LoadingSpinner';

interface DownloadTrack {
  id: string;
  title: string;
  status: 'pending' | 'downloading' | 'completed' | 'error' | 'paused';
  progress: number;
  currentStep?: string;
  error?: string;
  beatportData?: boolean;
  thumbnail?: string;
}

interface ModernDownloadDisplayProps {
  downloadId: string;
  title: string;
  type: 'individual' | 'playlist';
  status: 'pending' | 'downloading' | 'completed' | 'error' | 'paused';
  progress: number;
  tracks?: DownloadTrack[];
  currentTrack?: DownloadTrack;
  thumbnail?: string;
  onCancel?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
  onRemove?: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: (minimized: boolean) => void;
}

export default function ModernDownloadDisplay(props: ModernDownloadDisplayProps) {
  const {
    downloadId,
    title,
    type,
    status,
    progress,
    tracks = [],
    currentTrack,
    thumbnail,
    onCancel,
    onPause,
    onResume,
    onRetry,
    onRemove,
    isMinimized = false,
    onToggleMinimize
  } = props;

  const [dominantColor, setDominantColor] = useState<string>('rgba(75, 85, 99, 0.2)');
  const [expandedTracks, setExpandedTracks] = useState(false);

  // Extrai cor da thumbnail
  useEffect(() => {
    if (thumbnail) {
      const extractColor = async () => {
        try {
          const colorData = await getCachedDominantColor(thumbnail);
          setDominantColor(colorData.rgba(0.2));
        } catch (error) {
          setDominantColor('rgba(75, 85, 99, 0.2)');
        }
      };
      extractColor();
    }
  }, [thumbnail]);

  // Estatísticas para playlists
  const stats = tracks.length > 0 ? {
    total: tracks.length,
    completed: tracks.filter(t => t.status === 'completed').length,
    downloading: tracks.filter(t => t.status === 'downloading').length,
    error: tracks.filter(t => t.status === 'error').length,
    paused: tracks.filter(t => t.status === 'paused').length,
    pending: tracks.filter(t => t.status === 'pending').length,
    withBeatport: tracks.filter(t => t.beatportData).length
  } : null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'downloading':
        return (
                          <LoadingSpinner size="sm" color="rgb(96, 165, 250)" isLoading={true} />
        );
      case 'completed':
        return (
          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'paused':
        return (
          <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        );
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'downloading': return 'Baixando';
      case 'completed': return 'Concluído';
      case 'error': return 'Erro';
      case 'paused': return 'Pausado';
      case 'pending': return 'Pendente';
      default: return 'Desconhecido';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'downloading': return 'border-blue-500/50 bg-blue-500/10';
      case 'completed': return 'border-green-500/50 bg-green-500/10';
      case 'error': return 'border-red-500/50 bg-red-500/10';
      case 'paused': return 'border-yellow-500/50 bg-yellow-500/10';
      default: return 'border-gray-500/50 bg-gray-500/10';
    }
  };

  // Versão minimizada
  if (isMinimized) {
    return (
      <div 
        className={`rounded-xl border backdrop-blur-sm transition-all duration-300 p-3 ${getStatusColor(status)}`}
        style={{ 
          background: `linear-gradient(135deg, ${dominantColor} 0%, rgba(0, 0, 0, 0.8) 100%)`,
          borderColor: dominantColor.replace('0.2', '0.4')
        }}
      >
        <div className="flex items-center gap-3">
          {/* Thumbnail */}
          {thumbnail && (
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
              <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
            </div>
          )}
          
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {getStatusIcon(status)}
              <span className="text-white font-medium truncate text-sm">{title}</span>
              {type === 'playlist' && (
                <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded text-xs border border-purple-500/30">
                  Playlist
                </span>
              )}
            </div>
            {stats && (
              <div className="text-xs text-gray-400 mt-1">
                {stats.completed}/{stats.total} • {stats.withBeatport} com Beatport
              </div>
            )}
          </div>

          {/* Progress */}
          <div className="text-xs text-gray-400 font-mono">{progress}%</div>

          {/* Expand button */}
          {onToggleMinimize && (
            <button
              onClick={() => onToggleMinimize(false)}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Versão expandida
  return (
    <div 
      className={`rounded-xl border backdrop-blur-sm transition-all duration-300 overflow-hidden ${getStatusColor(status)}`}
      style={{ 
        background: `linear-gradient(135deg, ${dominantColor} 0%, rgba(0, 0, 0, 0.9) 100%)`,
        borderColor: dominantColor.replace('0.2', '0.4')
      }}
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-start gap-4">
          {/* Thumbnail */}
          {thumbnail && (
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
              <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
            </div>
          )}
          
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {getStatusIcon(status)}
              <h3 className="text-white font-bold text-lg truncate">{title}</h3>
              {type === 'playlist' && (
                <span className="bg-purple-500/20 text-purple-400 px-3 py-1 rounded-full text-sm border border-purple-500/30">
                  Playlist
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span className={`px-2 py-1 rounded ${getStatusColor(status)} border-0`}>
                {getStatusText(status)}
              </span>
              {currentTrack && (
                <span>Atual: {currentTrack.title}</span>
              )}
              {stats && (
                <>
                  <span>{stats.completed}/{stats.total} faixas</span>
                  {stats.withBeatport > 0 && (
                    <span className="text-orange-400">
                      🎵 {stats.withBeatport} com dados Beatport
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {status === 'downloading' && onPause && (
              <button
                onClick={onPause}
                className="p-2 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/20 rounded-lg transition-colors"
                title="Pausar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                </svg>
              </button>
            )}
            
            {status === 'paused' && onResume && (
              <button
                onClick={onResume}
                className="p-2 text-green-400 hover:text-green-300 hover:bg-green-500/20 rounded-lg transition-colors"
                title="Continuar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-9-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}
            
            {status === 'error' && onRetry && (
              <button
                onClick={onRetry}
                className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 rounded-lg transition-colors"
                title="Tentar novamente"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
            
            {(['pending', 'downloading'].includes(status)) && onCancel && (
              <button
                onClick={onCancel}
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                title="Cancelar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            
            {onRemove && ['completed', 'error'].includes(status) && (
              <button
                onClick={onRemove}
                className="p-2 text-gray-400 hover:text-gray-300 hover:bg-gray-500/20 rounded-lg transition-colors"
                title="Remover"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}

            {onToggleMinimize && (
              <button
                onClick={() => onToggleMinimize(true)}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Minimizar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-400">
              {currentTrack?.currentStep || 'Preparando...'}
            </span>
            <span className="text-sm text-gray-400 font-mono">{progress}%</span>
          </div>
          <div className="w-full bg-gray-700/50 rounded-full h-3">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                status === 'downloading' ? 'bg-blue-500 animate-pulse' : 
                status === 'completed' ? 'bg-green-500' :
                status === 'error' ? 'bg-red-500' :
                'bg-gray-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tracks List (for playlists) */}
      {type === 'playlist' && tracks.length > 0 && (
        <div className="border-t border-white/10">
          <button
            onClick={() => setExpandedTracks(!expandedTracks)}
            className="w-full p-4 text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">
                Faixas da Playlist ({tracks.length})
              </span>
              <div className="flex items-center gap-3">
                {stats && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-green-400">✓ {stats.completed}</span>
                    <span className="text-blue-400">⬇ {stats.downloading}</span>
                    <span className="text-red-400">✗ {stats.error}</span>
                    <span className="text-orange-400">🎵 {stats.withBeatport}</span>
                  </div>
                )}
                <svg 
                  className={`w-5 h-5 text-gray-400 transition-transform ${expandedTracks ? 'rotate-180' : ''}`} 
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </button>

          {expandedTracks && (
            <div className="max-h-64 overflow-y-auto border-t border-white/10 custom-scroll">
              {tracks.map((track, index) => (
                <div key={track.id} className="p-3 border-b border-white/5 last:border-b-0 hover:bg-white/5">
                  <div className="flex items-center gap-3">
                    {/* Track thumbnail */}
                    {track.thumbnail && (
                      <div className="w-8 h-8 rounded overflow-hidden bg-gray-800 flex-shrink-0">
                        <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
                      </div>
                    )}
                    
                    {/* Status icon */}
                    <div className="flex-shrink-0">
                      {getStatusIcon(track.status)}
                    </div>
                    
                    {/* Track info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm truncate">{track.title}</span>
                        {track.beatportData && (
                          <span className="bg-orange-500/20 text-orange-400 px-1 py-0.5 rounded text-xs border border-orange-500/30">
                            Beatport
                          </span>
                        )}
                      </div>
                      {track.currentStep && (
                        <div className="text-xs text-gray-400 truncate mt-1">
                          {track.currentStep}
                        </div>
                      )}
                      {track.error && (
                        <div className="text-xs text-red-400 truncate mt-1">
                          {track.error}
                        </div>
                      )}
                    </div>
                    
                    {/* Progress */}
                    <div className="flex items-center gap-2">
                      {track.status === 'downloading' && (
                        <div className="w-16 bg-gray-700 rounded-full h-1">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-300"
                            style={{ width: `${track.progress}%` }}
                          />
                        </div>
                      )}
                      <span className="text-xs text-gray-400 font-mono w-8 text-right">
                        {track.status === 'completed' ? '100%' : `${track.progress}%`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 