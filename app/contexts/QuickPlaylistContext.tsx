'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { safeSetItem, safeGetItem, limitArraySize } from '../utils/localStorage';

export interface QuickPlaylistTrack {
  name: string;
  title?: string;
  artist?: string;
  path?: string;
  thumbnail?: string;
  [key: string]: any; // Para permitir outras propriedades do FileInfo
}

export interface Playlist {
  id: string;
  name: string;
  tracks: QuickPlaylistTrack[];
  createdAt: number;
  updatedAt: number;
}

interface QuickPlaylistContextType {
  // Playlist atual (para compatibilidade com código existente)
  tracks: QuickPlaylistTrack[];
  addTrack: (track: QuickPlaylistTrack, playlistId?: string) => void;
  removeTrack: (trackName: string, playlistId?: string) => void;
  isInPlaylist: (trackName: string, playlistId?: string) => boolean;
  toggleTrack: (track: QuickPlaylistTrack, playlistId?: string) => void;
  clearPlaylist: (playlistId?: string) => void;
  count: number;
  
  // Sistema de múltiplas playlists
  playlists: Playlist[];
  currentPlaylistId: string;
  setCurrentPlaylistId: (id: string) => void;
  createPlaylist: (name: string) => string;
  updatePlaylist: (id: string, updates: Partial<Playlist>) => void;
  deletePlaylist: (id: string) => void;
  getPlaylist: (id: string) => Playlist | undefined;
  addTrackToPlaylist: (playlistId: string, track: QuickPlaylistTrack) => void;
  removeTrackFromPlaylist: (playlistId: string, trackName: string) => void;
  isTrackInPlaylist: (playlistId: string, trackName: string) => boolean;
}

const QuickPlaylistContext = createContext<QuickPlaylistContextType | undefined>(undefined);

const STORAGE_KEY = 'legolas-playlists';
const DEFAULT_PLAYLIST_ID = 'quick-playlist';

