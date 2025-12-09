'use client';

import { useEffect, useState, useRef, memo, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import DownloadQueue from './DownloadQueue';
import { useDownload } from '../contexts/DownloadContext';
import { useFile } from '../contexts/FileContext';
import { useUI } from '../contexts/UIContext';
import { usePlayer } from '../contexts/PlayerContext';
import { getThumbnailUrl } from '../utils/thumbnailCache';
import { getCachedDominantColor } from '../utils/colorExtractor';
import { useSettings } from '../hooks/useSettings';
import SoundWave from './SoundWave';
import ReactDOM from 'react-dom';
import LoadingSpinner from './LoadingSpinner';
import { SkeletonMusicList } from './SkeletonComponents';

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
  catalogNumber?: string;
  catalog?: string;
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
        width={36}
        height={36}
        className="object-cover w-full h-full rounded"
        onError={() => setError(true)}
        loading="lazy"
      />
    </div>
  );
});

ThumbnailImage.displayName = 'ThumbnailImage';

// Definição centralizada das colunas
const columns: { label: string; key: string; width: number; always: boolean }[] = [
  { label: 'Título', key: 'title', width: 260, always: true },
  { label: 'Artistas', key: 'artist', width: 180, always: true },
  { label: 'Gravadora', key: 'label', width: 100, always: false },
  { label: 'Albúm', key: 'album', width: 120, always: false },
  { label: 'Gênero', key: 'genre', width: 100, always: false },
  { label: 'BPM', key: 'bpm', width: 60, always: false },
  { label: 'Tom', key: 'key', width: 70, always: false },
  { label: 'Lançamento', key: 'ano', width: 70, always: false },
  { label: 'Ações', key: 'acoes', width: 50, always: true },
];



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

