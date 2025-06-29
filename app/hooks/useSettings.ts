"use client";

import { useState, useEffect } from 'react';

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
    const savedSettings = localStorage.getItem('legolas-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...defaultSettings, ...parsed });
      } catch (error) {
        console.error('Erro ao carregar configurações:', error);
      }
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
    localStorage.setItem('legolas-settings', JSON.stringify(updatedSettings));
    
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