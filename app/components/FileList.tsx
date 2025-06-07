'use client';

import { useEffect, useState, useRef, memo, useCallback, useMemo } from 'react';
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
  ano?: string;
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
  onContextMenu,
  metadataStatus,
  updateMetadataForFile,
  setEditModalFile,
  isPlaying = false,
  fetchFiles
}: {
  file: FileInfo;
  index: number;
  files: FileInfo[];
  colWidths: number[];
  onPlay: (file: FileInfo) => void;
  onContextMenu: (e: React.MouseEvent, file: FileInfo) => void;
  metadataStatus: any;
  updateMetadataForFile: (fileName: string) => void;
  setEditModalFile: (file: FileInfo) => void;
  isPlaying?: boolean;
  fetchFiles: (force?: boolean) => void;
}) => {
  const fileExists = files.some(f => f.name === file.name);
  
  return (
    <div
      key={file.path}
      className={`flex items-center hover:bg-zinc-700 transition-all duration-200 group w-full h-[50px] animate-fade-in text-xs cursor-pointer ${isPlaying ? 'ring-2 ring-blue-400 bg-blue-900/20' : ''}`}
      style={{ minHeight: 50 }}
      onClick={e => onContextMenu(e, file)}
    >
      <div className="flex justify-center text-center text-gray-400" style={{width:colWidths[0], minWidth:50}}>
        {index + 1}
      </div>
      <div className="flex items-center justify-center" style={{width:colWidths[1], minWidth:50}}>
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
      <div className="truncate text-gray-400 flex items-center gap-2 justify-start" style={{width:colWidths[2], minWidth:50}}>
        {file.title || file.displayName}
        {file.isBeatportFormat && (
          <span className="text-xs text-green-500" title="Arquivo já está no formato Beatport">
            ✓
          </span>
        )}
      </div>
      <div className="truncate text-gray-400 flex items-center justify-start" style={{width:colWidths[3], minWidth:50}}>{file.artist || '-'}</div>
      <div className="flex justify-center text-center text-gray-400" style={{width:colWidths[4], minWidth:50}}>{file.duration || '-'}</div>
      <div className="flex justify-center text-center text-gray-400" style={{width:colWidths[5], minWidth:50}}>{file.bpm || '-'}</div>
      <div className="flex justify-center text-center text-gray-400" style={{width:colWidths[6], minWidth:50}}>{file.key || '-'}</div>
      <div className="flex justify-center text-center text-gray-400" style={{width:colWidths[7], minWidth:50}}>{file.genre || '-'}</div>
      <div className="flex justify-center text-center text-gray-400" style={{width:colWidths[8], minWidth:50}}>
        <span className="truncate block max-w-[180px] whitespace-nowrap" title={file.album || ''}>{file.album || '-'}</span>
      </div>
      <div className="flex justify-center text-center text-gray-400" style={{width:colWidths[9], minWidth:50}}>
        <span className="truncate block max-w-[180px] whitespace-nowrap" title={file.label || ''}>{file.label || '-'}</span>
      </div>
      <div className="flex justify-center text-center text-gray-400" style={{width:colWidths[10], minWidth:50}}>{file.ano ? String(file.ano).slice(0, 4) : '-'}</div>
      <div className="flex justify-center items-center" style={{width:colWidths[11], minWidth:120}}>
        <select
          className="px-2 py-1 rounded bg-zinc-700 text-white text-xs focus:outline-none"
          defaultValue=""
          onClick={e => e.stopPropagation()}
          onChange={async (e) => {
            const value = e.target.value;
            if (value === 'atualizar') {
              updateMetadataForFile(file.name);
            } else if (value === 'baixar') {
              window.open(`/api/downloads/${encodeURIComponent(file.name)}`, '_blank');
            } else if (value === 'editar') {
              setEditModalFile(file);
            } else if (value === 'remover') {
              await removeFile(file.name, fetchFiles);
            }
            e.target.value = '';
          }}
          disabled={metadataStatus[file.name] === 'loading' || file.isBeatportFormat}
        >
          <option value="" disabled hidden>Ações</option>
          <option value="atualizar">Atualizar</option>
          <option value="baixar">Baixar</option>
          <option value="editar">Editar</option>
          <option value="remover">Remover</option>
        </select>
      </div>
    </div>
  );
});

