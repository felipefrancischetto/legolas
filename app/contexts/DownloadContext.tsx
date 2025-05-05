'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { DownloadItem, DownloadHistory } from '@/types/download';

interface DownloadContextType {
  queue: DownloadItem[];
  history: DownloadHistory[];
  activeDownloads: number;
  maxConcurrentDownloads: number;
  addToQueue: (item: Omit<DownloadItem, 'id' | 'createdAt' | 'status' | 'progress'>) => DownloadItem;
  removeFromQueue: (id: string) => void;
  updateQueueItem: (id: string, updates: Partial<DownloadItem>) => void;
  clearHistory: () => void;
  startDownload: () => void;
  finishDownload: () => void;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DownloadItem[]>([]);
  const [history, setHistory] = useState<DownloadHistory[]>([]);
  const [activeDownloads, setActiveDownloads] = useState(0);
  const maxConcurrentDownloads = 3; // Limite de downloads simultâneos

  // Carregar dados do localStorage ao inicializar
  useEffect(() => {
    const savedQueue = localStorage.getItem('downloadQueue');
    const savedHistory = localStorage.getItem('downloadHistory');
    
    if (savedQueue) {
      setQueue(JSON.parse(savedQueue));
    }
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  // Salvar dados no localStorage quando mudarem
  useEffect(() => {
    localStorage.setItem('downloadQueue', JSON.stringify(queue));
  }, [queue]);

  useEffect(() => {
    localStorage.setItem('downloadHistory', JSON.stringify(history));
  }, [history]);

  const addToQueue = (item: Omit<DownloadItem, 'id' | 'createdAt' | 'status' | 'progress'>) => {
    const newItem: DownloadItem = {
      ...item,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      progress: 0,
    };
    setQueue(prev => [...prev, newItem]);
    return newItem;
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const updateQueueItem = (id: string, updates: Partial<DownloadItem>) => {
    setQueue(prev => prev.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, ...updates };
        
        // Se o download foi concluído, adicionar ao histórico
        if (updates.status === 'completed') {
          const historyItem: DownloadHistory = {
            id: item.id,
            title: item.title,
            url: item.url,
            downloadedAt: new Date().toISOString(),
            isPlaylist: item.isPlaylist,
            playlistItems: item.playlistItems?.map(playlistItem => ({
              title: playlistItem.title,
              downloadedAt: new Date().toISOString(),
            })),
          };
          setHistory(prev => [historyItem, ...prev]);
        }
        
        return updatedItem;
      }
      return item;
    }));
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const startDownload = () => {
    setActiveDownloads(prev => prev + 1);
  };

  const finishDownload = () => {
    setActiveDownloads(prev => prev - 1);
  };

  return (
    <DownloadContext.Provider value={{
      queue,
      history,
      activeDownloads,
      maxConcurrentDownloads,
      addToQueue,
      removeFromQueue,
      updateQueueItem,
      clearHistory,
      startDownload,
      finishDownload,
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