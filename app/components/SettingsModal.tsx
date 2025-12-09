"use client";

import BaseModal from './BaseModal';
import { useSettings } from '../hooks/useSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { settings, updateSettings } = useSettings();

  const handleToggleDynamicColors = () => {
    updateSettings({
      disableDynamicColors: !settings.disableDynamicColors
    });
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Configurações"
      maxWidth="max-w-md"
    >
      <div className="space-y-6">
        {/* Seção de Aparência */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a4 4 0 004-4V5z" />
            </svg>
            Aparência
          </h3>
          
          <div className="space-y-4">
            {/* Toggle para cores dinâmicas */}
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex-1">
                <label className="text-white font-medium block mb-1">
                  Cores Dinâmicas
                </label>
                <p className="text-sm text-zinc-400">
                  Extrair cores das capas dos álbuns para personalizar a interface
                </p>
              </div>
              <button
                onClick={handleToggleDynamicColors}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                  settings.disableDynamicColors 
                    ? 'bg-zinc-600' 
                    : 'bg-emerald-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                    settings.disableDynamicColors ? 'translate-x-1' : 'translate-x-6'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Seção de Informações */}
        <div className="pt-4 border-t border-white/10">
          <div className="flex items-center justify-between text-sm text-zinc-400">
            <span>Configurações salvas automaticamente</span>
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-emerald-400">Salvo</span>
            </div>
          </div>
        </div>
      </div>
    </BaseModal>
  );
} 