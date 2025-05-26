'use client';

import { useDownload } from '../contexts/DownloadContext';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function DownloadQueue({ onClose }: { onClose: () => void }) {
  const { queue, removeFromQueue } = useDownload();

  if (queue.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-zinc-900 rounded-lg border border-zinc-800 p-4 animate-slide-up">
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
                    </div>
                    <p className="text-xs text-gray-400 truncate">
                      {playlistItem.title}
                    </p>
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