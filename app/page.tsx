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
import FloatingPlaylistButton from './components/FloatingPlaylistButton';
import DownloadQueue from './components/DownloadQueue';
import { useState } from 'react';
import { useUI } from './contexts/UIContext';
import Image from 'next/image';

export default function Home() {
  const [beatportModalOpen, setBeatportModalOpen] = useState(false);
  const [beatportDownloaderModalOpen, setBeatportDownloaderModalOpen] = useState(false);
  const { playerOpen, playerMinimized } = useUI();
  const [downloadFormMinimized, setDownloadFormMinimized] = useState(true);
  const [showQueue, setShowQueue] = useState(false);
  
  console.log('🎵 [Page] playerOpen:', playerOpen);
  
  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <div className="flex flex-col h-screen">
        {/* Header responsivo */}
        <header className="flex-shrink-0 p-4 sm:p-2 border-b border-zinc-800">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-4 sm:gap-2">
            <Image
              src="/legolas_thumb.png"
              alt="Legolas"
              width={48}
              height={48}
              className="object-contain sm:w-8 sm:h-8"
            />
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent sm:text-xl">
              Legolas
            </h1>
          </div>
        </header>

        {/* Container principal responsivo */}
        <div className="flex-1 flex flex-col min-h-0 max-w-7xl mx-auto w-full px-4 sm:px-2 py-4 sm:py-2 gap-4 sm:gap-2">
          {/* Formulário de download */}
          <div className="flex-shrink-0">
            <DownloadForm 
              minimized={downloadFormMinimized} 
              setMinimized={setDownloadFormMinimized}
              showQueue={showQueue}
              setShowQueue={setShowQueue}
            />
          </div>

          {/* Lista de arquivos */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <FileList />
          </div>
        </div>

        {/* Player de áudio (já responsivo) */}
        {playerOpen && <AudioPlayer />}
      </div>
      
      <div className="fixed bottom-6 left-6 z-[60] sm:bottom-4 sm:left-4">
        <FloatingPlaylistButton />
      </div>

      {/* Fila de downloads */}
      {showQueue && <DownloadQueue onClose={() => setShowQueue(false)} />}

      <BeatportModal isOpen={beatportModalOpen} onClose={() => setBeatportModalOpen(false)} />
      <BeatportDownloaderModal isOpen={beatportDownloaderModalOpen} onClose={() => setBeatportDownloaderModalOpen(false)} />
    </div>
  );
}
