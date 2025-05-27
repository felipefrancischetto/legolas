'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface DownloadItem {
  id: string;
  url: string;
  status: 'pending' | 'queued' | 'downloading' | 'completed' | 'error';
  progress?: number;
  error?: string;
  [key: string]: any;
}

interface DownloadContextType {
  queue: DownloadItem[];
  history: DownloadItem[];
  addToQueue: (item: string | Omit<DownloadItem, 'id'>) => DownloadItem;
  removeFromQueue: (id: string) => void;
  updateQueueItem: (id: string, updates: Partial<DownloadItem>) => void;
  clearHistory: () => void;
  activeDownloads: number;
  maxConcurrentDownloads: number;
  startDownload: () => void;
  finishDownload: () => void;
  retryDownload: (id: string, playlistIndex?: number) => void;
  cancelDownload: (id: string, playlistIndex?: number) => void;
  fetchAndSyncPlaylistStatus: () => Promise<void>;
  files: any[];
  fetchFiles: () => Promise<void>;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DownloadItem[]>([]);
  const [history, setHistory] = useState<DownloadItem[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const maxConcurrentDownloads = 3;
  const activeDownloads = queue.filter(item => item.status === 'downloading').length;

  // Carregar histórico do localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('downloadHistory');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  // Salvar histórico no localStorage
  useEffect(() => {
    localStorage.setItem('downloadHistory', JSON.stringify(history));
  }, [history]);

  const addToQueue = (item: string | Omit<DownloadItem, 'id'>): DownloadItem => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let queueItem: DownloadItem;
    if (typeof item === 'string') {
      queueItem = { id, url: item, status: 'pending' };
    } else {
      queueItem = {
        id,
        url: item.url || '',
        status: item.status || 'pending',
        ...item
      };
    }
    setQueue(prev => [...prev, queueItem]);
    return queueItem;
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const updateQueueItem = (id: string, updates: Partial<DownloadItem>) => {
    setQueue(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));

    // Se o item foi concluído ou teve erro, movê-lo para o histórico
    if (updates.status === 'completed' || updates.status === 'error') {
      const item = queue.find(item => item.id === id);
      if (item) {
        setHistory(prev => [...prev, { ...item, ...updates }]);
        removeFromQueue(id);
      }
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('downloadHistory');
  };

  const startDownload = () => {};
  const finishDownload = () => {};

  // Retry download (playlistIndex opcional para item individual de playlist)
  const retryDownload = (id: string, playlistIndex?: number) => {
    setQueue(prev => prev.map(item => {
      if (item.id !== id) return item;
      if (item.isPlaylist && typeof playlistIndex === 'number' && item.playlistItems) {
        // Retry apenas o item da playlist
        const updatedPlaylistItems = item.playlistItems.map((plItem: any, idx: number) =>
          idx === playlistIndex ? { ...plItem, status: 'pending', progress: 0, error: undefined } : plItem
        );
        return { ...item, playlistItems: updatedPlaylistItems, status: 'pending', error: undefined };
      } else {
        // Retry o item inteiro
        return { ...item, status: 'pending', progress: 0, error: undefined };
      }
    }));
  };

  // Cancel download (playlistIndex opcional para item individual de playlist)
  const cancelDownload = (id: string, playlistIndex?: number) => {
    setQueue(prev => prev.map(item => {
      if (item.id !== id) return item;
      if (item.isPlaylist && typeof playlistIndex === 'number' && item.playlistItems) {
        // Cancelar apenas o item da playlist
        const updatedPlaylistItems = item.playlistItems.map((plItem: any, idx: number) =>
          idx === playlistIndex ? { ...plItem, status: 'error', error: 'Cancelado pelo usuário' } : plItem
        );
        return { ...item, playlistItems: updatedPlaylistItems };
      } else {
        // Cancelar o item inteiro
        return { ...item, status: 'error', error: 'Cancelado pelo usuário' };
      }
    }));
  };

  // Função para buscar arquivos baixados
  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/files');
      const data = await response.json();
      setFiles(data.files || []);
    } catch (error) {
      // Ignorar erro
    }
  };

  // Sincroniza status real da playlist com o backend E EXISTÊNCIA DO ARQUIVO
  const fetchAndSyncPlaylistStatus = async () => {
    try {
      const res = await fetch('/api/playlist-status');
      const data = await res.json();
      await fetchFiles();
      if (data && Array.isArray(data.videos)) {
        setQueue(prevQueue => prevQueue.map(item => {
          if (!item.isPlaylist || !item.playlistItems) return item;
          // Atualiza status das faixas
          const updatedPlaylistItems = item.playlistItems.map((plItem: any, idx: number) => {
            const backendStatus = data.videos[idx];
            if (!backendStatus) return plItem;
            // Checar se arquivo existe
            const fileExists = files.some(f => {
              // Comparar por título ou displayName
              return (
                (f.title && f.title.trim().toLowerCase() === plItem.title.trim().toLowerCase()) ||
                (f.displayName && f.displayName.trim().toLowerCase() === plItem.title.trim().toLowerCase())
              );
            });
            let status: any = plItem.status;
            if ((backendStatus.status === 'success' || backendStatus.status === 'existing') && fileExists) status = 'completed';
            else if (backendStatus.status === 'downloading') status = 'downloading';
            else if (backendStatus.status === 'error') status = 'error';
            else status = 'pending';
            return {
              ...plItem,
              status,
              error: backendStatus.status === 'error' ? backendStatus.message : undefined,
              progress: status === 'completed' ? 100 : plItem.progress || 0,
            };
          });
          // Atualiza status geral do item playlist
          let overallStatus = 'pending';
          if (updatedPlaylistItems.every((pl: any) => pl.status === 'completed')) overallStatus = 'completed';
          else if (updatedPlaylistItems.some((pl: any) => pl.status === 'downloading')) overallStatus = 'downloading';
          else if (updatedPlaylistItems.some((pl: any) => pl.status === 'error')) overallStatus = 'error';
          return {
            ...item,
            playlistItems: updatedPlaylistItems,
            status: overallStatus as any,
          };
        }));
      }
    } catch (err) {
      // Ignorar erros de polling
    }
  };

  return (
    <DownloadContext.Provider value={{
      queue,
      history,
      addToQueue,
      removeFromQueue,
      updateQueueItem,
      clearHistory,
      activeDownloads,
      maxConcurrentDownloads,
      startDownload,
      finishDownload,
      retryDownload,
      cancelDownload,
      fetchAndSyncPlaylistStatus,
      files,
      fetchFiles,
    }}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownload() {
  const context = useContext(DownloadContext);
  if (context === undefined) {
    throw new Error('useDownload must be used within a DownloadProvider');
  }
  return context;
} 