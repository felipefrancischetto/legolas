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
  const [downloadFormMinimized, setDownloadFormMinimized] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  
  console.log('🎵 [Page] playerOpen:', playerOpen);
  
  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <div className="flex flex-col h-screen">
        {/* Header com transparência */}
        <header className="flex-shrink-0 relative z-40 backdrop-blur-xl">
          <div 
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.8) 0%, rgba(15, 23, 42, 0.6) 50%, rgba(0, 0, 0, 0.8) 100%)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          />
          <div className="relative px-6 py-4 md:px-4 md:py-3 sm:px-3 sm:py-2">
            <div className="max-w-7xl mx-auto flex items-center justify-center gap-4 md:gap-3 sm:gap-2">
              <Image
                src="/legolas_thumb.png"
                alt="Legolas"
                width={48}
                height={48}
                className="object-contain w-12 h-12 md:w-10 md:h-10 sm:w-8 sm:h-8"
              />
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-gray-200 to-emerald-200 bg-clip-text text-transparent md:text-2xl sm:text-xl">
                Legolas
              </h1>
            </div>
          </div>
        </header>

        {/* Container principal com melhor responsividade */}
        <div className="flex-1 flex flex-col min-h-0 max-w-7xl mx-auto w-full px-6 py-6 gap-6 md:px-4 md:py-4 md:gap-4 sm:px-3 sm:py-3 sm:gap-3">
          {/* Motor de busca/download */}
          <div className="flex-shrink-0">
            <DownloadForm 
              minimized={downloadFormMinimized} 
              setMinimized={setDownloadFormMinimized}
              showQueue={showQueue}
              setShowQueue={setShowQueue}
            />
          </div>

          {/* Lista de arquivos com melhor espaçamento */}
          <div className="flex-1 min-h-0 overflow-hidden">
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
    </div>
  );
}
