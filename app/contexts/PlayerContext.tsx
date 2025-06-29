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
  const [playerState, setPlayerState] = useState<PlayerState>(() => {
    let initialVolume = 1;
    let initialCurrentFile = null;
    let initialCurrentTime = 0;

    if (typeof window !== 'undefined') {
      const savedVolume = localStorage.getItem('audioPlayerVolume');
      if (savedVolume !== null) {
        const parsedVolume = parseFloat(savedVolume);
        if (!isNaN(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 1) {
          initialVolume = parsedVolume;
        }
      }

      const savedCurrentFile = localStorage.getItem('audioPlayerCurrentFile');
      if (savedCurrentFile) {
        try {
          initialCurrentFile = JSON.parse(savedCurrentFile);
        } catch (error) {
          console.error('Erro ao carregar música atual do localStorage:', error);
        }
      }

      // Progresso por música
      if (initialCurrentFile && initialCurrentFile.name) {
        const savedCurrentTime = localStorage.getItem('audioPlayerCurrentTime_' + initialCurrentFile.name);
        if (savedCurrentTime) {
          const parsedTime = parseFloat(savedCurrentTime);
          if (!isNaN(parsedTime) && parsedTime >= 0) {
            initialCurrentTime = parsedTime;
          }
        }
      }
    }

    return {
      isPlaying: false,
      currentTime: initialCurrentTime,
      duration: 0,
      isReady: false,
      isLoading: false,
      error: null,
      currentFile: initialCurrentFile,
      volume: initialVolume,
      isMuted: false
    };
  });

  const updatePlayerState = (state: Partial<PlayerState> | ((prev: PlayerState) => Partial<PlayerState>)) => {
    if (typeof state === 'function') {
      setPlayerState(prev => {
        const partial = state(prev);
        let newState = { ...prev, ...partial };

        // Se mudou de música, zera o progresso, senão mantém
        if (partial.currentFile && partial.currentFile !== prev.currentFile) {
          newState.currentTime = 0;
        } else if (partial.currentTime !== undefined) {
          // Mantém o currentTime se foi explicitamente definido
          newState.currentTime = partial.currentTime;
        }

        // Salva no localStorage
        if (typeof window !== 'undefined') {
          if (newState.currentFile) {
            localStorage.setItem('audioPlayerCurrentFile', JSON.stringify(newState.currentFile));
            // Salva progresso por música
            localStorage.setItem('audioPlayerCurrentTime_' + newState.currentFile.name, newState.currentTime.toString());
          } else {
            localStorage.removeItem('audioPlayerCurrentFile');
          }
        }
        return newState;
      });
    } else {
      setPlayerState(prev => {
        let newState = { ...prev, ...state };
        // Se mudou de música, zera o progresso, senão mantém
        if (state.currentFile && state.currentFile !== prev.currentFile) {
          newState.currentTime = 0;
        } else if (state.currentTime !== undefined) {
          // Mantém o currentTime se foi explicitamente definido
          newState.currentTime = state.currentTime;
        }
        // Salva no localStorage
        if (typeof window !== 'undefined') {
          if (newState.currentFile) {
            localStorage.setItem('audioPlayerCurrentFile', JSON.stringify(newState.currentFile));
            // Salva progresso por música
            localStorage.setItem('audioPlayerCurrentTime_' + newState.currentFile.name, newState.currentTime.toString());
          } else {
            localStorage.removeItem('audioPlayerCurrentFile');
          }
        }
        return newState;
      });
    }
  };

  const setVolume = (volume: number) => {
    updatePlayerState({ volume });
  };

  const setIsMuted = (muted: boolean) => {
    updatePlayerState({ isMuted: muted });
  };

  const play = useCallback((file: FileInfo) => {
    console.log('🎵 [PlayerContext] play() chamado para:', file.displayName);
    // Sempre zera o progresso ao tocar uma nova música
    updatePlayerState(prev => {
      if (prev.currentFile?.name === file.name && prev.isPlaying) {
        console.log('🎵 [PlayerContext] Mesma música já está tocando, ignorando');
        return {}; // Não atualiza se já está tocando o mesmo arquivo
      }
      console.log('🎵 [PlayerContext] Atualizando estado para nova música');
      return {
        currentFile: file,
        isPlaying: true,
        isLoading: true,
        isReady: false,
        error: null,
        currentTime: 0 // Zera o progresso
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