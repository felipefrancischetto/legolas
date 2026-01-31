'use client';

import { createContext, useContext, useState, ReactNode, useCallback, useMemo, useEffect } from 'react';
import { safeSetItem, safeGetItem } from '../utils/localStorage';

interface UIContextType {
  search: string;
  setSearch: (search: string) => void;
  sortBy: string;
  setSortBy: (sortBy: string) => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: (order: 'asc' | 'desc') => void;
  groupByAlbum: boolean;
  setGroupByAlbum: (group: boolean) => void;
  showQueue: boolean;
  setShowQueue: (show: boolean) => void;
  playerOpen: boolean;
  setPlayerOpen: (open: boolean) => void;
  playerReady: boolean;
  setPlayerReady: (ready: boolean) => void;
  actionMenu: { x: number; y: number; file: any | null } | null;
  setActionMenu: (menu: { x: number; y: number; file: any | null } | null) => void;
  colWidths: number[];
  setColWidths: (widths: number[]) => void;
  playerMinimized: boolean;
  setPlayerMinimized: (minimized: boolean) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<string>('fileCreatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [groupByAlbum, setGroupByAlbum] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [actionMenu, setActionMenu] = useState<{ x: number; y: number; file: any | null } | null>(null);
  const [playerMinimized, setPlayerMinimized] = useState(false);
  
  // 10 colunas: #, Thumbnail, Título, Duração, Artista, BPM, Key, Gênero, Álbum, Label
  const defaultWidths = [50, 50, 250, 80, 150, 70, 70, 120, 150, 120, 180];
  
  const [colWidths, setColWidths] = useState<number[]>(defaultWidths);
  const [isInitialized, setIsInitialized] = useState(false);

  // Carregar valores do localStorage após montagem para evitar problemas de hidratação
  useEffect(() => {
    // Carregar playerOpen
    const savedPlayerOpen = safeGetItem<string>('playerOpen');
    if (savedPlayerOpen === 'true') {
      setPlayerOpen(true);
    }
    
    // Carregar larguras das colunas
    const savedColWidths = safeGetItem<number[]>('columnWidths');
    if (savedColWidths && Array.isArray(savedColWidths) && savedColWidths.length === defaultWidths.length) {
      setColWidths(savedColWidths);
    }

    // Carregar outros estados da UI
    try {
      const savedSearch = safeGetItem<string>('uiSearch');
      if (savedSearch !== null) {
        setSearch(savedSearch);
      }

      const savedSortBy = safeGetItem<string>('uiSortBy');
      if (savedSortBy) {
        setSortBy(savedSortBy);
      }

      const savedSortOrder = safeGetItem<string>('uiSortOrder');
      if (savedSortOrder === 'asc' || savedSortOrder === 'desc') {
        setSortOrder(savedSortOrder as 'asc' | 'desc');
      }

      const savedGroupByAlbum = safeGetItem<string>('uiGroupByAlbum');
      if (savedGroupByAlbum === 'true') {
        setGroupByAlbum(true);
      }

      const savedShowQueue = safeGetItem<string>('uiShowQueue');
      if (savedShowQueue === 'true') {
        setShowQueue(true);
      }

      const savedPlayerMinimized = safeGetItem<string>('playerMinimized');
      if (savedPlayerMinimized === 'true') {
        setPlayerMinimized(true);
      }
    } catch (e) {
      console.warn('Erro ao carregar estados da UI:', e);
    }
    
    setIsInitialized(true);
  }, []);

  // Salvar estados no localStorage quando mudarem (após inicialização)
  // Usar debounce para evitar salvamentos excessivos e rebuilds
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') return;
    
    const timeoutId = setTimeout(() => {
      try {
        safeSetItem('uiSearch', search, { maxSize: 10 * 1024 }); // 10KB máximo
        safeSetItem('uiSortBy', sortBy, { maxSize: 1024 });
        safeSetItem('uiSortOrder', sortOrder, { maxSize: 1024 });
        safeSetItem('uiGroupByAlbum', groupByAlbum.toString(), { maxSize: 1024 });
        safeSetItem('uiShowQueue', showQueue.toString(), { maxSize: 1024 });
        safeSetItem('playerMinimized', playerMinimized.toString(), { maxSize: 1024 });
      } catch (e) {
        console.warn('Erro ao salvar estados da UI:', e);
      }
    }, 300); // Debounce de 300ms
    
    return () => clearTimeout(timeoutId);
  }, [search, sortBy, sortOrder, groupByAlbum, showQueue, playerMinimized, isInitialized]);

  // Memoizar funções para evitar re-renders
  const handleSetColWidths = useCallback((widths: number[]) => {
    setColWidths(widths);
    if (typeof window !== 'undefined') {
      safeSetItem('columnWidths', widths, { maxSize: 1024 });
    }
  }, []);

  const handleSetPlayerOpen = useCallback((open: boolean) => {
    setPlayerOpen(open);
    if (typeof window !== 'undefined') {
      safeSetItem('playerOpen', open.toString(), { maxSize: 1024 });
    }
  }, []);

  // Memoizar o context value para evitar re-renders desnecessários
  const contextValue = useMemo(() => ({
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
    setPlayerOpen: handleSetPlayerOpen,
    playerReady,
    setPlayerReady,
    actionMenu,
    setActionMenu,
    colWidths,
    setColWidths: handleSetColWidths,
    playerMinimized,
    setPlayerMinimized
  }), [
    search,
    sortBy,
    sortOrder,
    groupByAlbum,
    showQueue,
    playerOpen,
    playerReady,
    actionMenu,
    colWidths,
    playerMinimized,
    handleSetPlayerOpen,
    handleSetColWidths
  ]);

  return (
    <UIContext.Provider value={contextValue}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
} 