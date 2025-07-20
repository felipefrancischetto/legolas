'use client';

import { createContext, useContext, useState, useCallback, useMemo, ReactNode, useEffect, useRef } from 'react';

interface DownloadStep {
  type: 'info' | 'warning' | 'error' | 'progress';
  step: string;
  substep?: string;
  detail?: string;
  progress?: number;
  timestamp: string;
  completed: boolean;
}

interface DownloadItem {
  id: string;
  url: string;
  title?: string;
  status: 'pending' | 'queued' | 'downloading' | 'completed' | 'error';
  progress?: number;
  error?: string;
  currentStep?: string;
  currentSubstep?: string;
  detail?: string;
  steps: DownloadStep[];
  startTime?: number;
  endTime?: number;
  metadata?: any;
  isPlaylist?: boolean;
  format?: string;
  enrichWithBeatport?: boolean;
  playlistItems?: Array<{
    title: string;
    status: 'pending' | 'downloading' | 'completed' | 'error';
    progress?: number;
    error?: string;
    steps: DownloadStep[];
  }>;
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
  retryDownload: (id: string, playlistIndex?: number) => void;
  cancelDownload: (id: string, playlistIndex?: number) => void;
  downloadStatus: {
    loading: boolean;
    error: string | null;
    success: boolean;
  };
  setDownloadStatus: (status: Partial<DownloadContextType['downloadStatus']>) => void;
  toasts: Array<{ title: string; id: string }>;
  addToast: (toast: { title: string }) => void;
  removeToast: (id: string) => void;
  updateProgress: (downloadId: string, progress: number, step?: string, substep?: string, detail?: string, playlistIndex?: number) => void;
  addStep: (downloadId: string, step: DownloadStep & { playlistIndex?: number }) => void;
  getCurrentDownload: (downloadId: string) => DownloadItem | undefined;
  getPlaylistProgressData: (itemId: string) => {
    current: number;
    total: number;
    completed: number;
    errors: number;
    downloading: number;
  } | null;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DownloadItem[]>([]);
  const [history, setHistory] = useState<DownloadItem[]>([]);
  const maxConcurrentDownloads = 3;
  
  // Refs para batching de updates e controle de estado
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Map<string, Partial<DownloadItem>>>(new Map());
  const isProcessingRef = useRef<boolean>(false);
  const queueProcessTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Computed values memoizados
  const activeDownloads = useMemo(() => 
    queue.filter(item => item.status === 'downloading').length,
    [queue]
  );

  // Estados simplificados
  const [downloadStatus, setDownloadStatusState] = useState<DownloadContextType['downloadStatus']>({
    loading: false,
    error: null,
    success: false
  });

  const [toasts, setToasts] = useState<Array<{ title: string; id: string }>>([]);

