'use client';

import { createContext, useContext, useState, ReactNode, useCallback, useMemo, useEffect } from 'react';

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

  // Carregar valores do localStorage após montagem para evitar problemas de hidratação
  useEffect(() => {
    // Carregar playerOpen
    const savedPlayerOpen = localStorage.getItem('playerOpen');
    if (savedPlayerOpen === 'true') {
      setPlayerOpen(true);
    }
    
    // Carregar larguras das colunas
    const savedColWidths = localStorage.getItem('columnWidths');
    if (savedColWidths) {
      try {
        const parsed = JSON.parse(savedColWidths);
        if (Array.isArray(parsed) && parsed.length === defaultWidths.length) {
          setColWidths(parsed);
        }
      } catch (e) {
        console.warn('Erro ao carregar larguras das colunas salvas:', e);
      }
    }
  }, []);

  // Memoizar funções para evitar re-renders
  const handleSetColWidths = useCallback((widths: number[]) => {
    setColWidths(widths);
    if (typeof window !== 'undefined') {
      localStorage.setItem('columnWidths', JSON.stringify(widths));
    }
  }, []);

  const handleSetPlayerOpen = useCallback((open: boolean) => {
    setPlayerOpen(open);
    if (typeof window !== 'undefined') {
      localStorage.setItem('playerOpen', open.toString());
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