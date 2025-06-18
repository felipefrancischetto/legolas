import { useState, useCallback } from 'react';
import { DownloadStatus } from '../types';

interface UseDownloadProps {
  onStatusChange?: (status: DownloadStatus) => void;
}

export function useDownload({ onStatusChange }: UseDownloadProps = {}) {
  const [queue, setQueue] = useState<Array<{ url: string; status: DownloadStatus }>>([]);
  const [currentDownload, setCurrentDownload] = useState<DownloadStatus | null>(null);

  const addToQueue = useCallback(async (url: string) => {
    const newStatus: DownloadStatus = {
      type: 'individual',
      status: 'queued',
      title: url,
      progress: 0
    };

    setQueue(prev => [...prev, { url, status: newStatus }]);
    onStatusChange?.(newStatus);

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        throw new Error('Erro ao iniciar download');
      }

      const data = await response.json();
      setCurrentDownload({
        type: 'individual',
        status: 'downloading',
        title: data.title || url,
        progress: 0
      });

      // Iniciar SSE para acompanhar o progresso
      const eventSource = new EventSource(`/api/download-status/${data.id}`);

      eventSource.onmessage = (event) => {
        const status = JSON.parse(event.data);
        setCurrentDownload(status);
        onStatusChange?.(status);

        if (status.status === 'completed' || status.status === 'error') {
          eventSource.close();
          setQueue(prev => prev.filter(item => item.url !== url));
          setCurrentDownload(null);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setCurrentDownload(prev => prev ? { ...prev, status: 'error' } : null);
        setQueue(prev => prev.filter(item => item.url !== url));
      };
    } catch (error) {
      setCurrentDownload(prev => prev ? { ...prev, status: 'error' } : null);
      setQueue(prev => prev.filter(item => item.url !== url));
      throw error;
    }
  }, [onStatusChange]);

  const cancelDownload = useCallback((url: string) => {
    setQueue(prev => prev.filter(item => item.url !== url));
    if (currentDownload?.title === url) {
      setCurrentDownload(null);
    }
  }, [currentDownload]);

  return {
    queue,
    currentDownload,
    addToQueue,
    cancelDownload
  };
} 