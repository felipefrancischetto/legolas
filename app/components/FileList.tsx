'use client';

import { useEffect, useState, useRef, memo, useCallback } from 'react';
import Image from 'next/image';
import DownloadQueue from './DownloadQueue';
import { useDownload } from '../contexts/DownloadContext';
import { useFile } from '../contexts/FileContext';
import { useUI } from '../contexts/UIContext';
import { usePlayer } from '../contexts/PlayerContext';
import { getThumbnailUrl } from '../utils/thumbnailCache';

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
  label?: string;
}

const MusicIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
  </svg>
);

// Memoizando o ThumbnailImage para evitar re-renders desnecessários
const ThumbnailImage = memo(({ file, fileExists }: { file: FileInfo, fileExists: boolean }) => {
  const [error, setError] = useState(false);
  
  if (!fileExists || error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-800 rounded">
        <svg className="w-6 h-6 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>
    );
  }

  const thumbnailUrl = getThumbnailUrl(file.name);
  return (
    <div className="w-full h-full relative">
      <Image
        src={thumbnailUrl}
        alt={file.title || file.displayName}
        width={32}
        height={32}
        className="object-cover w-full h-full rounded"
        onError={() => setError(true)}
        loading="lazy"
      />
    </div>
  );
});

ThumbnailImage.displayName = 'ThumbnailImage';

// Memoizando o FileRow para evitar re-renders desnecessários
const FileRow = memo(({ 
  file, 
  index, 
  files,
  colWidths, 
  onPlay, 
  onContextMenu 
}: {
  file: FileInfo;
  index: number;
  files: FileInfo[];
  colWidths: number[];
  onPlay: (file: FileInfo) => void;
  onContextMenu: (e: React.MouseEvent, file: FileInfo) => void;
}) => {
  const fileExists = files.some(f => f.name === file.name);
  
  return (
    <div
      key={file.path}
      className="flex items-center hover:bg-zinc-700 transition-all duration-200 group w-full h-[50px] animate-fade-in text-xs cursor-pointer"
      style={{ minHeight: 50 }}
      onClick={e => onContextMenu(e, file)}
    >
      <div className="flex justify-center text-center text-gray-400" style={{width:colWidths[0], minWidth:40}}>
        {index + 1}
      </div>
      <div className="flex items-center justify-center" style={{width:colWidths[1], minWidth:40}}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay(file);
          }}
          className="w-10 h-10 flex-shrink-0 bg-zinc-700 rounded-sm overflow-hidden group-hover:bg-zinc-600 transition-all duration-200 relative transform hover:scale-110"
        >
          <ThumbnailImage file={file} fileExists={fileExists} />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </button>
      </div>
      <div className="truncate text-gray-400 flex items-center gap-2 justify-start" style={{width:colWidths[2], minWidth:40}}>
        {file.title || file.displayName}
        {file.isBeatportFormat && (
          <span className="text-xs text-green-500" title="Arquivo já está no formato Beatport">
            ✓
          </span>
        )}
      </div>
      <div className="flex justify-center text-center text-gray-400" style={{width:colWidths[3], minWidth:40}}>{file.duration || '-'}</div>
      <div className="truncate text-gray-400 flex items-center justify-start" style={{width:colWidths[4], minWidth:40}}>{file.artist || '-'}</div>
      <div className="flex justify-center text-center text-gray-400" style={{width:colWidths[5], minWidth:40}}>{file.bpm || '-'}</div>
      <div className="flex justify-center text-center text-gray-400" style={{width:colWidths[6], minWidth:40}}>{file.key || '-'}</div>
      <div className="flex justify-center text-center text-gray-400" style={{width:colWidths[7], minWidth:40}}>{file.genre || '-'}</div>
      <div className="flex justify-center text-center text-gray-400" style={{width:colWidths[8], minWidth:40}}>
        <span className="truncate block max-w-[180px] whitespace-nowrap" title={file.album || ''}>{file.album || '-'}</span>
      </div>
      <div className="flex justify-center text-center text-gray-400" style={{width:colWidths[9], minWidth:40}}>
        <span className="truncate block max-w-[180px] whitespace-nowrap" title={file.label || ''}>{file.label || '-'}</span>
      </div>
    </div>
  );
});