  // Funções para gerenciar toasts
  const addToast = useCallback((toast: { title: string }) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    setToasts(prev => [...prev, { ...toast, id }]);
    
    // Auto-remove após 4 segundos
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Carregar histórico do localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('downloadHistory');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        setHistory(Array.isArray(parsed) ? parsed : []);
      } catch (err) {
        console.error('Erro ao carregar histórico:', err);
      }
    }
  }, []);

  // Salvar histórico no localStorage com debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem('downloadHistory', JSON.stringify(history));
      } catch (err) {
        console.error('Erro ao salvar histórico:', err);
      }
    }, 2000);
    
    return () => clearTimeout(timeoutId);
  }, [history]);

  const addToQueue = useCallback((item: string | Omit<DownloadItem, 'id'>): DownloadItem => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    let queueItem: DownloadItem;
    
    if (typeof item === 'string') {
      queueItem = { 
        id, 
        url: item, 
        status: 'pending',
        startTime: Date.now(),
        steps: []
      };
    } else {
      // Se for playlist, garantir que playlistItems está inicializado corretamente
      let playlistItems = item.playlistItems;
      if (item.isPlaylist) {
        if (!playlistItems || !Array.isArray(playlistItems) || playlistItems.length === 0) {
          playlistItems = Array(3).fill(0).map((_, idx) => ({
            title: `Faixa ${idx + 1}`,
            status: 'pending' as const,
            progress: 0,
            steps: []
          }));
        } else {
          playlistItems = playlistItems.map((track, idx) => ({
            title: track.title || `Faixa ${idx + 1}`,
            status: (track.status || 'pending') as 'pending' | 'downloading' | 'completed' | 'error',
            progress: track.progress ?? 0,
            steps: track.steps || []
          }));
        }
      }
      
      queueItem = {
        ...item,
        id,
        startTime: Date.now(),
        status: 'pending',
        steps: [],
        playlistItems: item.isPlaylist ? playlistItems : undefined
      };
    }
    
    setQueue(prev => [...prev, queueItem]);
    console.log('📝 Item adicionado à fila:', queueItem);
    return queueItem;
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
    console.log('🗑️ Item removido da fila:', id);
  }, []);

  // Função otimizada para updates em lote
  const flushUpdates = useCallback(() => {
    if (pendingUpdatesRef.current.size === 0) return;
    
    setQueue(prev => prev.map(item => {
      const updates = pendingUpdatesRef.current.get(item.id);
      if (updates) {
        return { ...item, ...updates };
      }
      return item;
    }));
    
    pendingUpdatesRef.current.clear();
  }, []);

  const updateQueueItem = useCallback((id: string, updates: Partial<DownloadItem>) => {
    // Accumular updates para fazer em lote
    const existingUpdates = pendingUpdatesRef.current.get(id) || {};
    pendingUpdatesRef.current.set(id, { ...existingUpdates, ...updates });
    
    // Debounce para fazer updates em lote
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    updateTimeoutRef.current = setTimeout(() => {
      flushUpdates();
      
      // Verificar se precisa mover para histórico
      if (updates.status === 'completed' || updates.status === 'error') {
        setQueue(prev => {
          const item = prev.find(item => item.id === id);
          if (item && item.status !== updates.status) {
            const finalItem = { ...item, ...updates, endTime: Date.now() };
            setHistory(prevHistory => [finalItem, ...prevHistory.slice(0, 49)]); // Limitar histórico a 50 itens
            addToast({ 
              title: updates.status === 'completed' 
                ? `✅ ${item.title || 'Download'} concluído!`
                : `❌ Erro em ${item.title || 'Download'}`
            });
            
            // Remover da fila após 3 segundos
            setTimeout(() => {
              removeFromQueue(id);
            }, 3000);
          }
          return prev;
        });
      }
    }, 200); // Debounce de 200ms
  }, [flushUpdates, addToast, removeFromQueue]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem('downloadHistory');
  }, []);

  const updateProgress = useCallback((downloadId: string, progress: number, step?: string, substep?: string, detail?: string, playlistIndex?: number) => {
    const updates: Partial<DownloadItem> = {
      progress,
      currentStep: step,
      currentSubstep: substep,
      detail
    };
    
    if (typeof playlistIndex === 'number') {
      // Atualizar item específico da playlist
      setQueue(prev => prev.map(item => {
        if (item.id === downloadId && item.playlistItems) {
          const updatedPlaylistItems = item.playlistItems.map((plItem, idx) =>
            idx === playlistIndex ? { 
              ...plItem, 
              progress, 
              status: 'downloading' as const 
            } : plItem
          );
          return { ...item, playlistItems: updatedPlaylistItems };
        }
        return item;
      }));
    } else {
      updateQueueItem(downloadId, updates);
    }
  }, [updateQueueItem]);

  const addStep = useCallback((downloadId: string, step: DownloadStep & { playlistIndex?: number }) => {
    const { playlistIndex, ...stepData } = step;
    
    if (typeof playlistIndex === 'number') {
      // Adicionar step a item específico da playlist
      setQueue(prev => prev.map(item => {
        if (item.id === downloadId && item.playlistItems) {
          const updatedPlaylistItems = item.playlistItems.map((plItem, idx) =>
            idx === playlistIndex ? { ...plItem, steps: [...plItem.steps, stepData] } : plItem
          );
          return { ...item, playlistItems: updatedPlaylistItems };
        }
        return item;
      }));
    } else {
      updateQueueItem(downloadId, {
        steps: [...(queue.find(item => item.id === downloadId)?.steps || []), stepData]
      });
    }
  }, [updateQueueItem, queue]);

  const getCurrentDownload = useCallback((downloadId: string) => {
    return queue.find(item => item.id === downloadId);
  }, [queue]);

  const getPlaylistProgressData = useCallback((itemId: string) => {
    const item = queue.find(q => q.id === itemId);
    if (!item || !item.isPlaylist || !item.playlistItems) return null;

    const total = item.playlistItems.length;
    const completed = item.playlistItems.filter(p => p.status === 'completed').length;
    const errors = item.playlistItems.filter(p => p.status === 'error').length;
    const downloading = item.playlistItems.filter(p => p.status === 'downloading').length;
    const current = completed + errors + downloading;

    return { current, total, completed, errors, downloading };
  }, [queue]);

  const retryDownload = useCallback((id: string, playlistIndex?: number) => {
    setQueue(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      if (item.isPlaylist && typeof playlistIndex === 'number' && item.playlistItems) {
        const updatedPlaylistItems = item.playlistItems.map((plItem, idx) =>
          idx === playlistIndex ? { 
            ...plItem, 
            status: 'pending' as const, 
            error: undefined 
          } : plItem
        );
        return { ...item, playlistItems: updatedPlaylistItems };
      } else {
        return { ...item, status: 'pending' as const, error: undefined };
      }
    }));
    
    console.log('🔄 Retry iniciado para:', id, playlistIndex);
  }, []);

  const cancelDownload = useCallback((id: string, playlistIndex?: number) => {
    setQueue(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      if (item.isPlaylist && typeof playlistIndex === 'number' && item.playlistItems) {
        const updatedPlaylistItems = item.playlistItems.map((plItem, idx) =>
          idx === playlistIndex ? { 
            ...plItem, 
            status: 'error' as const, 
            error: 'Cancelado pelo usuário' 
          } : plItem
        );
        return { ...item, playlistItems: updatedPlaylistItems };
      } else {
        return { 
          ...item, 
          status: 'error' as const, 
          error: 'Cancelado pelo usuário',
          currentStep: 'Cancelado'
        };
      }
    }));
    
    console.log('❌ Download cancelado:', id, playlistIndex);
  }, []);

  const setDownloadStatus = useCallback((status: Partial<DownloadContextType['downloadStatus']>) => {
    setDownloadStatusState(prev => ({ ...prev, ...status }));
  }, []);

  // Função para processar download real
  const processRealDownload = useCallback(async (item: DownloadItem) => {
    if (isProcessingRef.current) return;
    
    updateProgress(item.id, 0, 'Iniciando download...');
    updateQueueItem(item.id, { status: 'downloading' });

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          url: item.url,
          downloadId: item.id,
          format: item.format || 'flac',
          useBeatport: item.enrichWithBeatport || false,
          isPlaylist: item.isPlaylist || false
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro no download');
      }

      const data = await response.json();

      updateProgress(item.id, 100, 'Download concluído com sucesso! 🎉');
      updateQueueItem(item.id, { 
        status: 'completed', 
        progress: 100,
        currentStep: 'Download concluído!',
        metadata: data.info || data.details
      });

      console.log(`✅ Download concluído com sucesso: ${item.title}`);
      
      // Atualizar lista de arquivos
      window.dispatchEvent(new CustomEvent('refresh-files'));
      
    } catch (error) {
      console.error('❌ Erro no download real:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      updateProgress(item.id, 0, 'Erro no download', 'Falha no processamento', errorMessage);
      updateQueueItem(item.id, {
        status: 'error',
        error: errorMessage,
        currentStep: 'Erro no download'
      });
    }
  }, [updateQueueItem, updateProgress]);

  // Auto-processar fila quando há downloads pendentes (com throttling melhorado)
  useEffect(() => {
    if (queueProcessTimeoutRef.current) {
      clearTimeout(queueProcessTimeoutRef.current);
    }
    
    queueProcessTimeoutRef.current = setTimeout(() => {
      const pendingDownloads = queue.filter(item => item.status === 'pending');
      const activeCount = queue.filter(item => item.status === 'downloading').length;
      
      if (pendingDownloads.length > 0 && activeCount < maxConcurrentDownloads && !isProcessingRef.current) {
        const nextDownload = pendingDownloads[0];
        console.log('🎯 Processando próximo download da fila:', nextDownload.id);
        processRealDownload(nextDownload);
      }
    }, 1000); // Throttle de 1 segundo
    
    return () => {
      if (queueProcessTimeoutRef.current) {
        clearTimeout(queueProcessTimeoutRef.current);
      }
    };
  }, [queue.length, activeDownloads, processRealDownload]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      if (queueProcessTimeoutRef.current) {
        clearTimeout(queueProcessTimeoutRef.current);
      }
    };
  }, []);

  // Memoizar o context value
  const contextValue = useMemo(() => ({
    queue,
    history,
    addToQueue,
    removeFromQueue,
    updateQueueItem,
    clearHistory,
    activeDownloads,
    maxConcurrentDownloads,
    retryDownload,
    cancelDownload,
    downloadStatus,
    setDownloadStatus,
    toasts,
    addToast,
    removeToast,
    updateProgress,
    addStep,
    getCurrentDownload,
    getPlaylistProgressData
  }), [
    queue,
    history,
    addToQueue,
    removeFromQueue,
    updateQueueItem,
    clearHistory,
    activeDownloads,
    maxConcurrentDownloads,
    retryDownload,
    cancelDownload,
    downloadStatus,
    setDownloadStatus,
    toasts,
    addToast,
    removeToast,
    updateProgress,
    addStep,
    getCurrentDownload,
    getPlaylistProgressData
  ]);

  return (
    <DownloadContext.Provider value={contextValue}>
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