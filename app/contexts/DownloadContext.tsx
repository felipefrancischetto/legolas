'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface DownloadItem {
  id: string;
  url: string;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  progress?: number;
  error?: string;
}

interface DownloadContextType {
  queue: DownloadItem[];
  history: DownloadItem[];
  addToQueue: (url: string) => void;
  removeFromQueue: (id: string) => void;
  updateQueueItem: (id: string, updates: Partial<DownloadItem>) => void;
  clearHistory: () => void;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DownloadItem[]>([]);
  const [history, setHistory] = useState<DownloadItem[]>([]);

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

  const addToQueue = (url: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setQueue(prev => [...prev, { id, url, status: 'pending' }]);
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

  return (
    <DownloadContext.Provider value={{
      queue,
      history,
      addToQueue,
      removeFromQueue,
      updateQueueItem,
      clearHistory,
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