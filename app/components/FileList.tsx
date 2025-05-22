'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import AudioPlayer from './AudioPlayer';
import DownloadQueue from './DownloadQueue';
import { useDownload } from '../contexts/DownloadContext';

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
  genre?: string;
  album?: string;
  downloadedAt?: string;
  metadata?: {
    album?: string;
    ano?: string;
    genero?: string;
    descricao?: string;
  };
  fileCreatedAt?: string;
  isBeatportFormat?: boolean;
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
  const [sortBy, setSortBy] = useState<string>('fileCreatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [metadataStatus, setMetadataStatus] = useState<{ [fileName: string]: 'idle' | 'loading' | 'success' | 'error' | string }>({});
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [updateProgress, setUpdateProgress] = useState({ current: 0, total: 0 });
  const [showQueue, setShowQueue] = useState(false);
  const [groupByAlbum, setGroupByAlbum] = useState(false);
  const { queue, maxConcurrentDownloads } = useDownload();

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

    // Ouvir evento customizado para abrir a fila de downloads
    const openQueue = () => setShowQueue(true);
    window.addEventListener('open-download-queue', openQueue);

    return () => {
      clearInterval(interval);
      window.removeEventListener('refresh-files', handleRefresh);
      window.removeEventListener('open-download-queue', openQueue);
    };
  }, []);

  // Função para alternar ordenação
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  // Função de comparação genérica
  const compare = (a: any, b: any) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
  };

  // Ordenar arquivos filtrados
  const sortedFiles = [...files.filter(file => {
    const query = search.toLowerCase();
    return (
      file.displayName.toLowerCase().includes(query) ||
      (file.title && file.title.toLowerCase().includes(query)) ||
      (file.artist && file.artist.toLowerCase().includes(query))
    );
  })];

  if (sortBy) {
    sortedFiles.sort((a, b) => {
      let valA, valB;
      switch (sortBy) {
        case '#':
          valA = files.indexOf(a);
          valB = files.indexOf(b);
          break;
        case 'title':
          valA = a.title || a.displayName;
          valB = b.title || b.displayName;
          break;
        case 'duration':
          valA = a.duration;
          valB = b.duration;
          break;
        case 'artist':
          valA = a.artist;
          valB = b.artist;
          break;
        case 'bpm':
          valA = a.bpm;
          valB = b.bpm;
          break;
        case 'key':
          valA = a.key;
          valB = b.key;
          break;
        case 'genre':
          valA = a.genre;
          valB = b.genre;
          break;
        case 'album':
          valA = a.album;
          valB = b.album;
          break;
        case 'downloadedAt':
          valA = a.downloadedAt;
          valB = b.downloadedAt;
          break;
        case 'fileCreatedAt':
          valA = a.fileCreatedAt;
          valB = b.fileCreatedAt;
          break;
        default:
          // fallback seguro para tipos
          const fileInfoMap: Record<string, any> = a;
          const fileInfoMapB: Record<string, any> = b;
          valA = fileInfoMap[sortBy];
          valB = fileInfoMapB[sortBy];
      }
      const cmp = compare(valA, valB);
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }

  // Agrupar por álbum se necessário
  const groupedFiles = groupByAlbum ? sortedFiles.reduce((groups, file) => {
    const album = file.album || 'Sem Álbum';
    if (!groups[album]) {
      groups[album] = [];
    }
    groups[album].push(file);
    return groups;
  }, {} as Record<string, FileInfo[]>) : { '': sortedFiles };

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

  async function updateMetadataForFile(fileName: string) {
    setMetadataStatus(s => ({ ...s, [fileName]: 'loading' }));
    try {
      const response = await fetch('/api/update-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        setMetadataStatus(s => ({ ...s, [fileName]: result.error || 'error' }));
        return;
      }
      setMetadataStatus(s => ({ ...s, [fileName]: 'success' }));
      fetchFiles();
    } catch (err: any) {
      setMetadataStatus(s => ({ ...s, [fileName]: err.message || 'error' }));
    }
  }

  async function updateAllMetadata() {
    const filesToUpdate = files.filter(file => !file.isBeatportFormat);
    if (filesToUpdate.length === 0) return;

    setIsUpdatingAll(true);
    setUpdateProgress({ current: 0, total: filesToUpdate.length });

    for (const file of filesToUpdate) {
      setMetadataStatus(s => ({ ...s, [file.name]: 'loading' }));
      try {
        const response = await fetch('/api/update-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name }),
        });
        const result = await response.json();
        if (!response.ok || result.error) {
          setMetadataStatus(s => ({ ...s, [file.name]: result.error || 'error' }));
        } else {
          setMetadataStatus(s => ({ ...s, [file.name]: 'success' }));
        }
      } catch (err: any) {
        setMetadataStatus(s => ({ ...s, [file.name]: err.message || 'error' }));
      }
      setUpdateProgress(prev => ({ ...prev, current: prev.current + 1 }));
    }

    setIsUpdatingAll(false);
    fetchFiles();
  }

  // Contar apenas downloads em andamento ou na fila
  const queueActive = queue.filter(item => ['pending', 'queued', 'downloading'].includes(item.status));
  const queueCount = queueActive.length;
  // Verificar se há algum download em andamento
  const isProcessing = queue.some(item => item.status === 'downloading');

  if (loading) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex justify-center items-center animate-fade-in">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col justify-center items-center text-center text-gray-400 animate-fade-in">
          <MusicIcon />
          <p className="mt-2">Nenhum arquivo baixado ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="space-y-1 animate-slide-up flex-1 flex flex-col">
        <div className="flex justify-between items-center mb-4 gap-2">
          <h2 className="text-xl font-semibold text-white">Arquivos Baixados</h2>
          <div className="flex gap-2">
            <button
              onClick={updateAllMetadata}
              disabled={isUpdatingAll || files.every(f => f.isBeatportFormat)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                isUpdatingAll || files.every(f => f.isBeatportFormat)
                  ? 'bg-zinc-700 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isUpdatingAll ? (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  </svg>
                  <span>Atualizando... ({updateProgress.current}/{updateProgress.total})</span>
                </div>
              ) : (
                'Atualizar Todos'
              )}
            </button>
            <button
              onClick={() => setGroupByAlbum(!groupByAlbum)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                groupByAlbum
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-zinc-700 text-white hover:bg-zinc-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                {groupByAlbum ? 'Desagrupar' : 'Agrupar por Álbum'}
              </div>
            </button>
          </div>
        </div>
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
        <div className="bg-zinc-800 rounded-md border border-zinc-700 overflow-hidden w-full flex flex-col" style={{height: '100%'}}>
          <div className="grid grid-cols-[32px_48px_minmax(120px,2fr)_80px_1fr_60px_60px_100px_100px_80px] gap-2 px-2 py-2 text-sm text-gray-400 border-b border-zinc-700 sticky top-0 bg-zinc-900 z-10 w-full">
            <div className="text-center cursor-pointer select-none" onClick={() => handleSort('#')}>
              # {sortBy === '#' && (sortOrder === 'asc' ? '↑' : '↓')}
            </div>
            <div></div>
            <div className="cursor-pointer select-none" onClick={() => handleSort('title')}>
              Título {sortBy === 'title' && (sortOrder === 'asc' ? '↑' : '↓')}
            </div>
            <div className="text-center cursor-pointer select-none" onClick={() => handleSort('duration')}>
              Duração {sortBy === 'duration' && (sortOrder === 'asc' ? '↑' : '↓')}
            </div>
            <div className="cursor-pointer select-none" onClick={() => handleSort('artist')}>
              Artista {sortBy === 'artist' && (sortOrder === 'asc' ? '↑' : '↓')}
            </div>
            <div className="text-center cursor-pointer select-none" onClick={() => handleSort('bpm')}>
              BPM {sortBy === 'bpm' && (sortOrder === 'asc' ? '↑' : '↓')}
            </div>
            <div className="text-center cursor-pointer select-none" onClick={() => handleSort('key')}>
              Key {sortBy === 'key' && (sortOrder === 'asc' ? '↑' : '↓')}
            </div>
            <div className="text-center cursor-pointer select-none" onClick={() => handleSort('genre')}>
              Gênero {sortBy === 'genre' && (sortOrder === 'asc' ? '↑' : '↓')}
            </div>
            <div className="text-center cursor-pointer select-none" onClick={() => handleSort('album')}>
              Álbum/Label {sortBy === 'album' && (sortOrder === 'asc' ? '↑' : '↓')}
            </div>
            <div className="text-center">Ações</div>
          </div>
          <div
            className="flex-1 overflow-y-auto custom-scroll"
          >
            {Object.entries(groupedFiles).map(([album, files]) => (
              <div key={album} className="animate-fade-in">
                {groupByAlbum && album !== '' && (
                  <div className="sticky top-0 bg-zinc-900 z-10 px-2 py-2 border-b border-zinc-700">
                    <h3 className="text-sm font-medium text-white">{album}</h3>
                  </div>
                )}
                {files.map((file, index) => (
                  <div
                    key={file.path}
                    className="grid grid-cols-[32px_48px_minmax(120px,2fr)_80px_1fr_60px_60px_100px_100px_80px] gap-2 px-2 items-center hover:bg-zinc-700 transition-all duration-200 group w-full h-[50px] animate-fade-in text-xs"
                    style={{ minHeight: 50 }}
                  >
                    <div className="text-center text-gray-400">{files.indexOf(file) + 1}</div>
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
                    <div className="truncate text-gray-400 flex items-center gap-2">
                      {file.title || file.displayName}
                      {file.isBeatportFormat && (
                        <span className="text-xs text-green-500" title="Arquivo já está no formato Beatport">
                          ✓
                        </span>
                      )}
                    </div>
                    <div className="text-center text-gray-400">{file.duration || '-'}</div>
                    <div className="truncate text-gray-400">{file.artist || '-'}</div>
                    <div className="text-center text-gray-400">{file.bpm || '-'}</div>
                    <div className="text-center text-gray-400">{file.key || '-'}</div>
                    <div className="text-center text-gray-400">{file.genre || '-'}</div>
                    <div className="text-center text-gray-400">
                      <span className="truncate block max-w-[180px] whitespace-nowrap" title={file.album || ''}>{file.album || '-'}</span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => updateMetadataForFile(file.name)}
                        disabled={metadataStatus[file.name] === 'loading' || file.isBeatportFormat}
                        className={`text-blue-500 hover:text-blue-700 transition-all p-2 rounded-full bg-zinc-700 hover:bg-zinc-600 ${file.isBeatportFormat ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={
                          file.isBeatportFormat
                            ? 'Arquivo já está no formato Beatport'
                            : metadataStatus[file.name] === 'error' || (metadataStatus[file.name] && metadataStatus[file.name] !== 'idle' && metadataStatus[file.name] !== 'success' && metadataStatus[file.name] !== 'loading')
                              ? String(metadataStatus[file.name])
                              : metadataStatus[file.name] === 'success'
                                ? 'Metadados atualizados com sucesso!'
                                : metadataStatus[file.name] === 'loading'
                                  ? 'Atualizando metadados...'
                                  : 'Atualizar metadados'
                        }
                      >
                        {metadataStatus[file.name] === 'loading' ? (
                          <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          </svg>
                        ) : metadataStatus[file.name] === 'success' ? (
                          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : metadataStatus[file.name] && metadataStatus[file.name] !== 'idle' && metadataStatus[file.name] !== 'success' ? (
                          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l1.664-1.664A9 9 0 1012 3v.75" />
                          </svg>
                        )}
                      </button>
                      <a
                        href={`/api/downloads/${encodeURIComponent(file.name)}`}
                        download
                        className="text-green-500 hover:text-green-700 transition-all p-2 rounded-full bg-zinc-700 hover:bg-zinc-600"
                        title="Baixar arquivo"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l-6-6m6 6l6-6" />
                        </svg>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
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
      {showQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <DownloadQueue onClose={() => setShowQueue(false)} />
        </div>
      )}
    </div>
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