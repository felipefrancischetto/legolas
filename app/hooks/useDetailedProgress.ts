'use client';

import { useEffect, useRef, useState } from 'react';

interface ProgressEvent {
  type: string;
  step: string;
  progress?: number;
  substep?: string;
  detail?: string;
  metadata?: any;
  timestamp: string;
}

interface UseDetailedProgressProps {
  downloadId: string | null;
  onProgress?: (event: ProgressEvent) => void;
  onComplete?: (finalEvent: ProgressEvent) => void;
  onError?: (error: string) => void;
}

export function useDetailedProgress({
  downloadId,
  onProgress,
  onComplete,
  onError
}: UseDetailedProgressProps) {
  const [currentStep, setCurrentStep] = useState<string>('');
  const [currentSubstep, setCurrentSubstep] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [detail, setDetail] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastEvent, setLastEvent] = useState<ProgressEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // 🔧 Usar refs para callbacks estáveis
  const onProgressRef = useRef(onProgress);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  
  // Atualizar refs quando callbacks mudarem
  useEffect(() => {
    onProgressRef.current = onProgress;
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onProgress, onComplete, onError]);

  useEffect(() => {
    if (!downloadId) {
      // Limpar estados se não há downloadId
      setCurrentStep('');
      setCurrentSubstep('');
      setProgress(0);
      setDetail('');
      setIsConnected(false);
      setLastEvent(null);
      return;
    }

    // Resetar estados para novo download
    setCurrentStep('Conectando...');
    setCurrentSubstep('');
    setProgress(0);
    setDetail('');
    setLastEvent(null);

    console.log('🔌 Iniciando conexão SSE para downloadId:', downloadId);

    // 🔧 Construir URL com cache busting para evitar redirecionamentos
    const sseUrl = `/api/download-progress?downloadId=${encodeURIComponent(downloadId)}&_t=${Date.now()}`;
    console.log('📡 URL SSE:', sseUrl);

    // Conectar ao Server-Sent Events com configurações específicas
    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('✅ Conectado ao stream de progresso:', downloadId);
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const progressEvent: ProgressEvent = JSON.parse(event.data);
        
        // Ignorar eventos de heartbeat
        if (progressEvent.type === 'heartbeat') {
          return;
        }

        console.log('📡 Evento de progresso recebido:', progressEvent.type, '-', progressEvent.step, `(${progressEvent.progress || 0}%)`);

        // Atualizar estado local apenas se não for heartbeat
        setLastEvent(progressEvent);
        setCurrentStep(progressEvent.step);
        setCurrentSubstep(progressEvent.substep || '');
        setProgress(progressEvent.progress || 0);
        setDetail(progressEvent.detail || '');

        // 🔧 Usar ref do callback para evitar stale closures
        onProgressRef.current?.(progressEvent);

        // Verificar se é evento de conclusão
        if (progressEvent.type === 'complete') {
          console.log('🎉 Download concluído - processando evento final');
          onCompleteRef.current?.(progressEvent);
          
          // Fechar conexão após completar
          setTimeout(() => {
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
              setIsConnected(false);
            }
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
      console.error('🔍 EventSource url:', eventSource.url);
      setIsConnected(false);
      
      // Verificar se é um erro de conexão real ou fechamento normal
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('🔌 Conexão SSE fechada');
      } else if (eventSource.readyState === EventSource.CONNECTING) {
        console.log('🔄 SSE tentando reconectar...');
      } else {
        console.error('❌ Erro na conexão SSE - readyState:', eventSource.readyState);
        onErrorRef.current?.('Erro na conexão com o servidor');
      }
    };

    // Cleanup
    return () => {
      if (eventSourceRef.current) {
        console.log('🔌 Fechando conexão SSE para:', downloadId);
        eventSourceRef.current.close();
        setIsConnected(false);
      }
    };
  }, [downloadId]); // 🔧 Apenas downloadId como dependency

  // Função para fechar conexão manualmente
  const disconnect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      setIsConnected(false);
    }
  };

  // Função para reconectar
  const reconnect = () => {
    disconnect();
    if (downloadId) {
      // Aguardar um pouco antes de reconectar
      setTimeout(() => {
        const eventSource = new EventSource(`/api/download-progress?downloadId=${downloadId}`);
        eventSourceRef.current = eventSource;
        setIsConnected(true);
      }, 1000);
    }
  };

  return {
    // Estados do progresso
    currentStep,
    currentSubstep,
    progress,
    detail,
    lastEvent,
    
    // Estados da conexão
    isConnected,
    
    // Controles
    disconnect,
    reconnect
  };
} 