'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import AudioPlayer from './AudioPlayer';

interface FileInfo {
  name: string;
  displayName: string;
  path: string;
  size: number;
  title?: string;
  artist?: string;
  duration?: string;
  thumbnail?: string;
  bpm?: number;
  key?: string;
  downloadedAt?: string;
}

const MusicIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
  </svg>
);

const ThumbnailImage = ({ file }: { file: FileInfo }) => {
  const [error, setError] = useState(false);
  const thumbnailUrl = `/api/thumbnail/${encodeURIComponent(file.name)}`;

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <MusicIcon />
      </div>
    );
  }

  return (
    <Image
      src={thumbnailUrl}
      alt={file.title || file.displayName}
      width={32}
      height={32}
      className="object-cover w-full h-full"
      onError={() => setError(true)}
      priority
    />
  );
};

export default function FileList() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFile, setCurrentFile] = useState<FileInfo | null>(null);
  const [customDownloadsPath, setCustomDownloadsPath] = useState<string | null>(null);

  const selectDownloadsFolder = async () => {
    try {
      // @ts-ignore - showDirectoryPicker é uma API experimental
      const directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads'
      });
      
      const path = await directoryHandle.getDirectoryHandle();
      setCustomDownloadsPath(path.name);
      
      // Salvar a preferência no localStorage
      localStorage.setItem('customDownloadsPath', path.name);
      
      // Atualizar a API com o novo caminho
      await fetch('/api/set-downloads-path', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: path.name }),
      });
      
      // Recarregar a lista de arquivos
      fetchFiles();
    } catch (error) {
      console.error('Erro ao selecionar pasta:', error);
    }
  };

  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/files');
      const data = await response.json();
      setFiles(data.files);
    } catch (error) {
      console.error('Erro ao carregar arquivos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Carregar a preferência salva
    const savedPath = localStorage.getItem('customDownloadsPath');
    if (savedPath) {
      setCustomDownloadsPath(savedPath);
    }
    
    fetchFiles();

    // Atualizar a cada 5 segundos
    const interval = setInterval(fetchFiles, 5000);

    // Atualizar quando um novo download for concluído
    const handleRefresh = () => fetchFiles();
    window.addEventListener('refresh-files', handleRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('refresh-files', handleRefresh);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        <MusicIcon />
        <p className="mt-2">Nenhum arquivo baixado ainda.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-white mb-4">Arquivos Baixados</h2>
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => {
                const downloadsPath = customDownloadsPath 
                  ? `${process.cwd()}/${customDownloadsPath}`
                  : `${process.cwd()}/downloads`;
                window.open(`file:///${downloadsPath.replace(/\\/g, '/')}`);
              }}
              className="px-4 py-2 bg-zinc-800 text-white rounded-md hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-600 transition-colors duration-200 text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              Abrir Pasta de Downloads
            </button>
            <button
              onClick={selectDownloadsFolder}
              className="px-4 py-2 bg-zinc-800 text-white rounded-md hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-600 transition-colors duration-200 text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Escolher Nova Pasta
            </button>
          </div>
          {customDownloadsPath && (
            <div className="text-sm text-gray-400">
              Pasta atual: {customDownloadsPath}
            </div>
          )}
        </div>
        <div className="bg-zinc-800 rounded-lg border border-zinc-700 overflow-hidden max-h-[800px] overflow-y-auto w-full max-w-[1280px] mx-auto">
          <div className="grid grid-cols-[40px_60px_1.5fr_80px_1fr_80px] gap-2 px-4 py-2 text-sm text-gray-400 border-b border-zinc-700 sticky top-0 bg-zinc-800 w-full">
            <div className="text-center">#</div>
            <div></div>
            <div>Título</div>
            <div className="text-center">Duração</div>
            <div>Artista</div>
            <div className="text-center">Ações</div>
          </div>
          {files.map((file, index) => (
            <div
              key={file.path}
              className="grid grid-cols-[40px_60px_1.5fr_80px_1fr_80px] gap-2 px-4 items-center hover:bg-zinc-700 transition-colors duration-200 group w-full h-[50px]"
              style={{ minHeight: 50 }}
            >
              <div className="text-center text-gray-400">{index + 1}</div>
              <div className="flex items-center justify-center">
                <button
                  onClick={() => setCurrentFile(file)}
                  className="w-10 h-10 flex-shrink-0 bg-zinc-700 rounded-sm overflow-hidden group-hover:bg-zinc-600 transition-colors relative"
                >
                  <ThumbnailImage file={file} />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </button>
              </div>
              <div className="truncate text-white group-hover:text-gray-200 flex items-center">{file.title || file.displayName}</div>
              <div className="text-center text-gray-400">{file.duration || '-'}</div>
              <div className="truncate text-gray-400">{file.artist || '-'}</div>
              <div className="flex items-center justify-center">
                <a
                  href={`/api/downloads/${encodeURIComponent(file.name)}`}
                  download
                  className="text-white hover:text-gray-200 transition-colors duration-200 px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600"
                >
                  Baixar
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {currentFile && (
        <AudioPlayer
          file={currentFile}
          onClose={() => setCurrentFile(null)}
        />
      )}
    </>
  );
}

function formatDateTime(dateString?: string) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (isToday) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
} 