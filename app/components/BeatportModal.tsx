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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 sm:p-2">
      <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-md shadow-lg relative animate-fade-in sm:p-4 sm:max-w-full sm:mx-2">
        <div className="flex justify-between items-center mb-4 sm:mb-3">
          <h2 className="text-xl font-semibold text-white sm:text-lg">Beatport Integration</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-4 sm:space-y-3">
          <p className="text-gray-300 text-sm sm:text-xs">
            Conecte sua conta do Beatport para enriquecer automaticamente os metadados das suas músicas.
          </p>
          
          <div className="bg-zinc-800 rounded-lg p-4 sm:p-3">
            <h3 className="text-white font-medium mb-2 sm:text-sm sm:mb-1">Recursos:</h3>
            <ul className="text-gray-300 text-sm space-y-1 sm:text-xs">
              <li>• Metadados completos e precisos</li>
              <li>• Informações de BPM e key</li>
              <li>• Dados de gravadora e lançamento</li>
              <li>• Capas de alta qualidade</li>
            </ul>
          </div>
          
          <div className="flex gap-3 sm:gap-2 sm:flex-col">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-700 text-white rounded-md hover:bg-zinc-600 transition-colors sm:px-3 sm:py-1.5 sm:text-sm"
            >
              Fechar
            </button>
            <button
              onClick={() => {
                // Implementar conexão com Beatport
                alert('Recurso em desenvolvimento');
              }}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors sm:px-3 sm:py-1.5 sm:text-sm"
            >
              Conectar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 