FileRow.displayName = 'FileRow';

export default function FileList() {
  const {
    files,
    setFiles,
    loading,
    setLoading,
    metadataStatus,
    setMetadataStatus,
    isUpdatingAll,
    setIsUpdatingAll,
    updateProgress,
    setUpdateProgress,
    customDownloadsPath,
    setCustomDownloadsPath,
  } = useFile();

  const {
    search,
    setSearch,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    groupByAlbum,
    setGroupByAlbum,
    showQueue,
    setShowQueue,
    playerOpen,
    setPlayerOpen,
    actionMenu,
    setActionMenu,
    colWidths,
    setColWidths,
  } = useUI();

  const { play } = usePlayer();
  const { queue, updateQueueItem } = useDownload();
  const resizingCol = useRef<number | null>(null);
  const startX = useRef<number>(0);
  const startWidth = useRef<number>(0);
  const audioPlayerRef = useRef<any>(null);
  const lastPlayedFile = useRef<string | null>(null);

  const fetchFiles = useCallback(async () => {
    try {
      const response = await fetch('/api/files');
      const data = await response.json();
      setFiles(data.files);
    } catch (error) {
      console.error('Erro ao carregar arquivos:', error);
    } finally {
      setLoading(false);
    }
  }, [setFiles, setLoading]);

  useEffect(() => {
    // Carregar a preferência salva
    const savedPath = localStorage.getItem('customDownloadsPath');
    if (savedPath) {
      setCustomDownloadsPath(savedPath);
    }
    
    fetchFiles();

    // Atualizar a cada 30 segundos (reduzido de 15s para diminuir re-renders)
    const interval = setInterval(fetchFiles, 30000);

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
  }, [fetchFiles, setCustomDownloadsPath, setShowQueue]);

  // Função para alternar ordenação
  const handleSort = useCallback((column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  }, [sortBy, sortOrder, setSortBy, setSortOrder]);

  // Função de comparação genérica
  const compare = (a: any, b: any) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
  };

  // Memoizando a ordenação e filtragem
  const sortedFiles = useCallback(() => {
    const filtered = [...(files || [])].filter(file => {
      const query = search.toLowerCase();
      return (
        (file.displayName && file.displayName.toLowerCase().includes(query)) ||
        (file.title && file.title.toLowerCase().includes(query)) ||
        (file.artist && file.artist.toLowerCase().includes(query))
      );
    });

    // Aplicar ordenação apenas se o usuário selecionou uma coluna específica
    if (sortBy) {
      filtered.sort((a, b) => {
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
          case 'label':
            valA = a.label;
            valB = b.label;
            break;
          default:
            const fileInfoMap: Record<string, any> = a;
            const fileInfoMapB: Record<string, any> = b;
            valA = fileInfoMap[sortBy];
            valB = fileInfoMapB[sortBy];
        }
        const cmp = compare(valA, valB);
        return sortOrder === 'asc' ? cmp : -cmp;
      });
    }

    return filtered;
  }, [files, search, sortBy, sortOrder]);

  // Memoizando o agrupamento
  const groupedFiles = useCallback(() => {
    const sorted = sortedFiles();
    return groupByAlbum ? sorted.reduce((groups, file) => {
      const album = file.album || 'Sem Álbum';
      if (!groups[album]) {
        groups[album] = [];
      }
      groups[album].push(file);
      return groups;
    }, {} as Record<string, FileInfo[]>) : { '': sorted };
  }, [sortedFiles, groupByAlbum]);

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
    setMetadataStatus({ ...metadataStatus, [fileName]: 'loading' });
    try {
      const response = await fetch('/api/update-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        setMetadataStatus({ ...metadataStatus, [fileName]: result.error || 'error' });
        return;
      }
      setMetadataStatus({ ...metadataStatus, [fileName]: 'success' });
      fetchFiles();
    } catch (err: any) {
      setMetadataStatus({ ...metadataStatus, [fileName]: err.message || 'error' });
    }
  }

  async function updateAllMetadata() {
    const filesToUpdate = files.filter(file => !file.isBeatportFormat);
    if (filesToUpdate.length === 0) return;

    setIsUpdatingAll(true);
    setUpdateProgress({ current: 0, total: filesToUpdate.length });

    for (const file of filesToUpdate) {
      setMetadataStatus({ ...metadataStatus, [file.name]: 'loading' });
      try {
        const response = await fetch('/api/update-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name }),
        });
        const result = await response.json();
        if (!response.ok || result.error) {
          setMetadataStatus({ ...metadataStatus, [file.name]: result.error || 'error' });
        } else {
          setMetadataStatus({ ...metadataStatus, [file.name]: 'success' });
        }
      } catch (err: any) {
        setMetadataStatus({ ...metadataStatus, [file.name]: err.message || 'error' });
      }
      setUpdateProgress({ ...updateProgress, current: updateProgress.current + 1 });
    }

    setIsUpdatingAll(false);
    fetchFiles();
  }

  // Contar apenas downloads em andamento ou na fila
  const queueActive = queue.filter(item => ['pending', 'queued', 'downloading'].includes(item.status));
  const queueCount = queueActive.length;
  // Verificar se há algum download em andamento
  const isProcessing = queue.some(item => item.status === 'downloading');

  // Nova função para selecionar pasta de downloads com feedback
  const handleSelectDownloadsFolder = async () => {
    if (!('showDirectoryPicker' in window)) {
      alert('Seu navegador não suporta seleção de pastas. Use o Chrome ou Edge mais recente.');
      return;
    }
    try {
      // Só pode ser chamado em resposta a um clique!
      // @ts-ignore
      const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setCustomDownloadsPath(directoryHandle.name);
      localStorage.setItem('customDownloadsPath', directoryHandle.name);
      // Atualizar a API/backend se necessário
      await fetch('/api/set-downloads-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: directoryHandle.name }),
      });
      // Atualizar a lista
      fetchFiles();
      alert('Pasta selecionada com sucesso!');
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        alert('Seleção de pasta cancelada.');
      } else {
        alert('Permissão negada ou erro ao acessar a pasta.');
      }
    }
  };

  // Função para iniciar o resize
  const handleResizeStart = (idx: number, e: React.MouseEvent) => {
    resizingCol.current = idx;
    startX.current = e.clientX;
    startWidth.current = colWidths[idx];
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', handleResizing);
    window.addEventListener('mouseup', handleResizeEnd);
  };

  // Função para redimensionar
  const handleResizing = (e: MouseEvent) => {
    if (resizingCol.current === null) return;
    const delta = e.clientX - startX.current;
    const newWidths = [...colWidths];
    newWidths[resizingCol.current!] = Math.max(40, startWidth.current + delta);
    setColWidths(newWidths);
  };

  // Função para finalizar o resize
  const handleResizeEnd = () => {
    resizingCol.current = null;
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', handleResizing);
    window.removeEventListener('mouseup', handleResizeEnd);
  };

  // Sincronizar fila de downloads com arquivos baixados
  useEffect(() => {
    if (!queue || !files) return;
    queue.forEach(item => {
      if (files.some(f => f.name === item.title || f.displayName === item.title)) {
        updateQueueItem(item.id, { status: 'completed', progress: 100 });
      }
    });
  }, [files, queue, updateQueueItem]);

  // Fecha o menu de ações ao clicar fora
  useEffect(() => {
    if (!actionMenu) return;
    const handleClick = (e: MouseEvent) => {
      setActionMenu(null);
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [actionMenu, setActionMenu]);

  // Handlers memoizados
  const handlePlay = useCallback((file: FileInfo) => {
    play(file);
    setPlayerOpen(true);
  }, [play, setPlayerOpen]);

  const handleContextMenu = useCallback((e: React.MouseEvent, file: FileInfo) => {
    if (e.button === 0) {
      e.stopPropagation();
      setActionMenu({
        x: e.clientX,
        y: e.clientY,
        file
      });
    }
  }, [setActionMenu]);

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center animate-fade-in">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if ((files || []).length === 0) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center text-center text-gray-400 animate-fade-in">
        <MusicIcon />
        <p className="mt-2">Nenhum arquivo baixado ainda.</p>
      </div>
    );
  }

  const finalGroupedFiles = groupedFiles();

  return (
    <>
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
            onClick={handleSelectDownloadsFolder}
            className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all duration-200 shadow"
            title={customDownloadsPath ? `Pasta atual: ${customDownloadsPath}` : 'Selecionar pasta de downloads'}
          >
            Selecionar pasta de downloads
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
      
      <div className="flex justify-between items-center mb-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por título ou artista..."
          className="w-full max-w-md px-4 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-white placeholder-gray-400 focus:border-zinc-600 focus:ring-zinc-600 transition-all duration-200 shadow"
        />
      </div>
      
      <div 
        className="bg-zinc-800 rounded-md border border-zinc-700 overflow-hidden flex flex-col flex-1"
        style={{ 
          maxHeight: playerOpen ? '400px' : 'none'
        }}
      >
        <div className="flex w-full px-2 py-2 text-sm text-gray-400 border-b border-zinc-700 sticky top-0 bg-zinc-900 z-10" style={{userSelect:'none'}}>
          {[
            { label: '#', sortable: true, align: 'center' },
            { label: '', sortable: false, align: 'center' },
            { label: 'Título', sortable: true, align: 'left' },
            { label: 'Duração', sortable: true, align: 'center' },
            { label: 'Artista', sortable: true, align: 'left' },
            { label: 'BPM', sortable: true, align: 'center' },
            { label: 'Key', sortable: true, align: 'center' },
            { label: 'Gênero', sortable: true, align: 'center' },
            { label: 'Álbum', sortable: true, align: 'center' },
            { label: 'Label', sortable: true, align: 'center' },
          ].map((col, idx) => (
            <div
              key={col.label}
              className={`flex items-center h-8 relative ${col.sortable ? 'cursor-pointer select-none' : ''} ${col.align === 'center' ? 'justify-center' : 'justify-start'}`}
              style={{ width: colWidths[idx], minWidth: 40 }}
              onClick={col.sortable ? () => handleSort(col.label.toLowerCase().replace('ações','label') === 'ações' ? 'label' : col.label.toLowerCase()) : undefined}
            >
              <span className="truncate">{col.label} {sortBy === col.label.toLowerCase() && (sortOrder === 'asc' ? '↑' : '↓')}</span>
              {idx < colWidths.length - 2 && (
                <div
                  onMouseDown={e => handleResizeStart(idx, e)}
                  className="absolute right-0 top-0 h-full w-2 cursor-col-resize z-20"
                  style={{ userSelect: 'none' }}
                />
              )}
            </div>
          ))}
        </div>
        <div 
          className="flex-1 min-h-0 overflow-y-auto custom-scroll"
        >
          {Object.entries(finalGroupedFiles).map(([album, files]) => (
            <div key={album} className="animate-fade-in">
              {groupByAlbum && album !== '' && (
                <div className="sticky top-0 bg-zinc-900 z-10 px-2 py-2 border-b border-zinc-700">
                  <h3 className="text-sm font-medium text-white">{album}</h3>
                </div>
              )}
              {files.map((file, index) => (
                <FileRow
                  key={file.path}
                  file={file}
                  index={index}
                  files={files}
                  colWidths={colWidths}
                  onPlay={handlePlay}
                  onContextMenu={handleContextMenu}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      
      {showQueue && queue.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <DownloadQueue onClose={() => setShowQueue(false)} />
        </div>
      )}

      {/* Menu flutuante de ações */}
      {actionMenu && actionMenu.file && (
        <div
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded shadow-lg p-2 flex flex-col min-w-[180px] animate-fade-in"
          style={{ left: actionMenu.x, top: actionMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-2 hover:bg-zinc-700 text-white rounded"
            disabled={metadataStatus[actionMenu.file.name] === 'loading' || actionMenu.file.isBeatportFormat}
            onClick={() => {
              updateMetadataForFile(actionMenu.file!.name);
              setActionMenu(null);
            }}
          >
            Atualizar metadados
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-zinc-700 text-white rounded"
            onClick={() => {
              window.open(`/api/downloads/${encodeURIComponent(actionMenu.file!.name)}`, '_blank');
              setActionMenu(null);
            }}
          >
            Baixar arquivo
          </button>
        </div>
      )}
    </>
  );
}
