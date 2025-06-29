"use client";

import DownloadForm from './components/DownloadForm';
import FileList from './components/FileList';
import dynamic from 'next/dynamic';

const AudioPlayer = dynamic(() => import('./components/AudioPlayer'), {
  ssr: false,
  loading: () => null
});
import BeatportModal from './components/BeatportModal';
import BeatportDownloaderModal from './components/BeatportDownloaderModal';
import SettingsModal from './components/SettingsModal';
import FloatingPlaylistButton from './components/FloatingPlaylistButton';
import DownloadQueue from './components/DownloadQueue';
import { useState } from 'react';
import { useUI } from './contexts/UIContext';
import Image from 'next/image';

export default function Home() {
  const [beatportModalOpen, setBeatportModalOpen] = useState(false);
  const [beatportDownloaderModalOpen, setBeatportDownloaderModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const { playerOpen, playerMinimized } = useUI();
  const [downloadFormMinimized, setDownloadFormMinimized] = useState(true);
  const [showQueue, setShowQueue] = useState(false);
  
  console.log('🎵 [Page] playerOpen:', playerOpen);
  
  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <div className="flex flex-col h-screen">


        {/* Motor de busca/download - fixo no topo */}
        <div className="flex-shrink-0 max-w-7xl mx-auto w-full px-6 pt-3 md:px-4 md:pt-2 sm:px-3 sm:pt-1">
          <DownloadForm 
            minimized={downloadFormMinimized} 
            setMinimized={setDownloadFormMinimized}
            showQueue={showQueue}
            setShowQueue={setShowQueue}
            setSettingsModalOpen={setSettingsModalOpen}
          />
        </div>

        {/* Container da lista de arquivos */}
        <div className="flex-1 min-h-0 max-w-7xl mx-auto w-full px-6 pt-1 md:px-4 md:pt-1 sm:px-3 sm:pt-0">
          <div className="h-full overflow-hidden">
            <FileList />
          </div>
        </div>

        {/* Player de áudio */}
        {playerOpen && <AudioPlayer />}
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
  );
}
