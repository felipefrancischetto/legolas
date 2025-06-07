"use client";

import DownloadForm from './components/DownloadForm';
import FileList from './components/FileList';
import AudioPlayer from './components/AudioPlayer';
import PlaylistTracklistModal from './components/PlaylistTracklistModal';
import BeatportModal from './components/BeatportModal';
import BeatportDownloaderModal from './components/BeatportDownloaderModal';
import { useState } from 'react';
import { useUI } from './contexts/UIContext';

export default function Home() {
  const [modalOpen, setModalOpen] = useState(false);
  const [beatportModalOpen, setBeatportModalOpen] = useState(false);
  const [beatportDownloaderModalOpen, setBeatportDownloaderModalOpen] = useState(false);
  const { playerOpen } = useUI();
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
            style={downloadFormMinimized
              ? { marginTop: 60, marginBottom: 105, height: 'calc(100vh - 220px)' }
              : {}}
          >
            <FileList />
          </div>
        </div>
      </div>
      
      {playerOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <AudioPlayer />
        </div>
      )}
      
      <PlaylistTracklistModal isOpen={modalOpen} onClose={() => setModalOpen(false)} playlistUrl="" />
      <BeatportModal isOpen={beatportModalOpen} onClose={() => setBeatportModalOpen(false)} />
      <BeatportDownloaderModal isOpen={beatportDownloaderModalOpen} onClose={() => setBeatportDownloaderModalOpen(false)} />
    </main>
  );
}
