"use client";

import { useState, useEffect } from 'react';
import { safeSetItem, safeGetItem } from '../utils/localStorage';

export interface Settings {
  disableDynamicColors: boolean;
}

const defaultSettings: Settings = {
  disableDynamicColors: true
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  // Carregar configurações do localStorage
  useEffect(() => {
    const savedSettings = safeGetItem<Settings>('legolas-settings');
    if (savedSettings) {
      setSettings({ ...defaultSettings, ...savedSettings });
    }
    setIsLoaded(true);
  }, []);

  // Escutar mudanças de configurações de outros componentes
  useEffect(() => {
    const handleSettingsChange = (event: CustomEvent) => {
      setSettings(event.detail);
    };

    window.addEventListener('settings-changed', handleSettingsChange as EventListener);
    
    return () => {
      window.removeEventListener('settings-changed', handleSettingsChange as EventListener);
    };
  }, []);

  // Salvar configurações
  const updateSettings = (newSettings: Partial<Settings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    safeSetItem('legolas-settings', updatedSettings, {
      maxSize: 10 * 1024, // 10KB máximo para settings
      onError: (err) => {
        console.error('⚠️ Erro ao salvar configurações:', err.message);
      }
    });
    
    // Disparar evento para notificar outros componentes
    window.dispatchEvent(new CustomEvent('settings-changed', { 
      detail: updatedSettings 
    }));
  };

  return {
    settings,
    updateSettings,
    isLoaded
  };
} 