"use client";

import DownloadForm from './components/DownloadForm';
import FileList from './components/FileList';
import AudioPlayer from './components/AudioPlayer';
import BeatportModal from './components/BeatportModal';
import BeatportDownloaderModal from './components/BeatportDownloaderModal';
import FloatingPlaylistButton from './components/FloatingPlaylistButton';
import { useState } from 'react';
import { useUI } from './contexts/UIContext';

export default function Home() {
  const [beatportModalOpen, setBeatportModalOpen] = useState(false);
  const [beatportDownloaderModalOpen, setBeatportDownloaderModalOpen] = useState(false);
  const { playerOpen, playerMinimized } = useUI();
  const [downloadFormMinimized, setDownloadFormMinimized] = useState(true);
  
  return (
    <main className="flex flex-col h-screen bg-black text-white p-4 sm:p-8 overflow-hidden">
      <div className="max-w-6xl mx-auto flex-1 flex flex-col min-h-0">
        {!downloadFormMinimized && (
          <div className="text-center mb-4 animate-slide-up">
            <div className="flex items-center justify-center gap-2 mb-2">
              <img src="/legolas_thumb.png" alt="Legolas" className="w-[48px] h-[48px] object-contain transform hover:scale-110 transition-transform duration-200" />
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent" style={{ lineHeight: 'unset' }}>
                Legolas
              </h1>
            </div>
          </div>
        )}
        <div className="space-y-6 flex flex-col flex-1 min-h-0">
          {!downloadFormMinimized && (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 animate-slide-up hover:border-zinc-700 transition-colors duration-200">
              <DownloadForm minimized={downloadFormMinimized} setMinimized={setDownloadFormMinimized} />
            </div>
          )}
          {downloadFormMinimized && (
            <DownloadForm minimized={downloadFormMinimized} setMinimized={setDownloadFormMinimized} />
          )}
          <div
            className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 animate-slide-up hover:border-zinc-700 transition-colors duration-200 flex-1 min-h-0 flex flex-col"
            style={{
              marginTop: downloadFormMinimized ? 70 : 0,
              marginBottom: playerOpen && !playerMinimized ? 115 : 0
            }}
          >
            <FileList />
          </div>
        </div>
      </div>
      
      {playerOpen && <AudioPlayer />}
      
      <div className="fixed bottom-6 right-6 z-[60]">
        <FloatingPlaylistButton />
      </div>
      
      <BeatportModal isOpen={beatportModalOpen} onClose={() => setBeatportModalOpen(false)} />
      <BeatportDownloaderModal isOpen={beatportDownloaderModalOpen} onClose={() => setBeatportDownloaderModalOpen(false)} />
    </main>
  );
}