FileRow.displayName = 'FileRow';

// Função global para remover arquivo
async function removeFile(fileName: string, fetchFiles: (force?: boolean) => void) {
  if (!window.confirm('Tem certeza que deseja mover este arquivo para a lixeira?')) return;
  try {
    const response = await fetch(`/api/delete-file?fileName=${encodeURIComponent(fileName)}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Erro ao mover arquivo para lixeira');
    fetchFiles(true);
  } catch (err: any) {
    alert(err.message || 'Erro ao mover arquivo para lixeira.');
    fetchFiles(true); // Atualiza a lista mesmo em caso de erro
  }
}

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

  const { play, playerState } = usePlayer();
  const { queue, updateQueueItem } = useDownload();
  const resizingCol = useRef<number | null>(null);
  const startX = useRef<number>(0);
  const startWidth = useRef<number>(0);
  const audioPlayerRef = useRef<any>(null);
  const lastPlayedFile = useRef<string | null>(null);

  // Debounce para evitar múltiplas chamadas consecutivas
  const fetchFilesDebounced = useRef<NodeJS.Timeout | null>(null);
  const isCurrentlyFetching = useRef(false);

  const fetchFiles = useCallback(async (force = false) => {
    // Evitar múltiplas chamadas simultâneas
    if (isCurrentlyFetching.current && !force) {
      console.log('📂 Fetch já em andamento, ignorando nova chamada');
      return;
    }

    // Debounce - aguardar 500ms antes de executar
    if (fetchFilesDebounced.current) {
      clearTimeout(fetchFilesDebounced.current);
    }

    fetchFilesDebounced.current = setTimeout(async () => {
      isCurrentlyFetching.current = true;
      try {
        console.log('📂 Buscando lista de arquivos...');
        const response = await fetch('/api/files');
        const data = await response.json();
        setFiles(data.files);
        console.log(`📂 Lista de arquivos atualizada: ${data.files.length} arquivos`);
      } catch (error) {
        console.error('❌ Erro ao carregar arquivos:', error);
      } finally {
        setLoading(false);
        isCurrentlyFetching.current = false;
      }
    }, force ? 0 : 500);
  }, [setFiles, setLoading]);

  useEffect(() => {
    // Carregar a preferência salva
    const savedPath = localStorage.getItem('customDownloadsPath');
    if (savedPath) {
      setCustomDownloadsPath(savedPath);
    }
    
    // Carregar arquivos inicialmente (força execução imediata)
    fetchFiles(true);

    // Atualizar a cada 60 segundos (reduzido frequência para evitar calls desnecessários)
    const interval = setInterval(() => fetchFiles(), 60000);

    // Atualizar quando um novo download for concluído (com debounce)
    const handleRefresh = () => {
      console.log('🔄 Evento refresh-files recebido, atualizando lista...');
      fetchFiles();
    };
    window.addEventListener('refresh-files', handleRefresh);

    // Ouvir evento customizado para abrir a fila de downloads
    const openQueue = () => setShowQueue(true);
    window.addEventListener('open-download-queue', openQueue);

    return () => {
      clearInterval(interval);
      window.removeEventListener('refresh-files', handleRefresh);
      window.removeEventListener('open-download-queue', openQueue);
      
      // Limpar timeout pendente
      if (fetchFilesDebounced.current) {
        clearTimeout(fetchFilesDebounced.current);
      }
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
          case 'ano':
            valA = (a as any)['ano'];
            valB = (b as any)['ano'];
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

  const [groupByField, setGroupByField] = useState<string>('album');

  // Lista de campos possíveis para agrupar
  const groupableFields = [
    { value: '', label: 'Nenhum' },
    { value: 'album', label: 'Álbum' },
    { value: 'artist', label: 'Artista' },
    { value: 'genre', label: 'Gênero' },
    { value: 'ano', label: 'Ano' },
    { value: 'label', label: 'Label' },
    { value: 'key', label: 'Key' },
    { value: 'bpm', label: 'BPM' },
  ];

  // Memoizando o agrupamento
  const groupedFiles = useMemo(() => {
    const sorted = sortedFiles();
    if (!groupByField) return { '': sorted };
    return sorted.reduce((groups, file) => {
      // Acessar campo de forma segura
      let groupValue: string = '';
      if (groupByField in file) {
        // @ts-ignore
        groupValue = file[groupByField] ?? '';
      }
      if (!groupValue) groupValue = 'Sem valor';
      if (!groups[groupValue]) {
        groups[groupValue] = [];
      }
      groups[groupValue].push(file);
      return groups;
    }, {} as Record<string, FileInfo[]>);
  }, [sortedFiles, groupByField]);

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
      const file = files.find(f => f.name === fileName);
      if (!file) {
        throw new Error('Arquivo não encontrado');
      }

      const response = await fetch('/api/update-individual-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fileName,
          title: file.title || file.displayName,
          artist: file.artist || ''
        }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        setMetadataStatus({ ...metadataStatus, [fileName]: result.error || 'error' });
        return;
      }

      // Atualizar os metadados do arquivo com os novos dados
      const updatedFile = {
        ...file,
        ...result.metadata,
        isBeatportFormat: true
      };

      // Atualizar o arquivo no backend
      const updateResponse = await fetch('/api/update-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFile),
      });

      if (!updateResponse.ok) {
        throw new Error('Erro ao atualizar arquivo');
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
    e.preventDefault();
    e.stopPropagation();
    resizingCol.current = idx;
    startX.current = e.clientX;
    startWidth.current = colWidths[idx];
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleResizing);
    window.addEventListener('mouseup', handleResizeEnd);
  };

  // Função para redimensionar
  const handleResizing = (e: MouseEvent) => {
    if (resizingCol.current === null) return;
    e.preventDefault();
    const delta = e.clientX - startX.current;
    const newWidths = [...colWidths];
    newWidths[resizingCol.current!] = Math.max(50, startWidth.current + delta);
    setColWidths(newWidths);
  };

  // Função para finalizar o resize
  const handleResizeEnd = () => {
    resizingCol.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
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

  // Função para resetar larguras das colunas
  const resetColumnWidths = useCallback(() => {
    const defaultWidths = [36, 44, 200, 140, 56, 44, 52, 120, 120, 90, 52, 70];
    setColWidths(defaultWidths);
  }, [setColWidths]);

  const [editModalFile, setEditModalFile] = useState<FileInfo | null>(null);

  const handleEditFileSave = async (data: Partial<FileInfo>) => {
    if (editModalFile) {
      try {
        // Montar novo nome de arquivo no padrão: Artista(s) - Título (Versão) [Label].extensão
        const ext = editModalFile.name.split('.').pop();
        let artista = (data.artist || editModalFile.artist || '').trim();
        let titulo = (data.title || editModalFile.title || editModalFile.displayName || '').trim();
        let label = (data.label || editModalFile.label || '').trim();
        // Extrair versão do título se houver entre parênteses
        let versao = '';
        const matchVersao = titulo.match(/\(([^)]+)\)/);
        if (matchVersao) {
          versao = matchVersao[1];
          // Remover a versão do título para não duplicar
          titulo = titulo.replace(/\s*\([^)]*\)/, '').trim();
        }
        // Montar nome
        let newFileName = `${artista} - ${titulo}`;
        if (versao) newFileName += ` (${versao})`;
        if (label) newFileName += ` [${label}]`;
        newFileName = newFileName.replace(/\s+/g, ' ').replace(/[\\/:*?"<>|]/g, '').trim();
        newFileName += `.${ext}`;
        const response = await fetch('/api/update-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: editModalFile.name, ...data, year: data.ano ? String(data.ano).slice(0, 4) : '', newFileName }),
        });
        const result = await response.json();
        if (!response.ok || result.error) {
          setMetadataStatus({ ...metadataStatus, [editModalFile.name]: result.error || 'error' });
        } else {
          setMetadataStatus({ ...metadataStatus, [editModalFile.name]: 'success' });
          fetchFiles();
        }
      } catch (err: any) {
        setMetadataStatus({ ...metadataStatus, [editModalFile.name]: err.message || 'error' });
      }
      setEditModalFile(null);
    }
  };

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

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex justify-between items-center mb-4 gap-2 flex-shrink-0">
        <h2 className="text-xl font-semibold text-white">Arquivos Baixados</h2>
        <div className="flex gap-2 items-center">
          {/* Novo select de agrupamento */}
          <label className="text-sm text-zinc-300 mr-1">Agrupar por:</label>
          <select
            value={groupByField}
            onChange={e => setGroupByField(e.target.value)}
            className="px-2 py-1 rounded bg-zinc-700 text-white text-sm focus:outline-none"
          >
            {groupableFields.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
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
            onClick={resetColumnWidths}
            className="px-4 py-2 rounded-md text-sm font-medium bg-zinc-700 text-white hover:bg-zinc-600 transition-all duration-200"
            title="Resetar larguras das colunas para o padrão"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Resetar Colunas
            </div>
          </button>
        </div>
      </div>
      
      <div className="flex justify-between items-center mb-2 flex-shrink-0">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por título ou artista..."
          className="w-full max-w-md px-4 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-white placeholder-gray-400 focus:border-zinc-600 focus:ring-zinc-600 transition-all duration-200 shadow"
        />
      </div>
      
      <div 
        className="bg-zinc-800 rounded-md border border-zinc-700 overflow-hidden flex flex-col flex-1 min-h-0"
      >
        <div className="flex w-full px-2 py-2 text-sm text-gray-400 border-b border-zinc-700 sticky top-0 bg-zinc-900 z-10 flex-shrink-0" style={{userSelect:'none'}}>
          {[
            { label: '#', sortable: true, align: 'center' },
            { label: '', sortable: false, align: 'center' },
            { label: 'Título', sortable: true, align: 'left' },
            { label: 'Artista', sortable: true, align: 'left' },
            { label: 'Duração', sortable: true, align: 'center' },
            { label: 'BPM', sortable: true, align: 'center' },
            { label: 'Key', sortable: true, align: 'center' },
            { label: 'Gênero', sortable: true, align: 'center' },
            { label: 'Álbum', sortable: true, align: 'center' },
            { label: 'Label', sortable: true, align: 'center' },
            { label: 'Ano', sortable: true, align: 'center' },
            { label: 'Ações', sortable: false, align: 'center' },
          ].map((col, idx) => (
            <div
              key={col.label + idx}
              className={`flex items-center h-8 relative ${col.sortable ? 'cursor-pointer select-none' : ''} ${col.align === 'center' ? 'justify-center' : 'justify-start'}`}
              style={{ width: colWidths[idx], minWidth: 40 }}
              onClick={col.sortable ? () => handleSort(col.label.toLowerCase().replace('ações','label') === 'ações' ? 'label' : col.label.toLowerCase()) : undefined}
            >
              <span className="truncate">{col.label} {sortBy === col.label.toLowerCase() && (sortOrder === 'asc' ? '↑' : '↓')}</span>
              {idx < colWidths.length - 1 && (
                <div
                  onMouseDown={e => handleResizeStart(idx, e)}
                  className="absolute right-0 top-0 h-full w-1 cursor-col-resize z-20 bg-zinc-600 hover:bg-blue-500 transition-colors duration-200 opacity-50 hover:opacity-100"
                  style={{ userSelect: 'none' }}
                  title="Arrastar para redimensionar coluna"
                />
              )}
            </div>
          ))}
        </div>
        <div 
          className="flex-1 min-h-0 overflow-y-auto custom-scroll"
        >
          {Object.entries(groupedFiles).map(([group, files]) => (
            <div key={group} className="animate-fade-in">
              {groupByField && group !== '' && (
                <div className="sticky top-0 bg-zinc-900 z-10 px-2 py-2 border-b border-zinc-700">
                  <h3 className="text-sm font-medium text-white">{group}</h3>
                </div>
              )}
              {files.map((file, index) => (
                <FileRow
                  key={file.path}
                  file={file}
                  index={files.length - index - 1}
                  files={files}
                  colWidths={colWidths}
                  onPlay={handlePlay}
                  onContextMenu={handleContextMenu}
                  metadataStatus={metadataStatus}
                  updateMetadataForFile={updateMetadataForFile}
                  setEditModalFile={setEditModalFile}
                  isPlaying={!!(playerState.currentFile && playerState.currentFile.name === file.name)}
                  fetchFiles={fetchFiles}
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

      {/* Modal de edição manual de informações */}
      {editModalFile && (
        <EditFileModal
          file={editModalFile}
          onClose={() => setEditModalFile(null)}
          onSave={handleEditFileSave}
        />
      )}
    </div>
  );
}

function EditFileModal({ file, onClose, onSave }: { file: FileInfo, onClose: () => void, onSave: (data: Partial<FileInfo>) => void }) {
  const [form, setForm] = useState({
    title: file.title || '',
    artist: file.artist || '',
    duration: file.duration || '',
    bpm: file.bpm?.toString() || '',
    key: file.key || '',
    genre: file.genre || '',
    album: file.album || '',
    label: file.label || '',
    ano: file.ano || '',
  });
  const [saving, setSaving] = useState(false);
  const [anoError, setAnoError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'ano') {
      // Permitir apenas números e no máximo 4 dígitos
      if (!/^\d{0,4}$/.test(value)) return;
      setForm(f => ({ ...f, [name]: value.slice(0, 4) }));
      setAnoError(null);
    } else {
      setForm(f => ({ ...f, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setAnoError(null);
    if (form.ano && form.ano.length !== 4) {
      setAnoError('O ano deve ter 4 dígitos.');
      setSaving(false);
      return;
    }
    await onSave({
      ...form,
      bpm: form.bpm ? parseInt(form.bpm) : undefined,
      ano: form.ano ? form.ano : '',
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-md shadow-lg relative animate-fade-in">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-white"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-xl font-semibold text-white mb-4">Editar informações</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input name="title" value={form.title} onChange={handleChange} placeholder="Título" className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-white" />
          <input name="artist" value={form.artist} onChange={handleChange} placeholder="Artista" className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-white" />
          <input name="duration" value={form.duration} onChange={handleChange} placeholder="Duração" className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-white" />
          <input name="bpm" value={form.bpm} onChange={handleChange} placeholder="BPM" className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-white" />
          <input name="key" value={form.key} onChange={handleChange} placeholder="Key" className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-white" />
          <input name="genre" value={form.genre} onChange={handleChange} placeholder="Gênero" className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-white" />
          <input name="album" value={form.album} onChange={handleChange} placeholder="Álbum" className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-white" />
          <input name="label" value={form.label} onChange={handleChange} placeholder="Label" className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-white" />
          <input name="ano" value={form.ano} onChange={handleChange} placeholder="Ano" maxLength={4} className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-white" />
          {anoError && <div className="text-red-400 text-xs">{anoError}</div>}
          <button type="submit" disabled={saving} className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all font-medium shadow disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </form>
      </div>
    </div>
  );
}
