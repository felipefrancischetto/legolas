'use client';

import { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';

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
    // Inicialização otimizada apenas uma vez
    if (typeof window === 'undefined') {
      return {
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        isReady: false,
        isLoading: false,
        error: null,
        currentFile: null,
        volume: 1,
        isMuted: false
      };
    }

    let initialVolume = 1;
    let initialCurrentFile = null;
    let initialCurrentTime = 0;

    try {
      const savedVolume = localStorage.getItem('audioPlayerVolume');
      if (savedVolume !== null) {
        const parsedVolume = parseFloat(savedVolume);
        if (!isNaN(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 1) {
          initialVolume = parsedVolume;
        }
      }

      const savedCurrentFile = localStorage.getItem('audioPlayerCurrentFile');
      if (savedCurrentFile) {
        initialCurrentFile = JSON.parse(savedCurrentFile);
      }

      if (initialCurrentFile && initialCurrentFile.name) {
        const savedCurrentTime = localStorage.getItem('audioPlayerCurrentTime_' + initialCurrentFile.name);
        if (savedCurrentTime) {
          const parsedTime = parseFloat(savedCurrentTime);
          if (!isNaN(parsedTime) && parsedTime >= 0) {
            initialCurrentTime = parsedTime;
            console.log('🔄 [PlayerContext] Progresso restaurado do localStorage:', parsedTime, 'para:', initialCurrentFile.name);
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar estado do player do localStorage:', error);
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

  // Função otimizada para atualizar estado com menos re-renders
  const updatePlayerState = useCallback((state: Partial<PlayerState> | ((prev: PlayerState) => Partial<PlayerState>)) => {
    setPlayerState(prev => {
      const partial = typeof state === 'function' ? state(prev) : state;
      const newState = { ...prev, ...partial };

      // Otimização: só atualiza se realmente mudou
      let hasChanged = false;
      for (const key in partial) {
        if (prev[key as keyof PlayerState] !== newState[key as keyof PlayerState]) {
          hasChanged = true;
          break;
        }
      }

      if (!hasChanged) return prev;

      // Se mudou de música, zera o progresso, senão mantém
      if (partial.currentFile && partial.currentFile !== prev.currentFile) {
        // Nova música - verificar se há progresso salvo no localStorage
        try {
          const savedTime = localStorage.getItem('audioPlayerCurrentTime_' + partial.currentFile.name);
          if (savedTime) {
            const parsedTime = parseFloat(savedTime);
            if (!isNaN(parsedTime) && parsedTime >= 0) {
              newState.currentTime = parsedTime;
              console.log('🔄 [PlayerContext] Progresso restaurado para nova música:', parsedTime);
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

             // Salva no localStorage de forma otimizada com throttling
       if (typeof window !== 'undefined') {
         const saveToStorage = () => {
           try {
             if (newState.currentFile) {
               localStorage.setItem('audioPlayerCurrentFile', JSON.stringify(newState.currentFile));
               
               // Só salva o progresso se houver mudança significativa (evita spam)
               const currentTimeChanged = Math.abs(newState.currentTime - prev.currentTime) > 0.5;
               if (currentTimeChanged || partial.currentFile !== prev.currentFile) {
                 localStorage.setItem('audioPlayerCurrentTime_' + newState.currentFile.name, newState.currentTime.toString());
                 console.log('💾 [PlayerContext] Progresso salvo:', newState.currentTime, 'para:', newState.currentFile.name);
               }
             } else {
               localStorage.removeItem('audioPlayerCurrentFile');
             }
             
             if (newState.volume !== prev.volume) {
               localStorage.setItem('audioPlayerVolume', newState.volume.toString());
             }
           } catch (error) {
             console.warn('Erro ao salvar no localStorage:', error);
           }
         };

         // Usar requestIdleCallback se disponível, senão setTimeout
         if (typeof requestIdleCallback !== 'undefined') {
           requestIdleCallback(saveToStorage);
         } else {
           setTimeout(saveToStorage, 0);
         }
       }

      return newState;
    });
  }, []);

  // Callbacks memoizados para evitar re-renders
  const setVolume = useCallback((volume: number) => {
    updatePlayerState({ volume });
  }, [updatePlayerState]);

  const setIsMuted = useCallback((muted: boolean) => {
    updatePlayerState({ isMuted: muted });
  }, [updatePlayerState]);

  const play = useCallback((file: FileInfo) => {
    console.log('🎵 [PlayerContext] play() chamado para:', file.displayName);
    updatePlayerState(prev => {
      if (prev.currentFile?.name === file.name && prev.isPlaying) {
        console.log('🎵 [PlayerContext] Mesma música já está tocando, ignorando');
        return {};
      }
      
      const isNewFile = prev.currentFile?.name !== file.name;
      
      if (isNewFile) {
        console.log('🎵 [PlayerContext] Nova música - carregando do início');
        return {
          currentFile: file,
          isPlaying: true,
          isLoading: true,
          isReady: false,
          error: null,
          currentTime: 0 // Zerar apenas para nova música
        };
      } else {
        console.log('🎵 [PlayerContext] Mesma música - apenas alterando estado de reprodução');
        return {
          isPlaying: true,
          // Manter currentTime atual se for a mesma música
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