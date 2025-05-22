'use client';

import { useState } from 'react';
import { useDownload } from '../contexts/DownloadContext';

interface BeatportDownloaderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BeatportDownloaderModal({ isOpen, onClose }: BeatportDownloaderModalProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToQueue } = useDownload();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/beatport-downloader', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao processar URL do Beatport');
      }

      // Adicionar à fila de download
      addToQueue(data.videoUrl);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar URL do Beatport');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-md shadow-lg relative animate-fade-in">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-white"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-semibold text-white mb-4">Importar do Beatport Downloader</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="url" className="block text-sm font-medium text-gray-300 mb-1">
              URL do Beatport
            </label>
            <input
              type="url"
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.beatport.com/track/..."
              className="w-full px-4 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-white placeholder-gray-400 focus:border-zinc-600 focus:ring-zinc-600 transition-all duration-200"
              required
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all font-medium shadow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processando...' : 'Importar'}
          </button>
        </form>
      </div>
    </div>
  );
} 