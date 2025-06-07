'use client';

import { useDownload } from '../contexts/DownloadContext';
import DownloadStatusIndicator from './DownloadStatusIndicator';

export default function DownloadQueue({ onClose }: { onClose: () => void }) {
  const { 
    queue, 
    removeFromQueue, 
    retryDownload, 
    cancelDownload,
    getPlaylistProgressData 
  } = useDownload();

  if (queue.length === 0) {
    return null;
  }

  return (
    <div className={`fixed right-4 w-96 max-h-[80vh] bg-zinc-900 rounded-lg border border-zinc-800 p-4 animate-slide-up z-50`}>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-medium text-white">Fila de Downloads</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="space-y-3 max-h-60 overflow-y-auto">
        {queue.map((item) => {
          // Usar dados precisos do progresso da playlist
          const progressData = item.isPlaylist ? getPlaylistProgressData(item.id) : null;
          const playlistProgress = progressData ? {
            current: progressData.current,
            total: progressData.total,
            completed: progressData.completed,
            errors: progressData.errors,
            downloading: progressData.downloading || 0
          } : undefined;

          let playlistCurrentStep = undefined;
          let playlistCurrentSubstep = undefined;
          let playlistCurrentDetail = undefined;
          let playlistCurrentSteps = undefined;
          if (item.isPlaylist && item.playlistItems && item.playlistItems.length > 0) {
            const currentTrack = item.playlistItems.find((track: any) => track.status === 'downloading')
              || item.playlistItems.find((track: any) => track.status === 'pending');
            if (currentTrack) {
              playlistCurrentStep = currentTrack.currentStep;
              playlistCurrentSubstep = currentTrack.currentSubstep;
              playlistCurrentDetail = currentTrack.detail;
              playlistCurrentSteps = currentTrack.steps;
            }
          }

          return (
            <div key={item.id} className="relative">
              <DownloadStatusIndicator
                type={item.isPlaylist ? 'playlist' : 'individual'}
                status={item.status as any}
                title={item.title || 'Download sem título'}
                progress={item.progress || 0}
                playlistProgress={playlistProgress}
                error={item.error}
                loading={item.status === 'downloading'}
                allowMinimize={true}
                defaultMinimized={item.status === 'completed'} // Minimizar downloads concluídos por padrão
                autoMinimizeAfter={item.isPlaylist ? 8 : 3} // Menos tempo na fila
                currentStep={item.isPlaylist ? playlistCurrentStep : item.currentStep}
                currentSubstep={item.isPlaylist ? playlistCurrentSubstep : item.currentSubstep}
                detail={item.isPlaylist ? playlistCurrentDetail : item.detail}
                steps={item.isPlaylist ? playlistCurrentSteps : item.steps}
              />
              
              {/* Botões de ação */}
              <div className="absolute top-2 right-2 flex gap-1">
                {(item.status === 'downloading' || item.status === 'pending') && (
                  <button
                    onClick={() => cancelDownload(item.id)}
                    className="p-1 text-yellow-400 hover:text-white transition-colors bg-zinc-800/80 rounded"
                    title="Cancelar download"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                {item.status === 'error' && (
                  <button
                    onClick={() => retryDownload(item.id)}
                    className="p-1 text-blue-400 hover:text-white transition-colors bg-zinc-800/80 rounded"
                    title="Tentar novamente"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M19.418 15A7.974 7.974 0 0012 8c-1.657 0-3.183.507-4.418 1.382" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => removeFromQueue(item.id)}
                  className="p-1 text-gray-400 hover:text-white transition-colors bg-zinc-800/80 rounded"
                  title="Remover da fila"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Lista de faixas da playlist com controles individuais */}
              {item.isPlaylist && item.playlistItems && item.playlistItems.length > 0 && (
                <div className="mt-2 pl-6 space-y-1 max-h-32 overflow-y-auto border-l-2 border-zinc-700">
                  {item.playlistItems.map((playlistItem: any, index: number) => (
                    <div key={index} className="flex items-center gap-2 p-1 rounded bg-zinc-800/50">
                      <div className={`w-2 h-2 rounded-full ${
                        playlistItem.status === 'completed' ? 'bg-green-400' :
                        playlistItem.status === 'downloading' ? 'bg-blue-400 animate-pulse' :
                        playlistItem.status === 'error' ? 'bg-red-400' :
                        'bg-zinc-600'
                      }`} />
                      
                      <p className="text-xs text-gray-300 truncate flex-1">
                        {playlistItem.title}
                      </p>
                      
                      <div className="flex gap-1">
                        {(playlistItem.status === 'downloading' || playlistItem.status === 'pending') && (
                          <button
                            onClick={() => cancelDownload(item.id, index)}
                            className="text-yellow-400 hover:text-white transition-colors"
                            title="Cancelar esta faixa"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {playlistItem.status === 'error' && (
                          <button
                            onClick={() => retryDownload(item.id, index)}
                            className="text-blue-400 hover:text-white transition-colors"
                            title="Tentar novamente esta faixa"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M19.418 15A7.974 7.974 0 0012 8c-1.657 0-3.183.507-4.418 1.382" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
} 