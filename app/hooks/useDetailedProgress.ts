'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface ProgressEvent {
  type: 'progress' | 'complete' | 'error' | 'heartbeat';
  step: string;
  substep?: string;
  progress?: number;
  detail?: string;
  error?: string;
}

interface ProgressState {
  currentStep: string;
  currentSubstep: string;
  progress: number;
  detail: string;
  isConnected: boolean;
  lastEvent: ProgressEvent | null;
}

interface UseDetailedProgressProps {
  downloadId: string | null;
  onProgress?: (event: ProgressEvent) => void;
  onComplete?: (event: ProgressEvent) => void;
  onError?: (error: string) => void;
}

export function useDetailedProgress({
  downloadId,
  onProgress,
  onComplete,
  onError
}: UseDetailedProgressProps) {
  // Usar um único estado para reduzir re-renders
  const [state, setState] = useState<ProgressState>({
    currentStep: '',
    currentSubstep: '',
    progress: 0,
    detail: '',
    isConnected: false,
    lastEvent: null
  });
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Partial<ProgressState>>({});
  const lastUpdateTimeRef = useRef<number>(0);
  const isConnectingRef = useRef<boolean>(false);
  
  // Usar refs para callbacks estáveis
  const onProgressRef = useRef(onProgress);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  
  // Atualizar refs quando callbacks mudarem
  useEffect(() => {
    onProgressRef.current = onProgress;
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onProgress, onComplete, onError]);

  // Função para fazer updates em lote com throttling
  const flushUpdates = useCallback(() => {
    if (Object.keys(pendingUpdatesRef.current).length === 0) return;
    
    const now = Date.now();
    // Throttle updates para não sobrecarregar o DOM
    if (now - lastUpdateTimeRef.current < 200) return;
    
    setState(prev => ({
      ...prev,
      ...pendingUpdatesRef.current
    }));
    
    pendingUpdatesRef.current = {};
    lastUpdateTimeRef.current = now;
  }, []);

  // Função para agendar updates com batching
  const scheduleUpdate = useCallback((updates: Partial<ProgressState>) => {
    Object.assign(pendingUpdatesRef.current, updates);
    
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    updateTimeoutRef.current = setTimeout(flushUpdates, 100); // Batch updates por 100ms
  }, [flushUpdates]);

  // Função para limpar conexão
  const cleanup = useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }
    
    if (eventSourceRef.current) {
      console.log('🔌 Fechando conexão SSE');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    isConnectingRef.current = false;
  }, []);

  useEffect(() => {
    // Limpar conexão anterior
    cleanup();
    
    if (!downloadId) {
      // Limpar estados se não há downloadId
      setState({
        currentStep: '',
        currentSubstep: '',
        progress: 0,
        detail: '',
        isConnected: false,
        lastEvent: null
      });
      return;
    }

    // Evitar conexões duplicadas
    if (isConnectingRef.current) {
      return;
    }
    
    isConnectingRef.current = true;

    // Resetar estados para novo download
    scheduleUpdate({
      currentStep: 'Conectando...',
      currentSubstep: '',
      progress: 0,
      detail: '',
      lastEvent: null
    });

    console.log('🔌 Iniciando conexão SSE para downloadId:', downloadId);

    // Construir URL com cache busting
    const sseUrl = `/api/download-progress?downloadId=${encodeURIComponent(downloadId)}&_t=${Date.now()}`;
    console.log('📡 URL SSE:', sseUrl);

    // Conectar ao Server-Sent Events
    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    let isConnected = false;
    let heartbeatTimeout: NodeJS.Timeout | null = null;

    const resetHeartbeat = () => {
      if (heartbeatTimeout) {
        clearTimeout(heartbeatTimeout);
      }
      heartbeatTimeout = setTimeout(() => {
        console.warn('❌ Heartbeat timeout - conexão perdida');
        onErrorRef.current?.('Conexão perdida com o servidor');
        cleanup();
      }, 30000); // 30 segundos de timeout
    };

    eventSource.onopen = () => {
      console.log('✅ Conectado ao stream de progresso:', downloadId);
      isConnected = true;
      isConnectingRef.current = false;
      scheduleUpdate({ isConnected: true });
      resetHeartbeat();
    };

    eventSource.onmessage = (event) => {
      resetHeartbeat();
      
      try {
        const progressEvent: ProgressEvent = JSON.parse(event.data);
        
        // Ignorar eventos de heartbeat
        if (progressEvent.type === 'heartbeat') {
          return;
        }

        console.log('📡 Evento de progresso recebido:', progressEvent.type, '-', progressEvent.step, `(${progressEvent.progress || 0}%)`);

        // Agendar update batched
        scheduleUpdate({
          lastEvent: progressEvent,
          currentStep: progressEvent.step,
          currentSubstep: progressEvent.substep || '',
          progress: progressEvent.progress || 0,
          detail: progressEvent.detail || ''
        });

        // Usar ref do callback para evitar stale closures
        onProgressRef.current?.(progressEvent);

        // Verificar se é evento de conclusão
        if (progressEvent.type === 'complete') {
          console.log('🎉 Download concluído - processando evento final');
          onCompleteRef.current?.(progressEvent);
          
          // Fechar conexão após completar
          setTimeout(() => {
            cleanup();
            scheduleUpdate({ isConnected: false });
          }, 2000);
        }

      } catch (err) {
        console.error('❌ Erro ao processar evento de progresso:', err);
        onErrorRef.current?.('Erro ao processar evento de progresso');
      }
    };

    eventSource.onerror = (error) => {
      console.error('❌ Erro no EventSource:', error);
      console.error('🔍 EventSource readyState:', eventSource.readyState);
      
      if (heartbeatTimeout) {
        clearTimeout(heartbeatTimeout);
      }
      
      scheduleUpdate({ isConnected: false });
      isConnectingRef.current = false;
      
      // Verificar se é um erro de conexão real ou fechamento normal
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('🔌 Conexão SSE fechada normalmente');
      } else if (eventSource.readyState === EventSource.CONNECTING) {
        console.log('🔄 SSE tentando reconectar...');
      } else {
        console.error('❌ Erro na conexão SSE - readyState:', eventSource.readyState);
        onErrorRef.current?.('Erro na conexão com o servidor');
      }
    };

    // Cleanup function
    return () => {
      if (heartbeatTimeout) {
        clearTimeout(heartbeatTimeout);
      }
      cleanup();
      scheduleUpdate({ isConnected: false });
    };
  }, [downloadId, scheduleUpdate, cleanup]);

  // Função para fechar conexão manualmente
  const disconnect = useCallback(() => {
    cleanup();
    scheduleUpdate({ isConnected: false });
  }, [cleanup, scheduleUpdate]);

  // Função para reconectar
  const reconnect = useCallback(() => {
    if (!downloadId) return;
    
    disconnect();
    
    // Aguardar um pouco antes de reconectar
    setTimeout(() => {
      if (isConnectingRef.current) return; // Evitar reconexões múltiplas
      
      const eventSource = new EventSource(`/api/download-progress?downloadId=${downloadId}&_t=${Date.now()}`);
      eventSourceRef.current = eventSource;
      scheduleUpdate({ isConnected: true });
    }, 1000);
  }, [downloadId, disconnect, scheduleUpdate]);

  return {
    ...state,
    disconnect,
    reconnect
  };
} 