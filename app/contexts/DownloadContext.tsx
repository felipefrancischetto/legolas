'use client';

import { createContext, useContext, useState, useCallback, useMemo, ReactNode, useEffect, useRef } from 'react';
import { safeSetItem, safeGetItem, safeRemoveItem, limitArraySize } from '../utils/localStorage';

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
  showBeatportPage?: boolean;
  albumName?: string; // Nome do álbum para agrupamento
  albumArtist?: string; // Artista do álbum para agrupamento
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
  clearStuckDownloads: () => void;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DownloadItem[]>([]);
  const [history, setHistory] = useState<DownloadItem[]>([]);
  const maxConcurrentDownloads = 3;
  
  // Refs para batching de updates e controle de estado
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Map<string, Partial<DownloadItem>>>(new Map());
  const processingIdsRef = useRef<Set<string>>(new Set()); // Rastrear IDs sendo processados
  const queueProcessTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map()); // Rastrear conexões SSE
  
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

  // Refs para controlar timeouts de toasts
  const toastTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const removeToast = useCallback((id: string) => {
    // Limpar timeout se existir
    const timeout = toastTimeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      toastTimeoutsRef.current.delete(id);
    }
    
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Funções para gerenciar toasts
  const addToast = useCallback((toast: { title: string }) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    setToasts(prev => [...prev, { ...toast, id }]);
    
    // Limpar timeout anterior se existir (não deveria acontecer, mas por segurança)
    const existingTimeout = toastTimeoutsRef.current.get(id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Auto-remove após 4 segundos
    const timeout = setTimeout(() => {
      removeToast(id);
    }, 4000);
    
    toastTimeoutsRef.current.set(id, timeout);
  }, [removeToast]);

  // Carregar histórico do localStorage
  useEffect(() => {
    const savedHistory = safeGetItem<DownloadItem[]>('downloadHistory');
    if (savedHistory && Array.isArray(savedHistory)) {
      setHistory(savedHistory);
    }
  }, []);

  // Carregar fila de downloads do localStorage
  useEffect(() => {
    const savedQueue = safeGetItem<DownloadItem[]>('downloadQueue');
    if (savedQueue && Array.isArray(savedQueue)) {
      // Filtrar apenas downloads que ainda estão pendentes ou em andamento
      const activeQueue = savedQueue.filter(item => 
        item.status === 'pending' || 
        item.status === 'queued' || 
        item.status === 'downloading'
      );
      
      if (activeQueue.length > 0) {
        // Resetar status de downloads que estavam "downloading" para "pending" ao restaurar
        const resetQueue = activeQueue.map(item => {
          if (item.status === 'downloading') {
            console.log(`🔄 Resetando status de download restaurado: ${item.id}`);
            return { ...item, status: 'pending' as const };
          }
          return item;
        });
        
        setQueue(resetQueue);
        console.log('📦 Fila de downloads restaurada:', resetQueue.length, 'itens');
      }
    }
  }, []);

  // Salvar histórico no localStorage com debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Limitar histórico aos últimos 100 itens para evitar dados muito grandes
      const limitedHistory = limitArraySize(history, 100);
      safeSetItem('downloadHistory', limitedHistory, {
        maxSize: 2 * 1024 * 1024, // 2MB máximo
        onError: (err) => {
          console.warn('⚠️ Erro ao salvar histórico:', err.message);
        }
      });
    }, 2000);
    
    return () => clearTimeout(timeoutId);
  }, [history]);

  // Salvar fila de downloads no localStorage com debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Salvar apenas downloads ativos (pendentes, em fila ou baixando)
      const activeQueue = queue.filter(item => 
        item.status === 'pending' || 
        item.status === 'queued' || 
        item.status === 'downloading'
      );
      if (activeQueue.length > 0) {
        // Otimizar dados: remover campos grandes desnecessários
        const optimizedQueue = activeQueue.map(item => ({
          id: item.id,
          url: item.url,
          title: item.title,
          status: item.status,
          progress: item.progress,
          currentStep: item.currentStep,
          currentSubstep: item.currentSubstep,
          format: item.format,
          isPlaylist: item.isPlaylist,
          enrichWithBeatport: item.enrichWithBeatport,
          showBeatportPage: item.showBeatportPage,
          albumName: item.albumName,
          albumArtist: item.albumArtist
          // Não salvar steps completos e metadata para reduzir tamanho
        }));
        
        safeSetItem('downloadQueue', optimizedQueue, {
          maxSize: 1 * 1024 * 1024, // 1MB máximo
          onError: (err) => {
            console.warn('⚠️ Erro ao salvar fila de downloads:', err.message);
          }
        });
      } else {
        safeRemoveItem('downloadQueue');
      }
    }, 1000);
    
    return () => clearTimeout(timeoutId);
  }, [queue]);

  const addToQueue = useCallback((item: string | Omit<DownloadItem, 'id'>): DownloadItem => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    let queueItem: DownloadItem;
    
    if (typeof item === 'string') {
      queueItem = { 
        id, 
        url: item, 
        status: 'pending',
        startTime: Date.now(),
        steps: [],
        enrichWithBeatport: true, // Sempre usar Beatport por padrão
        showBeatportPage: false
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
    console.log('📝 Item adicionado à fila:', queueItem.id, queueItem.title || queueItem.url);
    return queueItem;
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    // Fechar conexão SSE se existir
    const eventSource = eventSourcesRef.current.get(id);
    if (eventSource) {
      try {
        eventSource.close();
        console.log(`🔌 SSE fechado para download removido: ${id}`);
      } catch (e) {
        console.warn(`Erro ao fechar SSE: ${e}`);
      }
      eventSourcesRef.current.delete(id);
    }
    
    // Remover do conjunto de processamento
    processingIdsRef.current.delete(id);
    
    setQueue(prev => prev.filter(item => item.id !== id));
    console.log('🗑️ Item removido da fila:', id);
  }, []);

  // Função otimizada para updates em lote
  const flushUpdates = useCallback(() => {
    if (pendingUpdatesRef.current.size === 0) return;
    
    setQueue(prev => {
      const updated = prev.map(item => {
        const updates = pendingUpdatesRef.current.get(item.id);
        if (updates) {
          // Garantir que progress seja sempre um número válido
          // Para progresso, sempre usar o valor mais recente (não fazer merge)
          const merged = { ...item };
          
          // Aplicar updates, mas para progresso usar sempre o mais recente
          if ('progress' in updates) {
            merged.progress = Math.max(0, Math.min(100, updates.progress || 0));
          } else if (merged.progress !== undefined) {
            merged.progress = Math.max(0, Math.min(100, merged.progress));
          }
          
          // Aplicar outros campos normalmente
          Object.keys(updates).forEach(key => {
            if (key !== 'progress') {
              (merged as any)[key] = (updates as any)[key];
            }
          });
          
          return merged;
        }
        return item;
      });
      return updated;
    });
    
    pendingUpdatesRef.current.clear();
  }, []);

  const updateQueueItem = useCallback((id: string, updates: Partial<DownloadItem>) => {
    // Para updates de progresso, aplicar imediatamente sem debounce
    const isProgressUpdate = 'progress' in updates;
    
    if (isProgressUpdate) {
      // Aplicar progresso imediatamente para evitar travamento
      setQueue(prev => prev.map(item => {
        if (item.id === id) {
          const updated = { ...item, ...updates };
          if (updated.progress !== undefined) {
            updated.progress = Math.max(0, Math.min(100, updated.progress));
          }
          return updated;
        }
        return item;
      }));
      
      // Ainda acumular outros campos para aplicar depois (se houver)
      const otherUpdates = { ...updates };
      delete otherUpdates.progress;
      if (Object.keys(otherUpdates).length > 0) {
        const existingUpdates = pendingUpdatesRef.current.get(id) || {};
        pendingUpdatesRef.current.set(id, { ...existingUpdates, ...otherUpdates });
        
        // Aplicar outros updates com debounce menor
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
        }
        updateTimeoutRef.current = setTimeout(() => {
          flushUpdates();
        }, 100);
      }
      return;
    }
    
    // Para outros updates, usar debounce normal
    const existingUpdates = pendingUpdatesRef.current.get(id) || {};
    pendingUpdatesRef.current.set(id, { ...existingUpdates, ...updates });
    
    // Debounce para fazer updates em lote (200ms para outros updates)
    const debounceTime = 200; // Debounce dinâmico: 50ms para progresso, 200ms para outros
    
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
            
            // Remover do conjunto de processamento quando finalizar
            processingIdsRef.current.delete(id);
            
            // Evitar duplicatas no histórico verificando se já existe
            setHistory(prevHistory => {
              // Remover se já existir (evitar duplicatas)
              const filtered = prevHistory.filter(h => h.id !== id);
              // Adicionar no início e limitar a 50 itens
              return [finalItem, ...filtered].slice(0, 50);
            });
            
            // Só mostrar toast se não for um download travado (para evitar spam)
            if (!updates.error?.includes('travado') && !updates.error?.includes('tempo limite')) {
              addToast({ 
                title: updates.status === 'completed' 
                  ? `✅ ${item.title || 'Download'} concluído!`
                  : `❌ Erro em ${item.title || 'Download'}`
              });
            }
            
            // Remover da fila após 3 segundos
            setTimeout(() => {
              removeFromQueue(id);
            }, 3000);
          }
          return prev;
        });
      }
    }, debounceTime);
  }, [flushUpdates, addToast, removeFromQueue]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem('downloadHistory');
  }, []);

  const updateProgress = useCallback((downloadId: string, progress: number, step?: string, substep?: string, detail?: string, playlistIndex?: number) => {
    // Validar progresso
    const validProgress = Math.max(0, Math.min(100, progress));
    
    if (typeof playlistIndex === 'number') {
      // Atualizar item específico da playlist - aplicar imediatamente
      setQueue(prev => prev.map(item => {
        if (item.id === downloadId && item.playlistItems) {
          const updatedPlaylistItems = item.playlistItems.map((plItem, idx) =>
            idx === playlistIndex ? { 
              ...plItem, 
              progress: validProgress, 
              status: 'downloading' as const 
            } : plItem
          );
          // Também atualizar progresso geral do item se necessário
          const updatedItem = { 
            ...item, 
            playlistItems: updatedPlaylistItems,
            progress: validProgress,
            currentStep: step,
            currentSubstep: substep,
            detail
          };
          return updatedItem;
        }
        return item;
      }));
    } else {
      // Atualizar progresso principal - aplicar imediatamente
      setQueue(prev => prev.map(item => {
        if (item.id === downloadId) {
          return {
            ...item,
            progress: validProgress,
            currentStep: step,
            currentSubstep: substep,
            detail
          };
        }
        return item;
      }));
    }
  }, []);

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
      // Usar função de callback para acessar queue atual sem dependência
      setQueue(prev => {
        const item = prev.find(q => q.id === downloadId);
        if (item) {
          return prev.map(q => 
            q.id === downloadId 
              ? { ...q, steps: [...(q.steps || []), stepData] }
              : q
          );
        }
        return prev;
      });
    }
  }, []);

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
    // Remover do conjunto de processamento
    processingIdsRef.current.delete(id);
    
    // Fechar conexão SSE se existir
    const eventSource = eventSourcesRef.current.get(id);
    if (eventSource) {
      try {
        eventSource.close();
        console.log(`🔌 SSE fechado para download cancelado: ${id}`);
      } catch (e) {
        console.warn(`Erro ao fechar SSE: ${e}`);
      }
      eventSourcesRef.current.delete(id);
    }
    
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
          currentStep: 'Cancelado',
          endTime: Date.now()
        };
      }
    }));
    
    console.log('❌ Download cancelado:', id, playlistIndex);
    
    // Mover para histórico após cancelar
    setQueue(prev => {
      const item = prev.find(item => item.id === id);
      if (item && item.status === 'error') {
        const cancelledItem = { ...item, endTime: Date.now() };
        setHistory(prevHistory => {
          const filtered = prevHistory.filter(h => h.id !== id);
          return [cancelledItem, ...filtered].slice(0, 50);
        });
      }
      return prev;
    });
  }, []);

  const setDownloadStatus = useCallback((status: Partial<DownloadContextType['downloadStatus']>) => {
    setDownloadStatusState(prev => ({ ...prev, ...status }));
  }, []);

  // Função para limpar downloads travados (que estão em downloading há muito tempo sem progresso)
  const clearStuckDownloads = useCallback(() => {
    const now = Date.now();
    const STUCK_TIMEOUT = 5 * 60 * 1000; // 5 minutos sem progresso = travado
    const PENDING_TIMEOUT = 10 * 60 * 1000; // 10 minutos em pending = travado
    
    let clearedCount = 0;
    
    setQueue(prev => prev.map(item => {
      // Verificar se está em downloading há muito tempo
      if (item.status === 'downloading' && item.startTime) {
        const timeSinceStart = now - item.startTime;
        
        // Se está há mais de 5 minutos sem progresso significativo
        if (timeSinceStart > STUCK_TIMEOUT && (item.progress || 0) < 10) {
          console.log(`🧹 Limpando download travado: ${item.id} (${item.title})`);
          clearedCount++;
          // Remover do conjunto de processamento
          processingIdsRef.current.delete(item.id);
          return {
            ...item,
            status: 'error' as const,
            error: 'Download travado - tempo limite excedido',
            currentStep: 'Download travado',
            endTime: now
          };
        }
      }
      
      // Verificar se está em pending há muito tempo sem ser processado
      if (item.status === 'pending' && item.startTime) {
        const timeSinceStart = now - item.startTime;
        
        // Se está há mais de 10 minutos em pending sem ser processado
        if (timeSinceStart > PENDING_TIMEOUT && !processingIdsRef.current.has(item.id)) {
          console.log(`🧹 Limpando download pendente travado: ${item.id} (${item.title})`);
          clearedCount++;
          return {
            ...item,
            status: 'error' as const,
            error: 'Download não iniciado - tempo limite excedido',
            currentStep: 'Download não iniciado',
            endTime: now
          };
        }
      }
      
      return item;
    }));
    
    if (clearedCount > 0) {
      console.log(`🧹 Total de downloads travados limpos: ${clearedCount}`);
    }
  }, []);

  // Ref para acessar a queue atual sem causar re-renders
  const queueRef = useRef<DownloadItem[]>([]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Função para processar download real
  const processRealDownload = useCallback(async (item: DownloadItem) => {
    // Verificar se já está sendo processado (evitar duplicatas) - verificação primeiro
    if (processingIdsRef.current.has(item.id)) {
      console.log('⏭️ Item já está sendo processado:', item.id);
      return;
    }
    
    // Verificar rapidamente se o item ainda está na fila e tem status pendente
    // Usar ref para evitar dependência de queue
    const currentItem = queueRef.current.find(q => q.id === item.id);
    if (!currentItem) {
      console.log('⏭️ Item não encontrado na fila:', item.id);
      return;
    }
    
    // Se o status mudou para algo diferente de pending, não processar
    if (currentItem.status !== 'pending' && currentItem.status !== 'queued') {
      console.log(`⏭️ Item não está mais pendente (status: ${currentItem.status}):`, item.id);
      return;
    }
    
    // Marcar como sendo processado ANTES de iniciar (importante para evitar duplicatas)
    processingIdsRef.current.add(item.id);
    console.log(`🚀 Iniciando processamento do download: ${item.id} - ${item.title || item.url}`);
    
    try {
      updateProgress(item.id, 0, 'Iniciando download...');
      updateQueueItem(item.id, { status: 'downloading' });

      // Conectar ao SSE de progresso ANTES de iniciar o POST, para não perder eventos iniciais
      let eventSource: EventSource | null = null;
      try {
        eventSource = new EventSource(`/api/download-progress?downloadId=${encodeURIComponent(item.id)}&_t=${Date.now()}`);
        
        // Armazenar referência do EventSource para poder fechar depois
        eventSourcesRef.current.set(item.id, eventSource);

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // Ignorar heartbeats
            if (data.type === 'heartbeat') return;

            if (typeof data.progress === 'number') {
              updateProgress(item.id, data.progress, data.step, data.substep, data.detail, data.playlistIndex);
            }

            // Registrar step detalhado na timeline
            addStep(item.id, {
              type: data.type === 'error' ? 'error' : 'progress',
              step: data.step || 'Processando...',
              substep: data.substep,
              detail: data.detail,
              progress: data.progress,
              timestamp: new Date().toISOString(),
              completed: data.type === 'complete',
              playlistIndex: typeof data.playlistIndex === 'number' ? data.playlistIndex : undefined,
            });

            // Conclusão enviada pelo servidor
            if (data.type === 'complete') {
              updateProgress(item.id, 100, 'Download concluído!');
            }
          } catch (e) {
            // Falha ao parsear evento: apenas logar em dev
            console.error('Erro ao processar evento SSE:', e);
          }
        };

        eventSource.onerror = () => {
          // Em caso de erro de conexão, não interrompe o fluxo do download
          console.warn('SSE erro/desconexão para', item.id);
          // Remover do mapa quando houver erro
          eventSourcesRef.current.delete(item.id);
        };
      } catch (e) {
        console.warn('Falha ao abrir SSE de progresso, seguindo sem streaming:', e);
      }

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
          showBeatportPage: item.showBeatportPage || false,
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
      
      // Aguardar um pouco para garantir que o arquivo foi salvo no sistema de arquivos
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Atualizar lista de arquivos sem mostrar loading (atualização incremental)
      window.dispatchEvent(new CustomEvent('refresh-files', { detail: { skipLoading: true } }));
      
      // Fechar SSE se aberto
      try { 
        if (eventSource) {
          eventSource.close();
          eventSourcesRef.current.delete(item.id);
        }
      } catch {}
      
    } catch (error) {
      console.error('❌ Erro no download real:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      updateProgress(item.id, 0, 'Erro no download', 'Falha no processamento', errorMessage);
      updateQueueItem(item.id, {
        status: 'error',
        error: errorMessage,
        currentStep: 'Erro no download'
      });
      
      // Garantir fechamento do SSE em erro
      try {
        const eventSource = eventSourcesRef.current.get(item.id);
        if (eventSource) {
          eventSource.close();
          eventSourcesRef.current.delete(item.id);
        }
      } catch {}
    } finally {
      // Sempre remover do conjunto de processamento quando terminar (sucesso ou erro)
      processingIdsRef.current.delete(item.id);
    }
  }, [updateQueueItem, updateProgress, addStep]);

  // Auto-processar fila quando há downloads pendentes
  useEffect(() => {
    // Atualizar ref imediatamente
    queueRef.current = queue;
    
    // Limpar timeout anterior
    if (queueProcessTimeoutRef.current) {
      clearTimeout(queueProcessTimeoutRef.current);
      queueProcessTimeoutRef.current = null;
    }
    
    // Usar a queue atual diretamente
    const currentQueue = queue;
    const pendingDownloads = currentQueue.filter(item => 
      item.status === 'pending' && !processingIdsRef.current.has(item.id)
    );
    const activeCount = currentQueue.filter(item => item.status === 'downloading').length;
    
    // Log para debug
    if (pendingDownloads.length > 0) {
      console.log(`📊 Estado da fila: ${pendingDownloads.length} pendente(s), ${activeCount} ativo(s), ${maxConcurrentDownloads} máximo`);
    }
    
    // Se não há downloads pendentes, não fazer nada
    if (pendingDownloads.length === 0) {
      return;
    }
    
    // Processar imediatamente se houver slots disponíveis
    const slotsAvailable = maxConcurrentDownloads - activeCount;
    const toProcess = pendingDownloads.slice(0, slotsAvailable);
    
    if (toProcess.length > 0) {
      console.log(`🎯 Processando ${toProcess.length} download(s) da fila. Ativos: ${activeCount}/${maxConcurrentDownloads}`);
      console.log(`📋 IDs a processar:`, toProcess.map(d => `${d.id} - ${d.title || d.url}`));
      
      // Processar cada download
      toProcess.forEach(download => {
        // Verificar novamente antes de processar (pode ter mudado)
        const currentItem = queue.find(q => q.id === download.id);
        if (currentItem && currentItem.status === 'pending' && !processingIdsRef.current.has(download.id)) {
          processRealDownload(download);
        }
      });
    } else {
      console.log(`⏳ Sem slots disponíveis. Aguardando conclusão de downloads ativos...`);
    }
    
    // Se ainda há downloads pendentes mas não há slots, agendar verificação
    if (pendingDownloads.length > toProcess.length) {
      queueProcessTimeoutRef.current = setTimeout(() => {
        // Verificar novamente após 1 segundo usando a queue atual
        const checkQueue = queueRef.current;
        const checkPending = checkQueue.filter(item => 
          item.status === 'pending' && !processingIdsRef.current.has(item.id)
        );
        const checkActive = checkQueue.filter(item => item.status === 'downloading').length;
        const checkSlots = maxConcurrentDownloads - checkActive;
        const checkToProcess = checkPending.slice(0, checkSlots);
        
        if (checkToProcess.length > 0) {
          console.log(`🔄 Verificação agendada: Processando ${checkToProcess.length} download(s) da fila. Ativos: ${checkActive}/${maxConcurrentDownloads}`);
          checkToProcess.forEach(download => {
            processRealDownload(download);
          });
        }
      }, 1000);
    }
    
    return () => {
      if (queueProcessTimeoutRef.current) {
        clearTimeout(queueProcessTimeoutRef.current);
        queueProcessTimeoutRef.current = null;
      }
    };
  }, [queue, activeDownloads, processRealDownload]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      if (queueProcessTimeoutRef.current) {
        clearTimeout(queueProcessTimeoutRef.current);
      }
      // Limpar todos os timeouts de toasts
      toastTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      toastTimeoutsRef.current.clear();
      // Fechar todas as conexões SSE
      eventSourcesRef.current.forEach((eventSource, id) => {
        try {
          eventSource.close();
          console.log(`🔌 SSE fechado no cleanup: ${id}`);
        } catch (e) {
          console.warn(`Erro ao fechar SSE no cleanup: ${e}`);
        }
      });
      eventSourcesRef.current.clear();
    };
  }, []);

  // Auto-limpar downloads travados a cada 2 minutos
  useEffect(() => {
    const interval = setInterval(() => {
      clearStuckDownloads();
    }, 2 * 60 * 1000); // Verificar a cada 2 minutos
    
    return () => clearInterval(interval);
  }, [clearStuckDownloads]);

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
    getPlaylistProgressData,
    clearStuckDownloads
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
    getPlaylistProgressData,
    clearStuckDownloads
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