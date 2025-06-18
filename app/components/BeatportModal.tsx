'use client';

import { useState } from 'react';
import { useDownload } from '../contexts/DownloadContext';
import BaseModal from './BaseModal';

interface BeatportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BeatportModal({ isOpen, onClose }: BeatportModalProps) {
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

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Importar do Beatport"
    >
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
    </BaseModal>
  );
} 