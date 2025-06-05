'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

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
  
  // 10 colunas: #, Thumbnail, Título, Duração, Artista, BPM, Key, Gênero, Álbum, Label
  const defaultWidths = [50, 50, 250, 80, 150, 70, 70, 120, 150, 120];
  
  const [colWidths, setColWidths] = useState<number[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('columnWidths');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Verificar se o array tem o tamanho correto
          if (Array.isArray(parsed) && parsed.length === defaultWidths.length) {
            return parsed;
          }
        } catch (e) {
          console.warn('Erro ao carregar larguras das colunas salvas:', e);
        }
      }
    }
    return defaultWidths;
  });

  // Salvar larguras no localStorage quando alteradas
  const handleSetColWidths = (widths: number[]) => {
    setColWidths(widths);
    if (typeof window !== 'undefined') {
      localStorage.setItem('columnWidths', JSON.stringify(widths));
    }
  };

  return (
    <UIContext.Provider value={{
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
      playerReady,
      setPlayerReady,
      actionMenu,
      setActionMenu,
      colWidths,
      setColWidths: handleSetColWidths
    }}>
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