// Componente para item da lista com cor dinâmica - otimizado
const DynamicFileItem = memo(({ 
  file, 
  isPlaying, 
  isPlayerPlaying, 
  onPlay, 
  extractDominantColor, 
  dominantColors,
  onUpdate,
  onEdit,
  fetchFiles,
  isLoading
}: { 
  file: FileInfo; 
  isPlaying: boolean; 
  isPlayerPlaying: boolean; 
  onPlay: () => void;
  extractDominantColor: (fileName: string, imageUrl: string) => Promise<{ rgb: string; rgba: (opacity: number) => string }>;
  dominantColors: { [fileName: string]: { rgb: string; rgba: (opacity: number) => string } };
  onUpdate: (fileName: string, status: string) => void;
  onEdit: (file: any) => void;
  fetchFiles: (force?: boolean) => void;
  isLoading: boolean;
}) => {
  const [itemColor, setItemColor] = useState<{ rgb: string; rgba: (opacity: number) => string }>({
    rgb: '16, 185, 129',
    rgba: (opacity: number) => `rgba(16, 185, 129, ${opacity})`
  });

  // Otimizar carregamento de cor com throttling
  useEffect(() => {
    let isCancelled = false;
    
    const loadColor = async () => {
      if (dominantColors[file.name]) {
        if (!isCancelled) {
          setItemColor(dominantColors[file.name]);
        }
      } else {
        // Throttle para evitar chamadas excessivas
        await new Promise(resolve => setTimeout(resolve, 200));
        
        if (isCancelled) return;
        
        const thumbnailUrl = getThumbnailUrl(file.name);
        try {
          const color = await extractDominantColor(file.name, thumbnailUrl);
          if (!isCancelled) {
            setItemColor(color);
          }
        } catch (error) {
          console.error('Erro ao carregar cor:', error);
        }
      }
    };
    
    loadColor();
    
    return () => {
      isCancelled = true;
    };
  }, [file.name, dominantColors, extractDominantColor]);

  // Memoizar verificação de metadados completos
  const isComplete = useMemo(() => Boolean(
    (file.title || file.displayName) &&
    file.artist &&
    file.label &&
    file.album &&
    file.genre &&
    file.bpm &&
    file.key &&
    file.ano
  ), [file.title, file.displayName, file.artist, file.label, file.album, file.genre, file.bpm, file.key, file.ano]);

  // Memoizar função de formatação de data
  const formatDate = useCallback((dateString?: string) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return dateString;
    }
  }, []);

  // Memoizar handler de play
  const handlePlay = useCallback(() => {
    onPlay();
  }, [onPlay]);

  // Verificar se o modo debug está ativo
  const searchParams = useSearchParams();
  const isDebugMode = searchParams?.get('debug') !== null;

      return (
      <div
        className="backdrop-blur-md rounded-xl overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-xl group flex flex-col sm:flex-row mt-3 mb-3 border border-white/10"
        onClick={handlePlay}
        data-file-name={file.name}
        style={{
          borderColor: itemColor.rgba(isPlaying ? 0.4 : 0.15),
          background: isPlaying
            ? `linear-gradient(135deg, 
                ${itemColor.rgba(0.25)} 0%, 
                ${itemColor.rgba(0.35)} 30%, 
                rgba(0, 0, 0, 0.7) 70%, 
                rgba(15, 23, 42, 0.8) 100%
              )`
            : `linear-gradient(135deg, 
                ${itemColor.rgba(0.08)} 0%, 
                ${itemColor.rgba(0.12)} 30%, 
                rgba(0, 0, 0, 0.6) 70%, 
                rgba(15, 23, 42, 0.7) 100%
              )`,
          boxShadow: isPlaying
            ? `0 12px 40px ${itemColor.rgba(0.25)}, inset 0 1px 0 rgba(255, 255, 255, 0.15)`
            : `0 6px 20px ${itemColor.rgba(0.12)}, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
        }}
    >
      {/* Capa ocupando toda altura à esquerda */}
      <div className="relative w-full sm:w-[132.5px] sm:min-w-[132.5px] h-[200px] sm:h-[132.5px] flex-shrink-0">
        <Image
          src={getThumbnailUrl(file.name)}
          alt={file.title || file.displayName}
          width={132.5}
          height={132.5}
          className="object-cover w-full h-full bg-zinc-800"
        />
        {isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            {isPlayerPlaying ? (
              <SoundWave 
                color={`rgb(${itemColor.rgb})`}
                size="large"
                isPlaying={true}
                isLoading={isLoading}  
              />
            ) : (
              <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="currentColor" viewBox="0 0 24 24" style={{ color: `rgb(${itemColor.rgb})` }}>
                <polygon points="8,5 19,12 8,19" />
              </svg>
            )}
          </div>
        )}
        
        {/* Indicador de metadados completos */}
        {isComplete && (
          <div className="absolute top-2 right-2 w-5 h-5 bg-green-500 rounded-full border border-black flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>
      
      {/* Conteúdo principal à direita */}
      <div className="flex-1 p-3 sm:p-2 flex flex-col min-w-0">
        {/* JSON Debug - Apenas em modo debug */}
        {isDebugMode && (
          <div className="mt-2 p-3 bg-black/30 rounded-lg border border-zinc-700/50 max-h-40 overflow-auto custom-scroll">
            <div className="text-xs text-zinc-300 font-medium mb-1 flex items-center gap-2">
              <span>🔍 Debug Info</span>
              <span className="text-emerald-400 text-[10px] bg-emerald-500/20 px-1 py-0.5 rounded">
                Copiar JSON
              </span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(JSON.stringify(file, null, 2));
                }}
                className="text-zinc-500 hover:text-emerald-400 transition-colors"
                title="Copiar JSON"
              >
                📋
              </button>
            </div>
            <pre className="text-xs text-zinc-400 font-mono leading-relaxed whitespace-pre-wrap break-words">
              {JSON.stringify(file, null, 2)}
            </pre>
          </div>
        )}
        
        {/* Linha superior: Título, Artista e Menu */}
        <div className="flex items-start justify-between mb-2 sm:mb-1 gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-base sm:text-sm leading-tight truncate group-hover:text-white/90 transition-colors">
              {file.title || file.displayName} 
            </div>
            <div className="text-sm sm:text-xs font-medium leading-tight truncate mt-0.5" style={{ color: `rgb(${itemColor.rgb})` }}>
              {file.artist || 'Artista desconhecido'}
            </div>
          </div>
          
          <div className="flex-shrink-0">
            <ActionMenu 
              file={file} 
              onUpdate={onUpdate} 
              onEdit={onEdit} 
              fetchFiles={fetchFiles} 
            />
          </div>
        </div>
        {/* Todas as informações organizadas */}
        <div className="space-y-1.5 sm:space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-1 text-xs">
            <span className="bg-zinc-600/30 text-zinc-300 px-2 py-1 rounded font-medium break-words">
              📀 Álbum: {file.album || 'N/A'}
            </span>
            <span className="bg-zinc-600/30 text-zinc-300 px-2 py-1 rounded font-medium break-words">
              🏷️ Label: {file.label || 'N/A'}
            </span>
            <span className="bg-zinc-600/30 text-zinc-300 px-2 py-1 rounded font-medium break-words">
              📋 Catálogo: {(file as any).catalogNumber || (file as any).catalog || 'N/A'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-1 text-xs">
            <span className="bg-zinc-600/30 text-zinc-300 px-2 py-1 rounded font-mono whitespace-nowrap">
              ⏱️ {file.duration || 'N/A'}
            </span>
            <span className="bg-zinc-600/30 text-zinc-300 px-2 py-1 whitespace-nowrap">
              🎵 BPM: {file.bpm || 'N/A'}
            </span>
            <span className="bg-zinc-600/30 text-zinc-300 px-2 py-1 whitespace-nowrap">
              🎹 Key: {file.key || 'N/A'}
            </span>
            <span className="bg-zinc-600/30 text-zinc-300 px-2 py-1 break-words max-w-full">
              🎧 Gênero: {file.genre || 'N/A'}
            </span>
            <span className="bg-zinc-600/30 text-zinc-300 px-2 py-1 whitespace-nowrap">
              📅 Ano: {(file as any).ano ? String((file as any).ano).slice(0, 4) : 'N/A'}
            </span>
            <span className="bg-zinc-600/30 text-zinc-300 px-2 py-1 break-words max-w-full">
              📰 Publicado: {(file as any).publishedDate || (file as any).ano || 'N/A'}
            </span>
            
            {/* Indicador de compatibilidade com Beatport */}
            {file.isBeatportFormat && (
              <span className="bg-orange-500/20 text-orange-200 px-2 py-1 rounded text-xs font-medium border border-orange-400/30 backdrop-blur-sm whitespace-nowrap">
                🎛️ Beatport ✓
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-1 text-xs">
            <span className="text-zinc-400 px-2 py-1 font-mono break-all" title={file.name}>
              📁 {file.name || 'N/A'}
            </span>
            <span className="text-zinc-400 px-2 py-1 font-mono whitespace-nowrap">
              📥 Baixado: {formatDate(file.downloadedAt || file.fileCreatedAt) || 'N/A'}
            </span>
            <span className="text-zinc-400 px-2 py-1 font-mono whitespace-nowrap">
              💾 {(file as any).size ? ((file as any).size / (1024 * 1024)).toFixed(1) + 'MB' : 'N/A'}
            </span>
            <span className="text-zinc-400 px-2 py-1 font-mono whitespace-nowrap">
              📄 {file.name ? `Formato: ${file.name.split('.').pop()}` : 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

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
    fetchFiles,
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

  const { play, resume, playerState } = usePlayer();
  const { queue, updateQueueItem } = useDownload();
  const { settings } = useSettings();
  const resizingCol = useRef<number | null>(null);
  const startX = useRef<number>(0);
  const startWidth = useRef<number>(0);
  const audioPlayerRef = useRef<any>(null);
  const lastPlayedFile = useRef<string | null>(null);

  // Debounce para evitar múltiplas chamadas consecutivas
  const fetchFilesDebounced = useRef<NodeJS.Timeout | null>(null);
  const isCurrentlyFetching = useRef(false);

  const [selectedRelease, setSelectedRelease] = useState<string | null>(null);
  const [releaseModalData, setReleaseModalData] = useState<any>(null);
  const [columnWidths, setColumnWidths] = useState(columns.map(c => c.width));
  const [catalogNumbers, setCatalogNumbers] = useState<Record<string, string>>({});

  // Ref para controlar o scroll automático
  const shouldScrollToPlaying = useRef<boolean>(false);
  const previousLoadingState = useRef<boolean>(false);

  useEffect(() => {
    const savedPath = localStorage.getItem('customDownloadsPath');
    if (savedPath) {
      setCustomDownloadsPath(savedPath);
    }
    
    // Removido auto-refresh da lista de arquivos

    const openQueue = () => setShowQueue(true);
    window.addEventListener('open-download-queue', openQueue);

    return () => {
      window.removeEventListener('open-download-queue', openQueue);
      
      if (fetchFilesDebounced.current) {
        clearTimeout(fetchFilesDebounced.current);
      }
    };
  }, [fetchFiles, setCustomDownloadsPath, setShowQueue]);

  // Detectar quando o loading termina e rolar para a música tocando
  useEffect(() => {
    // Se estava loading e agora não está mais (loading acabou)
    if (previousLoadingState.current && !loading) {
      shouldScrollToPlaying.current = true;
    }
    previousLoadingState.current = loading;
  }, [loading]);

  // Scroll automático para a música tocando após o loading
  useEffect(() => {
    if (shouldScrollToPlaying.current && playerState.currentFile && files.length > 0) {
      const currentFileName = playerState.currentFile.name;
      
      // Aguardar um pouco para garantir que o DOM foi atualizado
      setTimeout(() => {
        // Encontrar o elemento da música tocando
        const playingElement = document.querySelector(`[data-file-name="${CSS.escape(currentFileName)}"]`);
        
        if (playingElement) {
          // Verificar se o elemento está visível na tela
          const rect = playingElement.getBoundingClientRect();
          const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
          
          // Só fazer scroll se não estiver visível
          if (!isVisible) {
            playingElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
            
            // Scroll automático para a música tocando
          }
        }
        
        shouldScrollToPlaying.current = false;
      }, 300); // Delay para garantir que o DOM foi renderizado
    }
  }, [files, playerState.currentFile]);

  // Scroll automático quando uma nova música começar a tocar (não só após loading)
  useEffect(() => {
    if (playerState.currentFile && lastPlayedFile.current !== playerState.currentFile.name) {
      lastPlayedFile.current = playerState.currentFile.name;
      
      // Pequeno delay para permitir que a música inicie
      setTimeout(() => {
        const currentFileName = playerState.currentFile!.name;
        const playingElement = document.querySelector(`[data-file-name="${CSS.escape(currentFileName)}"]`);
        
        if (playingElement) {
          const rect = playingElement.getBoundingClientRect();
          const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
          
          // Só fazer scroll se não estiver visível
          if (!isVisible) {
            playingElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
            
            // Scroll automático para nova música
          }
        }
      }, 100);
    }
  }, [playerState.currentFile]);

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

  const [releaseModal, setReleaseModal] = useState<{album: string, tracks: any[], metadata: any, loading: boolean, error: string | null} | null>(null);
  const [dominantColors, setDominantColors] = useState<{ [fileName: string]: { rgb: string, rgba: (opacity: number) => string } }>({});
  const [mobileActionMenus, setMobileActionMenus] = useState<{ [fileName: string]: boolean }>({});

  // Função para extrair cor dominante (respeitando configurações)
  const extractDominantColor = useCallback(async (fileName: string, imageUrl: string) => {
    // Usar cor padrão se cores dinâmicas estiverem desabilitadas
    if (settings.disableDynamicColors) {
      const fallbackColor = { rgb: '16, 185, 129', rgba: (opacity: number) => `rgba(16, 185, 129, ${opacity})` };
      return fallbackColor;
    }

    if (dominantColors[fileName]) return dominantColors[fileName];

    // Verificar se estamos no cliente
    if (typeof window === 'undefined') {
      const fallbackColor = { rgb: '16, 185, 129', rgba: (opacity: number) => `rgba(16, 185, 129, ${opacity})` };
      return fallbackColor;
    }

    try {
      const img = new (window as any).Image();
      img.crossOrigin = 'anonymous';
      
      return new Promise<{ rgb: string, rgba: (opacity: number) => string }>((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ rgb: '16, 185, 129', rgba: (opacity: number) => `rgba(16, 185, 129, ${opacity})` });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          const colorCounts: { [key: string]: number } = {};

          // Analisar pixels em intervalos para performance
          for (let i = 0; i < data.length; i += 16) { // Pular pixels para performance
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const alpha = data[i + 3];

            if (alpha < 128) continue; // Ignorar pixels transparentes

            // Agrupar cores similares
            const key = `${Math.floor(r / 32) * 32},${Math.floor(g / 32) * 32},${Math.floor(b / 32) * 32}`;
            colorCounts[key] = (colorCounts[key] || 0) + 1;
          }

          // Encontrar cor mais comum
          let dominantColor = '16, 185, 129'; // Fallback para emerald
          let maxCount = 0;

          for (const [color, count] of Object.entries(colorCounts)) {
            if (count > maxCount) {
              maxCount = count;
              dominantColor = color;
            }
          }

          // Ajustar saturação e brilho para melhor contraste
          const [r, g, b] = dominantColor.split(',').map(Number);
          const adjustedColor = adjustColorForUI(r, g, b);

          const colorData = {
            rgb: adjustedColor,
            rgba: (opacity: number) => `rgba(${adjustedColor}, ${opacity})`
          };

          setDominantColors(prev => ({ ...prev, [fileName]: colorData }));
          resolve(colorData);
        };

        img.onerror = () => {
          const fallbackColor = { rgb: '16, 185, 129', rgba: (opacity: number) => `rgba(16, 185, 129, ${opacity})` };
          setDominantColors(prev => ({ ...prev, [fileName]: fallbackColor }));
          resolve(fallbackColor);
        };

        img.src = imageUrl;
      });
    } catch (error) {
      console.error('Erro ao extrair cor:', error);
      const fallbackColor = { rgb: '16, 185, 129', rgba: (opacity: number) => `rgba(16, 185, 129, ${opacity})` };
      setDominantColors(prev => ({ ...prev, [fileName]: fallbackColor }));
      return fallbackColor;
    }
  }, [dominantColors, settings.disableDynamicColors]);

  // Função para ajustar cor para melhor contraste na UI
  const adjustColorForUI = (r: number, g: number, b: number): string => {
    // Converter para HSL para ajustar saturação e luminosidade
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const diff = max - min;
    const add = max + min;
    const l = add * 0.5;

    let s = 0;
    if (diff !== 0) {
      s = l < 0.5 ? diff / add : diff / (2 - add);
    }

    // Ajustar saturação (mínimo 0.4, máximo 0.8)
    s = Math.max(0.4, Math.min(0.8, s));
    
    // Ajustar luminosidade (mínimo 0.3, máximo 0.7)
    const adjustedL = Math.max(0.3, Math.min(0.7, l));

    // Converter de volta para RGB
    const hue = getHue(r, g, b, max, min, diff);
    const [newR, newG, newB] = hslToRgb(hue, s, adjustedL);

    return `${Math.round(newR)}, ${Math.round(newG)}, ${Math.round(newB)}`;
  };

  const getHue = (r: number, g: number, b: number, max: number, min: number, diff: number): number => {
    if (diff === 0) return 0;
    
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;
    
    let hue = 0;
    if (max === rNorm) {
      hue = ((gNorm - bNorm) / diff) % 6;
    } else if (max === gNorm) {
      hue = (bNorm - rNorm) / diff + 2;
    } else {
      hue = (rNorm - gNorm) / diff + 4;
    }
    
    return hue * 60;
  };

  const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) {
      r = c; g = x; b = 0;
    } else if (60 <= h && h < 120) {
      r = x; g = c; b = 0;
    } else if (120 <= h && h < 180) {
      r = 0; g = c; b = x;
    } else if (180 <= h && h < 240) {
      r = 0; g = x; b = c;
    } else if (240 <= h && h < 300) {
      r = x; g = 0; b = c;
    } else if (300 <= h && h < 360) {
      r = c; g = 0; b = x;
    }

    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  };

  async function updateMetadataForFile(fileName: string, status: string) {
    if (!fileName) return;

    const file = files.find(f => f.name === fileName);
    if (!file) {
      console.error(`Arquivo ${fileName} não encontrado na lista.`);
      setMetadataStatus({ ...metadataStatus, [fileName]: 'error' });
      return;
    }

    try {
      setMetadataStatus({ ...metadataStatus, [fileName]: status });
      
      // Se é apenas para marcar como loading, não fazer a requisição
      if (status === 'loading') {
        const response = await fetch(`/api/enhanced-metadata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            title: file.title || file.displayName,
            artist: file.artist,
            useBeatport: true // Assumindo que deve usar Beatport por padrão
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Erro desconhecido');
        
        // Só fazer fetchFiles se realmente houver mudanças significativas
        // Para updates individuais, é melhor atualizar localmente quando possível
        setMetadataStatus({ ...metadataStatus, [fileName]: 'completed' });
        
        // Agenda uma atualização da lista após um delay, mas só se não houver outras pendentes
        setTimeout(() => {
          if (!isCurrentlyFetching.current) {
            isCurrentlyFetching.current = true;
            fetchFiles(false).finally(() => {
              isCurrentlyFetching.current = false;
            });
          }
        }, 2000);
      }
      
    } catch (err: any) {
      console.error(`Erro ao atualizar metadados para ${fileName}:`, err.message);
      setMetadataStatus({ ...metadataStatus, [fileName]: 'error' });
    }
  }

  async function updateAllMetadata() {
    setIsUpdatingAll(true);
    
    const filesToUpdate = files.filter(f => !f.isBeatportFormat);
    setUpdateProgress({ current: 0, total: filesToUpdate.length });

    // Iniciando atualização de metadados

    for (let i = 0; i < filesToUpdate.length; i++) {
      const file = filesToUpdate[i];
      setUpdateProgress({ current: i + 1, total: filesToUpdate.length });
      
      try {
        // Atualizar status para loading
        setMetadataStatus({ ...metadataStatus, [file.name]: 'loading' });
        
        // Fazer a requisição de metadados
        const response = await fetch(`/api/enhanced-metadata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            title: file.title || file.displayName,
            artist: file.artist,
            useBeatport: true
          }),
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Erro desconhecido');
        
        // Marcar como concluído
        setMetadataStatus({ ...metadataStatus, [file.name]: 'completed' });
        
      } catch (error: any) {
        console.error(`Erro ao atualizar metadados para ${file.name}:`, error.message);
        setMetadataStatus({ ...metadataStatus, [file.name]: 'error' });
      }
    }

    // Recarregar tudo apenas no final
    await fetchFiles(true);
    setIsUpdatingAll(false);
  }

  // Contar apenas downloads em andamento ou na fila
  const queueActive = queue.filter(item => ['pending', 'queued', 'downloading'].includes(item.status));
  const queueCount = queueActive.length;
  // Verificar se há algum download em andamento
  const isProcessing = queue.some(item => item.status === 'downloading');

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

  // Ref para rastrear itens já processados
  const processedQueueItems = useRef<Set<string>>(new Set());

  // Sincronizar fila de downloads com arquivos baixados
  useEffect(() => {
    if (!queue || !files) return;
    
    queue.forEach(item => {
      // Evitar processar o mesmo item múltiplas vezes
      if (processedQueueItems.current.has(item.id)) return;
      
      if (files.some(f => f.name === item.title || f.displayName === item.title)) {
        processedQueueItems.current.add(item.id);
        updateQueueItem(item.id, { status: 'completed', progress: 100 });
      }
    });
    
    // Limpar itens processados que não estão mais na fila
    const currentQueueIds = new Set(queue.map(item => item.id));
    processedQueueItems.current.forEach(id => {
      if (!currentQueueIds.has(id)) {
        processedQueueItems.current.delete(id);
      }
    });
  }, [files, queue, updateQueueItem]);

  // Handlers memoizados
  const handlePlay = useCallback((file: FileInfo) => {
    // Proteção contra chamadas duplicadas rapidamente (usando timestamp)
    const now = Date.now();
    const lastPlayTime = parseInt(localStorage.getItem('lastPlayTime') || '0');
    if (lastPlayedFile.current === file.name && (now - lastPlayTime) < 500) {
      return;
    }
    localStorage.setItem('lastPlayTime', now.toString());
    
    // Se é a mesma música já carregada, apenas resumir sem zerar progresso
    if (playerState.currentFile?.name === file.name) {
      if (!playerState.isPlaying) {
        // Usar resume() ao invés de play() para não zerar o progresso
        resume();
      }
    } else {
      play(file); // Para nova música, usar play normal
      lastPlayedFile.current = file.name;
    }
    
    setPlayerOpen(true);
  }, [play, resume, setPlayerOpen, playerState.currentFile, playerState.isPlaying]);

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
    if (!editModalFile) return;

    // Não usar setIsUpdatingAll para evitar loading que fecha modais
    try {
      // Se deve propagar para o álbum, atualizar todas as músicas do álbum
      if ((data as any).propagateToAlbum && data.album) {
        // Buscar todas as músicas do mesmo álbum
        const albumTracks = files.filter(f => f.album === data.album);
        
        if (albumTracks.length > 0) {
          // Preparar atualizações em lote para informações do álbum
          const albumUpdates = albumTracks.map(track => ({
            operation: 'update',
            fileName: track.name,
            title: track.name === editModalFile.name ? data.title : track.title,
            artist: track.name === editModalFile.name ? data.artist : track.artist,
            album: data.album,
            year: data.ano, // Propagar data para todo o álbum
            genre: track.name === editModalFile.name ? data.genre : track.genre,
            label: data.label, // Propagar label para todo o álbum
            bpm: track.name === editModalFile.name ? data.bpm : track.bpm,
            key: track.name === editModalFile.name ? data.key : track.key,
            catalogNumber: (data as any).catalogNumber, // Propagar catálogo para todo o álbum
            duration: track.name === editModalFile.name ? data.duration : track.duration,
          }));

          // Fazer as atualizações em lote
          let updatedCount = 0;
          for (const updatePayload of albumUpdates) {
            const response = await fetch('/api/metadata/unified', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(updatePayload),
            });

            if (!response.ok) {
              const errorResult = await response.json();
              throw new Error(errorResult.error || 'Falha ao atualizar metadados do álbum.');
            }
            updatedCount++;
          }

          // Informações do álbum atualizadas
          
          // Atualizar dados localmente sem recarregar tudo
          const updatedFiles = files.map(file => {
            if (file.album === data.album) {
              return {
                ...file,
                // Propagar informações do álbum
                label: data.label || file.label,
                ano: data.ano || (file as any).ano,
                catalogNumber: (data as any).catalogNumber || (file as any).catalogNumber,
                // Atualizar dados específicos da música editada
                ...(file.name === editModalFile.name ? {
                  title: data.title || file.title,
                  artist: data.artist || file.artist,
                  album: data.album || file.album,
                  genre: data.genre || file.genre,
                  bpm: data.bpm || file.bpm,
                  key: data.key || file.key,
                  duration: data.duration || file.duration,
                } : {})
              };
            }
            return file;
          });
          
          setFiles(updatedFiles);
          
          // Feedback visual de sucesso
          alert(`✅ Informações do álbum propagadas com sucesso!\n\n` +
                `📀 Álbum: "${data.album}"\n` +
                `🎵 ${updatedCount} músicas atualizadas\n\n` +
                `Informações propagadas:\n` +
                `${data.label ? `• Label: ${data.label}\n` : ''}` +
                `${data.ano ? `• Data: ${data.ano}\n` : ''}` +
                `${(data as any).catalogNumber ? `• Catálogo: ${(data as any).catalogNumber}` : ''}`);
        }
      } else {
        // Atualização normal de apenas uma música
        const payload = {
          operation: 'update',
          fileName: editModalFile.name,
          title: data.title,
          artist: data.artist,
          album: data.album,
          year: data.ano,
          genre: data.genre,
          label: data.label,
          bpm: data.bpm,
          key: data.key,
          catalogNumber: (data as any).catalogNumber,
          duration: data.duration,
        };

        const response = await fetch('/api/metadata/unified', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorResult = await response.json();
          throw new Error(errorResult.error || 'Falha ao atualizar metadados.');
        }

        // Atualizar apenas o arquivo editado localmente
        const updatedFiles = files.map(file => 
          file.name === editModalFile.name 
            ? { 
                ...file, 
                title: data.title || file.title,
                artist: data.artist || file.artist,
                album: data.album || file.album,
                ano: data.ano || (file as any).ano,
                genre: data.genre || file.genre,
                label: data.label || file.label,
                bpm: data.bpm || file.bpm,
                key: data.key || file.key,
                catalogNumber: (data as any).catalogNumber || (file as any).catalogNumber,
                duration: data.duration || file.duration,
              }
            : file
        );
        
        setFiles(updatedFiles);
      }

      setEditModalFile(null); // Fecha o modal

    } catch (error: any) {
      console.error('Erro ao salvar metadados:', error);
      alert(`Erro: ${error.message}`);
    }
  };

  // Função para atualizar metadados da release por álbum
  const handleUpdateRelease = async (albumName: string) => {
    setReleaseModal({ album: albumName, tracks: [], metadata: {}, loading: true, error: null });
    try {
      const response = await fetch('/api/update-release-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ album: albumName }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        setReleaseModal({ album: albumName, tracks: [], metadata: {}, loading: false, error: result.error || 'Erro desconhecido' });
        return;
      }
      // Salvar catálogo no cache
      if (result.metadata && result.metadata.catalogNumber) {
        setCatalogNumbers((prev: any) => ({ ...prev, [albumName]: result.metadata.catalogNumber }));
        // Atualizar título dos arquivos daquele álbum
        const updatedFiles = files.map((f: any) => {
          if (f.album === albumName && result.metadata.catalogNumber && f.title && !f.title.endsWith(`[${result.metadata.catalogNumber}]`)) {
            return { ...f, title: `${f.title} [${result.metadata.catalogNumber}]` };
          }
          return f;
        });
        setFiles(updatedFiles);
      }
      setReleaseModal({ album: albumName, tracks: result.tracks, metadata: result.metadata, loading: false, error: null });
    } catch (err: any) {
      setReleaseModal({ album: albumName, tracks: [], metadata: {}, loading: false, error: err.message || 'Erro desconhecido' });
    }
  };

  if (loading) {
    return (
      <>
        <SkeletonMusicList count={5} variant="desktop" />
        
        {/* Preservar modal de edição durante loading */}
        {editModalFile && (
          <EditFileModal
            file={editModalFile}
            onClose={() => setEditModalFile(null)}
            onSave={handleEditFileSave}
            isListLoading={loading}
            isUpdatingAll={isUpdatingAll}
          />
        )}

        {releaseModal && (
          <ReleaseModal
            album={releaseModal.album}
            tracks={releaseModal.tracks}
            metadata={releaseModal.metadata}
            loading={releaseModal.loading}
            error={releaseModal.error}
            onClose={() => setReleaseModal(null)}
            files={files}
          />
        )}
      </>
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
        {/* Controles superiores com melhor responsividade */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 flex-shrink-0 mb-2 mt-2">
          {/* Campo de busca melhorado */}
          <div className="flex-1 relative group">
            <input
              type="text"
              placeholder="Buscar por título ou artista..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-11 md:h-10 sm:h-9 pl-4 pr-12 py-2.5 rounded-xl text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200 text-sm font-medium backdrop-blur-xl border border-white/10 group-hover:border-emerald-500/30"
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(5, 150, 105, 0.08) 30%, rgba(0, 0, 0, 0.6) 70%, rgba(15, 23, 42, 0.7) 100%)',
                boxShadow: '0 6px 20px rgba(16, 185, 129, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
              }}
            />
            <svg className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 md:w-4 md:h-4 text-zinc-400 group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          
          {/* Controles laterais */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 lg:gap-4">
            {/* Seletor de agrupamento melhorado */}
            <div className="flex items-center gap-3 min-w-0 group">
              <label className="text-sm md:text-xs text-zinc-300 font-medium whitespace-nowrap">
                Agrupar por:
              </label>
              <select
                value={groupByField}
                onChange={e => setGroupByField(e.target.value)}
                className="flex-1 sm:flex-none h-11 md:h-10 sm:h-9 px-4 md:px-3 py-2 rounded-xl backdrop-blur-xl border text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all duration-200 min-w-[120px] appearance-none cursor-pointer hover:border-emerald-500/30"
                style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(5, 150, 105, 0.08) 30%, rgba(0, 0, 0, 0.6) 70%, rgba(15, 23, 42, 0.7) 100%)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 6px 20px rgba(16, 185, 129, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='rgba(16,185,129,0.8)' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: 'right 12px center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '16px',
                  paddingRight: '40px'
                }}
              >
                {groupableFields.map(opt => (
                  <option 
                    key={opt.value} 
                    value={opt.value}
                    className="bg-zinc-900 text-white py-2"
                    style={{
                      backgroundColor: '#18181b',
                      color: '#ffffff'
                    }}
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          
            {/* Estatísticas da biblioteca */}
             <div className="flex items-center gap-2 rounded-xl text-xs text-zinc-400 bg-black/20 px-3 py-2 backdrop-blur-sm border border-white/5">
               <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
               </svg>
               <span className="font-medium">
                 {Object.values(groupedFiles).flat().length} {Object.values(groupedFiles).flat().length === 1 ? 'música' : 'músicas'}
               </span>
             </div>
          </div>
        </div>

      {/* Lista de arquivos - Layout mobile (cards) */}
      <div className="block sm:hidden flex-1 overflow-y-auto space-y-1 custom-scroll-square">
        {Object.keys(groupedFiles).length === 0 || Object.values(groupedFiles).every(group => group.length === 0) ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-zinc-800/50 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <p className="text-zinc-400 text-lg font-medium">Nenhuma música encontrada</p>
            <p className="text-zinc-500 text-sm mt-1">Baixe algumas músicas para começar</p>
          </div>
        ) : (
          Object.entries(groupedFiles).map(([groupName, groupFiles]) => (
            <div key={groupName} className="space-y-1">
              {/* Cabeçalho do grupo (se houver agrupamento) */}
              {groupByField && groupName !== '' && (
                <div className="sticky top-0 z-10 bg-black/40 backdrop-blur-sm rounded-lg p-2 border border-white/10 mb-1">
                  <h3 className="text-base font-semibold text-white">
                    {groupableFields.find(f => f.value === groupByField)?.label}: {groupName}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {groupFiles.length} {groupFiles.length === 1 ? 'música' : 'músicas'}
                  </p>
                </div>
              )}
              
                            {/* Arquivos do grupo */}
              {groupFiles.map((file, index) => (
                <div
                  key={file.name}
                  data-file-name={file.name}
                  className={`glass-card backdrop-blur-sm border border-emerald-500/20 hover:border-emerald-500/40 rounded-lg p-2 transition-all duration-300 cursor-pointer hover:shadow-lg hover:shadow-emerald-500/20 h-[50px] flex items-center ${
                    playerState.currentFile?.name === file.name ? 'border-emerald-500/60 bg-emerald-500/10' : ''
                  }`}
                  onClick={() => handlePlay(file)}
                  style={{
                    background: `linear-gradient(135deg, 
                      rgba(16, 185, 129, 0.05) 0%, 
                      rgba(5, 150, 105, 0.08) 40%, 
                      rgba(16, 185, 129, 0.03) 100%
                    )`,
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                  }}
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="relative flex-shrink-0">
                      <Image
                        src={getThumbnailUrl(file.name)}
                        alt={file.title || file.displayName}
                        width={36}
                        height={36}
                        className="object-cover w-9 h-9 bg-zinc-800 rounded border border-zinc-700/50"
                      />
                      {playerState.currentFile?.name === file.name && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
                          {playerState.isPlaying ? (
                            <SoundWave 
                              color="rgb(16, 185, 129)"
                              size="small"
                              isPlaying={true}
                              isLoading={playerState.isLoading}
                            />
                          ) : (
                            <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                              <polygon points="8,5 19,12 8,19" />
                            </svg>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-semibold text-sm leading-tight truncate">
                        {file.title || file.displayName}
                      </div>
                      <div className="text-emerald-400 text-xs truncate font-medium leading-tight">
                        {file.artist || 'Artista desconhecido'}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {file.bpm && (
                        <span className="bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded text-xs font-medium">
                          {file.bpm}
                        </span>
                      )}
                      {file.key && (
                        <span className="bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded text-xs font-medium">
                          {file.key}
                        </span>
                      )}
                      {file.genre && (
                        <span className="bg-zinc-700/50 text-zinc-300 px-1.5 py-0.5 rounded text-xs max-w-[60px] truncate">
                          {file.genre}
                        </span>
                      )}
                    </div>

                    <div className="flex-shrink-0 ml-2">
                      <MobileActionMenu 
                        file={file}
                        onUpdate={updateMetadataForFile}
                        onEdit={setEditModalFile}
                        fetchFiles={fetchFiles}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Lista de arquivos - Layout desktop (cards como mobile) */}
      <div className="hidden sm:block flex-1 overflow-y-auto space-y-1 custom-scroll-square">
        {Object.keys(groupedFiles).length === 0 || Object.values(groupedFiles).every(group => group.length === 0) ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-zinc-800/50 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <p className="text-zinc-400 text-lg font-medium">Nenhuma música encontrada</p>
            <p className="text-zinc-500 text-sm mt-1">Baixe algumas músicas para começar</p>
          </div>
        ) : (
          Object.entries(groupedFiles).map(([groupName, groupFiles]) => (
            <div key={groupName} className="space-y-1">
              {/* Cabeçalho do grupo (se houver agrupamento) */}
              {groupByField && groupName !== '' && (
                <div className="sticky top-0 z-10 bg-black/40 backdrop-blur-sm rounded-lg p-2 border border-white/10 mb-1">
                  <h3 className="text-base font-semibold text-white">
                    {groupableFields.find(f => f.value === groupByField)?.label}: {groupName}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {groupFiles.length} {groupFiles.length === 1 ? 'música' : 'músicas'}
                  </p>
                </div>
              )}
              
              {/* Arquivos do grupo */}
              {groupFiles.map((file, index) => (
                <div key={file.name} data-file-name={file.name}>
                  <DynamicFileItem 
                    file={file}
                    isPlaying={playerState.currentFile?.name === file.name}
                    isPlayerPlaying={playerState.isPlaying}
                    onPlay={() => handlePlay(file)}
                    extractDominantColor={extractDominantColor}
                    dominantColors={dominantColors}
                    onUpdate={updateMetadataForFile}
                    onEdit={setEditModalFile}
                    fetchFiles={fetchFiles}
                    isLoading={playerState.isLoading}
                  />
                </div>
              ))}
            </div>
          ))
        )}
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
          isListLoading={loading}
          isUpdatingAll={isUpdatingAll}
        />
      )}

      {releaseModal && (
        <ReleaseModal
          album={releaseModal.album}
          tracks={releaseModal.tracks}
          metadata={releaseModal.metadata}
          loading={releaseModal.loading}
          error={releaseModal.error}
          onClose={() => setReleaseModal(null)}
          files={files}
        />
      )}
    </div>
  );
}

function EditFileModal({ file, onClose, onSave, isListLoading, isUpdatingAll }: { 
  file: FileInfo, 
  onClose: () => void, 
  onSave: (data: Partial<FileInfo>) => void,
  isListLoading?: boolean,
  isUpdatingAll?: boolean
}) {
  // Função utilitária para normalizar o valor inicial da data
  function getInitialReleaseDate(ano?: string) {
    if (!ano) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(ano)) return ano;
    if (/^\d{4}$/.test(ano)) return ano + '-01-01';
    return '';
  }

  const [form, setForm] = useState({
    title: file.title || '',
    artist: file.artist || '',
    duration: file.duration || '',
    bpm: file.bpm?.toString() || '',
    key: file.key || '',
    genre: file.genre || '',
    album: file.album || '',
    label: file.label || '',
    catalog: (file as any).catalogNumber || (file as any).catalog || '',
    releaseDate: getInitialReleaseDate(file.ano),
  });
  
  const [formTouched, setFormTouched] = useState(false); // Rastrear se o usuário alterou algo
  const [saving, setSaving] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [propagateToAlbum, setPropagateToAlbum] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'beatport'>('edit');
  const initialFileRef = useRef(file.name); // Rastrear o arquivo inicial

  // Só resetar o formulário se mudou para um arquivo diferente (não apenas atualizou)
  useEffect(() => {
    if (file.name !== initialFileRef.current) {
      // Mudou de arquivo, resetar tudo
      initialFileRef.current = file.name;
      setFormTouched(false);
      setActiveTab('edit'); // Resetar para aba de edição
      setForm({
        title: file.title || '',
        artist: file.artist || '',
        duration: file.duration || '',
        bpm: file.bpm?.toString() || '',
        key: file.key || '',
        genre: file.genre || '',
        album: file.album || '',
        label: file.label || '',
        catalog: (file as any).catalogNumber || (file as any).catalog || '',
        releaseDate: getInitialReleaseDate(file.ano),
      });
    }
  }, [file.name]); // Só depende do nome do arquivo, não do objeto completo

  // Máscara para data YYYY-MM-DD
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^\d-]/g, '');
    // Adiciona os traços automaticamente
    if (value.length > 4 && value[4] !== '-') value = value.slice(0, 4) + '-' + value.slice(4);
    if (value.length > 7 && value[7] !== '-') value = value.slice(0, 7) + '-' + value.slice(7);
    value = value.slice(0, 10);
    setFormTouched(true); // Marcar como alterado pelo usuário
    setForm(f => ({ ...f, releaseDate: value }));
    setDateError(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormTouched(true); // Marcar como alterado pelo usuário
    if (name === 'releaseDate') {
      handleDateChange(e);
    } else {
      setForm(f => ({ ...f, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setDateError(null);
    if (form.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.releaseDate)) {
      setDateError('A data deve estar no formato YYYY-MM-DD.');
      setSaving(false);
      return;
    }
    
    const formData = {
      ...form,
      bpm: form.bpm ? parseInt(form.bpm) : undefined,
      ano: form.releaseDate || '',
      catalogNumber: form.catalog,
      propagateToAlbum: propagateToAlbum && form.album
    };
    
    await onSave(formData);
    setSaving(false);
    setFormTouched(false); // Resetar o estado de alterações
    onClose();
  };

  const handleClose = () => {
    if (formTouched) {
      if (window.confirm('Você tem alterações não salvas. Deseja realmente fechar sem salvar?')) {
        setFormTouched(false);
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div 
        className="w-full max-w-2xl rounded-xl border border-emerald-500/30 shadow-2xl relative animate-fade-in backdrop-blur-xl"
        style={{
          background: `linear-gradient(135deg, 
            rgba(16, 185, 129, 0.1) 0%, 
            rgba(5, 150, 105, 0.15) 30%, 
            rgba(0, 0, 0, 0.8) 70%, 
            rgba(15, 23, 42, 0.9) 100%
          )`,
          boxShadow: '0 25px 50px rgba(16, 185, 129, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Header compacto */}
        <div className="relative p-4 pb-3 border-b border-emerald-500/20">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent"></div>
          
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Editar Metadados</h2>
              <p className="text-xs text-emerald-300/80">Personalize as informações da música</p>
            </div>
          </div>
        </div>

        {/* Abas */}
        <div className="flex border-b border-emerald-500/20">
          <button
            onClick={() => setActiveTab('edit')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 ${
              activeTab === 'edit'
                ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5'
                : 'text-zinc-400 hover:text-emerald-300 hover:bg-emerald-500/5'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edição Manual
            </div>
          </button>
          <button
            onClick={() => setActiveTab('beatport')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 ${
              activeTab === 'beatport'
                ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5'
                : 'text-zinc-400 hover:text-emerald-300 hover:bg-emerald-500/5'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Beatport
            </div>
          </button>
        </div>

        {/* Conteúdo das Abas */}
        {activeTab === 'edit' && (
          <div>
            {/* Form otimizado horizontalmente */}
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {/* Grid principal com 3 colunas em desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Título - ocupa 2 colunas */}
            <div className="lg:col-span-2 space-y-1">
              <label className="text-xs font-medium text-emerald-300">Título</label>
              <input 
                name="title" 
                value={form.title} 
                onChange={handleChange} 
                placeholder="Nome da música"
                className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200 text-sm"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                }}
              />
            </div>

            {/* Duração */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-emerald-300">Duração</label>
              <input 
                name="duration" 
                value={form.duration} 
                onChange={handleChange} 
                placeholder="0:00"
                className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200 text-sm"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                }}
              />
            </div>
          </div>

          {/* Segunda linha - Artista e BPM */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            {/* Artista - ocupa 3 colunas */}
            <div className="lg:col-span-3 space-y-1">
              <label className="text-xs font-medium text-emerald-300">Artista</label>
              <input 
                name="artist" 
                value={form.artist} 
                onChange={handleChange} 
                placeholder="Nome do artista"
                className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200 text-sm"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                }}
              />
            </div>

            {/* BPM */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-emerald-300">BPM</label>
              <input 
                name="bpm" 
                value={form.bpm} 
                onChange={handleChange} 
                placeholder="120"
                className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200 text-sm"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                }}
              />
            </div>
          </div>

          {/* Terceira linha - Key, Gênero, Data */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-emerald-300">Key</label>
              <input 
                name="key" 
                value={form.key} 
                onChange={handleChange} 
                placeholder="A Minor"
                className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200 text-sm"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                }}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-emerald-300">Gênero</label>
              <input 
                name="genre" 
                value={form.genre} 
                onChange={handleChange} 
                placeholder="Deep House"
                className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200 text-sm"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                }}
              />
            </div>

            <div className="space-y-1 md:col-span-2 lg:col-span-1">
              <label className="text-xs font-medium text-emerald-300">Data</label>
              <input 
                name="releaseDate" 
                value={form.releaseDate} 
                onChange={handleChange} 
                placeholder="YYYY-MM-DD" 
                maxLength={10}
                className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200 text-sm"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                }}
              />
            </div>
          </div>

          {/* Quarta linha - Álbum, Label e Catálogo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-emerald-300">Álbum</label>
              <input 
                name="album" 
                value={form.album} 
                onChange={handleChange} 
                placeholder="Nome do álbum"
                className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200 text-sm"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                }}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-emerald-300">Label</label>
              <input 
                name="label" 
                value={form.label} 
                onChange={handleChange} 
                placeholder="Gravadora"
                className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200 text-sm"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                }}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-emerald-300">Catálogo</label>
              <input 
                name="catalog" 
                value={form.catalog} 
                onChange={handleChange} 
                placeholder="CAT001"
                className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all duration-200 text-sm"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                }}
              />
            </div>
          </div>

          {/* Checkbox para propagar informações do álbum */}
          {form.album && (
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 backdrop-blur-sm">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex-shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={propagateToAlbum}
                    onChange={(e) => setPropagateToAlbum(e.target.checked)}
                    className="sr-only"
                  />
                  <div 
                    className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                      propagateToAlbum 
                        ? 'bg-blue-500 border-blue-500 shadow-lg shadow-blue-500/30' 
                        : 'border-blue-400/50 bg-transparent hover:border-blue-400 hover:bg-blue-500/10'
                    }`}
                  >
                    {propagateToAlbum && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <span className="text-sm font-semibold text-blue-300 group-hover:text-blue-200 transition-colors">
                    Aplicar informações do álbum para todas as músicas
                  </span>
                  <p className="text-xs text-blue-200/80 mt-1 leading-relaxed">
                    <strong>Label</strong>, <strong>Data</strong> e <strong>Catálogo</strong> serão atualizados em todas as músicas do álbum <span className="font-medium text-blue-100">"{form.album}"</span>
                  </p>
                  {propagateToAlbum && (
                    <div className="mt-2 text-xs text-blue-100 bg-blue-500/20 px-2 py-1 rounded-md">
                      ⚡ Propagação ativada
                    </div>
                  )}
                </div>
              </label>
            </div>
          )}

          {/* Erro de data */}
          {dateError && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {dateError}
            </div>
          )}

          {/* Botão de salvar compacto */}
          <div className="pt-3 border-t border-emerald-500/20">
            <button 
              type="submit" 
              disabled={saving}
              className="w-full px-4 py-2.5 rounded-lg font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              style={{
                background: saving 
                  ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.3) 0%, rgba(5, 150, 105, 0.4) 100%)'
                  : 'linear-gradient(135deg, rgba(16, 185, 129, 0.8) 0%, rgba(5, 150, 105, 0.9) 100%)',
                boxShadow: saving 
                  ? '0 4px 16px rgba(16, 185, 129, 0.1)' 
                  : '0 8px 32px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
              }}
              onMouseEnter={(e) => {
                if (!saving) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 12px 40px rgba(16, 185, 129, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
                }
              }}
              onMouseLeave={(e) => {
                if (!saving) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
                }
              }}
            >
              {saving ? (
                <div className="flex items-center justify-center gap-2">
                  <LoadingSpinner size="sm" color="white" isLoading={saving} />
                  Salvando...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Salvar Alterações
                </div>
              )}
            </button>
          </div>
        </form>
          </div>
        )}

        {/* Aba Beatport */}
        {activeTab === 'beatport' && (
          <div className="p-4">
            <div className="space-y-4">
              {/* Informações da música atual */}
              <div className="bg-zinc-800/50 rounded-lg p-3 border border-emerald-500/20">
                                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-emerald-300">Música Atual</h3>
                  <div className="flex items-center gap-3">
                    {formTouched && (
                      <div className="flex items-center gap-1 text-xs text-orange-400 bg-orange-500/10 px-2 py-1 rounded-md border border-orange-500/20">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        <span>Não salvo</span>
                      </div>
                    )}
                    {(isListLoading || isUpdatingAll) && (
                      <div className="flex items-center gap-2 text-xs text-yellow-400">
                        <LoadingSpinner size="sm" color="yellow" isLoading={true} />
                        <span>{formTouched ? 'Atualizando (suas alterações estão preservadas)' : 'Atualizando lista...'}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-xs text-zinc-300">
                  <div><strong>Título:</strong> {file.title || file.displayName}</div>
                  <div><strong>Artista:</strong> {file.artist || 'Não informado'}</div>
                </div>
              </div>

              {/* Iframe do Beatport */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-emerald-300">Pesquisar no Beatport</h3>
                  <button
                    onClick={() => {
                      const query = `${file.artist || ''} ${file.title || file.displayName}`.trim();
                      const beatportUrl = `https://www.beatport.com/search?q=${encodeURIComponent(query)}`;
                      window.open(beatportUrl, '_blank', 'width=1200,height=800');
                    }}
                    className="px-3 py-1 bg-emerald-600 text-white text-xs rounded-md hover:bg-emerald-700 transition-colors"
                  >
                    🔗 Abrir no Beatport
                  </button>
                </div>
                
                <div className="w-full rounded-lg border border-zinc-700 bg-zinc-800/30 p-6 text-center">
                  <div className="mb-4">
                    <svg className="w-16 h-16 mx-auto text-zinc-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <h3 className="text-lg font-medium text-zinc-300 mb-2">Beatport abrirá em nova aba</h3>
                    <p className="text-sm text-zinc-400 mb-4">
                      Por questões de segurança, o Beatport não permite integração via iframe.
                    </p>
                  </div>
                  
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 mb-4">
                    <h4 className="text-sm font-medium text-emerald-300 mb-2">🎯 Informações para buscar:</h4>
                    <div className="text-sm space-y-1">
                      <div className="bg-zinc-700/50 rounded px-3 py-2">
                        <strong className="text-emerald-300">Busca:</strong> 
                        <span className="ml-2 text-white">{`${file.artist || ''} ${file.title || file.displayName}`.trim()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-400">
                    Clique no botão acima para abrir o Beatport em uma nova aba com a busca automática.
                  </div>
                </div>
              </div>

              {/* Instruções */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <h4 className="text-xs font-medium text-blue-300 mb-2">💡 Como usar:</h4>
                <ol className="text-xs text-blue-200/80 space-y-1 list-decimal list-inside">
                  <li>Clique em "🔗 Abrir no Beatport" - abrirá uma nova aba com busca automática</li>
                  <li>Encontre a música desejada na página do Beatport</li>
                  <li>Copie as informações (BPM, Key, Label, etc.) da página do Beatport</li>
                  <li>Volte para esta aba e vá para "Edição Manual"</li>
                  <li>Cole os dados copiados nos campos correspondentes</li>
                  <li>Clique em "Salvar Alterações"</li>
                </ol>
              </div>

              {/* Botões de ação */}
              <div className="flex gap-3">
                <button
                  onClick={() => setActiveTab('edit')}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors text-sm"
                >
                  ← Voltar para Edição
                </button>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-zinc-700 text-white rounded-md hover:bg-zinc-600 transition-colors text-sm"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Menu de ações mobile
function MobileActionMenu({ file, onUpdate, onEdit, fetchFiles }: { 
  file: any, 
  onUpdate: (fileName: string, status: string) => void, 
  onEdit: (file: any) => void,
  fetchFiles: (force?: boolean) => void 
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Fechar menu ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && 
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
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
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-emerald-400 transition-colors rounded-lg hover:bg-emerald-500/10"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Ações"
        type="button"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-2 z-[9999] backdrop-blur-md border border-emerald-500/20 rounded-lg shadow-xl min-w-[140px] py-1.5 animate-fade-in"
          style={{
            background: `linear-gradient(135deg, 
              rgba(16, 185, 129, 0.1) 0%, 
              rgba(5, 150, 105, 0.15) 30%, 
              rgba(0, 0, 0, 0.8) 70%, 
              rgba(15, 23, 42, 0.9) 100%
            )`,
            boxShadow: '0 8px 32px rgba(16, 185, 129, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
          }}
        >
          <button
            className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-500/10 text-emerald-300 font-medium transition-colors rounded-md mx-1"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onUpdate(file.name, 'loading');
              setOpen(false);
            }}
          >
            ↻ Atualizar Metadados
          </button>
          <button
            className="w-full text-left px-3 py-2 text-xs hover:bg-blue-500/10 text-blue-300 font-medium transition-colors rounded-md mx-1"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit(file);
              setOpen(false);
            }}
          >
            ✎ Editar
          </button>
          <button
            className="w-full text-left px-3 py-2 text-xs hover:bg-red-500/10 text-red-300 font-medium transition-colors rounded-md mx-1"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (window.confirm('Remover este arquivo?')) {
                await removeFile(file.name, fetchFiles);
                setOpen(false);
              }
            }}
          >
            🗑 Remover
          </button>
        </div>
      )}
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{top: number, left: number}>({top: 0, left: 0});

  // Fechar menu ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
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

  // Calcular posição do menu
  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.right + window.scrollX - 160 // 160 = largura aproximada do menu
      });
    }
  }, [open]);

  const menu = (
    <div
      ref={menuRef}
      className="z-[9999] backdrop-blur-md border border-emerald-500/20 rounded-lg shadow-xl min-w-[140px] py-1.5 animate-fade-in"
      style={{ 
        position: 'absolute', 
        top: menuPosition.top, 
        left: menuPosition.left,
        background: `linear-gradient(135deg, 
          rgba(16, 185, 129, 0.1) 0%, 
          rgba(5, 150, 105, 0.15) 30%, 
          rgba(0, 0, 0, 0.8) 70%, 
          rgba(15, 23, 42, 0.9) 100%
        )`,
        boxShadow: '0 8px 32px rgba(16, 185, 129, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
      }}
    >
      <button
        className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-500/10 text-emerald-300 font-medium transition-colors rounded-md mx-1"
        onClick={() => { onUpdate(file.name, 'loading'); setOpen(false); }}
      >
        ↻ Atualizar Metadados
      </button>
      <button
        className="w-full text-left px-3 py-2 text-xs hover:bg-blue-500/10 text-blue-300 font-medium transition-colors rounded-md mx-1"
        onClick={() => { onEdit(file); setOpen(false); }}
      >
        ✎ Editar
      </button>
      <button
        className="w-full text-left px-3 py-2 text-xs hover:bg-red-500/10 text-red-300 font-medium transition-colors rounded-md mx-1"
        onClick={async () => { if (window.confirm('Remover este arquivo?')) { await removeFile(file.name, fetchFiles); setOpen(false); } }}
      >
        🗑 Remover
      </button>
    </div>
  );

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        className="w-8 h-8 rounded-lg hover:bg-emerald-500/10 transition-colors text-zinc-400 hover:text-emerald-400 flex items-center justify-center border border-transparent hover:border-emerald-500/20"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Ações"
        type="button"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="6" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="18" r="1.5" />
        </svg>
      </button>
      {open && typeof window !== 'undefined' && ReactDOM.createPortal(menu, document.body)}
    </div>
  );
}

