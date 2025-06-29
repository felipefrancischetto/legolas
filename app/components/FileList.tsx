'use client';

import { useEffect, useState, useRef, memo, useCallback, useMemo } from 'react';
import Image from 'next/image';
import DownloadQueue from './DownloadQueue';
import { useDownload } from '../contexts/DownloadContext';
import { useFile } from '../contexts/FileContext';
import { useUI } from '../contexts/UIContext';
import { usePlayer } from '../contexts/PlayerContext';
import { getThumbnailUrl } from '../utils/thumbnailCache';
import { getCachedDominantColor } from '../utils/colorExtractor';
import ReactDOM from 'react-dom';

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
  columns: { label: string, key: string, width: number, always: boolean }[];
  onPlay: (file: FileInfo) => void;
  onContextMenu: (e: React.MouseEvent, file: FileInfo) => void;
  metadataStatus: any;
  updateMetadataForFile: (fileName: string, status: string) => void;
  setEditModalFile: (file: FileInfo) => void;
  isPlaying?: boolean;
  fetchFiles: (force?: boolean) => void;
}) => {
  const fileExists = files.some(f => f.name === file.name);
  const [dominantColor, setDominantColor] = useState<string>('rgba(0, 0, 0, 0.3)');
  
  // Extrai cor dominante da capa
  useEffect(() => {
    const extractColor = async () => {
      try {
        const thumbnailUrl = getThumbnailUrl(file.name);
        const colorData = await getCachedDominantColor(thumbnailUrl);
        setDominantColor(colorData.rgba(0.15));
      } catch (error) {
        console.warn('Erro ao extrair cor para', file.name, error);
        setDominantColor('rgba(0, 0, 0, 0.3)');
      }
    };
    
    extractColor();
  }, [file.name]);
  
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
      className={`flex items-center hover:bg-zinc-700/50 transition-all duration-200 group w-full h-[80px] animate-fade-in text-xs cursor-pointer ${isPlaying ? 'ring-2 ring-blue-400 bg-blue-900/20' : ''}`}
      style={{ 
        minHeight: 80, 
        margin: '4px 0px',
        background: isPlaying ? 'rgba(59, 130, 246, 0.2)' : dominantColor,
        backdropFilter: 'blur(8px)',
        border: `1px solid ${dominantColor.replace('0.15', '0.3')}`
      }}
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
        if (!col.always && typeof window !== 'undefined' && window.innerWidth < 640) return null;
        let content = null;
        switch (col.key) {
          case 'title':
            content = (
              <div className="flex items-center overflow-hidden">
                <button
                  onClick={(e) => { e.stopPropagation(); onPlay(file); }}
                  className="w-12 h-12 flex-shrink-0 bg-zinc-700 rounded-sm overflow-hidden group-hover:bg-zinc-600 transition-all duration-200 relative transform hover:scale-110 mr-2 sm:w-8 sm:h-8"
                  style={{ margin: '4px' }}
                >
                  <ThumbnailImage file={file} fileExists={fileExists} />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </button>
                <span className="font-bold text-white truncate block max-w-full break-words sm:text-xs">{file.title || file.displayName}</span>
              </div>
            );
            break;
          case 'artist':
            content = <span className="text-xs text-blue-400 truncate block max-w-full break-words sm:text-xs">{file.artist || '-'}</span>;
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

// Componente para item da lista com cor dinâmica
function DynamicFileItem({ 
  file, 
  isPlaying, 
  isPlayerPlaying, 
  onPlay, 
  extractDominantColor, 
  dominantColors 
}: { 
  file: FileInfo; 
  isPlaying: boolean; 
  isPlayerPlaying: boolean; 
  onPlay: () => void;
  extractDominantColor: (fileName: string, imageUrl: string) => Promise<{ rgb: string; rgba: (opacity: number) => string }>;
  dominantColors: { [fileName: string]: { rgb: string; rgba: (opacity: number) => string } };
}) {
  const [itemColor, setItemColor] = useState<{ rgb: string; rgba: (opacity: number) => string }>({
    rgb: '16, 185, 129',
    rgba: (opacity: number) => `rgba(16, 185, 129, ${opacity})`
  });

  useEffect(() => {
    const loadColor = async () => {
      if (dominantColors[file.name]) {
        setItemColor(dominantColors[file.name]);
      } else {
        const thumbnailUrl = getThumbnailUrl(file.name);
        try {
          const color = await extractDominantColor(file.name, thumbnailUrl);
          setItemColor(color);
        } catch (error) {
          console.error('Erro ao carregar cor:', error);
        }
      }
    };
    loadColor();
  }, [file.name, dominantColors, extractDominantColor]);

  return (
    <div
      className="backdrop-blur-md border rounded-lg p-3 transition-all duration-300 cursor-pointer hover:shadow-lg"
      onClick={onPlay}
      style={{
        borderColor: itemColor.rgba(isPlaying ? 0.6 : 0.3),
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
          ? `0 8px 32px ${itemColor.rgba(0.2)}, inset 0 1px 0 rgba(255, 255, 255, 0.15)`
          : `0 4px 16px ${itemColor.rgba(0.08)}, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
      }}
    >
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          <Image
            src={getThumbnailUrl(file.name)}
            alt={file.title || file.displayName}
            width={56}
            height={56}
            className="object-cover w-14 h-14 bg-zinc-800 rounded-lg border border-zinc-700/50 shadow-lg"
          />
          {isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg backdrop-blur-sm">
              {isPlayerPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" style={{ color: `rgb(${itemColor.rgb})` }}>
                  <rect x="7" y="6" width="3" height="12" rx="1" />
                  <rect x="14" y="6" width="3" height="12" rx="1" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" style={{ color: `rgb(${itemColor.rgb})` }}>
                  <polygon points="8,5 19,12 8,19" />
                </svg>
              )}
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="text-white font-bold text-base leading-tight truncate">
            {file.title || file.displayName}
          </div>
          <div className="text-sm truncate font-medium" style={{ color: `rgb(${itemColor.rgb})` }}>
            {file.artist || 'Artista desconhecido'}
          </div>
          
          <div className="flex flex-wrap gap-1.5 mt-2">
            {file.bpm && (
              <span 
                className="px-2 py-0.5 rounded text-xs font-bold border backdrop-blur-sm"
                style={{ 
                  backgroundColor: itemColor.rgba(0.25),
                  color: `rgb(${itemColor.rgb})`,
                  borderColor: itemColor.rgba(0.2)
                }}
              >
                {file.bpm} BPM
              </span>
            )}
            {file.key && (
              <span 
                className="px-2 py-0.5 rounded text-xs font-bold border backdrop-blur-sm"
                style={{ 
                  backgroundColor: itemColor.rgba(0.25),
                  color: `rgb(${itemColor.rgb})`,
                  borderColor: itemColor.rgba(0.2)
                }}
              >
                {file.key}
              </span>
            )}
            {file.genre && (
              <span className="bg-white/10 text-zinc-200 px-2 py-0.5 rounded text-xs font-medium border border-white/15 backdrop-blur-sm">
                {file.genre}
              </span>
            )}
            {(file as any).ano && (
              <span className="bg-blue-500/20 text-blue-200 px-2 py-0.5 rounded text-xs font-medium border border-blue-400/20 backdrop-blur-sm">
                {String((file as any).ano).slice(0, 4)}
              </span>
            )}
          </div>
          
          {(file.label || file.album) && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {file.label && (
                <span className="text-zinc-300 text-xs bg-white/8 px-2 py-0.5 rounded border border-white/10 backdrop-blur-sm">
                  {file.label}
                </span>
              )}
              {file.album && (
                <span className="text-zinc-200 text-xs bg-white/10 px-2 py-0.5 rounded border border-white/15 backdrop-blur-sm">
                  {file.album}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex-shrink-0">
          <ActionMenu 
            file={file} 
            onUpdate={(fileName: string, status: string) => {}} 
            onEdit={(file: any) => {}} 
            fetchFiles={(force?: boolean) => {}} 
          />
        </div>
      </div>
    </div>
  );
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

  const [selectedRelease, setSelectedRelease] = useState<string | null>(null);
  const [releaseModalData, setReleaseModalData] = useState<any>(null);
  const [columnWidths, setColumnWidths] = useState(columns.map(c => c.width));
  const [catalogNumbers, setCatalogNumbers] = useState<Record<string, string>>({});

  useEffect(() => {
    const savedPath = localStorage.getItem('customDownloadsPath');
    if (savedPath) {
      setCustomDownloadsPath(savedPath);
    }
    
    const interval = setInterval(() => fetchFiles(false), 60000);

    const openQueue = () => setShowQueue(true);
    window.addEventListener('open-download-queue', openQueue);

    return () => {
      clearInterval(interval);
      window.removeEventListener('open-download-queue', openQueue);
      
      if (fetchFilesDebounced.current) {
        clearTimeout(fetchFilesDebounced.current);
      }
    };
  }, [fetchFiles, setCustomDownloadsPath, setShowQueue]);

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

  // Função para extrair cor dominante
  const extractDominantColor = useCallback(async (fileName: string, imageUrl: string) => {
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
  }, [dominantColors]);

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
      setMetadataStatus(prev => ({ ...prev, [fileName]: 'error' }));
      return;
    }

    try {
      setMetadataStatus((prev: any) => ({ ...prev, [fileName]: status }));
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
      
      await fetchFiles(true);
      
    } catch (err: any) {
      console.error(`Erro ao atualizar metadados para ${fileName}:`, err.message);
      setMetadataStatus((prev: any) => ({ ...prev, [fileName]: 'error' }));
    }
  }

  async function updateAllMetadata() {
    setIsUpdatingAll(true);
    setUpdateProgress({ current: 0, total: files.length });

    const filesToUpdate = files.filter(f => !f.isBeatportFormat);
    setUpdateProgress({ current: 0, total: filesToUpdate.length });

    for (let i = 0; i < filesToUpdate.length; i++) {
      const file = filesToUpdate[i];
      setUpdateProgress({ current: i + 1, total: filesToUpdate.length });
      try {
        await updateMetadataForFile(file.name, 'loading');
      } catch (error) {
        // O erro já é tratado em updateMetadataForFile
      }
    }

    await fetchFiles(true); // Recarrega tudo no final
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
    console.log('🎵 [FileList] handlePlay chamado para:', file.displayName);
    play(file);
    setPlayerOpen(true);
    console.log('🎵 [FileList] setPlayerOpen(true) chamado');
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
    if (!editModalFile) return;

    setIsUpdatingAll(true); // Reutiliza o estado de 'carregando'
    try {
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

      await fetchFiles(true); // Força a atualização da lista
      setEditModalFile(null); // Fecha o modal

    } catch (error: any) {
      console.error('Erro ao salvar metadados:', error);
      alert(`Erro: ${error.message}`);
    } finally {
      setIsUpdatingAll(false);
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
        setFiles((prevFiles: any[]) => prevFiles.map((f: any) => {
          if (f.album === albumName && result.metadata.catalogNumber && f.title && !f.title.endsWith(`[${result.metadata.catalogNumber}]`)) {
            return { ...f, title: `${f.title} [${result.metadata.catalogNumber}]` };
          }
          return f;
        }));
      }
      setReleaseModal({ album: albumName, tracks: result.tracks, metadata: result.metadata, loading: false, error: null });
    } catch (err: any) {
      setReleaseModal({ album: albumName, tracks: [], metadata: {}, loading: false, error: err.message || 'Erro desconhecido' });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center mb-6 gap-4 flex-shrink-0">
          <div className="flex-1 relative">
            <div className="w-full h-12 rounded-xl bg-zinc-800/50 border border-zinc-700/50 animate-pulse"></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-20 h-6 bg-zinc-700/50 rounded animate-pulse"></div>
            <div className="w-32 h-10 bg-zinc-800/50 border border-zinc-700/50 rounded-lg animate-pulse"></div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3">
          {Array.from({ length: 6 }).map((_, index) => {
            // Larguras fixas predefinidas para evitar hydration mismatch
            const titleWidths = ['75%', '85%', '68%', '92%', '78%', '82%'];
            const subtitleWidths = ['55%', '48%', '62%', '45%', '58%', '52%'];
            
            return (
              <div
                key={index}
                className="backdrop-blur-md border border-emerald-500/20 rounded-xl p-4 animate-pulse"
                style={{
                  background: `linear-gradient(135deg, 
                    rgba(16, 185, 129, 0.08) 0%, 
                    rgba(5, 150, 105, 0.12) 30%, 
                    rgba(0, 0, 0, 0.6) 70%, 
                    rgba(15, 23, 42, 0.7) 100%
                  )`,
                  boxShadow: '0 4px 16px rgba(16, 185, 129, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                }}
              >
                <div className="flex items-center gap-6">
                  <div className="relative flex-shrink-0">
                    <div className="w-16 h-16 bg-zinc-700/30 rounded-xl"></div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div 
                      className="h-5 bg-zinc-700/30 rounded mb-2" 
                      style={{ width: titleWidths[index] }}
                    ></div>
                    <div 
                      className="h-4 bg-zinc-700/20 rounded mb-3" 
                      style={{ width: subtitleWidths[index] }}
                    ></div>
                    
                    <div className="flex flex-wrap gap-2 mt-3">
                      <div className="h-7 w-16 bg-emerald-500/20 rounded-md"></div>
                      <div className="h-7 w-12 bg-emerald-500/20 rounded-md"></div>
                      <div className="h-7 w-20 bg-white/10 rounded-md"></div>
                      <div className="h-7 w-14 bg-blue-500/20 rounded-md"></div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mt-2">
                      <div className="h-6 w-24 bg-white/10 rounded-md"></div>
                      <div className="h-6 w-20 bg-white/15 rounded-md"></div>
                    </div>
                  </div>

                  <button className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-zinc-700/20 rounded-full">
                    <div className="w-5 h-5 bg-zinc-600/30 rounded"></div>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
        <div className="flex items-center mb-4 gap-3 flex-shrink-0">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Buscar por título ou artista..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 backdrop-blur-sm transition-all duration-200 text-sm"
            />
            <svg className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400 font-medium whitespace-nowrap">Agrupar por:</label>
            <select
              value={groupByField}
              onChange={e => setGroupByField(e.target.value)}
              className="px-3 py-2 rounded-md bg-zinc-800/50 border border-zinc-700/50 text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 backdrop-blur-sm min-w-[100px]"
            >
              {groupableFields.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

      {/* Lista de arquivos - Layout mobile (cards) */}
      <div className="block sm:hidden flex-1 overflow-y-auto space-y-3">
        {(groupedFiles[groupByField] || []).length === 0 ? (
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
          groupedFiles[groupByField]?.map((file, index) => (
            <div
              key={file.name}
              className={`glass-card backdrop-blur-sm border border-emerald-500/20 hover:border-emerald-500/40 rounded-lg p-3 transition-all duration-300 cursor-pointer hover:shadow-lg hover:shadow-emerald-500/20 ${
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
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <Image
                    src={getThumbnailUrl(file.name)}
                    alt={file.title || file.displayName}
                    width={48}
                    height={48}
                    className="object-cover w-12 h-12 bg-zinc-800 rounded-lg border border-zinc-700/50"
                  />
                  {playerState.currentFile?.name === file.name && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
                      {playerState.isPlaying ? (
                        <svg className="w-6 h-6 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                          <rect x="7" y="6" width="3" height="12" rx="1" />
                          <rect x="14" y="6" width="3" height="12" rx="1" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                          <polygon points="8,5 19,12 8,19" />
                        </svg>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-sm leading-tight truncate">
                    {file.title || file.displayName}
                  </div>
                  <div className="text-emerald-400 text-xs truncate font-medium">
                    {file.artist || 'Artista desconhecido'}
                  </div>
                  
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {file.bpm && (
                      <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded text-xs font-medium">
                        {file.bpm} BPM
                      </span>
                    )}
                    {file.key && (
                      <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded text-xs font-medium">
                        {file.key}
                      </span>
                    )}
                    {file.genre && (
                      <span className="bg-zinc-700/50 text-zinc-300 px-2 py-0.5 rounded text-xs">
                        {file.genre}
                      </span>
                    )}
                  </div>
                  
                  {file.label && (
                    <div className="text-zinc-400 text-xs mt-1 truncate">
                      {file.label}
                    </div>
                  )}
                </div>

                <button className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-emerald-400 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Lista de arquivos - Layout desktop (cards como mobile) */}
      <div className="hidden sm:block flex-1 overflow-y-auto space-y-3">
        {groupedFiles[groupByField]?.length === 0 ? (
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
          groupedFiles[groupByField]?.map((file, index) => (
            <DynamicFileItem 
              key={file.name}
              file={file}
              isPlaying={playerState.currentFile?.name === file.name}
              isPlayerPlaying={playerState.isPlaying}
              onPlay={() => handlePlay(file)}
              extractDominantColor={extractDominantColor}
              dominantColors={dominantColors}
            />
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

function EditFileModal({ file, onClose, onSave }: { file: FileInfo, onClose: () => void, onSave: (data: Partial<FileInfo>) => void }) {
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
    releaseDate: getInitialReleaseDate(file.ano),
  });
  const [saving, setSaving] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  // Máscara para data YYYY-MM-DD
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^\d-]/g, '');
    // Adiciona os traços automaticamente
    if (value.length > 4 && value[4] !== '-') value = value.slice(0, 4) + '-' + value.slice(4);
    if (value.length > 7 && value[7] !== '-') value = value.slice(0, 7) + '-' + value.slice(7);
    value = value.slice(0, 10);
    setForm(f => ({ ...f, releaseDate: value }));
    setDateError(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
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
    await onSave({
      ...form,
      bpm: form.bpm ? parseInt(form.bpm) : undefined,
      ano: form.releaseDate || '',
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
          <input name="releaseDate" value={form.releaseDate} onChange={handleChange} placeholder="Data de Lançamento (YYYY-MM-DD)" maxLength={10} className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-white" />
          {dateError && <div className="text-red-400 text-xs">{dateError}</div>}
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
        onClick={() => setOpen((v) => !v)}
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
