"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDownload } from '../contexts/DownloadContext';
import { useFile } from '../contexts/FileContext';
import { useSettings } from '../hooks/useSettings';
import BaseModal from './BaseModal';
import PlaylistTrackItem from './PlaylistTrackItem';
import { safeSetItem, safeGetItem, safeRemoveItem } from '../utils/localStorage';
import { parsePlaylistLines } from '../utils/parsePlaylistText';

interface PlaylistTextModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeColors?: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    background: string;
    border: string;
  };
}

interface TrackMetadata {
  title: string;
  artist: string;
  thumbnail?: string;
  duration?: string;
  url?: string;
  videoId?: string;
  source?: 'youtube-music' | 'youtube';
}

const STORAGE_KEY = 'legolas-playlist-draft';

interface SavedPlaylistData {
  playlistText: string;
  parsedTracks: Array<{ title: string; artist: string }>;
  enabledTracks: number[];
  trackMetadata: Array<[number, TrackMetadata]>;
}

export default function PlaylistTextModal({ isOpen, onClose, themeColors }: PlaylistTextModalProps) {
  const [playlistText, setPlaylistText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedTracks, setParsedTracks] = useState<Array<{ title: string; artist: string; youtubeUrl?: string; videoId?: string }>>([]);
  const [enabledTracks, setEnabledTracks] = useState<Set<number>>(new Set());
  const [trackMetadata, setTrackMetadata] = useState<Map<number, TrackMetadata>>(new Map());
  const [searchingTracks, setSearchingTracks] = useState<Set<number>>(new Set());
  const { addToQueue, addToast } = useDownload();
  const { files } = useFile();
  const { settings } = useSettings();
  
  // Ref para evitar carregamento duplicado
  const hasLoadedRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMountRef = useRef(true);
  
  // Criar um conjunto de músicas já baixadas para comparação rápida
  const downloadedTracks = useMemo(() => {
    const downloaded = new Set<string>();
    files.forEach(file => {
      const title = (file.title || file.displayName || '').toLowerCase().trim();
      const artist = (file.artist || '').toLowerCase().trim();
      
      // Adicionar por título apenas
      if (title) {
        downloaded.add(title);
      }
      
      // Adicionar por combinação artista - título
      if (artist && title) {
        downloaded.add(`${artist} - ${title}`);
        downloaded.add(`${title} - ${artist}`); // Inverter também
      }
    });
    return downloaded;
  }, [files]);
  
  // Função para normalizar strings para comparação
  const normalizeString = useCallback((str: string): string => {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove caracteres especiais exceto hífens e espaços
      .replace(/\s+/g, ' ') // Normaliza espaços múltiplos
      .replace(/\s*-\s*/g, ' - '); // Normaliza hífens
  }, []);
  
  // Função para verificar se uma música já foi baixada
  const isTrackDownloaded = useCallback((track: { title: string; artist: string }) => {
    const normalizedTitle = normalizeString(track.title);
    const normalizedArtist = normalizeString(track.artist);
    
    // Verificação rápida no cache primeiro
    if (downloadedTracks.has(normalizedTitle)) {
      return true;
    }
    
    const trackCombined = normalizedArtist ? `${normalizedArtist} - ${normalizedTitle}` : normalizedTitle;
    if (downloadedTracks.has(trackCombined)) {
      return true;
    }
    
    // Verificação detalhada nos arquivos
    return files.some(file => {
      const fileTitle = normalizeString(file.title || file.displayName || '');
      const fileArtist = normalizeString(file.artist || '');
      
      // Comparação exata de título
      if (fileTitle && normalizedTitle && fileTitle === normalizedTitle) {
        // Se não há artista ou os artistas coincidem (ou são vazios)
        if (!normalizedArtist || !fileArtist || fileArtist === normalizedArtist) {
          return true;
        }
      }
      
      // Comparação por combinação artista - título
      const fileCombined = fileArtist ? `${fileArtist} - ${fileTitle}` : fileTitle;
      
      if (trackCombined && fileCombined && trackCombined === fileCombined) {
        return true;
      }
      
      // Comparação parcial (título contém ou é contido) - apenas se muito similar
      if (fileTitle && normalizedTitle) {
        const titleSimilarity = Math.min(
          fileTitle.length / Math.max(normalizedTitle.length, 1),
          normalizedTitle.length / Math.max(fileTitle.length, 1)
        );
        
        // Se a similaridade é alta (pelo menos 80%)
        if (titleSimilarity >= 0.8 && (fileTitle.includes(normalizedTitle) || normalizedTitle.includes(fileTitle))) {
          // Verificar artista também
          if (!normalizedArtist || !fileArtist || fileArtist === normalizedArtist || 
              fileArtist.includes(normalizedArtist) || normalizedArtist.includes(fileArtist)) {
            return true;
          }
        }
      }
      
      return false;
    });
  }, [downloadedTracks, files, normalizeString]);
  
  // Carregar dados salvos na montagem inicial (mesmo se modal não estiver aberto)
  useEffect(() => {
    if (!isInitialMountRef.current) return;
    isInitialMountRef.current = false;
    
    const saved = safeGetItem<SavedPlaylistData>(STORAGE_KEY);
    if (saved && saved.playlistText && saved.playlistText.trim()) {
      setPlaylistText(saved.playlistText);
      const lines = saved.playlistText.split('\n').filter(line => line.trim());
      const tracksFromText = parsePlaylistLines(lines);
      setParsedTracks(tracksFromText.length > 0 ? tracksFromText : (saved.parsedTracks || []));
      
      // Restaurar enabledTracks (verificação de downloads será feita depois pelo useEffect que monitora files)
      const enabledSet = new Set<number>();
      const restoredTracks = tracksFromText.length > 0 ? tracksFromText : (saved.parsedTracks || []);
      restoredTracks.forEach((_, idx) => {
        // Restaurar apenas as que estavam habilitadas antes
        // A verificação se foram baixadas será feita automaticamente pelo useEffect que monitora files
        if ((saved.enabledTracks || []).includes(idx)) {
          enabledSet.add(idx);
        }
      });
      setEnabledTracks(enabledSet);
      
      if (saved.trackMetadata && saved.trackMetadata.length > 0) {
        setTrackMetadata(new Map(saved.trackMetadata));
      }
      
      console.log('📦 Playlist carregada na montagem:', restoredTracks.length, 'faixas');
    }
  }, []);
  
  // Limite de requisições simultâneas
  const MAX_CONCURRENT_SEARCHES = 2;
  const activeSearchesRef = useRef(0);
  const searchQueueRef = useRef<Array<{ index: number; track: { title: string; artist: string } }>>([]);
  
  // Atualizar enabledTracks quando o modal abrir e os arquivos mudarem
  useEffect(() => {
    if (!isOpen || parsedTracks.length === 0) return;
    
    // Verificar novamente quais faixas já foram baixadas quando o modal abrir
    const enabledSet = new Set<number>();
    parsedTracks.forEach((track, idx) => {
      if (!isTrackDownloaded(track)) {
        // Manter habilitada se já estava habilitada antes
        const saved = safeGetItem<SavedPlaylistData>(STORAGE_KEY);
        if (saved && (saved.enabledTracks || []).includes(idx)) {
          enabledSet.add(idx);
        } else if (!saved) {
          // Se não há dados salvos, habilitar todas que não foram baixadas
          enabledSet.add(idx);
        }
      }
    });
    
    setEnabledTracks(prev => {
      // Manter as que já estavam habilitadas e não foram baixadas
      const newSet = new Set<number>();
      prev.forEach(idx => {
        if (!isTrackDownloaded(parsedTracks[idx])) {
          newSet.add(idx);
        }
      });
      // Adicionar as novas que devem estar habilitadas
      enabledSet.forEach(idx => newSet.add(idx));
      return newSet;
    });
  }, [isOpen, parsedTracks, files, isTrackDownloaded]);
  
  // Função para salvar dados no localStorage
  const saveToLocalStorage = useCallback(() => {
    if (playlistText.trim() && parsedTracks.length > 0) {
      // Otimizar metadados: remover campos desnecessários e limitar tamanho
      const optimizedMetadata = Array.from(trackMetadata.entries()).map(([idx, meta]) => {
        // Manter apenas campos essenciais para reduzir tamanho
        return [idx, {
          title: meta.title,
          artist: meta.artist,
          url: meta.url,
          videoId: meta.videoId,
          source: meta.source
          // Remover thumbnail, duration e outros campos grandes se não forem essenciais
        }] as [number, TrackMetadata];
      });

      const data: SavedPlaylistData = {
        playlistText,
        parsedTracks,
        enabledTracks: Array.from(enabledTracks),
        trackMetadata: optimizedMetadata
      };
      
      safeSetItem(STORAGE_KEY, data, {
        maxSize: 2 * 1024 * 1024, // 2MB máximo para playlist
        onError: (err) => {
          console.warn('⚠️ Erro ao salvar playlist no localStorage:', err.message);
          // Se falhar, tentar salvar sem metadados
          const minimalData: SavedPlaylistData = {
            playlistText,
            parsedTracks,
            enabledTracks: Array.from(enabledTracks),
            trackMetadata: []
          };
          safeSetItem(STORAGE_KEY, minimalData);
        }
      });
    } else if (playlistText.trim() === '' && parsedTracks.length === 0) {
      // Limpar se não houver nada
      safeRemoveItem(STORAGE_KEY);
    }
  }, [playlistText, parsedTracks, enabledTracks, trackMetadata]);

  // Salvar no localStorage sempre que houver mudanças (com debounce)
  useEffect(() => {
    // Limpar timeout anterior
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounce de 500ms para evitar salvamentos excessivos durante Fast Refresh
    saveTimeoutRef.current = setTimeout(() => {
      saveToLocalStorage();
    }, 500);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [playlistText, parsedTracks, enabledTracks, trackMetadata, saveToLocalStorage]);

  // Salvar antes de descarregar a página (refresh, fechar aba, etc.)
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Salvar imediatamente sem debounce
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveToLocalStorage();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Salvar ao desmontar também
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveToLocalStorage();
    };
  }, [saveToLocalStorage]);

  // Cores padrão caso não sejam fornecidas
  const defaultColors = {
    primary: 'rgb(16, 185, 129)',
    primaryLight: 'rgba(16, 185, 129, 0.9)',
    primaryDark: 'rgba(16, 185, 129, 0.7)',
    background: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)'
  };
  
  // Usar cores padrão se cores dinâmicas estiverem desabilitadas
  const colors = (settings.disableDynamicColors || !themeColors) ? defaultColors : themeColors;

  // Função para normalizar o texto removendo timestamps/minutos de playlist
  const normalizePlaylistText = (text: string): string => {
    return text
      .split('\n')
      .map(line => {
        // Remove padrões de tempo como "**0:00 - 2:16**", "0:00 - 2:16", "0:00-2:16", etc.
        // Também remove padrões como "[0:00 - 2:16]", "(0:00 - 2:16)", etc.
        // E também remove padrões como "1::40", "2::13", etc.
        let normalized = line
          // Remove timestamps com asteriscos: **0:00 - 2:16**
          .replace(/\*\*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\*\*/g, '')
          // Remove timestamps com colchetes: [0:00 - 2:16]
          .replace(/\[\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\]/g, '')
          // Remove timestamps com parênteses: (0:00 - 2:16)
          .replace(/\(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\)/g, '')
          // Remove timestamps simples: 0:00 - 2:16 ou 0:00-2:16
          .replace(/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/g, '')
          // Remove timestamps de início apenas: 0:00 ou **0:00**
          .replace(/\*\*\d{1,2}:\d{2}\*\*/g, '')
          .replace(/\d{1,2}:\d{2}(?=\s*$)/g, '')
          // Remove padrão com dois pontos duplos: 1::40, 2::13, etc.
          .replace(/\d+::\d{2}/g, '')
          // Remove espaços extras e limpa a linha
          .trim()
          // Remove múltiplos espaços
          .replace(/\s+/g, ' ')
          // Remove espaços antes de hífens ou depois de hífens
          .replace(/\s*-\s*/g, ' - ');
        
        return normalized;
      })
      .filter(line => line.trim()) // Remove linhas vazias
      .join('\n');
  };

  const handleNormalize = () => {
    const normalized = normalizePlaylistText(playlistText);
    setPlaylistText(normalized);
    // Trigger parse after normalization
    handleTextChange({ target: { value: normalized } } as React.ChangeEvent<HTMLTextAreaElement>);
  };

  // Handler para detectar colagem e normalizar automaticamente
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text');
    
    // Normalizar o texto colado automaticamente
    const normalized = normalizePlaylistText(pastedText);
    
    // Se o texto foi normalizado (mudou), substituir o conteúdo colado
    if (normalized !== pastedText) {
      e.preventDefault();
      
      // Inserir o texto normalizado no textarea
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentText = playlistText;
      const newText = currentText.substring(0, start) + normalized + currentText.substring(end);
      
      // Atualizar o estado
      setPlaylistText(newText);
      
      // Processar o texto normalizado
      setTimeout(() => {
        const lines = newText.split('\n').filter(line => line.trim());
        const tracks = parsePlaylistLines(lines);
        
        setParsedTracks(tracks);
        
        const enabledSet = new Set<number>();
        tracks.forEach((track, idx) => {
          if (!isTrackDownloaded(track)) {
            enabledSet.add(idx);
          }
        });
        
        setEnabledTracks(enabledSet);
        setTrackMetadata(new Map());
        setSearchingTracks(new Set());
        activeSearchesRef.current = 0;
        searchQueueRef.current = [];
      }, 0);
    }
    // Se não precisou normalizar, deixar o comportamento padrão acontecer
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setPlaylistText(text);
    
    // Parse tracks from text imediatamente (sem debounce para UI responsiva)
    const lines = text.split('\n').filter(line => line.trim());
    const tracks = parsePlaylistLines(lines);
    
    setParsedTracks(tracks);
    
    // Verificar quais faixas já foram baixadas e desativá-las
    const enabledSet = new Set<number>();
    tracks.forEach((track, idx) => {
      if (!isTrackDownloaded(track)) {
        enabledSet.add(idx);
      }
    });
    
    setEnabledTracks(enabledSet);
    // Limpar metadados anteriores quando a lista muda
    setTrackMetadata(new Map());
    setSearchingTracks(new Set());
    activeSearchesRef.current = 0;
    searchQueueRef.current = [];
  };
  
  const applyTrackMetadata = useCallback(
    (index: number, track: { title: string; artist: string }, videoResult?: {
      title?: string;
      uploader?: string;
      thumbnail?: string;
      duration?: string;
      url?: string;
      videoId?: string;
      source?: 'youtube-music' | 'youtube';
    }) => {
      setTrackMetadata((prev) => {
        const newMap = new Map(prev);
        newMap.set(index, {
          title: videoResult?.title || track.title,
          artist: videoResult?.uploader || track.artist,
          thumbnail: videoResult?.thumbnail,
          duration: videoResult?.duration,
          url: videoResult?.url,
          videoId: videoResult?.videoId,
          source: videoResult?.source,
        });
        return newMap;
      });
    },
    []
  );

  const buildSearchQuery = useCallback((track: { title: string; artist: string; youtubeUrl?: string; videoId?: string }) => {
    if (track.youtubeUrl) return track.youtubeUrl;
    const parts = [track.artist, track.title].filter(Boolean);
    return parts.join(' - ');
  }, []);

  const searchTracksInBatch = useCallback(
    async (items: Array<{ index: number; track: { title: string; artist: string; youtubeUrl?: string; videoId?: string } }>) => {
      const needsRemoteSearch = items.filter(({ track }) => !track.youtubeUrl);
      const withUrl = items.filter(({ track }) => track.youtubeUrl);

      for (const { index, track } of withUrl) {
        applyTrackMetadata(index, track, {
          title: track.title,
          uploader: track.artist,
          url: track.youtubeUrl,
          videoId: track.videoId,
          source: 'youtube',
        });
        setSearchingTracks((prev) => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }

      if (needsRemoteSearch.length === 0) return;

      const chunkSize = 8;
      for (let offset = 0; offset < needsRemoteSearch.length; offset += chunkSize) {
        const chunk = needsRemoteSearch.slice(offset, offset + chunkSize);
        const queries = chunk.map(({ track }) => buildSearchQuery(track));

        try {
          const response = await fetch('/api/search-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queries, platform: 'youtube-music' }),
          });

          if (response.ok) {
            const payload = await response.json();
            const results = Array.isArray(payload.results) ? payload.results : [];

            for (const entry of results) {
              const item = chunk[entry.index];
              if (!item) continue;
              if (entry.ok && entry.data) {
                applyTrackMetadata(item.index, item.track, entry.data);
              } else {
                applyTrackMetadata(item.index, item.track);
              }
              setSearchingTracks((prev) => {
                const next = new Set(prev);
                next.delete(item.index);
                return next;
              });
            }
          } else {
            for (const item of chunk) {
              applyTrackMetadata(item.index, item.track);
              setSearchingTracks((prev) => {
                const next = new Set(prev);
                next.delete(item.index);
                return next;
              });
            }
          }
        } catch (err) {
          console.warn('❌ Erro na busca em lote da playlist:', err);
          for (const item of chunk) {
            applyTrackMetadata(item.index, item.track);
            setSearchingTracks((prev) => {
              const next = new Set(prev);
              next.delete(item.index);
              return next;
            });
          }
        }

        if (offset + chunkSize < needsRemoteSearch.length) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
    },
    [applyTrackMetadata, buildSearchQuery]
  );

  // Fallback: fila serializada com poucas requisições paralelas
  const processSearchQueue = useCallback(async () => {
    while (searchQueueRef.current.length > 0 && activeSearchesRef.current < MAX_CONCURRENT_SEARCHES) {
      const { index, track } = searchQueueRef.current.shift()!;
      activeSearchesRef.current++;
      setSearchingTracks((prev) => new Set(prev).add(index));

      (async () => {
        try {
          const query = buildSearchQuery(track);
          const videoResponse = await fetch(
            `/api/search-video?q=${encodeURIComponent(query)}&platform=youtube-music`
          );

          if (videoResponse.ok) {
            const videoResult = await videoResponse.json();
            applyTrackMetadata(index, track, videoResult);
          } else {
            applyTrackMetadata(index, track);
          }
        } catch (err) {
          console.warn(`❌ Erro ao buscar vídeo para faixa ${index}:`, err);
          applyTrackMetadata(index, track);
        } finally {
          activeSearchesRef.current--;
          setSearchingTracks((prev) => {
            const newSet = new Set(prev);
            newSet.delete(index);
            return newSet;
          });

          if (searchQueueRef.current.length > 0) {
            setTimeout(() => processSearchQueue(), 200);
          }
        }
      })();
    }
  }, [applyTrackMetadata, buildSearchQuery]);
  
  // Atualizar faixas habilitadas quando os arquivos mudarem (novo download)
  useEffect(() => {
    if (parsedTracks.length === 0) return;
    
    // Verificar novamente quais faixas já foram baixadas
    setEnabledTracks(prev => {
      const newSet = new Set<number>();
      parsedTracks.forEach((track, idx) => {
        // Manter habilitada apenas se não foi baixada
        if (!isTrackDownloaded(track) && prev.has(idx)) {
          newSet.add(idx);
        }
      });
      return newSet;
    });
  }, [files, parsedTracks, isTrackDownloaded]);
  
  // Chave estável do conteúdo parseado (evita re-busca só por nova referência de array)
  const parsedTracksKey = useMemo(
    () => parsedTracks.map(t => `${t.artist}\u0000${t.title}`).join('\n'),
    [parsedTracks]
  );

  // Iniciar buscas quando o conteúdo das faixas mudar (com debounce ao digitar)
  useEffect(() => {
    if (parsedTracks.length === 0) {
      setTrackMetadata(new Map());
      setSearchingTracks(new Set());
      activeSearchesRef.current = 0;
      searchQueueRef.current = [];
      return;
    }

    const debounceId = setTimeout(() => {
      setTrackMetadata(new Map());
      activeSearchesRef.current = 0;
      setSearchingTracks(new Set(parsedTracks.map((_, idx) => idx)));
      const items = parsedTracks.map((track, idx) => ({ index: idx, track }));

      console.log(`📋 Iniciando busca para ${parsedTracks.length} faixas`);
      void searchTracksInBatch(items);
    }, 450);

    return () => clearTimeout(debounceId);
  }, [parsedTracksKey, parsedTracks, searchTracksInBatch]);

  const handleToggleTrack = (index: number) => {
    const track = parsedTracks[index];
    if (!track) return;
    
    // Não permitir habilitar músicas já baixadas
    if (isTrackDownloaded(track)) {
      return;
    }
    
    setEnabledTracks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleDownloadAll = async () => {
    setLoading(true);
    setError(null);

    try {
      const tracksToDownload = parsedTracks.filter((_, idx) => enabledTracks.has(idx));
      
      if (tracksToDownload.length === 0) {
        setError('Nenhuma faixa selecionada para download');
        setLoading(false);
        return;
      }

      const addedItems: Array<{ id: string; title?: string; url: string }> = [];
      const errors: string[] = [];

      for (const [idx, track] of parsedTracks.entries()) {
        if (!enabledTracks.has(idx)) continue;

        try {
          // Tentar usar URL do YouTube se disponível, senão usar busca por texto
          const metadata = trackMetadata.get(idx);
          let queueItem: ReturnType<typeof addToQueue> | null = null;

          const directUrl = track.youtubeUrl || metadata?.url;
          if (directUrl) {
            queueItem = addToQueue({
              url: directUrl,
              title: metadata?.title || track.title,
              format: 'flac',
              enrichWithBeatport: true, // Sempre ativo por padrão
              showBeatportPage: false,
              isPlaylist: false,
              status: 'pending' as const,
              steps: []
            });
          } else {
            // Fallback: adicionar por texto (será buscado automaticamente)
            queueItem = addToQueue({
              url: `${track.artist} - ${track.title}`,
              title: track.title,
              format: 'flac',
              enrichWithBeatport: true, // Sempre ativo por padrão
              showBeatportPage: false,
              isPlaylist: false,
              status: 'pending' as const,
              steps: []
            });
          }

          if (queueItem && queueItem.id) {
            addedItems.push(queueItem);
            console.log(`✅ Adicionado à fila: ${('title' in queueItem && queueItem.title) || queueItem.url}`);
          } else {
            errors.push(`Falha ao adicionar "${track.artist} - ${track.title}"`);
          }
        } catch (itemError: any) {
          console.error(`❌ Erro ao adicionar faixa ${idx}:`, itemError);
          errors.push(`Erro ao adicionar "${track.artist} - ${track.title}": ${itemError.message || 'Erro desconhecido'}`);
        }
      }

      // Verificar se pelo menos alguns itens foram adicionados
      if (addedItems.length === 0) {
        setError(errors.length > 0 
          ? `Erro ao adicionar faixas: ${errors.join('; ')}` 
          : 'Nenhuma faixa foi adicionada à fila de download');
        setLoading(false);
        return;
      }

      // Mostrar aviso se algumas faixas falharam
      if (errors.length > 0) {
        console.warn(`⚠️ ${errors.length} faixa(s) não foram adicionadas:`, errors);
        // Não bloquear o processo, apenas avisar
        if (addedItems.length > 0) {
          addToast({ title: `${addedItems.length} faixa(s) adicionada(s). ${errors.length} falha(s).` });
        }
      } else {
        addToast({ title: `${addedItems.length} faixa(s) adicionada(s) à fila de download` });
      }

      // Limpar localStorage após adicionar à fila (mesmo que alguns tenham falhado)
      try {
        safeRemoveItem(STORAGE_KEY);
        console.log('🗑️ Playlist removida do localStorage');
      } catch (storageError: any) {
        console.warn('⚠️ Erro ao limpar localStorage:', storageError);
        // Não bloquear o processo por erro de localStorage
      }
      
      // Fechar modal após um pequeno delay para mostrar o toast
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err: any) {
      console.error('❌ Erro ao processar playlist:', err);
      setError(err.message || 'Erro ao processar playlist');
    } finally {
      setLoading(false);
    }
  };
  
  // Função para limpar dados salvos
  const handleClearSaved = () => {
    safeRemoveItem(STORAGE_KEY);
    setPlaylistText('');
    setParsedTracks([]);
    setEnabledTracks(new Set());
    setTrackMetadata(new Map());
    setSearchingTracks(new Set());
    console.log('🗑️ Playlist limpa');
  };

  // Handler para fechar mantendo dados salvos
  const handleClose = () => {
    // Os dados já estão salvos automaticamente no useEffect
    onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Importar Playlist"
      maxWidth="max-w-4xl"
      themeColors={colors}
    >
      <div className="space-y-4 sm:space-y-3">
        <div>
          <div className="flex items-center justify-between mb-2 sm:mb-1">
            <label 
              className="block text-sm font-medium sm:text-xs text-white"
            >
              Cole o texto da playlist aqui:
            </label>
            <div className="flex items-center gap-2">
              {playlistText.trim() && (
                <>
                  <button
                    onClick={handleClearSaved}
                    className="px-2 py-1.5 text-xs font-medium text-white rounded-lg transition-all duration-200 hover:scale-105 backdrop-blur-md"
                    style={{
                      background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.8) 0%, rgba(239, 68, 68, 0.9) 100%)',
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                      boxShadow: '0 2px 8px rgba(239, 68, 68, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
                    }}
                    title="Limpar playlist"
                  >
                    🗑️
                  </button>
                  <button
                    onClick={handleNormalize}
                    className="px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-all duration-200 hover:scale-105 backdrop-blur-md"
                    style={{
                      background: `linear-gradient(135deg, ${colors.primaryLight} 0%, ${colors.primaryDark} 100%)`,
                      border: `1px solid ${colors.border}`,
                      boxShadow: `0 2px 8px ${colors.primary}25, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                      e.currentTarget.style.boxShadow = `0 4px 12px ${colors.primary}40, inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                      e.currentTarget.style.boxShadow = `0 2px 8px ${colors.primary}25, inset 0 1px 0 rgba(255, 255, 255, 0.1)`;
                    }}
                  >
                    Normalizar Lista
                  </button>
                </>
              )}
            </div>
          </div>
          <textarea
            value={playlistText}
            onChange={handleTextChange}
            onPaste={handlePaste}
            className="w-full h-64 px-4 py-3 rounded-xl text-white placeholder-zinc-400 focus:outline-none resize-none custom-scroll sm:h-48 sm:px-3 sm:py-2 sm:text-sm backdrop-blur-md transition-all duration-200 focus:ring-2 focus:ring-emerald-500/50"
            style={{
              background: `linear-gradient(135deg, ${colors.background} 0%, ${colors.background.replace('0.15', '0.25')} 100%)`,
              border: `1px solid ${colors.border}`,
              boxShadow: playlistText 
                ? `0 4px 12px ${colors.primary}25, 0 0 0 1px ${colors.primaryLight}, inset 0 1px 0 rgba(255, 255, 255, 0.1)` 
                : `0 4px 12px ${colors.primary}15, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
            }}
            placeholder="Cole aqui o texto da playlist com nomes de artistas e músicas..."
          />
        </div>
        
        {parsedTracks.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-white">
                  {parsedTracks.length} faixas detectadas
                </p>
                {(() => {
                  const downloadedCount = parsedTracks.filter(t => isTrackDownloaded(t)).length;
                  const selectedCount = enabledTracks.size;
                  
                  return (
                    <>
                      {downloadedCount > 0 && (
                        <span 
                          className="text-xs px-2 py-0.5 rounded font-medium"
                          style={{
                            backgroundColor: 'rgba(34, 197, 94, 0.2)',
                            color: '#22c55e',
                            border: '1px solid rgba(34, 197, 94, 0.4)'
                          }}
                        >
                          {downloadedCount} já baixada{downloadedCount > 1 ? 's' : ''}
                        </span>
                      )}
                      {selectedCount < parsedTracks.length - downloadedCount && (
                        <span className="ml-2 text-xs text-zinc-400">
                          ({selectedCount} selecionada{selectedCount !== 1 ? 's' : ''})
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            
            {/* Lista de faixas com preview */}
            <div className="max-h-96 overflow-y-auto custom-scroll space-y-2 mb-4">
              {parsedTracks.map((track, idx) => {
                const metadata = trackMetadata.get(idx);
                const isLoading = searchingTracks.has(idx);
                const hasMetadata = metadata !== undefined;
                const downloaded = isTrackDownloaded(track);
                
                return (
                  <PlaylistTrackItem
                    key={idx}
                    track={track}
                    index={idx}
                    themeColors={colors}
                    enabled={enabledTracks.has(idx)}
                    onToggle={handleToggleTrack}
                    metadata={hasMetadata ? metadata : null}
                    isLoading={isLoading}
                    isDownloaded={downloaded}
                  />
                );
              })}
            </div>
          </div>
        )}
        
        {error && (
          <div 
            className="px-3 py-2 rounded-lg text-sm text-red-300"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)'
            }}
          >
            {error}
          </div>
        )}
        
        <div className="flex gap-3 sm:gap-2 sm:flex-col">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-white rounded-xl transition-all duration-200 hover:scale-105 sm:px-3 sm:py-2 sm:text-sm backdrop-blur-md hover:shadow-lg"
            style={{
              background: 'linear-gradient(135deg, rgba(63, 63, 70, 0.8) 0%, rgba(63, 63, 70, 0.9) 100%)',
              border: '1px solid rgba(82, 82, 91, 0.5)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleDownloadAll}
            disabled={loading || !playlistText.trim() || enabledTracks.size === 0}
            className="flex-1 px-4 py-2.5 text-white rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 sm:px-3 sm:py-2 sm:text-sm backdrop-blur-md hover:shadow-lg"
            style={{
              background: loading || !playlistText.trim() || enabledTracks.size === 0
                ? 'linear-gradient(135deg, rgba(82, 82, 91, 0.8) 0%, rgba(82, 82, 91, 0.9) 100%)'
                : `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
              border: `1px solid ${loading || !playlistText.trim() || enabledTracks.size === 0 ? 'rgba(82, 82, 91, 0.5)' : colors.border}`,
              boxShadow: loading || !playlistText.trim() || enabledTracks.size === 0
                ? '0 4px 12px rgba(82, 82, 91, 0.3)'
                : `0 4px 12px ${colors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.2)`
            }}
            onMouseEnter={(e) => {
              if (!loading && playlistText.trim() && enabledTracks.size > 0) {
                e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                e.currentTarget.style.boxShadow = `0 8px 24px ${colors.primary}40, inset 0 1px 0 rgba(255, 255, 255, 0.25)`;
              }
            }}
            onMouseLeave={(e) => {
              if (!loading && playlistText.trim() && enabledTracks.size > 0) {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = `0 4px 12px ${colors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.2)`;
              }
            }}
          >
            {loading 
              ? 'Processando...' 
              : enabledTracks.size === parsedTracks.length 
                ? 'Baixar Todas' 
                : `Baixar ${enabledTracks.size} selecionada${enabledTracks.size > 1 ? 's' : ''}`
            }
          </button>
        </div>
      </div>
    </BaseModal>
  );
} 