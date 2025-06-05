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
  
  return (
    <main className="flex flex-col min-h-screen bg-black text-white p-4 sm:p-8">
      <div className="max-w-6xl mx-auto flex-1 flex flex-col min-h-0">
        <div className="text-center mb-8 animate-slide-up">
          <div className="flex items-center justify-center gap-4 mb-4">
            <img src="/legolas_thumb.png" alt="Legolas" className="w-[75px] h-[75px] object-contain transform hover:scale-110 transition-transform duration-200" />
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent" style={{ lineHeight: 'unset' }}>
              Legolas Downloader
            </h1>
          </div>
          <p className="text-sm sm:text-base text-gray-400 animate-fade-in">
            Baixe suas músicas favoritas do YouTube em formato MP3
          </p>
        </div>
        {/* <div className="w-full flex justify-end mb-6 gap-2">
          <button
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-all font-medium shadow"
            onClick={() => setBeatportDownloaderModalOpen(true)}
          >
            Baixar do Beatport (Downloader)
          </button>
          <button
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-all font-medium shadow"
            onClick={() => setBeatportModalOpen(true)}
          >
            Baixar do Beatport
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all font-medium shadow"
            onClick={() => setModalOpen(true)}
          >
            Buscar links de playlist no YouTube
          </button>
          <button
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-all font-medium shadow"
            onClick={async () => {
              if (!window.confirm('Tem certeza que deseja atualizar os metadados de todas as músicas? Isso pode demorar alguns minutos.')) return;
              try {
                const res = await fetch('/api/update-all-metadata', { method: 'POST' });
                const data = await res.json();
                alert(`Atualização concluída!\nSucesso: ${data.results.filter((r:any) => !r.error).length}\nErros: ${data.results.filter((r:any) => r.error).length}`);
                window.location.reload();
              } catch (err) {
                alert('Erro ao atualizar metadados em massa.');
              }
            }}
          >
            Atualizar metadados de todas
          </button>
        </div> */}
        <div className="space-y-6 flex flex-col flex-1 min-h-0">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 animate-slide-up hover:border-zinc-700 transition-colors duration-200">
            <DownloadForm />
          </div>
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-3 animate-slide-up hover:border-zinc-700 transition-colors duration-200 flex-1 min-h-0 flex flex-col">
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