export function QuickPlaylistProvider({ children }: { children: ReactNode }) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentPlaylistId, setCurrentPlaylistIdState] = useState<string>(DEFAULT_PLAYLIST_ID);

  // Carregar do localStorage ao montar
  useEffect(() => {
    const saved = safeGetItem<Playlist[]>(STORAGE_KEY);
    if (saved && Array.isArray(saved) && saved.length > 0) {
      setPlaylists(saved);
    } else {
      // Criar playlist padrão se não existir
      const defaultPlaylist: Playlist = {
        id: DEFAULT_PLAYLIST_ID,
        name: 'Quick Playlist',
        tracks: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      setPlaylists([defaultPlaylist]);
    }
  }, []);

  // Ref para debounce de salvamento
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Salvar no localStorage quando playlists mudarem (com debounce)
  useEffect(() => {
    // Limpar timeout anterior
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounce de 1 segundo para evitar salvamentos excessivos
    saveTimeoutRef.current = setTimeout(() => {
      // Otimizar: limitar número de playlists e tamanho de tracks
      const optimizedPlaylists = playlists.map(playlist => ({
        ...playlist,
        tracks: limitArraySize(playlist.tracks, 500) // Limitar a 500 tracks por playlist
      }));
      
      safeSetItem(STORAGE_KEY, optimizedPlaylists, {
        maxSize: 2 * 1024 * 1024, // 2MB máximo
        onError: (err) => {
          console.error('⚠️ Erro ao salvar playlists:', err.message);
        }
      });
    }, 1000);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [playlists]);

  // Playlist atual
  const currentPlaylist = useMemo(() => {
    return playlists.find(p => p.id === currentPlaylistId) || playlists[0] || null;
  }, [playlists, currentPlaylistId]);

  const setCurrentPlaylistId = useCallback((id: string) => {
    setCurrentPlaylistIdState(id);
  }, []);

  // Criar nova playlist
  const createPlaylist = useCallback((name: string): string => {
    const id = `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newPlaylist: Playlist = {
      id,
      name,
      tracks: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setPlaylists(prev => [...prev, newPlaylist]);
    return id;
  }, []);

  // Atualizar playlist
  const updatePlaylist = useCallback((id: string, updates: Partial<Playlist>) => {
    setPlaylists(prev => prev.map(p => 
      p.id === id 
        ? { ...p, ...updates, updatedAt: Date.now() }
        : p
    ));
  }, []);

  // Deletar playlist
  const deletePlaylist = useCallback((id: string) => {
    if (id === DEFAULT_PLAYLIST_ID) {
      // Não permitir deletar a playlist padrão
      return;
    }
    setPlaylists(prev => {
      const filtered = prev.filter(p => p.id !== id);
      // Se deletar a playlist atual, voltar para a padrão
      if (currentPlaylistId === id && filtered.length > 0) {
        setCurrentPlaylistIdState(DEFAULT_PLAYLIST_ID);
      }
      return filtered;
    });
  }, [currentPlaylistId]);

  // Obter playlist por ID
  const getPlaylist = useCallback((id: string) => {
    return playlists.find(p => p.id === id);
  }, [playlists]);

  // Adicionar track a uma playlist específica
  const addTrackToPlaylist = useCallback((playlistId: string, track: QuickPlaylistTrack) => {
    setPlaylists(prev => prev.map(p => {
      if (p.id === playlistId) {
        // Evitar duplicatas
        if (p.tracks.some(t => t.name === track.name)) {
          return p;
        }
        return {
          ...p,
          tracks: [...p.tracks, track],
          updatedAt: Date.now()
        };
      }
      return p;
    }));
  }, []);

  // Remover track de uma playlist específica
  const removeTrackFromPlaylist = useCallback((playlistId: string, trackName: string) => {
    console.log('[removeTrackFromPlaylist] Iniciando remoção:', { playlistId, trackName });
    
    setPlaylists(prev => {
      const playlistIndex = prev.findIndex(p => p.id === playlistId);
      if (playlistIndex === -1) {
        console.warn('[removeTrackFromPlaylist] Playlist não encontrada:', playlistId, 'Playlists disponíveis:', prev.map(p => p.id));
        return prev;
      }
      
      const playlist = prev[playlistIndex];
      console.log('[removeTrackFromPlaylist] Playlist encontrada:', {
        id: playlist.id,
        name: playlist.name,
        tracksCount: playlist.tracks.length,
        trackNames: playlist.tracks.map(t => ({ name: t.name, title: t.title }))
      });
      
      // Filtrar a track - comparar principalmente por name (que é o identificador principal)
      const beforeCount = playlist.tracks.length;
      const filteredTracks = playlist.tracks.filter(t => {
        // Comparar primeiro por name (identificador principal) - comparação exata
        const matches = t.name === trackName;
        if (matches) {
          console.log('[removeTrackFromPlaylist] Track encontrada e será removida:', { 
            trackName: t.name, 
            searchedName: trackName,
            match: true 
          });
        }
        return !matches; // Manter apenas tracks que NÃO correspondem
      });
      
      const afterCount = filteredTracks.length;
      const removedCount = beforeCount - afterCount;
      
      console.log('[removeTrackFromPlaylist] Resultado da filtragem:', {
        beforeCount,
        afterCount,
        removedCount,
        trackNameProcurado: trackName
      });
      
      // Se não removeu nada, ainda assim retornar um novo estado para forçar re-render
      // (mas só se realmente não encontrou nada)
      if (removedCount === 0) {
        console.warn('[removeTrackFromPlaylist] Nenhuma track foi removida. TrackName procurado:', trackName);
        // Retornar novo array mesmo assim para garantir que o React detecte a mudança
        return prev.map((p, idx) => 
          idx === playlistIndex 
            ? { ...p, updatedAt: Date.now() } // Forçar atualização mesmo sem mudança
            : p
        );
      }
      
      // Criar novo array com a playlist atualizada
      const updated = prev.map((p, idx) => {
        if (idx === playlistIndex) {
          return {
            ...p,
            tracks: filteredTracks,
            updatedAt: Date.now()
          };
        }
        return p;
      });
      
      console.log('[removeTrackFromPlaylist] Estado atualizado com sucesso. Nova contagem:', {
        playlistId,
        tracksCount: updated[playlistIndex].tracks.length
      });
      
      return updated;
    });
  }, []);

  // Verificar se track está em uma playlist específica
  const isTrackInPlaylist = useCallback((playlistId: string, trackName: string) => {
    const playlist = playlists.find(p => p.id === playlistId);
    return playlist ? playlist.tracks.some(t => t.name === trackName) : false;
  }, [playlists]);

  // Funções de compatibilidade (usam a playlist atual)
  const tracks = currentPlaylist?.tracks || [];
  
  const addTrack = useCallback((track: QuickPlaylistTrack, playlistId?: string) => {
    const targetId = playlistId || currentPlaylistId;
    addTrackToPlaylist(targetId, track);
  }, [currentPlaylistId, addTrackToPlaylist]);

  const removeTrack = useCallback((trackName: string, playlistId?: string) => {
    const targetId = playlistId || currentPlaylistId;
    console.log('[removeTrack] Chamado:', { trackName, playlistId, targetId, currentPlaylistId });
    removeTrackFromPlaylist(targetId, trackName);
  }, [currentPlaylistId, removeTrackFromPlaylist]);

  const isInPlaylist = useCallback((trackName: string, playlistId?: string) => {
    const targetId = playlistId || currentPlaylistId;
    return isTrackInPlaylist(targetId, trackName);
  }, [currentPlaylistId, isTrackInPlaylist]);

  const toggleTrack = useCallback((track: QuickPlaylistTrack, playlistId?: string) => {
    const targetId = playlistId || currentPlaylistId;
    const isIn = isTrackInPlaylist(targetId, track.name);
    if (isIn) {
      removeTrackFromPlaylist(targetId, track.name);
    } else {
      addTrackToPlaylist(targetId, track);
    }
  }, [currentPlaylistId, isTrackInPlaylist, addTrackToPlaylist, removeTrackFromPlaylist]);

  const clearPlaylist = useCallback((playlistId?: string) => {
    const targetId = playlistId || currentPlaylistId;
    updatePlaylist(targetId, { tracks: [] });
  }, [currentPlaylistId, updatePlaylist]);

  const count = useMemo(() => tracks.length, [tracks]);

  const contextValue = useMemo(() => ({
    tracks,
    addTrack,
    removeTrack,
    isInPlaylist,
    toggleTrack,
    clearPlaylist,
    count,
    playlists,
    currentPlaylistId,
    setCurrentPlaylistId,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    getPlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    isTrackInPlaylist
  }), [
    tracks,
    addTrack,
    removeTrack,
    isInPlaylist,
    toggleTrack,
    clearPlaylist,
    count,
    playlists,
    currentPlaylistId,
    setCurrentPlaylistId,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    getPlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    isTrackInPlaylist
  ]);

  return (
    <QuickPlaylistContext.Provider value={contextValue}>
      {children}
    </QuickPlaylistContext.Provider>
  );
}

export function useQuickPlaylist() {
  const context = useContext(QuickPlaylistContext);
  if (context === undefined) {
    throw new Error('useQuickPlaylist must be used within a QuickPlaylistProvider');
  }
  return context;
}
