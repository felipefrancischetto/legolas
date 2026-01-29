'use client';

import { useDownload } from '../contexts/DownloadContext';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { getCachedDominantColor } from '../utils/colorExtractor';

interface DownloadQueueProps {
  onClose: () => void;
}

interface DownloadItemComponentProps {
  item: any;
  handleRetry: (item: any) => void;
  handleRemove: (item: any) => void;
  getStatusText: (status: string) => string;
  formatDate: (timestamp: string | number) => string;
  formatDuration: (seconds: number) => string;
}

interface AlbumGroupProps {
  albumKey: string;
  albumItems: any[];
  handleRetry: (item: any) => void;
  handleRemove: (item: any) => void;
  getStatusText: (status: string) => string;
  formatDate: (timestamp: string | number) => string;
  formatDuration: (seconds: number) => string;
  getAlbumStats: (items: any[]) => { total: number; completed: number; downloading: number; pending: number; errors: number };
}

function AlbumGroup({ albumKey, albumItems, handleRetry, handleRemove, getStatusText, formatDate, formatDuration, getAlbumStats }: AlbumGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [albumName, albumArtist] = albumKey.split('|||');
  const albumStats = getAlbumStats(albumItems);
  
  return (
    <div className="space-y-2">
      {/* Cabeçalho do Álbum */}
      <div 
        className="backdrop-blur-sm rounded-xl p-4 border cursor-pointer transition-all duration-200 hover:scale-[1.01]"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 50%, rgba(39, 39, 42, 0.5) 100%)',
          borderColor: 'rgba(139, 92, 246, 0.3)',
          boxShadow: '0 2px 8px rgba(139, 92, 246, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <svg 
              className={`w-5 h-5 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              style={{ color: 'rgba(167, 139, 250, 0.9)' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white text-lg truncate">
                📀 {albumName}
              </h3>
              {albumArtist && (
                <p className="text-sm truncate" style={{ color: 'rgba(156, 163, 175, 0.9)' }}>
                  {albumArtist}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Estatísticas do álbum */}
            <div className="flex items-center gap-2 text-sm">
              {albumStats.completed > 0 && (
                <span style={{ color: 'rgba(110, 231, 183, 0.9)' }}>
                  ✓ {albumStats.completed}
                </span>
              )}
              {albumStats.downloading > 0 && (
                <span className="flex items-center gap-1" style={{ color: 'rgba(16, 185, 129, 0.9)' }}>
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  {albumStats.downloading}
                </span>
              )}
              {albumStats.pending > 0 && (
                <span style={{ color: 'rgba(234, 179, 8, 0.9)' }}>
                  ⏳ {albumStats.pending}
                </span>
              )}
              {albumStats.errors > 0 && (
                <span style={{ color: 'rgba(239, 68, 68, 0.9)' }}>
                  ✗ {albumStats.errors}
                </span>
              )}
              <span className="ml-2 font-medium" style={{ color: 'rgba(167, 139, 250, 0.9)' }}>
                {albumStats.completed}/{albumStats.total}
              </span>
            </div>
          </div>
        </div>
        
        {/* Barra de progresso do álbum */}
        <div className="mt-3">
          <div 
            className="w-full rounded-full h-2 overflow-hidden backdrop-blur-sm"
            style={{
              background: 'rgba(139, 92, 246, 0.1)',
              border: '1px solid rgba(139, 92, 246, 0.2)'
            }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(albumStats.completed / albumStats.total) * 100}%`,
                background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.8) 0%, rgba(124, 58, 237, 0.9) 100%)',
                boxShadow: '0 0 8px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
              }}
            />
          </div>
        </div>
      </div>
      
      {/* Itens do álbum (expandido/colapsado) */}
      {isExpanded && (
        <div className="ml-4 space-y-2 border-l-2 pl-4" style={{ borderColor: 'rgba(139, 92, 246, 0.2)' }}>
          {albumItems.map((item) => (
            <DownloadItemComponent key={`${item.source}-${item.id}`} item={item} handleRetry={handleRetry} handleRemove={handleRemove} getStatusText={getStatusText} formatDate={formatDate} formatDuration={formatDuration} />
          ))}
        </div>
      )}
    </div>
  );
}

