'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode, useRef } from 'react';
import { safeSetItem, safeGetItem, safeRemoveItem } from '../utils/localStorage';

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
  // Refs para controlar throttling e evitar loops
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedState = useRef<PlayerState | null>(null);
  const lastSaveTime = useRef<number>(0);
  
  // Inicializar com valores padrão para evitar hydration mismatch
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

  // Carregar estado do localStorage apenas no cliente após montagem
  useEffect(() => {
    let initialVolume = 1;
    let initialCurrentFile = null;
    let initialCurrentTime = 0;

    try {
      const savedVolume = safeGetItem<string>('audioPlayerVolume');
      if (savedVolume !== null) {
        const parsedVolume = parseFloat(savedVolume);
        if (!isNaN(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 1) {
          initialVolume = parsedVolume;
        }
      }

      const savedCurrentFile = safeGetItem<any>('audioPlayerCurrentFile');
      if (savedCurrentFile) {
        initialCurrentFile = savedCurrentFile;
      }

      if (initialCurrentFile && initialCurrentFile.name) {
        const savedCurrentTime = safeGetItem<string>('audioPlayerCurrentTime_' + initialCurrentFile.name);
        if (savedCurrentTime) {
          const parsedTime = parseFloat(savedCurrentTime);
          if (!isNaN(parsedTime) && parsedTime >= 0) {
            initialCurrentTime = parsedTime;
          }
        }
      }

      // Atualizar estado apenas se houver valores salvos diferentes dos padrões
      if (initialVolume !== 1 || initialCurrentFile !== null || initialCurrentTime !== 0) {
        setPlayerState(prev => ({
          ...prev,
          volume: initialVolume,
          currentFile: initialCurrentFile,
          currentTime: initialCurrentTime
        }));
      }
    } catch (error) {
      console.error('Erro ao carregar estado do player do localStorage:', error);
    }
  }, []); // Executar apenas uma vez após montagem

  // Função otimizada para salvar no localStorage com throttling melhorado
  const saveToLocalStorage = useCallback((newState: PlayerState) => {
    if (typeof window === 'undefined') return;

    // Evitar salvar o mesmo estado novamente
    if (lastSavedState.current && 
        lastSavedState.current.currentFile?.name === newState.currentFile?.name &&
        Math.abs(lastSavedState.current.currentTime - newState.currentTime) < 1 &&
        lastSavedState.current.volume === newState.volume) {
      return;
    }

    // Limpar timeout anterior
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounce para evitar salvamento excessivo
    saveTimeoutRef.current = setTimeout(() => {
      try {
        if (newState.currentFile) {
          // Otimizar arquivo: remover campos grandes desnecessários
          const optimizedFile = {
            name: newState.currentFile.name,
            displayName: newState.currentFile.displayName,
            path: newState.currentFile.path,
            title: newState.currentFile.title,
            artist: newState.currentFile.artist,
            duration: newState.currentFile.duration
            // Não salvar thumbnail, metadata completo, etc.
          };
          
          const lastSavedFile = safeGetItem('audioPlayerCurrentFile');
          const currentFileJson = JSON.stringify(optimizedFile);
          const lastSavedFileJson = lastSavedFile ? JSON.stringify(lastSavedFile) : null;
          
          if (currentFileJson !== lastSavedFileJson) {
            safeSetItem('audioPlayerCurrentFile', optimizedFile, {
              maxSize: 100 * 1024, // 100KB máximo para arquivo
              onError: (err) => {
                console.warn('⚠️ Erro ao salvar arquivo do player:', err.message);
              }
            });
          }
          
          // Salvar tempo atual com throttling
          const now = Date.now();
          const timeDiff = Math.abs(newState.currentTime - lastSaveTime.current);
          
          if (timeDiff > 2 || now - lastSaveTime.current > 10000) {
            const timeKey = 'audioPlayerCurrentTime_' + newState.currentFile.name;
            safeSetItem(timeKey, newState.currentTime.toString(), {
              maxSize: 1024 // 1KB máximo para tempo
            });
            lastSaveTime.current = newState.currentTime;
          }
        } else {
          safeRemoveItem('audioPlayerCurrentFile');
        }
        
        // Salvar volume apenas se mudou
        const currentVolume = safeGetItem<string>('audioPlayerVolume');
        if (currentVolume !== newState.volume.toString()) {
          safeSetItem('audioPlayerVolume', newState.volume.toString(), {
            maxSize: 1024 // 1KB máximo para volume
          });
        }
        
        // Atualizar estado salvo
        lastSavedState.current = { ...newState };
        
      } catch (error) {
        console.warn('Erro ao salvar no localStorage:', error);
      }
    }, 2000); // Debounce aumentado para 2 segundos
  }, []);

  // Função otimizada para atualizar estado com menos re-renders
  const updatePlayerState = useCallback((state: Partial<PlayerState> | ((prev: PlayerState) => Partial<PlayerState>)) => {
    setPlayerState(prev => {
      const partial = typeof state === 'function' ? state(prev) : state;
      
      // Otimização: só atualiza se realmente mudou
      let hasChanged = false;
      const newState = { ...prev };
      
      for (const key in partial) {
        const newValue = partial[key as keyof PlayerState];
        const prevValue = prev[key as keyof PlayerState];
        
        // Comparação mais precisa para currentTime
        if (key === 'currentTime') {
          if (Math.abs((newValue as number) - (prevValue as number)) > 0.1) {
            hasChanged = true;
            (newState as any)[key] = newValue;
          }
        } else if (newValue !== prevValue) {
          hasChanged = true;
          (newState as any)[key] = newValue;
        }
      }

      if (!hasChanged) return prev;

      // Se mudou de música, verificar progresso salvo
      if (partial.currentFile && partial.currentFile !== prev.currentFile) {
        try {
          const savedTime = safeGetItem<string>('audioPlayerCurrentTime_' + partial.currentFile.name);
          if (savedTime) {
            const parsedTime = parseFloat(savedTime);
            if (!isNaN(parsedTime) && parsedTime >= 0) {
              newState.currentTime = parsedTime;
            } else {
              newState.currentTime = 0;
            }
          } else {
            newState.currentTime = 0;
          }
        } catch (error) {
          console.warn('Erro ao restaurar progresso:', error);
          newState.currentTime = 0;
        }
      }

      return newState;
    });
  }, []);

  // Efeito para salvar no localStorage apenas quando necessário
  useEffect(() => {
    // Evitar salvar durante o carregamento inicial
    if (playerState.isLoading && !playerState.currentFile) return;
    
    saveToLocalStorage(playerState);
  }, [playerState.currentFile?.name, playerState.volume, saveToLocalStorage]);

  // Efeito separado para salvar currentTime com throttling
  useEffect(() => {
    if (!playerState.currentFile || playerState.isLoading) return;
    
    const now = Date.now();
    if (now - lastSaveTime.current > 5000) { // Salvar a cada 5 segundos
      saveToLocalStorage(playerState);
    }
  }, [Math.floor(playerState.currentTime), playerState.currentFile?.name, saveToLocalStorage]);

  // Callbacks memoizados para evitar re-renders
  const play = useCallback((file: FileInfo) => {
    updatePlayerState(prev => {
      if (prev.currentFile?.name === file.name && prev.isPlaying) {
        return {};
      }
      
      const isNewFile = prev.currentFile?.name !== file.name;
      
      if (isNewFile) {
        return {
          currentFile: file,
          isPlaying: true,
          isLoading: true,
          isReady: false,
          error: null,
          currentTime: 0
        };
      } else {
        return {
          isPlaying: true,
        };
      }
    });
  }, [updatePlayerState]);

  const pause = useCallback(() => {
    updatePlayerState({ isPlaying: false });
  }, [updatePlayerState]);

  const resume = useCallback(() => {
    updatePlayerState({ isPlaying: true });
  }, [updatePlayerState]);

  const stop = useCallback(() => {
    updatePlayerState({
      isPlaying: false,
      currentTime: 0,
      currentFile: null,
      isReady: false,
      isLoading: false
    });
  }, [updatePlayerState]);

  const seek = useCallback((time: number) => {
    updatePlayerState({ currentTime: time });
  }, [updatePlayerState]);

  const setVolume = useCallback((volume: number) => {
    updatePlayerState({ volume });
  }, [updatePlayerState]);

  const setIsMuted = useCallback((muted: boolean) => {
    updatePlayerState({ isMuted: muted });
  }, [updatePlayerState]);

  // Memoizar o value do contexto para evitar re-renders desnecessários
  const contextValue = useMemo(() => ({
    playerState,
    setPlayerState: updatePlayerState,
    play,
    pause,
    resume,
    stop,
    seek,
    setVolume,
    setIsMuted
  }), [playerState, updatePlayerState, play, pause, resume, stop, seek, setVolume, setIsMuted]);

  return (
    <PlayerContext.Provider value={contextValue}>
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