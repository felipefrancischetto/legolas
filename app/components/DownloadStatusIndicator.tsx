'use client';

import { useState, useEffect } from 'react';
import DetailedProgressDisplay from './DetailedProgressDisplay';
import { getCachedDominantColor } from '../utils/colorExtractor';
import LoadingSpinner from './LoadingSpinner';

interface DownloadStatusIndicatorProps {
  type: 'individual' | 'playlist';
  status: 'pending' | 'downloading' | 'completed' | 'error' | 'queued';
  progress?: number;
  title: string;
  currentStep?: string;
  currentSubstep?: string;
  detail?: string;
  playlistProgress?: {
    current: number;
    total: number;
    completed: number;
    errors: number;
    downloading?: number;
  };
  error?: string;
  onClose?: () => void;
  loading?: boolean;
  isConnected?: boolean;
  defaultMinimized?: boolean;
  autoMinimizeAfter?: number; // segundos para minimizar automaticamente
  allowMinimize?: boolean; // se permite minimizar
  steps?: any[]; // DownloadStep[]
  beatportData?: boolean; // se os dados vieram do Beatport
  thumbnail?: string; // thumbnail da música/playlist
}

export default function DownloadStatusIndicator({
  type,
  status,
  progress = 0,
  title,
  currentStep,
  currentSubstep,
  detail,
  playlistProgress,
  error,
  onClose,
  loading = false,
  isConnected = false,
  defaultMinimized = false,
  autoMinimizeAfter = 0, // 0 = desabilitado
  allowMinimize = true,
  steps,
  beatportData = false,
  thumbnail
}: DownloadStatusIndicatorProps) {
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);
  const [userInteracted, setUserInteracted] = useState(false);
  const [willAutoMinimize, setWillAutoMinimize] = useState(false);
  const [dominantColor, setDominantColor] = useState<string>('rgba(75, 85, 99, 0.2)');

  // Extrai cor da thumbnail
  useEffect(() => {
    if (thumbnail) {
      const extractColor = async () => {
        try {
          const colorData = await getCachedDominantColor(thumbnail);
          setDominantColor(colorData.rgba(0.15));
        } catch (error) {
          setDominantColor('rgba(75, 85, 99, 0.2)');
        }
      };
      extractColor();
    } else {
      setDominantColor('rgba(75, 85, 99, 0.2)');
    }
  }, [thumbnail]);

  // Auto-minimizar após um tempo se estiver baixando
  useEffect(() => {
    if (autoMinimizeAfter > 0 && 
        (status === 'downloading' || loading) && 
        !isMinimized && 
        !userInteracted &&
        allowMinimize) {
      
      // Mostrar aviso 2 segundos antes de minimizar
      const warningTimer = setTimeout(() => {
        setWillAutoMinimize(true);
      }, Math.max(0, (autoMinimizeAfter - 2) * 1000));
      
      // Minimizar automaticamente
      const timer = setTimeout(() => {
        setIsMinimized(true);
        setWillAutoMinimize(false);
      }, autoMinimizeAfter * 1000);

      return () => {
        clearTimeout(warningTimer);
        clearTimeout(timer);
      };
    } else {
      setWillAutoMinimize(false);
    }
  }, [status, loading, isMinimized, userInteracted, autoMinimizeAfter, allowMinimize]);

  // Reset userInteracted quando o status mudar para downloading
  useEffect(() => {
    if (status === 'downloading' || loading) {
      setUserInteracted(false);
    }
  }, [status, loading]);

  // Marcar interação do usuário quando expandir/minimizar manualmente
  const handleToggleMinimize = (minimized: boolean) => {
    setIsMinimized(minimized);
    setUserInteracted(true);
    setWillAutoMinimize(false); // Cancelar aviso quando usuário interage
  };
  // Ícones específicos para cada tipo
  const getTypeIcon = () => {
    if (type === 'individual') {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l6 6-6 6z" />
        </svg>
      );
    } else {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
      );
    }
  };

  // Cores baseadas no status
  const getStatusColors = () => {
    switch (status) {
      case 'completed':
        return {
          bg: 'bg-green-900/20',
          text: 'text-green-400',
          border: 'border-green-500/20'
        };
      case 'error':
        return {
          bg: 'bg-red-900/20',
          text: 'text-red-400',
          border: 'border-red-500/20'
        };
      case 'downloading':
        return {
          bg: 'bg-blue-900/20',
          text: 'text-blue-400',
          border: 'border-blue-500/20'
        };
      case 'queued':
        return {
          bg: 'bg-yellow-900/20',
          text: 'text-yellow-400',
          border: 'border-yellow-500/20'
        };
      default:
        return {
          bg: 'bg-zinc-800',
          text: 'text-zinc-400',
          border: 'border-zinc-700'
        };
    }
  };

  const colors = getStatusColors();

  // Status específico para playlist
  const renderPlaylistStatus = () => {
    if (!playlistProgress) return null;
    
    const { current, total, completed, errors, downloading = 0 } = playlistProgress;
    const inProgress = current > 0 ? 1 : 0; // Faixa atual em progresso
    const pending = total - completed - downloading - inProgress - errors; // Faixas pendentes
    
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>Progresso da Playlist</span>
          <span className="font-mono">{current}/{total}</span>
        </div>
        
        {/* Barra de progresso da playlist */}
        <div className="w-full bg-zinc-700 rounded-full h-2">
          <div className="flex h-full rounded-full overflow-hidden">
            {/* Faixas concluídas */}
            <div 
              className="bg-green-500 transition-all duration-500 ease-out"
              style={{ width: `${(completed / total) * 100}%` }}
            />
            {/* Faixas baixadas mas processando metadados */}
            <div 
              className="bg-yellow-500 transition-all duration-500 ease-out"
              style={{ width: `${(downloading / total) * 100}%` }}
            />
            {/* Faixa atual em progresso */}
            <div 
              className="bg-blue-500 animate-pulse transition-all duration-500 ease-out"
              style={{ width: `${(inProgress / total) * 100}%` }}
            />
            {/* Faixas com erro */}
            <div 
              className="bg-red-500 transition-all duration-500 ease-out"
              style={{ width: `${(errors / total) * 100}%` }}
            />
          </div>
        </div>
        
        {/* Estatísticas */}
        <div className="flex justify-between text-xs text-zinc-400 flex-wrap gap-1">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            {completed} concluídas
          </span>
          {downloading > 0 && (
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
              {downloading} processando
            </span>
          )}
          {inProgress > 0 && (
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              1 baixando
            </span>
          )}
          {errors > 0 && (
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              {errors} erros
            </span>
          )}
          {pending > 0 && (
            <span>{pending} pendentes</span>
          )}
        </div>
      </div>
    );
  };

  // Status específico para download individual
  const renderIndividualStatus = () => {
    if (status !== 'downloading') return null;
    
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>Progresso</span>
          <span className="font-mono">{progress}%</span>
        </div>
        
        {/* Barra de progresso individual */}
        <div className="w-full bg-zinc-700 rounded-full h-2">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              status === 'downloading' ? 'bg-blue-500 animate-progress-pulse' : 'bg-blue-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  };

  // Renderizar versão minimizada
  if (isMinimized) {
    return (
      <div 
        className="border rounded-xl p-3 animate-bounce-in transition-all duration-300 sm:p-2 backdrop-blur-sm"
        style={{ 
          background: `linear-gradient(135deg, ${dominantColor} 0%, rgba(0, 0, 0, 0.8) 100%)`,
          borderColor: dominantColor.replace('0.15', '0.4')
        }}
      >
        <div className="space-y-2 sm:space-y-1">
          <div className="flex items-center justify-between">
            {/* Informações básicas */}
            <div className="flex items-center gap-3 flex-1 min-w-0 sm:gap-2">
              {thumbnail ? (
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0 sm:w-8 sm:h-8">
                  <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className={`${colors.text} flex-shrink-0`}>
                  {getTypeIcon()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 sm:gap-1">
                  <h3 className="text-white font-medium text-sm truncate sm:text-xs">{title}</h3>
                  <span className={`${colors.text} text-xs px-1.5 py-0.5 rounded bg-zinc-800 sm:text-[10px] sm:px-1`}>
                    {type === 'individual' ? 'Música' : 'Playlist'}
                  </span>
                  {beatportData && (
                    <span className="bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded text-xs border border-orange-500/30 sm:text-[10px] sm:px-1">
                      Beatport
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 sm:gap-1">
                  <LoadingSpinner 
                    size="xs" 
                    className="sm:w-2 sm:h-2" 
                    isLoading={status === 'downloading' || loading}
                    timeout={60000}
                  />
                  {isConnected && (
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse sm:w-1 sm:h-1" title="Conectado ao servidor" />
                  )}
                  <span className={`${colors.text} text-xs sm:text-[10px]`}>
                    {currentStep || getStatusText()}
                  </span>
                  {/* Progresso inline para versão minimizada */}
                  {(status === 'downloading' || loading) && (
                    <span className="text-zinc-400 text-xs font-mono sm:text-[10px]">
                      {type === 'playlist' && playlistProgress 
                        ? `${playlistProgress.current}/${playlistProgress.total}`
                        : `${progress}%`
                      }
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {/* Controles minimizados */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {allowMinimize && (
                <button
                  onClick={() => setIsMinimized(false)}
                  className="text-gray-400 hover:text-white transition-colors p-1 sm:p-0.5"
                  title="Expandir"
                >
                  <svg className="w-4 h-4 sm:w-3 sm:h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-white transition-colors p-1 sm:p-0.5"
                  title="Fechar"
                >
                  <svg className="w-4 h-4 sm:w-3 sm:h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Renderizar versão expandida
  return (
    <div 
      className="border rounded-xl p-4 animate-bounce-in transition-all duration-300 sm:p-2 backdrop-blur-sm"
      style={{ 
        background: `linear-gradient(135deg, ${dominantColor} 0%, rgba(0, 0, 0, 0.9) 100%)`,
        borderColor: dominantColor.replace('0.15', '0.4')
      }}
    >
      <div className="space-y-3 sm:space-y-2">
        <div className="flex items-start justify-between gap-3 sm:gap-2">
          {/* Thumbnail ou ícone do tipo */}
          {thumbnail ? (
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0 sm:w-10 sm:h-10">
              <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className={`${colors.text} flex-shrink-0 mt-1`}>
              {getTypeIcon()}
            </div>
          )}
          
          {/* Informações principais */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 sm:gap-1">
              <h3 className="text-white font-medium text-sm truncate sm:text-xs">{title}</h3>
              <span className={`${colors.text} text-xs px-2 py-1 rounded-full bg-zinc-800 sm:text-[10px] sm:px-1`}>
                {type === 'individual' ? 'Música' : 'Playlist'}
              </span>
              {beatportData && (
                <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded-full text-xs border border-orange-500/30 sm:text-[10px] sm:px-1">
                  🎵 Beatport
                </span>
              )}
            </div>
            
            {/* Status atual */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 sm:gap-1">
                <LoadingSpinner 
                  size="sm" 
                  className="sm:w-3 sm:h-3" 
                  isLoading={status === 'downloading' || loading}
                  timeout={60000}
                />
                {isConnected && (
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse sm:w-1.5 sm:h-1.5" title="Conectado ao servidor" />
                )}
                <span className={`${colors.text} text-sm font-medium sm:text-xs`}>
                  {currentStep || getStatusText()}
                </span>
              </div>
              
              {/* Substep */}
              {currentSubstep && (
                <div className="flex items-center gap-2 pl-4 sm:gap-1 sm:pl-2">
                  <div className="w-1 h-1 bg-zinc-500 rounded-full" />
                  <span className="text-zinc-400 text-xs sm:text-[10px]">
                    {currentSubstep}
                  </span>
                </div>
              )}
              
              {/* Detail */}
              {detail && (
                <div className="text-zinc-500 text-xs pl-4 truncate sm:pl-2 sm:text-[10px]">
                  {detail}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Controles */}
        <div className="flex items-center justify-between gap-2 sm:gap-1">
          <div className="flex items-center gap-2 sm:gap-1">
            {(status === 'downloading' || loading) && (
              <span className="text-zinc-400 text-xs font-mono sm:text-[10px]">
                {type === 'playlist' && playlistProgress 
                  ? `${playlistProgress.current}/${playlistProgress.total}`
                  : `${progress}%`
                }
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            {allowMinimize && (
              <button
                onClick={() => setIsMinimized(true)}
                className="text-gray-400 hover:text-white transition-colors p-1 sm:p-0.5"
                title="Minimizar"
              >
                <svg className="w-4 h-4 sm:w-3 sm:h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors p-1 sm:p-0.5"
                title="Fechar"
              >
                <svg className="w-4 h-4 sm:w-3 sm:h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Barras de progresso */}
        {type === 'playlist' ? renderPlaylistStatus() : renderIndividualStatus()}

        {/* Erro */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded p-2 text-red-400 text-xs animate-status-change sm:p-1 sm:text-[10px]">
            {error}
          </div>
        )}
      </div>
    </div>
  );

  function getStatusText(): string {
    switch (status) {
      case 'pending':
        return 'Aguardando...';
      case 'queued':
        return 'Na fila';
      case 'downloading':
        if (type === 'playlist' && playlistProgress) {
          const { completed, total, downloading = 0 } = playlistProgress;
          if (completed === total) {
            return 'Playlist concluída!';
          } else if (downloading > 0) {
            return 'Processando metadados...';
          } else {
            return 'Baixando playlist...';
          }
        }
        return 'Baixando...';
      case 'completed':
        return type === 'playlist' ? 'Playlist concluída!' : 'Download concluído!';
      case 'error':
        return 'Erro no download';
      default:
        return 'Status desconhecido';
    }
  }
} 