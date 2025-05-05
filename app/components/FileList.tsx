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
  metadata?: {
    album?: string;
    ano?: string;
    genero?: string;
    descricao?: string;
  };
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
  const [search, setSearch] = useState('');

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

    // Atualizar a cada 15 segundos
    const interval = setInterval(fetchFiles, 15000);

    // Atualizar quando um novo download for concluído
    const handleRefresh = () => fetchFiles();
    window.addEventListener('refresh-files', handleRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('refresh-files', handleRefresh);
    };
  }, []);

  // Filtrar arquivos conforme a busca
  const filteredFiles = files.filter(file => {
    const query = search.toLowerCase();
    return (
      file.displayName.toLowerCase().includes(query) ||
      (file.title && file.title.toLowerCase().includes(query)) ||
      (file.artist && file.artist.toLowerCase().includes(query))
    );
  });

  const openDownloadsFolder = () => {
    // Caminho padrão do Windows (ajuste conforme necessário)
    const path = customDownloadsPath 
      ? `${customDownloadsPath}`
      : `${process.env.USERPROFILE || ''}/Downloads`;
    const fileUrl = `file:///${path.replace(/\\/g, '/').replace(/\s/g, '%20')}`;
    const win = window.open(fileUrl);
    if (!win) {
      alert('Não foi possível abrir a pasta automaticamente. Por favor, acesse sua pasta de downloads manualmente.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32 animate-fade-in">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8 animate-fade-in">
        <MusicIcon />
        <p className="mt-2">Nenhum arquivo baixado ainda.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1 animate-slide-up">
        <h2 className="text-xl font-semibold text-white mb-4">Arquivos Baixados</h2>
        <div className="flex justify-between items-center mb-2 w-full max-w-[1280px] mx-auto">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por título ou artista..."
            className="w-full max-w-md px-4 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-white placeholder-gray-400 focus:border-zinc-600 focus:ring-zinc-600 transition-all duration-200 shadow"
          />
        </div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          {customDownloadsPath && (
            <div className="text-sm text-gray-400 animate-fade-in">
              Pasta atual: {customDownloadsPath}
            </div>
          )}
        </div>
        <div
          className="bg-zinc-800 rounded-lg border border-zinc-700 overflow-hidden overflow-y-auto w-full"
          style={{ maxHeight: 'calc(100vh - 480px)' }}
        >
          <div className="grid grid-cols-[32px_48px_minmax(120px,2fr)_80px_1fr_80px] gap-2 px-2 py-2 text-sm text-gray-400 border-b border-zinc-700 sticky top-0 bg-zinc-900 z-10 w-full">
            <div className="text-center">#</div>
            <div></div>
            <div>Título</div>
            <div className="text-center">Duração</div>
            <div>Artista</div>
            <div className="text-center">Ações</div>
          </div>
          {filteredFiles.map((file, index) => (
            <div
              key={file.path}
              className="grid grid-cols-[32px_48px_minmax(120px,2fr)_80px_1fr_80px] gap-2 px-2 items-center hover:bg-zinc-700 transition-all duration-200 group w-full h-[50px] animate-fade-in"
              style={{ minHeight: 50 }}
            >
              <div className="text-center text-gray-400">{index + 1}</div>
              <div className="flex items-center justify-center">
                <button
                  onClick={() => setCurrentFile(file)}
                  className="w-10 h-10 flex-shrink-0 bg-zinc-700 rounded-sm overflow-hidden group-hover:bg-zinc-600 transition-all duration-200 relative transform hover:scale-110"
                >
                  <Image
                    src={`/api/thumbnail/${encodeURIComponent(file.name)}`}
                    alt={file.title || file.displayName}
                    width={32}
                    height={32}
                    className="object-cover w-full h-full"
                    loading="lazy"
                    priority={false}
                  />
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
                  className="text-white hover:text-gray-200 transition-all duration-200 px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600 transform hover:scale-105 active:scale-95"
                >
                  Baixar
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {currentFile && (
        <>
          <AudioPlayer
            file={currentFile}
            onClose={() => setCurrentFile(null)}
          />
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
            <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-md shadow-lg relative animate-fade-in">
              <button
                onClick={() => setCurrentFile(null)}
                className="absolute top-2 right-2 text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h3 className="text-lg font-semibold text-white mb-2">Detalhes da Música</h3>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-zinc-800 rounded overflow-hidden flex items-center justify-center">
                  <Image
                    src={`/api/thumbnail/${encodeURIComponent(currentFile.name)}`}
                    alt={currentFile.title || currentFile.displayName}
                    width={64}
                    height={64}
                    className="object-cover w-full h-full"
                    loading="lazy"
                    priority={false}
                  />
                </div>
                <div>
                  <div className="text-white font-medium text-base">{currentFile.title || currentFile.displayName}</div>
                  <div className="text-gray-400 text-sm">{currentFile.artist || '-'}</div>
                </div>
              </div>
              {currentFile.metadata ? (
                <div className="space-y-1 text-sm text-gray-300">
                  {currentFile.metadata.album && <div><span className="font-semibold">Álbum:</span> {currentFile.metadata.album}</div>}
                  {currentFile.metadata.ano && <div><span className="font-semibold">Ano:</span> {currentFile.metadata.ano}</div>}
                  {currentFile.metadata.genero && <div><span className="font-semibold">Gênero:</span> {currentFile.metadata.genero}</div>}
                  {currentFile.metadata.descricao && <div><span className="font-semibold">Descrição:</span> {currentFile.metadata.descricao}</div>}
                </div>
              ) : (
                <div className="text-gray-400 text-sm">Sem metadados adicionais.</div>
              )}
            </div>
          </div>
        </>
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