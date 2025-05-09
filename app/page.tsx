"use client";

import DownloadForm from './components/DownloadForm';
import FileList from './components/FileList';
import PlaylistTracklistModal from './components/PlaylistTracklistModal';
import { useState } from 'react';

export default function Home() {
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <main className="min-h-screen bg-black text-white p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8 animate-slide-up">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center transform hover:scale-110 transition-transform duration-200">
              <span className="text-black font-bold text-xl">L</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Legolas Downloader
            </h1>
          </div>
          <p className="text-sm sm:text-base text-gray-400 animate-fade-in">
            Baixe suas músicas favoritas do YouTube em formato MP3
          </p>
        </div>
        <div className="w-full flex justify-end mb-6">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all font-medium shadow"
            onClick={() => setModalOpen(true)}
          >
            Buscar links de playlist no YouTube
          </button>
        </div>
        <div className="space-y-6">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 animate-slide-up hover:border-zinc-700 transition-colors duration-200">
            <DownloadForm />
          </div>
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 animate-slide-up hover:border-zinc-700 transition-colors duration-200">
            <FileList />
          </div>
        </div>
      </div>
      <PlaylistTracklistModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </main>
  );
}
