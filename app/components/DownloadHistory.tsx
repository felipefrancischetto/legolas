'use client';

import { useDownload } from '../contexts/DownloadContext';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function DownloadHistory() {
  const { history, clearHistory } = useDownload();

  if (history.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 w-80 bg-zinc-900 rounded-lg border border-zinc-800 p-4 animate-slide-up">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-medium text-white">Histórico de Downloads</h3>
        <button
          onClick={clearHistory}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          Limpar
        </button>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {history.map((item) => (
          <div
            key={item.id}
            className="bg-zinc-800 rounded p-3 animate-fade-in"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{item.title}</p>
              <p className="text-xs text-gray-400">
                {formatDistanceToNow(new Date(item.downloadedAt), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </p>
            </div>

            {item.isPlaylist && item.playlistItems && (
              <div className="mt-2 space-y-1">
                {item.playlistItems.map((playlistItem: any, index: number) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
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