'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface DownloadStep {
  type: string;
  step: string;
  substep?: string;
  detail?: string;
  progress: number;
  timestamp: number;
}

interface DownloadItem {
  id: string;
  url: string;
  status: 'pending' | 'queued' | 'downloading' | 'completed' | 'error';
  progress?: number;
  error?: string;
  title?: string;
  isPlaylist?: boolean;
  playlistItems?: Array<{
    title: string;
    status: 'pending' | 'downloading' | 'completed' | 'error';
    progress: number;
    error?: string;
    steps?: DownloadStep[];
  }>;
  format?: string;
  enrichWithBeatport?: boolean;
  metadata?: any;
  currentStep?: string;
  currentSubstep?: string;
  detail?: string;
  startTime?: number;
  steps?: DownloadStep[];
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
  retryDownload: (id: string, playlistIndex?: number) => void;
  cancelDownload: (id: string, playlistIndex?: number) => void;
  // Estados simplificados
  downloadStatus: {
    loading: boolean;
    error: string | null;
    success: boolean;
  };
  setDownloadStatus: (status: Partial<DownloadContextType['downloadStatus']>) => void;
  toasts: Array<{ title: string; id: string }>;
  addToast: (toast: { title: string }) => void;
  removeToast: (id: string) => void;
  // Funções para gerenciar progresso interno
  updateProgress: (downloadId: string, progress: number, step?: string, substep?: string, detail?: string) => void;
  addStep: (downloadId: string, step: DownloadStep) => void;
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
  const activeDownloads = queue.filter(item => item.status === 'downloading').length;

  // Estados simplificados
  const [downloadStatus, setDownloadStatusState] = useState<DownloadContextType['downloadStatus']>({
    loading: false,
    error: null,
    success: false
  });

  const [toasts, setToasts] = useState<Array<{ title: string; id: string }>>([]);

  // Funções para gerenciar toasts
  const addToast = (toast: { title: string }) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    setToasts(prev => [...prev, { ...toast, id }]);
    