function DownloadItemComponent({ item, handleRetry, handleRemove, getStatusText, formatDate, formatDuration }: DownloadItemComponentProps) {
  return (
    <div
      className="backdrop-blur-sm rounded-xl p-4 border transition-all duration-200 hover:scale-[1.01]"
      style={{
        background: item.status === 'downloading' 
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 50%, rgba(39, 39, 42, 0.5) 100%)'
          : 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(24, 24, 27, 0.6) 50%, rgba(39, 39, 42, 0.4) 100%)',
        borderColor: item.status === 'downloading' 
          ? 'rgba(16, 185, 129, 0.4)' 
          : 'rgba(16, 185, 129, 0.2)',
        boxShadow: item.status === 'downloading'
          ? '0 4px 16px rgba(16, 185, 129, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
          : '0 2px 8px rgba(16, 185, 129, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
      }}
    >
      {/* Header do Item */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Thumbnail */}
          {(item as any).thumbnail && (
            <div 
              className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 backdrop-blur-sm"
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}
            >
              <img 
                src={(item as any).thumbnail} 
                alt={item.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div 
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: 
                    item.status === 'completed' ? 'rgba(16, 185, 129, 0.9)' :
                    item.status === 'downloading' ? 'rgba(16, 185, 129, 0.9)' :
                    item.status === 'error' ? 'rgba(239, 68, 68, 0.9)' :
                    item.status === 'pending' ? 'rgba(234, 179, 8, 0.9)' :
                    'rgba(156, 163, 175, 0.9)',
                  boxShadow: item.status === 'downloading' 
                    ? '0 0 8px rgba(16, 185, 129, 0.6)' 
                    : item.status === 'completed'
                    ? '0 0 6px rgba(16, 185, 129, 0.4)'
                    : 'none'
                }}
              />
              <h3 className="font-semibold text-white truncate text-lg">{item.title}</h3>
              {item.isPlaylist && (
                <span 
                  className="px-2 py-1 rounded text-xs backdrop-blur-sm"
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: 'rgba(110, 231, 183, 0.9)',
                    border: '1px solid rgba(16, 185, 129, 0.3)'
                  }}
                >
                  Playlist
                </span>
              )}
              {item.source === 'history' && (
                <span 
                  className="px-2 py-1 rounded text-xs backdrop-blur-sm"
                  style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: 'rgba(156, 163, 175, 0.9)',
                    border: '1px solid rgba(16, 185, 129, 0.2)'
                  }}
                >
                  Histórico
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-4 text-sm" style={{ color: 'rgba(156, 163, 175, 0.9)' }}>
              {(item as any).format && (
                <span 
                  className="px-2 py-1 rounded text-xs backdrop-blur-sm"
                  style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: 'rgba(110, 231, 183, 0.9)',
                    border: '1px solid rgba(16, 185, 129, 0.2)'
                  }}
                >
                  {(item as any).format.toUpperCase()}
                </span>
              )}
              {(item as any).enrichWithBeatport && (
                <span 
                  className="px-2 py-1 rounded text-xs backdrop-blur-sm"
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: 'rgba(110, 231, 183, 0.9)',
                    border: '1px solid rgba(16, 185, 129, 0.3)'
                  }}
                >
                  📀 Beatport
                </span>
              )}
              {(item as any).timestamp && (
                <span>{formatDate((item as any).timestamp)}</span>
              )}
              {(item as any).duration && (
                <span>{formatDuration((item as any).duration)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Status e Ações */}
        <div className="flex items-center gap-3">
          <span 
            className="px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm"
            style={
              item.status === 'completed' 
                ? {
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: 'rgba(110, 231, 183, 1)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)'
                  }
                : item.status === 'downloading'
                ? {
                    background: 'rgba(16, 185, 129, 0.25)',
                    color: 'rgba(110, 231, 183, 1)',
                    border: '1px solid rgba(16, 185, 129, 0.5)',
                    boxShadow: '0 2px 12px rgba(16, 185, 129, 0.3)'
                  }
                : item.status === 'error'
                ? {
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: 'rgba(252, 165, 165, 0.9)',
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                  }
                : item.status === 'pending'
                ? {
                    background: 'rgba(234, 179, 8, 0.15)',
                    color: 'rgba(253, 224, 71, 0.9)',
                    border: '1px solid rgba(234, 179, 8, 0.3)'
                  }
                : {
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: 'rgba(156, 163, 175, 0.9)',
                    border: '1px solid rgba(16, 185, 129, 0.2)'
                  }
            }
          >
            {getStatusText(item.status)}
          </span>
          
          <div className="flex items-center gap-1">
            {item.status === 'error' && (
              <button
                onClick={() => handleRetry(item)}
                className="p-2 rounded-lg transition-all duration-200 hover:scale-110"
                style={{
                  color: 'rgba(110, 231, 183, 0.9)',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}
                title="Tentar novamente"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)';
                  e.currentTarget.style.color = 'rgba(110, 231, 183, 1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)';
                  e.currentTarget.style.color = 'rgba(110, 231, 183, 0.9)';
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
            
            {/* Botão de remover/cancelar - disponível para todos os status exceto completed */}
            {item.source === 'queue' && item.status !== 'completed' && (
              <button
                onClick={() => handleRemove(item)}
                className="p-2 rounded-lg transition-all duration-200 hover:scale-110"
                style={{
                  color: 'rgba(252, 165, 165, 0.9)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)'
                }}
                title={item.status === 'downloading' ? 'Cancelar e remover download' : 'Remover da fila'}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                  e.currentTarget.style.color = 'rgba(252, 165, 165, 1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                  e.currentTarget.style.color = 'rgba(252, 165, 165, 0.9)';
                }}
              >
                {item.status === 'downloading' ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progresso - Mostrar para downloading, queued e pending (quando houver informações) */}
      {((item.status === 'downloading' || item.status === 'queued') || 
        (item.status === 'pending' && (item.progress !== undefined || item.currentStep || item.currentSubstep))) && (
        <div className="mb-3">
          <div className="flex justify-between items-center mb-2">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-sm" style={{ color: 'rgba(156, 163, 175, 0.9)' }}>
                {item.currentStep || (item.status === 'pending' ? 'Aguardando início...' : 'Preparando...')}
              </span>
              {item.currentSubstep && (
                <span className="text-xs opacity-75" style={{ color: 'rgba(156, 163, 175, 0.7)' }}>
                  {item.currentSubstep}
                </span>
              )}
              {item.detail && (
                <span className="text-xs opacity-60" style={{ color: 'rgba(156, 163, 175, 0.6)' }}>
                  {item.detail}
                </span>
              )}
            </div>
            <span className="text-sm font-mono ml-2 flex-shrink-0" style={{ color: 'rgba(156, 163, 175, 0.9)' }}>
              {item.isPlaylist && item.playlistItems
                ? `${item.playlistItems.filter((p: any) => p.status === 'completed').length}/${item.playlistItems.length}`
                : `${item.progress !== undefined ? item.progress : 0}%`
              }
            </span>
          </div>
          <div 
            className="w-full rounded-full h-2 overflow-hidden backdrop-blur-sm"
            style={{
              background: item.status === 'pending' 
                ? 'rgba(234, 179, 8, 0.1)' 
                : 'rgba(16, 185, 129, 0.1)',
              border: item.status === 'pending'
                ? '1px solid rgba(234, 179, 8, 0.2)'
                : '1px solid rgba(16, 185, 129, 0.2)'
            }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: item.isPlaylist && item.playlistItems
                  ? `${(item.playlistItems.filter((p: any) => p.status === 'completed').length / item.playlistItems.length) * 100}%`
                  : `${item.progress !== undefined ? item.progress : 0}%`,
                background: item.status === 'downloading'
                  ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.8) 0%, rgba(5, 150, 105, 0.9) 100%)'
                  : item.status === 'pending'
                  ? 'linear-gradient(90deg, rgba(234, 179, 8, 0.6) 0%, rgba(234, 179, 8, 0.7) 100%)'
                  : 'linear-gradient(90deg, rgba(16, 185, 129, 0.4) 0%, rgba(16, 185, 129, 0.5) 100%)',
                boxShadow: item.status === 'downloading'
                  ? '0 0 12px rgba(16, 185, 129, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                  : item.status === 'pending' && (item.progress !== undefined && item.progress > 0)
                  ? '0 0 8px rgba(234, 179, 8, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                  : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)'
              }}
            />
          </div>
          {/* Indicador de tempo decorrido para downloads pendentes */}
          {item.status === 'pending' && item.startTime && (
            <div className="mt-1 text-xs opacity-60" style={{ color: 'rgba(156, 163, 175, 0.6)' }}>
              {(() => {
                const elapsed = Math.floor((Date.now() - item.startTime!) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                return `Aguardando há ${minutes > 0 ? `${minutes}m ` : ''}${seconds}s`;
              })()}
            </div>
          )}
        </div>
      )}

      {/* Informações adicionais para downloads pendentes sem progresso */}
      {item.status === 'pending' && 
       item.progress === undefined && 
       !item.currentStep && 
       !item.isPlaylist && (
        <div className="mb-3">
          <div 
            className="p-3 rounded-lg border backdrop-blur-sm"
            style={{
              background: 'rgba(234, 179, 8, 0.05)',
              borderColor: 'rgba(234, 179, 8, 0.2)'
            }}
          >
            <div className="flex items-center gap-2">
              <svg 
                className="w-4 h-4 flex-shrink-0 animate-pulse" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                style={{ color: 'rgba(234, 179, 8, 0.9)' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm" style={{ color: 'rgba(234, 179, 8, 0.9)' }}>
                {item.startTime 
                  ? `Aguardando início do download${(() => {
                      const elapsed = Math.floor((Date.now() - item.startTime!) / 1000);
                      if (elapsed > 30) {
                        return ` (há ${Math.floor(elapsed / 60)}m)`;
                      }
                      return '';
                    })()}`
                  : 'Aguardando processamento...'
                }
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Detalhes da Playlist */}
      {item.isPlaylist && item.playlistItems && item.playlistItems.length > 0 && (
        <div 
          className="mt-3 p-3 rounded-lg border backdrop-blur-sm"
          style={{
            background: 'rgba(16, 185, 129, 0.05)',
            borderColor: 'rgba(16, 185, 129, 0.2)'
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: 'rgba(209, 213, 219, 0.9)' }}>
              Faixas da Playlist ({item.playlistItems.length})
            </span>
            <div className="flex items-center gap-2 text-xs">
              <span style={{ color: 'rgba(110, 231, 183, 0.9)' }}>
                ✓ {item.playlistItems.filter((p: any) => p.status === 'completed').length}
              </span>
              <span style={{ color: 'rgba(252, 165, 165, 0.9)' }}>
                ✗ {item.playlistItems.filter((p: any) => p.status === 'error').length}
              </span>
            </div>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1 custom-scroll">
            {item.playlistItems.slice(0, 10).map((track: any, index: number) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <div 
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: 
                      track.status === 'completed' ? 'rgba(16, 185, 129, 0.9)' :
                      track.status === 'error' ? 'rgba(239, 68, 68, 0.9)' :
                      track.status === 'downloading' ? 'rgba(16, 185, 129, 0.9)' :
                      'rgba(156, 163, 175, 0.9)',
                    boxShadow: track.status === 'downloading' || track.status === 'completed'
                      ? '0 0 4px rgba(16, 185, 129, 0.5)'
                      : 'none'
                  }}
                />
                <span className="truncate" style={{ color: 'rgba(209, 213, 219, 0.9)' }}>
                  {track.title}
                </span>
                {track.progress && track.progress > 0 && (
                  <span className="text-xs ml-auto" style={{ color: 'rgba(107, 114, 128, 0.9)' }}>
                    {track.progress}%
                  </span>
                )}
              </div>
            ))}
            {item.playlistItems.length > 10 && (
              <div className="text-xs text-center pt-1" style={{ color: 'rgba(107, 114, 128, 0.9)' }}>
                +{item.playlistItems.length - 10} faixas restantes...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Erro */}
      {item.error && (
        <div 
          className="mt-3 p-3 rounded-lg border backdrop-blur-sm"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            borderColor: 'rgba(239, 68, 68, 0.2)'
          }}
        >
          <div className="flex items-start gap-2">
            <svg 
              className="w-5 h-5 flex-shrink-0 mt-0.5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              style={{ color: 'rgba(252, 165, 165, 0.9)' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium text-sm" style={{ color: 'rgba(252, 165, 165, 0.9)' }}>
                Erro no Download
              </p>
              <p className="text-sm mt-1" style={{ color: 'rgba(254, 202, 202, 0.9)' }}>
                {item.error}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DownloadQueue({ onClose }: DownloadQueueProps) {
  const { 
    queue, 
    history,
    removeFromQueue, 
    retryDownload, 
    cancelDownload,
    clearHistory,
    getPlaylistProgressData,
    clearStuckDownloads,
    addToQueue
  } = useDownload();

  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'failed'>('all');
  const [modalColor, setModalColor] = useState<string>('rgba(0, 0, 0, 0.9)');
  
  // Cache para evitar recálculos desnecessários
  const queueHashRef = useRef<string>('');
  const historyHashRef = useRef<string>('');
  const allDownloadsRef = useRef<any[]>([]);

  // Função otimizada para gerar hash simples
  const generateHash = (items: any[]) => {
    return items.reduce((acc, item) => acc + item.id + item.status, '');
  };

  // Combina queue e history de forma otimizada
  const allDownloads = useMemo(() => {
    const queueHash = generateHash(queue);
    const historyHash = generateHash(history);
    
    // Só recalcular se realmente mudou
    if (queueHash === queueHashRef.current && historyHash === historyHashRef.current) {
      return allDownloadsRef.current;
    }
    
    queueHashRef.current = queueHash;
    historyHashRef.current = historyHash;
    
    const queueItems = queue.map(item => ({ ...item, source: 'queue' as const }));
    // Filtrar histórico para remover itens que ainda estão na queue (evitar duplicatas)
    const queueIds = new Set(queue.map(item => item.id));
    const historyItems = history
      .filter(item => !queueIds.has(item.id)) // Remover duplicatas
      .map(item => ({ ...item, source: 'history' as const }));
    
    // Usar sort estável e mais eficiente
    const combined = [...queueItems, ...historyItems];
    combined.sort((a, b) => {
      const aTime = (a as any).timestamp || (a as any).startTime || Date.now();
      const bTime = (b as any).timestamp || (b as any).startTime || Date.now();
      return bTime - aTime; // Mais recente primeiro
    });
    
    allDownloadsRef.current = combined;
    return combined;
  }, [queue, history]);

  // Filtra downloads baseado no filtro selecionado - otimizado
  const filteredDownloads = useMemo(() => {
    let filtered = allDownloads;
    
    if (filter !== 'all') {
      switch (filter) {
        case 'active':
          filtered = allDownloads.filter(item => 
            ['pending', 'queued', 'downloading'].includes(item.status)
          );
          break;
        case 'completed':
          filtered = allDownloads.filter(item => item.status === 'completed');
          break;
        case 'failed':
          filtered = allDownloads.filter(item => item.status === 'error');
          break;
      }
    }
    
    return filtered;
  }, [allDownloads, filter]);

  // Agrupar downloads por álbum
  const groupedDownloads = useMemo(() => {
    const groups: Map<string, typeof filteredDownloads> = new Map();
    const ungrouped: typeof filteredDownloads = [];
    
    filteredDownloads.forEach(item => {
      const albumName = (item as any).albumName;
      const albumArtist = (item as any).albumArtist;
      
      if (albumName && !item.isPlaylist) {
        // Criar chave única para o álbum
        const albumKey = `${albumName}|||${albumArtist || ''}`;
        
        if (!groups.has(albumKey)) {
          groups.set(albumKey, []);
        }
        groups.get(albumKey)!.push(item);
      } else {
        ungrouped.push(item);
      }
    });
    
    return { groups, ungrouped };
  }, [filteredDownloads]);

  // Calcular estatísticas do álbum
  const getAlbumStats = useCallback((items: any[]) => {
    const total = items.length;
    const completed = items.filter(i => i.status === 'completed').length;
    const downloading = items.filter(i => i.status === 'downloading').length;
    const pending = items.filter(i => i.status === 'pending' || i.status === 'queued').length;
    const errors = items.filter(i => i.status === 'error').length;
    
    return { total, completed, downloading, pending, errors };
  }, []);

  // Estatísticas memoizadas
  const stats = useMemo(() => {
    const active = allDownloads.filter(item => 
      ['pending', 'queued', 'downloading'].includes(item.status)
    ).length;
    const completed = allDownloads.filter(item => item.status === 'completed').length;
    const failed = allDownloads.filter(item => item.status === 'error').length;
    
    return { active, completed, failed, total: allDownloads.length };
  }, [allDownloads]);

  // Extrai cor do primeiro item para tema do modal - otimizado
  useEffect(() => {
    let isCancelled = false;
    
    if (allDownloads.length > 0 && (allDownloads[0] as any).thumbnail) {
      const extractColor = async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 100)); // Throttle
          
          if (isCancelled) return;
          
          const colorData = await getCachedDominantColor((allDownloads[0] as any).thumbnail);
          
          if (!isCancelled) {
            setModalColor(colorData.rgba(0.15));
          }
        } catch (error) {
          if (!isCancelled) {
            setModalColor('rgba(0, 0, 0, 0.9)');
          }
        }
      };
      
      extractColor();
    }
    
    return () => {
      isCancelled = true;
    };
  }, [allDownloads]);

  // Funções memoizadas para evitar re-renders
  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'downloading': return 'bg-blue-500 animate-pulse';
      case 'error': return 'bg-red-500';
      case 'pending': return 'bg-yellow-500';
      case 'queued': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  }, []);

  const getStatusBadgeColor = useCallback((status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-600/20 text-green-400 border border-green-500/30';
      case 'downloading': return 'bg-blue-600/20 text-blue-400 border border-blue-500/30';
      case 'error': return 'bg-red-600/20 text-red-400 border border-red-500/30';
      case 'pending': return 'bg-yellow-600/20 text-yellow-400 border border-yellow-500/30';
      case 'queued': return 'bg-gray-600/20 text-gray-400 border border-gray-500/30';
      default: return 'bg-gray-600/20 text-gray-400 border border-gray-500/30';
    }
  }, []);

  const getStatusText = useCallback((status: string) => {
    switch (status) {
      case 'completed': return 'Concluído';
      case 'downloading': return 'Baixando';
      case 'error': return 'Falhou';
      case 'pending': return 'Pendente';
      case 'queued': return 'Na Fila';
      default: return 'Desconhecido';
    }
  }, []);

  const handleRetry = useCallback(async (item: any) => {
    if (item.source === 'queue') {
      await retryDownload(item.id);
    } else {
      // Re-adiciona à fila um item do histórico
      addToQueue({
        url: item.url,
        title: item.title,
        isPlaylist: item.isPlaylist || false,
        status: 'pending' as const,
        steps: []
      });
    }
  }, [retryDownload, addToQueue]);

  const handleRemove = useCallback((item: any) => {
    if (item.source === 'queue') {
      // Se estiver baixando, cancelar primeiro
      if (item.status === 'downloading') {
        cancelDownload(item.id);
        // Aguardar um pouco e depois remover
        setTimeout(() => {
          removeFromQueue(item.id);
        }, 500);
      } else {
        // Para outros status, remover diretamente
        removeFromQueue(item.id);
      }
    }
  }, [removeFromQueue, cancelDownload]);

  const formatDate = useCallback((timestamp: string | number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div 
        className="w-full max-w-6xl h-[90vh] rounded-xl border shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl"
        style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(39, 39, 42, 0.7) 30%, rgba(24, 24, 27, 0.8) 100%)',
          borderColor: 'rgba(16, 185, 129, 0.3)',
          boxShadow: '0 8px 32px rgba(16, 185, 129, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between p-6 border-b flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 50%, rgba(39, 39, 42, 0.5) 100%)`,
            borderColor: 'rgba(16, 185, 129, 0.2)'
          }}
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div 
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ 
                  backgroundColor: 'rgb(16, 185, 129)',
                  boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)'
                }}
              />
              <h2 
                className="text-2xl font-semibold"
                style={{ color: 'rgb(16, 185, 129)' }}
              >
                Gerenciador de Downloads
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span 
                className="px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm"
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: 'rgba(110, 231, 183, 0.9)',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}
              >
                {stats.total} total
              </span>
              {stats.active > 0 && (
                <span 
                  className="px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm"
                  style={{
                    background: 'rgba(234, 179, 8, 0.15)',
                    color: 'rgba(253, 224, 71, 0.9)',
                    border: '1px solid rgba(234, 179, 8, 0.3)'
                  }}
                >
                  {stats.active} ativo{stats.active > 1 ? 's' : ''}
                </span>
              )}
              {stats.failed > 0 && (
                <span 
                  className="px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm"
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: 'rgba(252, 165, 165, 0.9)',
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                  }}
                >
                  {stats.failed} falhou
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {queue.some(item => 
              (item.status === 'downloading' || item.status === 'pending') && 
              item.startTime && 
              (Date.now() - item.startTime > 5 * 60 * 1000)
            ) && (
              <button
                onClick={clearStuckDownloads}
                className="px-4 py-2 rounded-lg transition-all duration-200 backdrop-blur-sm hover:scale-105"
                style={{
                  background: 'rgba(234, 179, 8, 0.15)',
                  color: 'rgba(253, 224, 71, 0.9)',
                  border: '1px solid rgba(234, 179, 8, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(234, 179, 8, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(234, 179, 8, 0.15)';
                }}
                title="Limpar downloads travados (mais de 5 minutos sem progresso)"
              >
                🧹 Limpar Travados
              </button>
            )}
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="px-4 py-2 rounded-lg transition-all duration-200 backdrop-blur-sm hover:scale-105"
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: 'rgba(252, 165, 165, 0.9)',
                  border: '1px solid rgba(239, 68, 68, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                }}
              >
                Limpar Histórico
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-emerald-400 transition-all duration-200 p-2 rounded-full hover:scale-105"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.2)'
              }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div 
          className="flex items-center gap-2 p-4 border-b flex-shrink-0"
          style={{ borderColor: 'rgba(16, 185, 129, 0.2)' }}
        >
          {[
            { key: 'all', label: 'Todos', count: stats.total },
            { key: 'active', label: 'Ativos', count: stats.active },
            { key: 'completed', label: 'Concluídos', count: stats.completed },
            { key: 'failed', label: 'Falharam', count: stats.failed },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key as any)}
              className="px-4 py-2 rounded-lg transition-all duration-200 backdrop-blur-sm"
              style={
                filter === key
                  ? {
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: 'rgba(110, 231, 183, 1)',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)'
                    }
                  : {
                      background: 'rgba(16, 185, 129, 0.05)',
                      color: 'rgba(156, 163, 175, 0.9)',
                      border: '1px solid rgba(16, 185, 129, 0.2)'
                    }
              }
              onMouseEnter={(e) => {
                if (filter !== key) {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)';
                  e.currentTarget.style.color = 'rgba(110, 231, 183, 0.9)';
                }
              }}
              onMouseLeave={(e) => {
                if (filter !== key) {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.05)';
                  e.currentTarget.style.color = 'rgba(156, 163, 175, 0.9)';
                }
              }}
            >
              {label} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
            </button>
          ))}
        </div>

        {/* Lista de Downloads */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scroll">
          {filteredDownloads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full" style={{ color: 'rgba(156, 163, 175, 0.9)' }}>
              <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <p className="text-lg">Nenhum download encontrado</p>
              <p className="text-sm opacity-70">
                {filter === 'all' ? 'Inicie um download para vê-lo aqui' : `Nenhum download ${filter === 'active' ? 'ativo' : filter === 'completed' ? 'concluído' : 'com falha'}`}
              </p>
            </div>
          ) : (
            <>
              {/* Grupos de álbuns */}
              {Array.from(groupedDownloads.groups.entries()).map(([albumKey, albumItems]) => (
                <AlbumGroup 
                  key={albumKey}
                  albumKey={albumKey}
                  albumItems={albumItems}
                  handleRetry={handleRetry}
                  handleRemove={handleRemove}
                  getStatusText={getStatusText}
                  formatDate={formatDate}
                  formatDuration={formatDuration}
                  getAlbumStats={getAlbumStats}
                />
              ))}
              
              {/* Downloads não agrupados (sem álbum) */}
              {groupedDownloads.ungrouped.map((item) => (
                <DownloadItemComponent key={`${item.source}-${item.id}`} item={item} handleRetry={handleRetry} handleRemove={handleRemove} getStatusText={getStatusText} formatDate={formatDate} formatDuration={formatDuration} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
} 