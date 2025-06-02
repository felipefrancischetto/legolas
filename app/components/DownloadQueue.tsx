'use client';

import { useDownload } from '../contexts/DownloadContext';

export default function DownloadQueue({ onClose }: { onClose: () => void }) {
  const { 
    queue, 
    removeFromQueue, 
    retryDownload, 
    cancelDownload, 
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
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {queue.map((item) => (
          <div
            key={item.id}
            className="bg-zinc-800 rounded p-3 animate-fade-in"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <p className="text-sm text-white truncate">{item.title}</p>
                {item.status === 'completed' && (
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <button
                onClick={() => removeFromQueue(item.id)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {(item.status === 'downloading' || item.status === 'pending') && (
                <button
                  onClick={() => cancelDownload(item.id)}
                  className="ml-2 text-yellow-400 hover:text-white transition-colors"
                  title="Cancelar download"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 6L6 18" />
                  </svg>
                </button>
              )}
              {item.status === 'error' && (
                <button
                  onClick={() => retryDownload(item.id)}
                  className="ml-2 text-blue-400 hover:text-white transition-colors"
                  title="Tentar novamente"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M19.418 15A7.974 7.974 0 0012 8c-1.657 0-3.183.507-4.418 1.382" />
                  </svg>
                </button>
              )}
            </div>
            
            {item.status === 'downloading' && (
              <div className="space-y-1">
                <div className="w-full bg-zinc-700 rounded-full h-1.5">
                  <div
                    className="bg-white h-full rounded-full transition-all duration-300"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 text-right">
                  {item.progress}%
                </p>
              </div>
            )}

            {item.status === 'error' && (
              <p className="text-xs text-red-400">{item.error}</p>
            )}

            {item.isPlaylist && item.playlistItems && (
              <div className="mt-2 space-y-1">
                {item.playlistItems.map((playlistItem: any, index: number) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-zinc-700">
                      {playlistItem.status === 'completed' && (
                        <div className="w-full h-full rounded-full bg-green-400" />
                      )}
                      {playlistItem.status === 'downloading' && (
                        <div className="w-full h-full rounded-full bg-white animate-pulse" />
                      )}
                      {playlistItem.status === 'error' && (
                        <div className="w-full h-full rounded-full bg-red-400" />
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate flex-1">
                      {playlistItem.title}
                    </p>
                    {(playlistItem.status === 'downloading' || playlistItem.status === 'pending') && (
                      <button
                        onClick={() => cancelDownload(item.id, index)}
                        className="text-yellow-400 hover:text-white transition-colors"
                        title="Cancelar download da faixa"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 6L6 18" />
                        </svg>
                      </button>
                    )}
                    {playlistItem.status === 'error' && (
                      <button
                        onClick={() => retryDownload(item.id, index)}
                        className="text-blue-400 hover:text-white transition-colors"
                        title="Tentar novamente esta faixa"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M19.418 15A7.974 7.974 0 0012 8c-1.657 0-3.183.507-4.418 1.382" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 