    // Auto-remove após 4 segundos
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Carregar histórico do localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('downloadHistory');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (err) {
        console.error('Erro ao carregar histórico:', err);
      }
    }
  }, []);

  // Salvar histórico no localStorage
  useEffect(() => {
    localStorage.setItem('downloadHistory', JSON.stringify(history));
  }, [history]);

  const addToQueue = (item: string | Omit<DownloadItem, 'id'>): DownloadItem => {
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
      queueItem = {
        id,
        url: item.url || '',
        status: item.status || 'pending',
        startTime: Date.now(),
        steps: [],
        ...item
      };
    }
    
    setQueue(prev => [...prev, queueItem]);
    console.log('📝 Item adicionado à fila:', queueItem);
    return queueItem;
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
    console.log('🗑️ Item removido da fila:', id);
  };

  const updateQueueItem = (id: string, updates: Partial<DownloadItem>) => {
    setQueue(prev => prev.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, ...updates };
        console.log('🔄 Item atualizado na fila:', id, updates);
        return updatedItem;
      }
      return item;
    }));

    // Se o item foi concluído ou teve erro, movê-lo para o histórico
    if (updates.status === 'completed' || updates.status === 'error') {
      const item = queue.find(item => item.id === id);
      if (item) {
        const finalItem = { ...item, ...updates };
        setHistory(prev => [finalItem, ...prev]);
        addToast({ 
          title: updates.status === 'completed' 
            ? `✅ ${item.title || 'Download'} concluído!`
            : `❌ Erro em ${item.title || 'Download'}`
        });
        
        // Remover da fila após um delay para mostrar o status final
        setTimeout(() => {
          removeFromQueue(id);
        }, 3000);
      }
    }
  };

  const updateProgress = (downloadId: string, progress: number, step?: string, substep?: string, detail?: string) => {
    updateQueueItem(downloadId, {
      progress,
      currentStep: step,
      currentSubstep: substep,
      detail
    });
    
    // Adicionar step ao histórico se fornecido
    if (step) {
      addStep(downloadId, {
        type: getStepType(step),
        step,
        substep,
        detail,
        progress,
        timestamp: Date.now()
      });
    }
  };

  const addStep = (downloadId: string, step: DownloadStep) => {
    setQueue(prev => prev.map(item => {
      if (item.id === downloadId) {
        const steps = [...(item.steps || []), step];
        console.log(`📋 Step adicionado para ${downloadId}:`, step);
        return { ...item, steps };
      }
      return item;
    }));
  };

  const getStepType = (step: string): string => {
    if (step.includes('Preparando') || step.includes('Conectado')) return 'init';
    if (step.includes('pasta') || step.includes('Verificando')) return 'setup';
    if (step.includes('informações') || step.includes('Extraindo')) return 'info';
    if (step.includes('Baixando') || step.includes('download')) return 'download';
    if (step.includes('metadados') || step.includes('Beatport')) return 'metadata';
    if (step.includes('Escrevendo') || step.includes('tags')) return 'tagging';
    if (step.includes('Verificação') || step.includes('integridade')) return 'verification';
    if (step.includes('concluído') || step.includes('finalizado')) return 'complete';
    return 'unknown';
  };

  const getCurrentDownload = (downloadId: string) => {
    return queue.find(item => item.id === downloadId);
  };

  const getPlaylistProgressData = (itemId: string) => {
    const playlistItem = queue.find(item => item.id === itemId && item.isPlaylist);
    if (playlistItem && playlistItem.playlistItems) {
      const total = playlistItem.playlistItems.length;
      const completed = playlistItem.playlistItems.filter(i => i.status === 'completed').length;
      const errors = playlistItem.playlistItems.filter(i => i.status === 'error').length;
      const downloading = playlistItem.playlistItems.filter(i => i.status === 'downloading').length;
      const current = completed + errors + downloading;
      
      return {
        current,
        total,
        completed,
        errors,
        downloading
      };
    }
    return null;
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('downloadHistory');
  };

  // Retry download
  const retryDownload = (id: string, playlistIndex?: number) => {
    setQueue(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      if (item.isPlaylist && typeof playlistIndex === 'number' && item.playlistItems) {
        // Retry apenas o item da playlist
        const updatedPlaylistItems = item.playlistItems.map((plItem: any, idx: number) =>
          idx === playlistIndex ? { 
            ...plItem, 
            status: 'pending', 
            progress: 0, 
            error: undefined,
            steps: []
          } : plItem
        );
        return { 
          ...item, 
          playlistItems: updatedPlaylistItems, 
          status: 'pending', 
          error: undefined,
          currentStep: 'Tentando novamente...',
          steps: []
        };
      } else {
        // Retry o item inteiro
        return { 
          ...item, 
          status: 'pending', 
          progress: 0, 
          error: undefined,
          currentStep: 'Tentando novamente...',
          startTime: Date.now(),
          steps: []
        };
      }
    }));
    
    console.log('🔄 Tentando novamente:', id, playlistIndex);
  };

  // Cancel download
  const cancelDownload = (id: string, playlistIndex?: number) => {
    setQueue(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      if (item.isPlaylist && typeof playlistIndex === 'number' && item.playlistItems) {
        // Cancelar apenas o item da playlist
        const updatedPlaylistItems = item.playlistItems.map((plItem: any, idx: number) =>
          idx === playlistIndex ? { 
            ...plItem, 
            status: 'error', 
            error: 'Cancelado pelo usuário' 
          } : plItem
        );
        return { ...item, playlistItems: updatedPlaylistItems };
      } else {
        // Cancelar o item inteiro
        return { 
          ...item, 
          status: 'error', 
          error: 'Cancelado pelo usuário',
          currentStep: 'Cancelado'
        };
      }
    }));
    
    console.log('❌ Download cancelado:', id, playlistIndex);
  };

  // Função para atualizar status geral
  const setDownloadStatus = (status: Partial<DownloadContextType['downloadStatus']>) => {
    setDownloadStatusState(prev => ({ ...prev, ...status }));
  };

  // Auto-processar fila quando há downloads pendentes
  useEffect(() => {
    const pendingDownloads = queue.filter(item => item.status === 'pending');
    const activeCount = queue.filter(item => item.status === 'downloading').length;
    
    // Processar próximo download se há espaço
    if (pendingDownloads.length > 0 && activeCount < maxConcurrentDownloads) {
      const nextDownload = pendingDownloads[0];
      console.log('🎯 Processando próximo download da fila:', nextDownload.id);
      
      // Processar download real
      processRealDownload(nextDownload);
    }
  }, [queue, maxConcurrentDownloads]);

  // 🔧 Função REAL de processamento de download - integrada com as APIs
  const processRealDownload = async (item: DownloadItem) => {
    try {
      // Iniciar download
      updateQueueItem(item.id, { 
        status: 'downloading', 
        progress: 0,
        currentStep: 'Iniciando download...',
        startTime: Date.now()
      });

      console.log(`🚀 Iniciando download real para: ${item.title} (${item.isPlaylist ? 'playlist' : 'individual'})`);

      // Determinar endpoint baseado no tipo
      const endpoint = item.isPlaylist ? 'playlist' : 'download';
      const params = new URLSearchParams({
        url: item.url,
        format: item.format || 'mp3',
        useBeatport: (item.enrichWithBeatport || false).toString(),
        downloadId: item.id
      });

      // Configurar monitoramento de progresso em tempo real se for download individual
      let progressInterval: NodeJS.Timeout | null = null;
      
      if (!item.isPlaylist) {
        // Para downloads individuais, simular steps enquanto aguarda API
        const individualSteps = [
          { step: 'Preparando download...', progress: 5 },
          { step: 'Verificando pasta de downloads...', progress: 10 },
          { step: 'Extraindo informações do vídeo...', progress: 15 },
          { step: 'Baixando áudio...', progress: 40 },
          { step: 'Processando metadados...', progress: 70 },
          { step: 'Escrevendo tags no arquivo...', progress: 85 },
          { step: 'Verificando integridade...', progress: 95 }
        ];

        let stepIndex = 0;
        progressInterval = setInterval(() => {
          if (stepIndex < individualSteps.length) {
            const currentStepInfo = individualSteps[stepIndex];
            updateProgress(
              item.id, 
              currentStepInfo.progress, 
              currentStepInfo.step,
              `Processando: ${item.title}`
            );
            stepIndex++;
          }
        }, 2000); // Step a cada 2 segundos
      }

      // Chamar API real
      const response = await fetch(`/api/${endpoint}?${params.toString()}`);
      const data = await response.json();

      // Limpar interval se existir
      if (progressInterval) {
        clearInterval(progressInterval);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Erro no download');
      }

      // Sucesso - finalizar download
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