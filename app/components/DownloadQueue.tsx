'use client';

import { useDownload } from '../contexts/DownloadContext';
import { useState, useMemo } from 'react';
import { getCachedDominantColor } from '../utils/colorExtractor';
import { useEffect } from 'react';

interface DownloadQueueProps {
  onClose: () => void;
}

export default function DownloadQueue({ onClose }: DownloadQueueProps) {
  const { 
    queue, 
    history,
    removeFromQueue, 
    retryDownload, 
    cancelDownload,
    clearHistory,
    getPlaylistProgressData 
  } = useDownload();

  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'failed'>('all');
  const [modalColor, setModalColor] = useState<string>('rgba(0, 0, 0, 0.9)');

  // Combina queue e history para mostrar todos os downloads
  const allDownloads = useMemo(() => {
    const queueItems = queue.map(item => ({ ...item, source: 'queue' as const }));
    const historyItems = history.map(item => ({ ...item, source: 'history' as const }));
    return [...queueItems, ...historyItems].sort((a, b) => {
      const aTime = (a as any).timestamp || (a as any).createdAt || 0;
      const bTime = (b as any).timestamp || (b as any).createdAt || 0;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [queue, history]);

  // Filtra downloads baseado no filtro selecionado
  const filteredDownloads = useMemo(() => {
    switch (filter) {
      case 'active':
        return allDownloads.filter(item => 
          ['pending', 'queued', 'downloading'].includes(item.status)
        );
      case 'completed':
        return allDownloads.filter(item => item.status === 'completed');
      case 'failed':
        return allDownloads.filter(item => item.status === 'error');
      default:
        return allDownloads;
    }
  }, [allDownloads, filter]);

  // Estatísticas
  const stats = useMemo(() => {
    const active = allDownloads.filter(item => 
      ['pending', 'queued', 'downloading'].includes(item.status)
    ).length;
    const completed = allDownloads.filter(item => item.status === 'completed').length;
    const failed = allDownloads.filter(item => item.status === 'error').length;
    
    return { active, completed, failed, total: allDownloads.length };
  }, [allDownloads]);

  // Extrai cor do primeiro item para tema do modal
  useEffect(() => {
    if (allDownloads.length > 0 && (allDownloads[0] as any).thumbnail) {
      const extractColor = async () => {
        try {
          const colorData = await getCachedDominantColor((allDownloads[0] as any).thumbnail);
          setModalColor(colorData.rgba(0.15));
        } catch (error) {
          setModalColor('rgba(0, 0, 0, 0.9)');
        }
      };
      extractColor();
    }
  }, [allDownloads]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'downloading': return 'bg-blue-500 animate-pulse';
      case 'error': return 'bg-red-500';
      case 'pending': return 'bg-yellow-500';
      case 'queued': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-600/20 text-green-400 border border-green-500/30';
      case 'downloading': return 'bg-blue-600/20 text-blue-400 border border-blue-500/30';
      case 'error': return 'bg-red-600/20 text-red-400 border border-red-500/30';
      case 'pending': return 'bg-yellow-600/20 text-yellow-400 border border-yellow-500/30';
      case 'queued': return 'bg-gray-600/20 text-gray-400 border border-gray-500/30';
      default: return 'bg-gray-600/20 text-gray-400 border border-gray-500/30';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Concluído';
      case 'downloading': return 'Baixando';
      case 'error': return 'Falhou';
      case 'pending': return 'Pendente';
      case 'queued': return 'Na Fila';
      default: return 'Desconhecido';
    }
  };

  const handleRetry = async (item: any) => {
    if (item.source === 'queue') {
      await retryDownload(item.id);
    } else {
      // Re-adiciona à fila um item do histórico
      const { addToQueue } = useDownload();
      await addToQueue({
        url: item.url,
        title: item.title,
        isPlaylist: item.isPlaylist || false,
        format: item.format || 'mp3',
        enrichWithBeatport: item.enrichWithBeatport || false
      });
    }
  };

  const handleRemove = (item: any) => {
    if (item.source === 'queue') {
      removeFromQueue(item.id);
    }
    // Items do histórico não podem ser removidos individualmente
  };

  const formatDate = (timestamp: string | number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div 
        className="w-full max-w-6xl h-[90vh] rounded-xl border border-white/10 shadow-2xl flex flex-col overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${modalColor} 0%, rgba(0, 0, 0, 0.95) 100%)`,
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-black/20">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-white">Gerenciador de Downloads</h2>
            <div className="flex items-center gap-2">
              <span className="bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-sm font-medium border border-blue-500/30">
                {stats.total} total
              </span>
              {stats.active > 0 && (
                <span className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-sm font-medium border border-yellow-500/30">
                  {stats.active} ativo{stats.active > 1 ? 's' : ''}
                </span>
              )}
              {stats.failed > 0 && (
                <span className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-sm font-medium border border-red-500/30">
                  {stats.failed} falhou
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors border border-red-500/30"
              >
                Limpar Histórico
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 p-4 border-b border-white/10 bg-black/10">
          {[
            { key: 'all', label: 'Todos', count: stats.total },
            { key: 'active', label: 'Ativos', count: stats.active },
            { key: 'completed', label: 'Concluídos', count: stats.completed },
            { key: 'failed', label: 'Falharam', count: stats.failed },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key as any)}
              className={`px-4 py-2 rounded-lg transition-all ${
                filter === key
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10'
              }`}
            >
              {label} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
            </button>
          ))}
        </div>

        {/* Lista de Downloads */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scroll">
          {filteredDownloads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <p className="text-lg">Nenhum download encontrado</p>
              <p className="text-sm opacity-70">
                {filter === 'all' ? 'Inicie um download para vê-lo aqui' : `Nenhum download ${filter === 'active' ? 'ativo' : filter === 'completed' ? 'concluído' : 'com falha'}`}
              </p>
            </div>
          ) : (
            filteredDownloads.map((item) => (
              <div
                key={`${item.source}-${item.id}`}
                className={`bg-black/30 backdrop-blur-sm rounded-xl p-4 border transition-all duration-200 ${
                  item.status === 'downloading' 
                    ? 'border-blue-500/50 ring-2 ring-blue-500/20' 
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                {/* Header do Item */}
                <div className="flex items-start justify-between mb-3">
                                     <div className="flex items-start gap-3 flex-1 min-w-0">
                     {/* Thumbnail */}
                     {(item as any).thumbnail && (
                       <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
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
                         <div className={`w-3 h-3 rounded-full flex-shrink-0 ${getStatusColor(item.status)}`} />
                         <h3 className="font-semibold text-white truncate text-lg">{item.title}</h3>
                         {item.isPlaylist && (
                           <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded text-xs border border-purple-500/30">
                             Playlist
                           </span>
                         )}
                         {item.source === 'history' && (
                           <span className="bg-gray-500/20 text-gray-400 px-2 py-1 rounded text-xs border border-gray-500/30">
                             Histórico
                           </span>
                         )}
                       </div>
                       
                       <div className="flex items-center gap-4 text-sm text-gray-400">
                         {(item as any).format && (
                           <span className="bg-gray-600/20 px-2 py-1 rounded text-xs">
                             {(item as any).format.toUpperCase()}
                           </span>
                         )}
                         {(item as any).enrichWithBeatport && (
                           <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded text-xs border border-orange-500/30">
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
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor(item.status)}`}>
                      {getStatusText(item.status)}
                    </span>
                    
                    <div className="flex items-center gap-1">
                      {item.status === 'error' && (
                        <button
                          onClick={() => handleRetry(item)}
                          className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 rounded-lg transition-colors"
                          title="Tentar novamente"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      )}
                      
                      {item.source === 'queue' && ['pending', 'queued'].includes(item.status) && (
                        <button
                          onClick={() => handleRemove(item)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                          title="Remover da fila"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progresso */}
                {(item.status === 'downloading' || item.status === 'queued') && (
                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-400">{item.currentStep || 'Preparando...'}</span>
                      <span className="text-sm text-gray-400 font-mono">
                        {item.isPlaylist && item.playlistItems
                          ? `${item.playlistItems.filter((p: any) => p.status === 'completed').length}/${item.playlistItems.length}`
                          : `${item.progress || 0}%`
                        }
                      </span>
                    </div>
                    <div className="w-full bg-gray-700/50 rounded-full h-2">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          item.status === 'downloading' ? 'bg-blue-500 animate-pulse' : 'bg-gray-500'
                        }`}
                        style={{
                          width: item.isPlaylist && item.playlistItems
                            ? `${(item.playlistItems.filter((p: any) => p.status === 'completed').length / item.playlistItems.length) * 100}%`
                            : `${item.progress || 0}%`
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Detalhes da Playlist */}
                {item.isPlaylist && item.playlistItems && item.playlistItems.length > 0 && (
                  <div className="mt-3 p-3 bg-black/20 rounded-lg border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-300">
                        Faixas da Playlist ({item.playlistItems.length})
                      </span>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-green-400">
                          ✓ {item.playlistItems.filter((p: any) => p.status === 'completed').length}
                        </span>
                        <span className="text-red-400">
                          ✗ {item.playlistItems.filter((p: any) => p.status === 'error').length}
                        </span>
                      </div>
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1 custom-scroll">
                      {item.playlistItems.slice(0, 10).map((track: any, index: number) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor(track.status)}`} />
                          <span className="truncate text-gray-300">{track.title}</span>
                          {track.progress && track.progress > 0 && (
                            <span className="text-xs text-gray-500 ml-auto">{track.progress}%</span>
                          )}
                        </div>
                      ))}
                      {item.playlistItems.length > 10 && (
                        <div className="text-xs text-gray-500 text-center pt-1">
                          +{item.playlistItems.length - 10} faixas restantes...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Erro */}
                {item.error && (
                  <div className="mt-3 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-red-400 font-medium text-sm">Erro no Download</p>
                        <p className="text-red-300 text-sm mt-1">{item.error}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
} 