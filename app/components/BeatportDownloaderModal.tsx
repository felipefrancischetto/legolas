'use client';

import { useState } from 'react';
import { useDownload } from '../contexts/DownloadContext';
import BaseModal from './BaseModal';

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
    setLoading(true);
    setError(null);

    try {
      await addToQueue(url);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao processar URL do Beatport');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 sm:p-2">
      <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-md shadow-lg relative animate-fade-in sm:p-4 sm:max-w-full sm:mx-2">
        <div className="flex justify-between items-center mb-4 sm:mb-3">
          <h2 className="text-xl font-semibold text-white sm:text-lg">Beatport Downloader</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2 sm:text-xs sm:mb-1">
              URL do Beatport
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:px-2 sm:py-1.5 sm:text-sm"
              placeholder="https://www.beatport.com/track/..."
              required
            />
          </div>
          
          <div className="flex gap-3 sm:gap-2 sm:flex-col">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-700 text-white rounded-md hover:bg-zinc-600 transition-colors sm:px-3 sm:py-1.5 sm:text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !url}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors sm:px-3 sm:py-1.5 sm:text-sm"
            >
              {loading ? 'Baixando...' : 'Baixar'}
            </button>
          </div>
        </form>
        
        {error && (
          <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm sm:mt-3 sm:p-2 sm:text-xs">
            {error}
          </div>
        )}
      </div>
    </div>
  );
} 