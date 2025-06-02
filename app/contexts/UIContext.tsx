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
  const initialWidths = [32, 48, 200, 80, 120, 60, 60, 100, 100, 80, 120];
  const [colWidths, setColWidths] = useState<number[]>(initialWidths);

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
      setColWidths
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