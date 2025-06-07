'use client';

import { useState, useEffect } from 'react';
import DetailedProgressDisplay from './DetailedProgressDisplay';

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
  steps
}: DownloadStatusIndicatorProps) {
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);
  const [userInteracted, setUserInteracted] = useState(false);
  const [willAutoMinimize, setWillAutoMinimize] = useState(false);

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

  // Animação de loading
  const LoadingSpinner = ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={`${className} animate-spin`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" className="opacity-25" />
      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75" />
    </svg>
  );

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
      <div className={`${colors.bg} ${colors.border} border rounded-lg p-3 animate-bounce-in transition-all duration-300`}>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            {/* Informações básicas */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={`${colors.text} flex-shrink-0`}>
                {getTypeIcon()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-medium text-sm truncate">{title}</h3>
                  <span className={`${colors.text} text-xs px-1.5 py-0.5 rounded bg-zinc-800`}>
                    {type === 'individual' ? 'Música' : 'Playlist'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {(status === 'downloading' || loading) && <LoadingSpinner className="w-3 h-3" />}
                  {isConnected && (
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" title="Conectado ao servidor" />
                  )}
                  <span className={`${colors.text} text-xs`}>
                    {currentStep || getStatusText()}
                  </span>
                                  {/* Progresso inline para versão minimizada */}
                {(status === 'downloading' || loading) && (
                  <span className="text-zinc-400 text-xs font-mono">
                    {type === 'playlist' && playlistProgress 
                      ? `${playlistProgress.current}/${playlistProgress.total}`
                      : `${progress}%`
                    }
                  </span>
                )}
                </div>
              </div>
            </div>
            
            {/* Controles */}
            <div className="flex items-center gap-1">
              {/* Botão expandir */}
              {allowMinimize && (
                <button
                  onClick={() => handleToggleMinimize(false)}
                  className="text-zinc-400 hover:text-white transition-colors flex-shrink-0 p-1"
                  title="Expandir"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
              
              {/* Botão de fechar */}
              {onClose && status === 'completed' && (
                <button
                  onClick={onClose}
                  className="text-zinc-400 hover:text-white transition-colors flex-shrink-0 p-1"
                  title="Fechar"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          
          {/* Barra de progresso compacta para versão minimizada */}
          {(status === 'downloading' || loading) && (
            <div className="w-full">
              {type === 'playlist' && playlistProgress ? (
                // Progresso da playlist
                <div className="w-full bg-zinc-700 rounded-full h-1.5">
                  <div className="flex h-full rounded-full overflow-hidden">
                    {/* Faixas concluídas */}
                    <div 
                      className="bg-green-500 transition-all duration-500 ease-out"
                      style={{ width: `${(playlistProgress.completed / playlistProgress.total) * 100}%` }}
                    />
                    {/* Faixas baixadas mas processando metadados */}
                    <div 
                      className="bg-yellow-500 transition-all duration-500 ease-out"
                      style={{ width: `${((playlistProgress.downloading || 0) / playlistProgress.total) * 100}%` }}
                    />
                    {/* Faixa atual em progresso */}
                    <div 
                      className="bg-blue-500 animate-pulse transition-all duration-500 ease-out"
                      style={{ width: `${(playlistProgress.current > 0 ? 1 / playlistProgress.total : 0) * 100}%` }}
                    />
                    {/* Faixas com erro */}
                    <div 
                      className="bg-red-500 transition-all duration-500 ease-out"
                      style={{ width: `${(playlistProgress.errors / playlistProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                // Progresso individual
                <div className="w-full bg-zinc-700 rounded-full h-1.5">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          )}
          
          {/* Erro minimizado */}
          {error && (
            <div className="text-red-400 text-xs truncate">
              ⚠️ {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Renderizar versão expandida (padrão)
  return (
    <div className={`${colors.bg} ${colors.border} border rounded-lg p-4 animate-bounce-in transition-all duration-300 ${status === 'downloading' ? 'animate-pulse-glow' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Ícone do tipo */}
          <div className={`${colors.text} flex-shrink-0`}>
            {getTypeIcon()}
          </div>
          
          {/* Título e tipo */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-white font-medium text-sm truncate">{title}</h3>
              <span className={`${colors.text} text-xs px-2 py-1 rounded-full bg-zinc-800`}>
                {type === 'individual' ? 'Música' : 'Playlist'}
              </span>
            </div>
            
            {/* Status atual */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {(status === 'downloading' || loading) && <LoadingSpinner />}
                {isConnected && (
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" title="Conectado ao servidor" />
                )}
                <span className={`${colors.text} text-sm font-medium`}>
                  {currentStep || getStatusText()}
                </span>
              </div>
              
              {/* Substep */}
              {currentSubstep && (
                <div className="flex items-center gap-2 pl-4">
                  <div className="w-1 h-1 bg-zinc-500 rounded-full" />
                  <span className="text-zinc-400 text-xs">
                    {currentSubstep}
                  </span>
                </div>
              )}
              
              {/* Detail */}
              {detail && (
                <div className="text-zinc-500 text-xs pl-4 truncate">
                  {detail}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Controles */}
        <div className="flex items-center gap-1">
          {/* Aviso de auto-minimize */}
          {willAutoMinimize && (
            <div className="flex items-center gap-1 text-yellow-400 text-xs px-2 py-1 bg-yellow-900/20 rounded animate-pulse">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>Será minimizado em breve</span>
            </div>
          )}
          
          {/* Botão minimizar */}
          {allowMinimize && (
            <button
              onClick={() => handleToggleMinimize(true)}
              className={`transition-colors flex-shrink-0 p-1 ${
                willAutoMinimize 
                  ? 'text-yellow-400 hover:text-yellow-300 animate-bounce' 
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Minimizar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
          )}
          
          {/* Botão de fechar */}
          {onClose && status === 'completed' && (
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white transition-colors flex-shrink-0 p-1"
              title="Fechar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo específico por tipo - só na versão expandida */}
      {type === 'playlist' ? renderPlaylistStatus() : renderIndividualStatus()}
      
      {/* Mensagem de erro */}
      {error && (
        <div className="mt-3 p-2 bg-red-900/20 border border-red-500/20 rounded text-red-400 text-sm">
          <p className="font-medium">Erro:</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}

      {/* Progresso detalhado - para downloads individuais ou playlist em andamento */}
      {type === 'playlist' && steps && steps.length > 0 && (
        <DetailedProgressDisplay
          currentStep={currentStep || ''}
          currentSubstep={currentSubstep}
          progress={progress}
          detail={detail}
          isConnected={isConnected}
          type={type}
          steps={steps}
        />
      )}
      {type !== 'playlist' && steps && steps.length > 0 && (
        <DetailedProgressDisplay
          currentStep={currentStep || ''}
          currentSubstep={currentSubstep}
          progress={progress}
          detail={detail}
          isConnected={isConnected}
          type={type}
          steps={steps}
        />
      )}
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