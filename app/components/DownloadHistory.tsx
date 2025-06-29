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
    <div className="fixed bottom-4 left-4 w-80 bg-zinc-900 rounded-lg border border-zinc-800 p-4 animate-slide-up sm:bottom-2 sm:left-2 sm:w-[calc(100vw-1rem)] sm:max-w-sm sm:p-3">
      <div className="flex justify-between items-center mb-3 sm:mb-2">
        <h3 className="text-sm font-medium text-white sm:text-xs">Histórico de Downloads</h3>
        <button
          onClick={clearHistory}
          className="text-xs text-gray-400 hover:text-white transition-colors sm:text-[10px]"
        >
          Limpar
        </button>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto custom-scroll sm:max-h-48 sm:space-y-1">
        {history.map((item) => (
          <div
            key={item.id}
            className="bg-zinc-800 rounded p-3 animate-fade-in sm:p-2"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate sm:text-xs">{item.title}</p>
              <p className="text-xs text-gray-400 sm:text-[10px]">
                {formatDistanceToNow(new Date(item.downloadedAt), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </p>
            </div>

            {item.isPlaylist && item.playlistItems && (
              <div className="mt-2 space-y-1 sm:mt-1">
                {item.playlistItems.map((playlistItem: any, index: number) => (
                  <div key={index} className="flex items-center gap-2 sm:gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-400 sm:w-1.5 sm:h-1.5" />
                    <p className="text-xs text-gray-400 truncate sm:text-[10px]">
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