"use client";

import DownloadForm from './components/DownloadForm';
import FileList from './components/FileList';
import dynamic from 'next/dynamic';
import { safeSetItem, safeGetItem } from './utils/localStorage';

const AudioPlayer = dynamic(() => import('./components/AudioPlayer'), {
  ssr: false,
  loading: () => null
});
import BeatportModal from './components/BeatportModal';
import BeatportDownloaderModal from './components/BeatportDownloaderModal';
import SettingsModal from './components/SettingsModal';
import FloatingPlaylistButton from './components/FloatingPlaylistButton';
import ScrollToPlayingButton from './components/ScrollToPlayingButton';
import DownloadQueue from './components/DownloadQueue';
import QuickPlaylistPanel from './components/QuickPlaylistPanel';
import { useState, useEffect } from 'react';
import { useUI } from './contexts/UIContext';

const STORAGE_KEY_PAGE_STATE = 'legolas-page-state';

interface SavedPageState {
  downloadFormMinimized: boolean;
  showQueue: boolean;
  beatportModalOpen: boolean;
  beatportDownloaderModalOpen: boolean;
  settingsModalOpen: boolean;
}

export default function Home() {
  // Carregar estados salvos do localStorage
  const loadSavedState = (): SavedPageState => {
    const saved = safeGetItem<SavedPageState>(STORAGE_KEY_PAGE_STATE);
    if (saved) {
      return saved;
    }
    return {
      downloadFormMinimized: true,
      showQueue: false,
      beatportModalOpen: false,
      beatportDownloaderModalOpen: false,
      settingsModalOpen: false
    };
  };

  const savedState = loadSavedState();
  
  const [beatportModalOpen, setBeatportModalOpen] = useState(savedState.beatportModalOpen);
  const [beatportDownloaderModalOpen, setBeatportDownloaderModalOpen] = useState(savedState.beatportDownloaderModalOpen);
  const [settingsModalOpen, setSettingsModalOpen] = useState(savedState.settingsModalOpen);
  const { playerOpen, playerMinimized } = useUI();
  const [downloadFormMinimized, setDownloadFormMinimized] = useState(savedState.downloadFormMinimized);
  const [showQueue, setShowQueue] = useState(savedState.showQueue);
  const [isInitialized, setIsInitialized] = useState(false);

  // Marcar como inicializado após montagem
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Salvar estados no localStorage quando mudarem (após inicialização)
  // Usar debounce para evitar salvamentos excessivos
  useEffect(() => {
    if (!isInitialized) return;
    
    const timeoutId = setTimeout(() => {
      try {
        const state: SavedPageState = {
          downloadFormMinimized,
          showQueue,
          beatportModalOpen,
          beatportDownloaderModalOpen,
          settingsModalOpen
        };
        safeSetItem(STORAGE_KEY_PAGE_STATE, state, {
          maxSize: 10 * 1024, // 10KB máximo
          onError: (err) => {
            console.warn('⚠️ Erro ao salvar estado da página:', err.message);
          }
        });
      } catch (err) {
        console.warn('Erro ao salvar estado da página:', err);
      }
    }, 300); // Debounce de 300ms
    
    return () => clearTimeout(timeoutId);
  }, [downloadFormMinimized, showQueue, beatportModalOpen, beatportDownloaderModalOpen, settingsModalOpen, isInitialized]);
  
  return (
    <>
      {/* Botão flutuante para rolar até a música atual */}
      <ScrollToPlayingButton />
      <div className="min-h-screen bg-black text-white overflow-hidden">
      <div className="flex flex-col h-screen">

        {/* Motor de busca/download - fixo no topo */}
        <div className="flex-shrink-0 mx-auto w-full">
          <DownloadForm 
            minimized={downloadFormMinimized} 
            setMinimized={setDownloadFormMinimized}
            showQueue={showQueue}
            setShowQueue={setShowQueue}
            setSettingsModalOpen={setSettingsModalOpen}
          />
        </div>

        {/* Container da lista de arquivos - ocupa todo espaço disponível menos o player */}
        <div className="flex-1 min-h-0 max-w-7xl mx-auto w-full px-6 md:px-4 sm:px-3 overflow-hidden">
          <div className="h-full overflow-y-auto pb-[200px] sm:pb-[90px]">
            <FileList />
          </div>
        </div>

        {/* Player de áudio - sempre visível (fixo na parte inferior) */}
        <AudioPlayer />
      </div>
      
      {/* Botão flutuante com melhor posicionamento */}
      <div className="fixed bottom-8 left-8 z-[60] md:bottom-6 md:left-6 sm:bottom-4 sm:left-4">
        <FloatingPlaylistButton />
      </div>

      {/* Fila de downloads */}
      {showQueue && <DownloadQueue onClose={() => setShowQueue(false)} />}


      <BeatportModal isOpen={beatportModalOpen} onClose={() => setBeatportModalOpen(false)} />
      <BeatportDownloaderModal isOpen={beatportDownloaderModalOpen} onClose={() => setBeatportDownloaderModalOpen(false)} />
      <SettingsModal isOpen={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} />
    </div>
    </>
  );
}
