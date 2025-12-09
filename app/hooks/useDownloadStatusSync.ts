'use client';

import { useEffect, useRef } from 'react';
import { useDownload } from '../contexts/DownloadContext';

interface PlaylistProgressUpdate {
  current: number;
  total: number;
  completed: number;
  errors: number;
  downloading: number;
}

export function useDownloadStatusSync(
  currentDownloadId: string | null,
  isPlaylist: boolean = false,
  onProgressUpdate?: (progress: PlaylistProgressUpdate) => void
) {
  const { 
    updateQueueItem, 
    getPlaylistProgressData,
    setDownloadStatus 
  } = useDownload();
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastProgressRef = useRef<PlaylistProgressUpdate | null>(null);

  useEffect(() => {
    if (!currentDownloadId) return;

    if (isPlaylist) {
      // Para playlists, fazer polling a cada 2 segundos
      intervalRef.current = setInterval(async () => {
        const progressData = getPlaylistProgressData(currentDownloadId);
        if (progressData) {
          const currentProgress: PlaylistProgressUpdate = {
            current: progressData.current,
            total: progressData.total,
            completed: progressData.completed,
            errors: progressData.errors,
            downloading: progressData.downloading
          };

          // Verificar se houve mudanças significativas
          const lastProgress = lastProgressRef.current;
          if (!lastProgress || 
              lastProgress.completed !== currentProgress.completed ||
              lastProgress.errors !== currentProgress.errors ||
              lastProgress.downloading !== currentProgress.downloading) {
            
            // Chamar callback se fornecido
            onProgressUpdate?.(currentProgress);
            
            // Verificar se a playlist foi concluída
            if (currentProgress.current >= currentProgress.total) {
              updateQueueItem(currentDownloadId, { 
                status: 'completed', 
                progress: 100 
              });
              
              // Parar o polling
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }
            }
          }
          
          lastProgressRef.current = currentProgress;
        }
      }, 2000);
    } else {
      // Para downloads individuais, simular progresso
      let progress = 0;
      intervalRef.current = setInterval(() => {
        progress += 5;
        if (progress <= 100) {
          updateQueueItem(currentDownloadId, { 
            status: 'downloading', 
            progress 
          });
        }
        
        if (progress >= 100) {
          updateQueueItem(currentDownloadId, { 
            status: 'completed', 
            progress: 100 
          });
          
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      }, 500);
    }

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [currentDownloadId, isPlaylist, getPlaylistProgressData, updateQueueItem, setDownloadStatus, onProgressUpdate]);

  // Cleanup no unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    getCurrentProgress: () => currentDownloadId ? getPlaylistProgressData(currentDownloadId) : null
  };
} 