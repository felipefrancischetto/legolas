'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

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
  downloadedAt?: string;
  metadata?: {
    album?: string;
    ano?: string;
    genero?: string;
    descricao?: string;
  };
  label?: string;
}

interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  currentFile: FileInfo | null;
  volume: number;
  isMuted: boolean;
}

interface PlayerContextType {
  playerState: PlayerState;
  setPlayerState: (state: Partial<PlayerState> | ((prev: PlayerState) => Partial<PlayerState>)) => void;
  play: (file: FileInfo) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  setIsMuted: (muted: boolean) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isReady: false,
    isLoading: false,
    error: null,
    currentFile: null,
    volume: 1,
    isMuted: false
  });

  const updatePlayerState = (state: Partial<PlayerState> | ((prev: PlayerState) => Partial<PlayerState>)) => {
    if (typeof state === 'function') {
      setPlayerState(prev => ({ ...prev, ...state(prev) }));
    } else {
      setPlayerState(prev => ({ ...prev, ...state }));
    }
  };

  const setVolume = (volume: number) => {
    updatePlayerState({ volume });
  };

  const setIsMuted = (muted: boolean) => {
    updatePlayerState({ isMuted: muted });
  };

  const play = useCallback((file: FileInfo) => {
    // Evita re-render se for o mesmo arquivo
    updatePlayerState(prev => {
      if (prev.currentFile?.name === file.name && prev.isPlaying) {
        return {}; // Não atualiza se já está tocando o mesmo arquivo
      }
      return {
        currentFile: file,
        isPlaying: true,
        isLoading: true,
        isReady: false,
        error: null
      };
    });
  }, []);

  const pause = useCallback(() => {
    updatePlayerState({ isPlaying: false });
  }, []);

  const resume = useCallback(() => {
    updatePlayerState({ isPlaying: true });
  }, []);

  const stop = useCallback(() => {
    updatePlayerState({
      isPlaying: false,
      currentTime: 0,
      currentFile: null,
      isReady: false,
      isLoading: false
    });
  }, []);

  const seek = useCallback((time: number) => {
    updatePlayerState({ currentTime: time });
  }, []);

  return (
    <PlayerContext.Provider value={{
      playerState,
      setPlayerState: updatePlayerState,
      play,
      pause,
      resume,
      stop,
      seek,
      setVolume,
      setIsMuted
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
} 