// Modal para exibir faixas da release e metadados
function ReleaseModal({ album, tracks, metadata, loading, error, onClose, files }: { album: string, tracks: any[], metadata: any, loading: boolean, error: string | null, onClose: () => void, files: any[] }) {
  // Verificar faixas já baixadas
  const downloadedTitles = new Set(files.map(f => (f.title || f.displayName || '').toLowerCase().trim()));
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-2xl shadow-lg relative animate-fade-in">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-white"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-xl font-semibold text-white mb-2">Release: {album}</h2>
        {loading && <div className="text-blue-400">Buscando informações da release...</div>}
        {error && <div className="text-red-400">{error}</div>}
        {!loading && !error && (
          <>
            <div className="mb-4">
              <div className="flex items-center gap-4">
                {metadata.cover && <img src={metadata.cover} alt="Capa" className="w-20 h-20 rounded shadow" />}
                <div>
                  <div className="text-white font-bold">{metadata.album}</div>
                  <div className="text-gray-400 text-sm">Artistas: {metadata.artists}</div>
                  <div className="text-gray-400 text-sm">Label: {metadata.label}</div>
                  <div className="text-gray-400 text-sm">Ano: {metadata.year}</div>
                  <div className="text-gray-400 text-sm">Lançamento: {metadata.releaseDate}</div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="min-w-full text-xs text-left">
                <thead>
                  <tr className="text-gray-400 border-b border-zinc-700">
                    <th className="px-2 py-1">Título</th>
                    <th className="px-2 py-1">Artistas</th>
                    <th className="px-2 py-1">Remixers</th>
                    <th className="px-2 py-1">BPM</th>
                    <th className="px-2 py-1">Key</th>
                    <th className="px-2 py-1">Gênero</th>
                    <th className="px-2 py-1">Duração</th>
                  </tr>
                </thead>
                <tbody>
                  {tracks.map((track, idx) => {
                    const isDownloaded = downloadedTitles.has((track.title || '').toLowerCase().trim());
                    return (
                      <tr key={idx} className={isDownloaded ? 'bg-green-900/30 text-green-300' : 'bg-zinc-800/60'}>
                        <td className="px-2 py-1 font-semibold">{track.title}</td>
                        <td className="px-2 py-1">{track.artists}</td>
                        <td className="px-2 py-1">{track.remixers}</td>
                        <td className="px-2 py-1">{track.bpm}</td>
                        <td className="px-2 py-1">{track.key}</td>
                        <td className="px-2 py-1">{track.genre}</td>
                        <td className="px-2 py-1">{track.duration}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
