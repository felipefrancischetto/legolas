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
  status?: string;
  remixer?: string;
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
        <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        width={48}
        height={48}
        className="object-cover w-full h-full rounded"
        onError={() => setError(true)}
        loading="lazy"
      />
    </div>
  );
});

ThumbnailImage.displayName = 'ThumbnailImage';

// Definição centralizada das colunas
const columns = [
  { label: 'Título', key: 'title', width: 260 },
  { label: 'Artistas', key: 'artist', width: 180 },
  { label: 'Gravadora', key: 'label', width: 100 },
  { label: 'Albúm', key: 'album', width: 120 },
  { label: 'Gênero', key: 'genre', width: 100 },
  { label: 'BPM', key: 'bpm', width: 60 },
  { label: 'Tom', key: 'key', width: 70 },
  { label: 'Lançamento', key: 'ano', width: 70 },
  { label: 'Ações', key: 'acoes', width: 50 },
];

// Memoizando o FileRow para evitar re-renders desnecessários
const FileRow = memo(({ 
  file, 
  index, 
  files,
  columns, 
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
  columns: { label: string, key: string, width: number }[];
  onPlay: (file: FileInfo) => void;
  onContextMenu: (e: React.MouseEvent, file: FileInfo) => void;
  metadataStatus: any;
  updateMetadataForFile: (fileName: string, status: string) => void;
  setEditModalFile: (file: FileInfo) => void;
  isPlaying?: boolean;
  fetchFiles: (force?: boolean) => void;
}) => {
  const fileExists = files.some(f => f.name === file.name);
  // Checar se todos os campos principais estão preenchidos
  const isComplete = Boolean(
    (file.title || file.displayName) &&
    file.artist &&
    file.label &&
    file.album &&
    file.genre &&
    file.bpm &&
    file.key &&
    file.ano
  );
  return (
    <div
      key={file.path}
      className={`flex items-center hover:bg-zinc-700 transition-all duration-200 group w-full h-[50px] animate-fade-in text-xs cursor-pointer ${isPlaying ? 'ring-2 ring-blue-400 bg-blue-900/20' : ''}`}
      style={{ minHeight: 50, margin: '5px 0px' }}
      onClick={e => onContextMenu(e, file)}
    >
      {/* Primeira coluna: check sutil se completo */}
      <div style={{ width: 18, minWidth: 18 }} className="flex items-center justify-center h-12 px-0">
        {isComplete && (
          <svg className="w-4 h-4 text-green-400 opacity-60" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      {columns.map((col, idx) => {
        let content = null;
        switch (col.key) {
          case 'title':
            content = (
              <div className="flex items-center overflow-hidden">
                <button
                  onClick={(e) => { e.stopPropagation(); onPlay(file); }}
                  className="w-12 h-12 flex-shrink-0 bg-zinc-700 rounded-sm overflow-hidden group-hover:bg-zinc-600 transition-all duration-200 relative transform hover:scale-110 mr-2"
                >
                  <ThumbnailImage file={file} fileExists={fileExists} />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </button>
                <span className="font-bold text-white truncate block max-w-full" title={file.title || file.displayName}>{file.title || file.displayName}</span>
              </div>
            );
            break;
          case 'artist':
            content = <span className="text-xs text-blue-400 truncate block max-w-full" title={file.artist || ''}>{file.artist || '-'}</span>;
            break;
          case 'label':
            content = <span className="truncate block max-w-full" title={file.label || ''}>{file.label || '-'}</span>;
            break;
          case 'album':
            content = <span className="text-xs text-gray-400 truncate block max-w-full" title={ file.album || ''}>{file.album || file.album || ''}</span>;
            break;
          case 'genre':
            content = <span className="truncate block max-w-full" title={file.genre || ''}>{file.genre || '-'}</span>;
            break;
          case 'bpm':
            content = <span className="text-xs text-gray-400 truncate block max-w-full">{file.bpm ? `${file.bpm}` : '-'}</span>;
            break;
          case 'key':
            content = <span className="text-xs text-gray-400 truncate block max-w-full">{file.key || '-'}</span>;
            break;
          case 'ano':
            content = <span className="truncate block max-w-full">{file.ano ? String(file.ano).slice(0, 4) : '-'}</span>;
            break;
          case 'acoes':
            content = (
              <ActionMenu 
                file={file} 
                onUpdate={(fileName) => updateMetadataForFile(fileName, 'loading')} 
                onEdit={setEditModalFile} 
                fetchFiles={fetchFiles} 
              />
            );
            break;
          default:
            content = null;
        }
        return (
          <div key={col.key} style={{ width: col.width, minWidth: col.width }} className="px-2 flex items-center h-12 justify-start text-left overflow-hidden whitespace-nowrap text-ellipsis">
            {content}
          </div>
        );
      })}
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

  const [groupByField, setGroupByField] = useState<string>('');

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

  async function updateMetadataForFile(fileName: string, status: string) {
    setMetadataStatus({ ...metadataStatus, [fileName]: status });
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
      <div className="flex items-center mb-4 gap-2 flex-shrink-0">
        {/* <h2 className="text-xl font-semibold text-white">Arquivos Baixados</h2> */}
        <div className="flex items-center justify-between w-full gap-2">
          {/* Campo de busca à esquerda */}
          <input
            type="text"
            placeholder="Buscar por título ou artista..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none"
            style={{ minWidth: 200 }}
          />
          {/* Agrupar por à direita */}
          <div className="flex gap-2 items-center ml-4">
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
          </div>
        </div>
      </div>
      
      <div 
        className="bg-zinc-800 rounded-md border border-zinc-700 overflow-hidden flex flex-col flex-1 min-h-0"
      >
        <div className="flex w-full px-2 py-2 text-sm text-gray-400 border-b border-zinc-700 sticky top-0 bg-zinc-900 z-10 flex-shrink-0" style={{userSelect:'none'}}>
          {columns.map((col, idx) => (
            <div
              key={col.key}
              style={{ width: col.width, minWidth: col.width }}
              className="flex items-center h-12 px-2 overflow-hidden whitespace-nowrap text-ellipsis"
            >
              <span className="truncate uppercase tracking-wide text-xs font-semibold">{col.label}{sortBy === col.key && (sortOrder === 'asc' ? '↑' : '↓')}</span>
            </div>
          ))}
        </div>
        <div 
          className="flex-1 min-h-0 overflow-y-auto custom-scroll"
          style={{ maxHeight: '100%' }}
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
                  columns={columns}
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

// Menu de ações para cada linha
function ActionMenu({ file, onUpdate, onEdit, fetchFiles }: { 
  file: any, 
  onUpdate: (fileName: string, status: string) => void, 
  onEdit: (file: any) => void,
  fetchFiles: (force?: boolean) => void 
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fechar menu ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="p-2 rounded-full hover:bg-zinc-700 transition-colors text-zinc-300 flex items-center justify-center"
        onClick={() => setOpen((v) => !v)}
        title="Ações"
        type="button"
      >
        {/* Vertical Dots (Heroicons style) */}
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="6" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="18" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 bg-zinc-900 border border-zinc-700 rounded shadow-lg min-w-[140px] py-1 animate-fade-in">
          <button
            className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-800 text-blue-400"
            onClick={() => { onUpdate(file.name, 'loading'); setOpen(false); }}
          >Atualizar</button>
          <button
            className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-800 text-green-400"
            onClick={() => { onEdit(file); setOpen(false); }}
          >Editar</button>
          <button
            className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-800 text-purple-400"
            onClick={() => { window.open(`/api/downloads/${encodeURIComponent(file.name)}`, '_blank'); setOpen(false); }}
          >Baixar</button>
          <button
            className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-800 text-red-400"
            onClick={async () => { if (window.confirm('Remover este arquivo?')) { await removeFile(file.name, fetchFiles); setOpen(false); } }}
          >Remover</button>
        </div>
      )}
    </div>
  );
}
