'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import WaveSurfer from 'wavesurfer.js';
import { usePlayer } from '../contexts/PlayerContext';
import { useUI } from '../contexts/UIContext';
import { getThumbnailUrl } from '../utils/thumbnailCache';
import { getCachedDominantColor } from '../utils/colorExtractor';
import { useFile } from '../contexts/FileContext';
import { useSettings } from '../hooks/useSettings';
import { useQuickPlaylist } from '../contexts/QuickPlaylistContext';
import AlbumModal from './AlbumModal';
import MusicStudyModal from './MusicStudyModal';
import LoadingSpinner from './LoadingSpinner';
import { SkeletonAudioPlayer } from './SkeletonComponents';
import { logger } from '../utils/logger';


export default function AudioPlayer() {
  const waveformDesktopRef = useRef<HTMLDivElement>(null);
  const waveformMobileRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isSeekingRef = useRef(false);
  const lastProgressUpdateTime = useRef(0);
  const isDraggingRef = useRef(false);
  
  const [isMobile, setIsMobile] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [showMusicStudyModal, setShowMusicStudyModal] = useState(false);
  const [playerDominantColor, setPlayerDominantColor] = useState('rgba(16, 185, 129, 0.2)');
  const [isWaveReady, setIsWaveReady] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const lastInitializedFile = useRef<string | null>(null);
  const isInitializing = useRef(false); // Para evitar múltiplas inicializações simultâneas
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Para debounce
  const isNavigatingRef = useRef(false); // Flag para indicar navegação (next/prev)
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Timeout para resetar flag de navegação
  const isHandlingEndedRef = useRef(false); // Flag para evitar múltiplas chamadas de handleEnded
  const isPlayingRef = useRef(false); // Ref para isPlaying para evitar dependências
  const currentTimeRef = useRef(0); // Ref para currentTime para evitar dependências
  const lastPlayerMinimizedRef = useRef<boolean | null>(null); // Ref para rastrear mudanças de playerMinimized

  const { playerState, setPlayerState, pause, resume, setVolume, setIsMuted, play } = usePlayer();
  const { setPlayerOpen, playerMinimized, setPlayerMinimized } = useUI();
  const { files } = useFile();
  
  const filesRef = useRef(files); // Ref para files
  const playRef = useRef(play); // Ref para função play
  
  // Atualizar refs quando valores mudam
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  
  useEffect(() => {
    playRef.current = play;
  }, [play]);
  const { settings } = useSettings();
  const { isInPlaylist, toggleTrack } = useQuickPlaylist();

  // Memoize valores para evitar re-renders desnecessários
  const currentFile = playerState.currentFile;
  const isPlaying = playerState.isPlaying;
  const currentTime = playerState.currentTime;
  const duration = playerState.duration;
  const isLoading = playerState.isLoading;
  const isReady = playerState.isReady;
  const error = playerState.error;
  
  // Estado local para volume durante interação (evita re-renders)
  const [localVolume, setLocalVolume] = useState(playerState.volume);
  const [localIsMuted, setLocalIsMuted] = useState(playerState.isMuted);
  
  // Refs para volume para evitar dependências em useEffects críticos
  const localVolumeRef = useRef(playerState.volume);
  const localIsMutedRef = useRef(playerState.isMuted);
  
  // Usar valores locais para renderização
  const volume = localVolume;
  const isMuted = localIsMuted;
  
  // Atualizar refs quando estado local muda
  useEffect(() => {
    localVolumeRef.current = localVolume;
  }, [localVolume]);
  
  useEffect(() => {
    localIsMutedRef.current = localIsMuted;
  }, [localIsMuted]);

  // Atualizar refs quando valores mudam
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Funções de navegação otimizadas
  const handleNext = useCallback(() => {
    if (!currentFile || isNavigatingRef.current) {
      logger.debug('⚠️ handleNext ignorado:', { 
        hasCurrentFile: !!currentFile, 
        isNavigating: isNavigatingRef.current 
      });
      return; // Prevenir múltiplos cliques
    }
    
    const currentIndex = files.findIndex(f => f.name === currentFile.name);
    if (currentIndex >= 0 && currentIndex < files.length - 1) {
      const nextFile = files[currentIndex + 1];
      logger.debug('▶️ Próxima música:', nextFile.displayName);
      
      // Marcar como navegação para resetar tempo
      isNavigatingRef.current = true;
      
      // Pausar e limpar áudio atual antes de trocar
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      
      // Resetar flag de handleEnded também
      isHandlingEndedRef.current = false;
      
      // Limpar timeout anterior se existir
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
      
      // Resetar flag após um tempo
      navigationTimeoutRef.current = setTimeout(() => {
        isNavigatingRef.current = false;
      }, 1500);
      
      // Chamar play com resetTime=true para não restaurar progresso
      // E garantir que isPlaying seja true para auto-play funcionar
      play(nextFile, true);
    } else {
      logger.debug('ℹ️ Não há próxima música disponível');
    }
  }, [currentFile, files, play]);

  const handlePrev = useCallback(() => {
    if (!currentFile || isNavigatingRef.current) {
      logger.debug('⚠️ handlePrev ignorado:', { 
        hasCurrentFile: !!currentFile, 
        isNavigating: isNavigatingRef.current 
      });
      return; // Prevenir múltiplos cliques
    }
    
    const currentIndex = files.findIndex(f => f.name === currentFile.name);
    if (currentIndex > 0) {
      const prevFile = files[currentIndex - 1];
      logger.debug('◀️ Música anterior:', prevFile.displayName);
      
      // Marcar como navegação para resetar tempo
      isNavigatingRef.current = true;
      
      // Pausar e limpar áudio atual antes de trocar
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      
      // Resetar flag de handleEnded também
      isHandlingEndedRef.current = false;
      
      // Limpar timeout anterior se existir
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
      
      // Resetar flag após um tempo
      navigationTimeoutRef.current = setTimeout(() => {
        isNavigatingRef.current = false;
      }, 1500);
      
      // Chamar play com resetTime=true para não restaurar progresso
      // E garantir que isPlaying seja true para auto-play funcionar
      play(prevFile, true);
    } else {
      logger.debug('ℹ️ Não há música anterior disponível');
    }
  }, [currentFile, files, play]);

  // Cleanup de timeouts ao desmontar
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
      if (volumeUpdateTimeoutRef.current) {
        clearTimeout(volumeUpdateTimeoutRef.current);
      }
      isHandlingEndedRef.current = false;
      isNavigatingRef.current = false;
    };
  }, []);

  // Detectar mobile e inicializar cliente
  useEffect(() => {
    setIsClient(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Extrair cor dominante quando arquivo muda (respeitando configuração)
  useEffect(() => {
    if (!currentFile) return;
    
    const extractPlayerColor = async () => {
      // Usar cor padrão se cores dinâmicas estiverem desabilitadas
      if (settings.disableDynamicColors) {
        setPlayerDominantColor('rgba(16, 185, 129, 0.2)');
        return;
      }

      try {
        const thumbnailUrl = getThumbnailUrl(currentFile.name);
        const colorData = await getCachedDominantColor(thumbnailUrl);
        const dominantColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.2)`;
        setPlayerDominantColor(dominantColor);
      } catch (error) {
        logger.warn('Erro ao extrair cor dominante:', error);
        setPlayerDominantColor('rgba(16, 185, 129, 0.2)');
      }
    };
    
    extractPlayerColor();
  }, [currentFile?.name, settings.disableDynamicColors]);

  // Inicializar áudio nativo
  useEffect(() => {
    if (!currentFile) return;

    const audioUrl = `/api/downloads/${encodeURIComponent(currentFile.name)}`;
            // Inicializando áudio
    
    const audio = new Audio();
    audio.preload = 'metadata';
    // Usar refs para obter valores atuais sem causar re-inicialização
    audio.volume = localIsMutedRef.current ? 0 : localVolumeRef.current;
    audio.crossOrigin = 'anonymous';
    
    // Event listeners otimizados
    const handleLoadedMetadata = () => {
      logger.debug('✅ Metadados carregados');
      setPlayerState(prev => ({
        ...prev,
        duration: audio.duration || 0,
        isReady: true,
        isLoading: false,
        error: null
      }));
    };

    const handleCanPlay = () => {
      const shouldPlay = isPlayingRef.current;
      const savedTime = currentTimeRef.current;
      
      logger.debug('✅ Áudio pronto para reprodução', {
        shouldPlay,
        paused: audio.paused,
        isNavigating: isNavigatingRef.current,
        savedTime
      });
      
      // Aplicar progresso inicial salvo APENAS se não estivermos navegando
      // Quando navegamos (next/prev), o tempo deve ser 0
      if (!isNavigatingRef.current && savedTime > 0 && Math.abs(audio.currentTime - savedTime) > 1) {
        // Aplicando progresso inicial apenas se não for navegação
        audio.currentTime = savedTime;
        logger.debug('⏩ Restaurando progresso salvo:', savedTime);
      } else if (isNavigatingRef.current) {
        // Garantir que o tempo seja 0 ao navegar
        audio.currentTime = 0;
        logger.debug('🔄 Resetando tempo para navegação');
      }
      
      // Atualizar estado apenas se necessário para evitar re-renders
      setPlayerState(prev => {
        const newCurrentTime = isNavigatingRef.current ? 0 : savedTime;
        // Só atualizar se realmente mudou algo
        if (prev.isReady && !prev.isLoading && Math.abs(prev.currentTime - newCurrentTime) < 0.1) {
          return prev; // Não atualizar se já está correto
        }
        return {
          ...prev,
          isReady: true,
          isLoading: false,
          currentTime: newCurrentTime
        };
      });
      
      // Auto-play se solicitado - garantir que realmente toque
      if (shouldPlay && audio.paused) {
        logger.debug('▶️ Tentando auto-play...');
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              logger.debug('✅ Auto-play bem-sucedido');
            })
            .catch(err => {
              logger.warn('❌ Auto-play falhou:', err);
              // Não pausar automaticamente - deixar o usuário decidir
              setPlayerState(prev => ({ ...prev, isPlaying: false }));
            });
        }
      }
    };

         const handleTimeUpdate = () => {
       // Ignorar completamente se estamos fazendo seek ou arrastando
       if (isSeekingRef.current || isDraggingRef.current) {
         return; // Sem logs para evitar spam
       }
       
       const now = Date.now();
       if (now - lastProgressUpdateTime.current < 100) return; // Throttle reduzido para 100ms para melhor sincronização
       lastProgressUpdateTime.current = now;
       
       const newTime = audio.currentTime || 0;
       
       // Só atualizar se houve mudança significativa E não estamos em seek
       setPlayerState(prev => {
         // Verificação dupla de seeking antes de atualizar
         if (isSeekingRef.current || isDraggingRef.current) {
           return prev;
         }
         
         // Só atualizar para mudanças maiores que 0.1s para melhor responsividade visual
         if (Math.abs(prev.currentTime - newTime) < 0.1) {
           return prev;
         }
         
         return { ...prev, currentTime: newTime };
       });
     };

    const handleEnded = () => {
      // Proteção contra múltiplas chamadas
      if (isHandlingEndedRef.current) {
        logger.debug('⚠️ handleEnded já está sendo processado, ignorando');
        return;
      }
      
      isHandlingEndedRef.current = true;
      logger.debug('🎵 Música terminou');
      
      // Pausar e resetar estado
      setPlayerState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
      
      // Usar setTimeout para evitar problemas de closure e usar refs para valores atualizados
      setTimeout(() => {
        // Verificar se há próxima música antes de avançar usando refs
        const currentFileName = currentFile?.name;
        if (!currentFileName) {
          isHandlingEndedRef.current = false;
          return;
        }
        
        const currentFiles = filesRef.current;
        const playFunction = playRef.current;
        
        const currentIndex = currentFiles.findIndex(f => f.name === currentFileName);
        const hasNext = currentIndex >= 0 && currentIndex < currentFiles.length - 1;
        
        if (hasNext) {
          const nextFile = currentFiles[currentIndex + 1];
          // Chamar play usando ref para evitar dependências
          playFunction(nextFile, true);
        } else {
          // Não há próxima música, apenas resetar flag
          logger.debug('ℹ️ Não há próxima música, parando reprodução');
        }
        
        isHandlingEndedRef.current = false;
      }, 300);
    };

    const handleError = (e: Event) => {
      const audioElement = e.target as HTMLAudioElement;
      const error = audioElement.error;
      
      let errorMessage = 'Erro ao carregar áudio';
      if (error) {
        switch (error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMessage = 'Reprodução cancelada';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = 'Erro de rede ao carregar áudio';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = 'Erro ao decodificar áudio';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = 'Formato de áudio não suportado ou arquivo não encontrado';
            break;
          default:
            errorMessage = `Erro ao carregar áudio (código: ${error.code})`;
        }
      }
      
      logger.error('❌ Erro no áudio:', {
        code: error?.code,
        message: errorMessage,
        url: audioUrl,
        event: e
      });
      
      setPlayerState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
        isReady: false,
        isPlaying: false
      }));
    };

    // Adicionar listeners
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    
    // Definir source e inicializar loading
    audio.src = audioUrl;
    audioRef.current = audio;
    
    // Só atualizar estado se realmente mudou para evitar re-renders
    setPlayerState(prev => {
      if (prev.isLoading && !prev.isReady && !prev.error) {
        return prev; // Já está no estado de loading correto
      }
      return { 
        ...prev, 
        isLoading: true, 
        error: null, 
        isReady: false
      };
    });
    
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, [currentFile?.name]); // Apenas arquivo atual - volume é controlado separadamente

  // Controlar reprodução/pausa
  useEffect(() => {
    if (!audioRef.current || !isReady) return;
    
    // Usar ref para evitar dependências desnecessárias
    const shouldPlay = isPlayingRef.current;
    
    if (shouldPlay && audioRef.current.paused) {
      logger.debug('▶️ Iniciando reprodução', {
        readyState: audioRef.current.readyState,
        paused: audioRef.current.paused,
        src: audioRef.current.src
      });
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            logger.debug('✅ Reprodução iniciada com sucesso');
          })
          .catch(err => {
            logger.warn('❌ Erro ao reproduzir:', err);
            setPlayerState(prev => ({ ...prev, isPlaying: false }));
          });
      }
    } else if (!shouldPlay && !audioRef.current.paused) {
      logger.debug('⏸️ Pausando reprodução');
      audioRef.current.pause();
    }
  }, [isPlaying, isReady, setPlayerState]); // Manter dependências para sincronizar com refs

  // Controlar volume do áudio usando estado local (não depende do contexto)
  // Este é o único lugar onde o volume do áudio é atualizado
  useEffect(() => {
    if (audioRef.current) {
      const newVolume = localIsMuted ? 0 : localVolume;
      // Só atualizar se realmente mudou para evitar operações desnecessárias
      if (Math.abs(audioRef.current.volume - newVolume) > 0.01) {
        audioRef.current.volume = newVolume;
      }
    }
  }, [localVolume, localIsMuted]);

  // Sincronizar WaveSurfer com progresso do áudio nativo (melhorado)
  useEffect(() => {
    if (!wavesurferRef.current || !isWaveReady || duration === 0) return;
    
    // Não sincronizar se estamos fazendo seek ou arrastando
    if (isSeekingRef.current || isDraggingRef.current) return;
    
    try {
      const percentage = currentTime / duration;
      
      // Verificar diferença atual
      const currentWavePos = wavesurferRef.current.getCurrentTime() || 0;
      const waveDuration = wavesurferRef.current.getDuration() || duration;
      const currentWavePercentage = waveDuration > 0 ? currentWavePos / waveDuration : 0;
      
      // Sincronizar com threshold menor para melhor precisão visual
      const percentageDiff = Math.abs(percentage - currentWavePercentage);
      const timeDiff = Math.abs(currentTime - currentWavePos);
      
      if (percentageDiff > 0.005 || timeDiff > 0.2) {
        wavesurferRef.current.seekTo(percentage);
      }
    } catch (error) {
      logger.warn('Erro ao sincronizar WaveSurfer:', error);
    }
  }, [currentTime, duration, isWaveReady]);

    // Inicializar WaveSurfer otimizado
  useEffect(() => {
    if (!currentFile || !isClient) return;

    // Não inicializar WaveSurfer se o player estiver minimizado (desktop)
    if (!isMobile && playerMinimized) {
      // Destruir WaveSurfer se existir quando minimizar
      if (wavesurferRef.current) {
        try {
          wavesurferRef.current.destroy();
          wavesurferRef.current = null;
          setIsWaveReady(false);
          lastInitializedFile.current = null;
        } catch (e) {
          logger.warn('Erro ao destruir WaveSurfer ao minimizar:', e);
        }
      }
      lastPlayerMinimizedRef.current = playerMinimized;
      return;
    }

    // Verificar se o player acabou de ser maximizado
    const wasMinimized = lastPlayerMinimizedRef.current === true;
    const justMaximized = wasMinimized && !playerMinimized;
    
    // Se acabou de ser maximizado, forçar reinicialização mesmo que o arquivo seja o mesmo
    if (justMaximized && wavesurferRef.current) {
      logger.debug('🔄 Player acabou de ser maximizado - destruindo WaveSurfer para reinicializar');
      try {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
        setIsWaveReady(false);
        lastInitializedFile.current = null;
      } catch (e) {
        logger.warn('Erro ao destruir WaveSurfer ao maximizar:', e);
      }
    }

    // Atualizar ref do estado de minimização
    lastPlayerMinimizedRef.current = playerMinimized;

    // Delay fixo para garantir que o container está visível
    // Delay maior quando o player é maximizado para garantir renderização completa
    let isCancelled = false;
    let timeoutId: NodeJS.Timeout | null = null;
    const delay = justMaximized ? 800 : 500;

    timeoutId = setTimeout(() => {
      if (isCancelled) return;

      // Evitar re-inicialização desnecessária apenas se o arquivo não mudou e não acabou de ser maximizado
      if (lastInitializedFile.current === currentFile.name && wavesurferRef.current && !justMaximized) {
        logger.debug('⚠️ WaveSurfer já inicializado para:', currentFile.name);
        return;
      }

      // Evitar múltiplas inicializações simultâneas
      if (isInitializing.current) {
        logger.debug('⚠️ WaveSurfer já está sendo inicializado, cancelando nova tentativa');
        return;
      }

      isInitializing.current = true;

      const initWaveSurfer = async () => {
        const containerRef = isMobile ? waveformMobileRef.current : waveformDesktopRef.current;
        if (!containerRef) {
          logger.warn('❌ Container do WaveSurfer não encontrado');
          isInitializing.current = false;
          return;
        }
        if (containerRef.offsetWidth === 0 || containerRef.offsetHeight === 0) {
          logger.warn('❌ Container do WaveSurfer não tem dimensões válidas');
          isInitializing.current = false;
          return;
        }

        // Verificar se o container tem dimensões válidas
        const rect = containerRef.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          logger.warn('❌ Container do WaveSurfer não está visível');
          return;
        }

        try {
          // Só limpar se já não estiver vazio
          if (containerRef.children.length > 0) {
            containerRef.innerHTML = '';
          }
          
          // Obter cores do tema - verificar configuração primeiro
          let waveColor = 'rgba(16, 185, 129, 0.4)';
          let progressColor = 'rgba(16, 185, 129, 0.8)';
          let cursorColor = 'rgba(16, 185, 129, 0.6)';
          
          // Só extrair cores se não estiver desabilitado
          if (!settings.disableDynamicColors) {
            try {
              const thumbnailUrl = getThumbnailUrl(currentFile.name);
              const colorData = await getCachedDominantColor(thumbnailUrl);
              waveColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.4)`;
              progressColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.8)`;
              cursorColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.6)`;
            } catch (error) {
              logger.warn('Usando cores padrão para WaveSurfer');
            }
          }

          if (isCancelled) return;

          logger.debug('🎨 Configurando WaveSurfer com cores:', { waveColor, progressColor, cursorColor });
          
          const wavesurfer = WaveSurfer.create({
            container: containerRef,
            waveColor,
            progressColor,
            cursorColor,
            height: isMobile ? 80 : 70,
            barWidth: 2,
            barGap: 1,
            barRadius: 1,
            normalize: true,
            interact: false,
            fillParent: true,
            hideScrollbar: false,
            backend: 'WebAudio',
            mediaControls: false,
            autoplay: false
          });
          
          logger.debug('✅ WaveSurfer criado:', wavesurfer);

          if (isCancelled) {
            wavesurfer.destroy();
            return;
          }

          wavesurfer.on('ready', () => {
            if (!isCancelled) {
              const duration = wavesurfer.getDuration();
              logger.debug('✅ WaveSurfer pronto - duração:', duration?.toFixed(2) + 's');
              logger.debug('✅ WaveSurfer container:', containerRef);
              logger.debug('✅ WaveSurfer canvas:', containerRef.querySelector('canvas'));
              setIsWaveReady(true);
              lastInitializedFile.current = currentFile.name;
              isInitializing.current = false;
              
              // Sincronizar com posição atual se necessário
              if (currentTime > 0 && duration > 0) {
                const initialPercentage = currentTime / duration;
                try {
                  wavesurfer.seekTo(initialPercentage);
                  logger.debug('✅ WaveSurfer sincronizado com posição:', initialPercentage);
                } catch (e) {
                  logger.warn('Erro na sincronização inicial do WaveSurfer:', e);
                }
              }
            }
          });

          wavesurfer.on('loading', (progress) => {
            if (!isCancelled) {
              logger.debug('📊 WaveSurfer carregando:', progress + '%');
            }
          });

          wavesurfer.on('decode', () => {
            if (!isCancelled) {
              logger.debug('🔍 WaveSurfer decodificando áudio...');
            }
          });

          wavesurfer.on('error', (err) => {
            if (!isCancelled) {
              logger.warn('⚠️ WaveSurfer erro:', err);
              logger.warn('⚠️ Detalhes do erro:', {
                message: err.message,
                stack: err.stack,
                container: containerRef,
                audioUrl
              });
              // Mesmo com erro, marcar como pronto para não travar a UI
              setIsWaveReady(true);
              isInitializing.current = false;
            }
          });

          // Desabilitar eventos que podem interferir com o playback
          wavesurfer.on('play', () => {
            // Não fazer nada - deixar o áudio nativo controlar
          });

          wavesurfer.on('pause', () => {
            // Não fazer nada - deixar o áudio nativo controlar
          });

          // Evitar que o WaveSurfer controle o playback
          if (wavesurfer.getMediaElement) {
            try {
              const mediaElement = wavesurfer.getMediaElement();
              if (mediaElement) {
                mediaElement.pause();
                // Desabilitar eventos de time update do media element para evitar conflitos
                mediaElement.removeAttribute('controls');
                mediaElement.muted = true;
              }
            } catch (e) {
              // Ignorar se não conseguir acessar o media element
            }
          }

          wavesurferRef.current = wavesurfer;
          
        } catch (error) {
          if (!isCancelled) {
            logger.warn('⚠️ Erro ao inicializar WaveSurfer:', error);
            setIsWaveReady(true); // Marcar como pronto mesmo com erro
            isInitializing.current = false; // Finalizar inicialização mesmo com erro
          }
        }

        // Cancelar carregamento pendente se houver
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }

        // Carregar áudio no WaveSurfer de forma assíncrona
        const audioUrl = `/api/downloads/${encodeURIComponent(currentFile.name)}`;
        
        logger.debug('📡 Preparando carregamento do WaveSurfer para:', currentFile.name);
        logger.debug('📡 URL do áudio:', audioUrl);
        
        // Testar se a URL do áudio está acessível
        fetch(audioUrl, { method: 'HEAD' })
          .then(response => {
            logger.debug('📡 Status da URL do áudio:', response.status, response.statusText);
            logger.debug('📡 Headers da resposta:', Object.fromEntries(response.headers.entries()));
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
          })
          .catch(error => {
            logger.warn('⚠️ Erro ao verificar URL do áudio:', error);
          });
        
                      // Carregar áudio imediatamente após criar o WaveSurfer
        try {
          logger.debug('🎵 Carregando WaveSurfer:', currentFile.name);
          logger.debug('🎵 WaveSurfer instance:', wavesurferRef.current);
          logger.debug('🎵 Container atual:', containerRef);
          logger.debug('🎵 URL do áudio:', audioUrl);
          
          // Verificar se o container ainda está válido
          if (containerRef && containerRef.offsetWidth > 0 && containerRef.offsetHeight > 0 && wavesurferRef.current) {
            wavesurferRef.current.load(audioUrl);
            logger.debug('🎵 Comando load enviado para WaveSurfer');
            
            // Não precisamos de timeout aqui, já temos o timeout de fallback global
            
          } else {
            logger.warn('⚠️ Container inválido no momento do carregamento');
            setIsWaveReady(true);
            isInitializing.current = false;
          }
        } catch (error) {
          logger.warn('Erro ao carregar WaveSurfer:', error);
          if (!isCancelled) {
            setIsWaveReady(true);
            isInitializing.current = false;
          }
        }
        
                  // Não precisamos mais do loadingTimeoutRef aqui
      };

      initWaveSurfer();
    }, delay);

    return () => {
      isCancelled = true;
      isInitializing.current = false; // Resetar flag de inicialização
      logger.debug('🔄 Destruindo WaveSurfer para:', currentFile?.name);
      
      // Cancelar timeouts pendentes
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      
      setIsWaveReady(false);
      lastInitializedFile.current = null;
      
      if (wavesurferRef.current) {
        try {
          wavesurferRef.current.destroy();
        } catch (e) {
          logger.warn('Erro ao destruir WaveSurfer:', e);
        }
        wavesurferRef.current = null;
      }
    };
  }, [currentFile?.name, isMobile, isClient, playerMinimized]); // Adicionado playerMinimized para reinicializar quando maximizar

  // Timeout de fallback para evitar loading infinito da wave
  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;
    
    if (!isWaveReady && currentFile) {
      logger.debug('⏰ Iniciando timeout de fallback para wave (30s)');
      timeout = setTimeout(() => {
        logger.warn('⚠️ Timeout da wave - forçando isWaveReady para true');
        setIsWaveReady(true);
      }, 30000); // 30 segundos para FLAC
    }
    
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [isWaveReady, currentFile?.name]);

  // Handlers otimizados
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [isPlaying, pause, resume]);

  // Ref para controlar volume durante arrasto sem causar re-renders
  const isDraggingVolumeRef = useRef(false);
  const volumeUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastContextVolumeRef = useRef(playerState.volume);
  const lastContextMutedRef = useRef(playerState.isMuted);

  // Sincronizar estado local com contexto quando contexto mudar externamente
  // Mas não durante arrasto para evitar conflitos
  useEffect(() => {
    if (!isDraggingVolumeRef.current) {
      // Só sincronizar se não estiver arrastando e se realmente mudou
      const volumeChanged = Math.abs(lastContextVolumeRef.current - playerState.volume) > 0.01;
      const mutedChanged = lastContextMutedRef.current !== playerState.isMuted;
      
      if (volumeChanged || mutedChanged) {
        // Atualizar refs primeiro
        lastContextVolumeRef.current = playerState.volume;
        lastContextMutedRef.current = playerState.isMuted;
        
        // Atualizar estado local usando função de atualização para evitar dependências
        if (volumeChanged) {
          setLocalVolume(prev => {
            // Só atualizar se realmente mudou
            if (Math.abs(prev - playerState.volume) > 0.01) {
              return playerState.volume;
            }
            return prev;
          });
        }
        if (mutedChanged) {
          setLocalIsMuted(prev => {
            // Só atualizar se realmente mudou
            if (prev !== playerState.isMuted) {
              return playerState.isMuted;
            }
            return prev;
          });
        }
      }
    }
  }, [playerState.volume, playerState.isMuted]);

  // Ref para os elementos de input do volume para atualização direta do DOM
  const volumeSliderVerticalRef = useRef<HTMLInputElement | null>(null);
  const volumeSliderHorizontalRef = useRef<HTMLInputElement | null>(null);
  const volumeProgressFillRef = useRef<HTMLDivElement | null>(null);

  // Cores do tema baseadas na cor dominante - mais claras e visíveis
  const themeColors = useMemo(() => {
    const baseColor = playerDominantColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (baseColor) {
      const [, r, g, b] = baseColor;
      return {
        primary: `rgb(${r}, ${g}, ${b})`,
        primaryLight: `rgba(${r}, ${g}, ${b}, 0.9)`,
        primaryDark: `rgba(${r}, ${g}, ${b}, 0.7)`,
        background: `rgba(${r}, ${g}, ${b}, 0.15)`,
        border: `rgba(${r}, ${g}, ${b}, 0.4)`
      };
    }
    return {
      primary: 'rgb(16, 185, 129)',
      primaryLight: 'rgba(16, 185, 129, 0.9)',
      primaryDark: 'rgba(16, 185, 129, 0.7)',
      background: 'rgba(16, 185, 129, 0.15)',
      border: 'rgba(16, 185, 129, 0.4)'
    };
  }, [playerDominantColor]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    const newIsMuted = newVolume === 0;
    
    // Atualizar áudio imediatamente para feedback instantâneo (sem esperar re-render)
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    
    // Atualizar estado local imediatamente (isso atualiza o input e o useEffect de volume)
    setLocalVolume(newVolume);
    setLocalIsMuted(newIsMuted);
    
    // Durante arrasto, atualizar DOM diretamente também (para performance visual)
    if (isDraggingVolumeRef.current) {
      // Atualizar barra de progresso visual diretamente
      if (volumeProgressFillRef.current) {
        volumeProgressFillRef.current.style.height = `${newVolume * 100}%`;
        volumeProgressFillRef.current.style.transition = 'none';
      }
      // Atualizar background do slider horizontal diretamente
      if (volumeSliderHorizontalRef.current) {
        const primaryColor = themeColors.primary;
        volumeSliderHorizontalRef.current.style.background = 
          `linear-gradient(to right, ${primaryColor} 0%, ${primaryColor} ${newVolume * 100}%, rgb(63, 63, 70) ${newVolume * 100}%, rgb(63, 63, 70) 100%)`;
        volumeSliderHorizontalRef.current.style.transition = 'none';
      }
      
      // Limpar timeout anterior
      if (volumeUpdateTimeoutRef.current) {
        clearTimeout(volumeUpdateTimeoutRef.current);
      }
      
      // Atualizar contexto apenas com debounce durante arrasto (evita re-renders do contexto)
      volumeUpdateTimeoutRef.current = setTimeout(() => {
        if (!isDraggingVolumeRef.current) {
          // Só atualizar se não estiver mais arrastando
          setVolume(newVolume);
          setIsMuted(newIsMuted);
          lastContextVolumeRef.current = newVolume;
          lastContextMutedRef.current = newIsMuted;
        }
      }, 300); // Debounce aumentado para 300ms durante arrasto
    } else {
      // Quando não está arrastando, atualizar contexto imediatamente
      // Limpar timeout anterior se existir
      if (volumeUpdateTimeoutRef.current) {
        clearTimeout(volumeUpdateTimeoutRef.current);
        volumeUpdateTimeoutRef.current = null;
      }
      
      // Atualizar contexto (isso pode causar re-render, mas é aceitável quando não está arrastando)
      setVolume(newVolume);
      setIsMuted(newIsMuted);
      lastContextVolumeRef.current = newVolume;
      lastContextMutedRef.current = newIsMuted;
    }
  }, [setVolume, setIsMuted, themeColors.primary]);

  const handleVolumeMouseDown = useCallback(() => {
    isDraggingVolumeRef.current = true;
  }, []);

  const handleVolumeMouseUp = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    isDraggingVolumeRef.current = false;
    
    const finalVolume = parseFloat((e.target as HTMLInputElement).value);
    const finalIsMuted = finalVolume === 0;
    
    // Limpar timeout pendente
    if (volumeUpdateTimeoutRef.current) {
      clearTimeout(volumeUpdateTimeoutRef.current);
      volumeUpdateTimeoutRef.current = null;
    }
    
    // Restaurar transições CSS
    if (volumeProgressFillRef.current) {
      volumeProgressFillRef.current.style.transition = 'height 0.1s ease';
    }
    if (volumeSliderHorizontalRef.current) {
      volumeSliderHorizontalRef.current.style.transition = 'background 0.1s ease';
    }
    
    // Garantir que estado local está sincronizado (já deve estar, mas garantir)
    setLocalVolume(finalVolume);
    setLocalIsMuted(finalIsMuted);
    
    // Atualizar contexto imediatamente quando soltar (sem debounce)
    setVolume(finalVolume);
    setIsMuted(finalIsMuted);
    lastContextVolumeRef.current = finalVolume;
    lastContextMutedRef.current = finalIsMuted;
  }, [setVolume, setIsMuted]);

  const toggleMute = useCallback(() => {
    const newMuted = !localIsMuted;
    
    // Atualizar estado local primeiro
    setLocalIsMuted(newMuted);
    
    // Atualizar áudio diretamente para feedback instantâneo
    if (audioRef.current) {
      audioRef.current.volume = newMuted ? 0 : localVolumeRef.current;
    }
    
    // Atualizar contexto (pode causar re-render, mas é aceitável para toggle)
    setIsMuted(newMuted);
    lastContextMutedRef.current = newMuted;
  }, [localIsMuted, setIsMuted]);

  const seekToPosition = useCallback((clientX: number, element: HTMLElement) => {
    logger.debug('🎯 seekToPosition called', { 
      hasAudioRef: !!audioRef.current, 
      duration, 
      isReady, 
      audioReadyState: audioRef.current?.readyState 
    });
    
    if (!audioRef.current || duration === 0) {
      logger.warn('⚠️ seekToPosition: No audio ref or duration is 0');
      return;
    }
    
    const audio = audioRef.current;
    if (!isReady || audio.readyState < 1) {
      logger.warn('⚠️ seekToPosition: Audio not ready', { isReady, readyState: audio.readyState });
      return;
    }
    
    const rect = element.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * duration;
    
    if (isNaN(newTime) || newTime < 0 || newTime > duration) {
      logger.warn('⚠️ seekToPosition: Invalid time', { newTime, duration });
      return;
    }
    
    logger.debug('✅ seekToPosition: Applying seek', { newTime, percentage, clickX, rectWidth: rect.width });
    
    // Bloquear updates durante o seek
    isSeekingRef.current = true;
    
    try {
      // Aplicar o seek diretamente
      audio.currentTime = newTime;
      
      // Atualizar estado imediatamente
      setPlayerState(prev => ({ ...prev, currentTime: newTime }));
      
      // Sincronizar WaveSurfer se disponível
      if (wavesurferRef.current && isWaveReady && duration > 0) {
        try {
          const wavePercentage = newTime / duration;
          wavesurferRef.current.seekTo(wavePercentage);
        } catch (waveError) {
          logger.warn('Erro ao sincronizar WaveSurfer:', waveError);
        }
      }
      
    } catch (e) {
      logger.error('Erro no seek:', e);
    }
    
    // Liberar bloqueio após um tempo mínimo
    setTimeout(() => {
      isSeekingRef.current = false;
    }, 100);
    
  }, [duration, setPlayerState, isWaveReady, isReady]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
            // Progress bar clicked
    
    // Aplicar seek imediatamente sem delay
    seekToPosition(e.clientX, e.currentTarget);
  }, [seekToPosition]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
            // Iniciando drag do progresso
    isDraggingRef.current = true;
    isSeekingRef.current = true; // Marcar seeking também durante drag
    
    const progressElement = e.currentTarget;
    seekToPosition(e.clientX, progressElement);

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      seekToPosition(e.clientX, progressElement);
    };

    const handleMouseUp = (e: MouseEvent) => {
              // Finalizando drag do progresso
      e.preventDefault();
      
      isDraggingRef.current = false;
      
      // Fazer um último seek para garantir posição final
      seekToPosition(e.clientX, progressElement);
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Aguardar o mesmo tempo que o seek simples para consistência
      setTimeout(() => {
        isSeekingRef.current = false;
        // DRAG FINALIZADO - liberando handleTimeUpdate
      }, 300);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [seekToPosition]);

  const formatTime = useCallback((time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const handleAlbumClick = useCallback(() => {
    setShowAlbumModal(true);
  }, []);

  const handleMusicStudyClick = useCallback(() => {
    setShowMusicStudyModal(true);
  }, []);

  const handleAddToPlaylist = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentFile) return;
    
    toggleTrack({
      name: currentFile.name,
      title: currentFile.title || currentFile.displayName,
      artist: currentFile.artist,
      path: currentFile.path,
      thumbnail: getThumbnailUrl(currentFile.name)
    });
  }, [currentFile, toggleTrack]);

  const getAlbumData = useCallback(() => {
    if (!currentFile) return null;
    
    // Função auxiliar para formatar tamanho do arquivo
    const formatFileSize = (bytes: number) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Função auxiliar para formatar data
    const formatDate = (dateString: string) => {
      try {
        return new Date(dateString).toLocaleDateString('pt-BR');
      } catch {
        return dateString;
      }
    };
    
    return {
      title: currentFile.title || currentFile.displayName,
      artist: currentFile.artist || 'Artista Desconhecido',
      artwork: getThumbnailUrl(currentFile.name),
      year: (currentFile as any).year,
      genre: (currentFile as any).genre,
      label: currentFile.label,
      bpm: currentFile.bpm?.toString(),
      key: currentFile.key,
      duration: formatTime(duration),
      filename: currentFile.name,
      
      // Informações técnicas do arquivo
      fileSize: (currentFile as any).fileSize ? formatFileSize((currentFile as any).fileSize) : undefined,
      format: currentFile.name.split('.').pop()?.toLowerCase(),
      bitrate: (currentFile as any).bitrate ? `${(currentFile as any).bitrate} kbps` : undefined,
      sampleRate: (currentFile as any).sampleRate ? `${(currentFile as any).sampleRate} Hz` : undefined,
      channels: (currentFile as any).channels ? 
        ((currentFile as any).channels === 2 ? 'Estéreo' : 
         (currentFile as any).channels === 1 ? 'Mono' : 
         `${(currentFile as any).channels} canais`) : undefined,
      encoder: (currentFile as any).encoder,
      
      // Metadados adicionais
      album: (currentFile as any).album,
      track: (currentFile as any).track ? `${(currentFile as any).track}` : undefined,
      disc: (currentFile as any).disc ? `${(currentFile as any).disc}` : undefined,
      composer: (currentFile as any).composer,
      publisher: (currentFile as any).publisher,
      isrc: (currentFile as any).isrc,
      catalog: (currentFile as any).catalogNumber || (currentFile as any).catalog,
      
      // Informações de uso
      dateAdded: (currentFile as any).dateAdded ? formatDate((currentFile as any).dateAdded) : undefined,
      lastPlayed: (currentFile as any).lastPlayed ? formatDate((currentFile as any).lastPlayed) : undefined,
      playCount: (currentFile as any).playCount || 0
    };
  }, [currentFile, duration, formatTime]);

  // Não renderizar no servidor
  if (!isClient) return null;
  
  // Mostrar skeleton quando carregando ou sem arquivo
  if (!currentFile || isLoading) {
    return <SkeletonAudioPlayer variant={isMobile ? 'mobile' : 'desktop'} />;
  }

  // Renderizar erro
  if (error) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-red-900 border-t border-red-700 px-4 py-3">
        <div className="text-red-100 text-center">{error}</div>
      </div>
    );
  }

  // Não renderizar o player grande quando está minimizado
  if (playerMinimized) {
    // Renderizar apenas o player minimizado
    return (
      <>
        {/* Minimized Player */}
        {currentFile && (
          <div 
            className="fixed bottom-6 right-6 z-[100] rounded-xl shadow-2xl flex flex-col backdrop-blur-xl"
            style={{
              background: `linear-gradient(135deg, 
                ${playerDominantColor.replace('0.2', '0.4')} 0%, 
                rgba(0, 0, 0, 0.7) 70%, 
                rgba(15, 23, 42, 0.8) 100%
              )`,
              boxShadow: `0 8px 32px ${themeColors.background}, 0 2px 8px rgba(0, 0, 0, 0.3)`,
              minWidth: 260,
              pointerEvents: 'auto'
            }}
          >
            {/* Main Content */}
            <div className="flex items-center gap-3 px-3 pt-2">
              {/* Foto */}
              <div className="flex-shrink-0">
                <button onClick={handleAlbumClick} className="hover:scale-105 transition-transform duration-200">
                  <Image
                    src={getThumbnailUrl(currentFile.name)}
                    alt={currentFile.title || currentFile.displayName}
                    width={44}
                    height={44}
                    className="object-cover bg-zinc-800 rounded-lg cursor-pointer shadow-md"
                    style={{ width: 44, height: 44 }}
                  />
                </button>
              </div>
              
              {/* Informações */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="text-white font-bold text-sm truncate leading-tight">
                  {currentFile.title || currentFile.displayName}
                </div>
                <div className="text-xs truncate font-medium mt-0.5 flex items-center gap-2" style={{ color: themeColors.primary }}>
                  <div 
                    className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                    style={{ 
                      backgroundColor: `${themeColors.primary}25`,
                      border: `1px solid ${themeColors.primary}40`
                    }}
                  >
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                  {currentFile.artist || '-'}
                </div>
              </div>
              
              {/* Controles */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button 
                  onClick={handlePrev} 
                  className="text-white player-button hover:scale-110 transition-transform duration-200" 
                  style={{ color: themeColors.primaryLight }}
                  title="Música anterior"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                  </svg>
                </button>
                <button 
                  onClick={togglePlay} 
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white player-button hover:scale-110 transition-transform duration-200 shadow-md"
                  style={{ backgroundColor: themeColors.primary }}
                >
                  {isPlaying ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>
                <button 
                  onClick={handleNext} 
                  className="text-white player-button hover:scale-110 transition-transform duration-200"
                  style={{ color: themeColors.primaryLight }}
                  title="Próxima música"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                  </svg>
                </button>
                <button 
                  onClick={handleAddToPlaylist}
                  className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
                  style={{ 
                    color: isInPlaylist(currentFile.name) ? themeColors.primary : themeColors.primaryLight,
                    backgroundColor: isInPlaylist(currentFile.name) ? `${themeColors.primary}20` : 'transparent'
                  }}
                  title={isInPlaylist(currentFile.name) ? 'Remover da playlist' : 'Adicionar à playlist'}
                >
                  {isInPlaylist(currentFile.name) ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                </button>
                <div 
                  className="relative flex items-center"
                  onMouseEnter={() => setShowVolumeSlider(true)}
                  onMouseLeave={() => setShowVolumeSlider(false)}
                >
                  <button 
                    onClick={toggleMute} 
                    className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
                    style={{ color: isMuted ? 'rgb(239, 68, 68)' : themeColors.primaryLight }}
                    title={isMuted ? 'Desmutar' : 'Mutar'}
                  >
                    {isMuted || volume === 0 ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                      </svg>
                    )}
                  </button>
                  {showVolumeSlider && (
                    <div 
                      className="absolute bottom-full left-1/2 px-1 py-3 rounded-lg backdrop-blur-xl shadow-lg border flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, 
                          ${playerDominantColor.replace('0.2', '0.3')} 0%, 
                          rgba(0, 0, 0, 0.4) 70%, 
                          rgba(15, 23, 42, 0.5) 100%
                        )`,
                        borderColor: themeColors.border,
                        height: '120px',
                        transform: 'translateX(-50%)',
                        zIndex: 1000,
                        marginBottom: '0px',
                        boxShadow: `0 4px 16px ${themeColors.background}, 0 2px 8px rgba(0, 0, 0, 0.2)`,
                        pointerEvents: 'auto'
                      }}
                      onMouseEnter={() => setShowVolumeSlider(true)}
                      onMouseLeave={() => setShowVolumeSlider(false)}
                    >
                      <div className="relative flex items-center justify-center" style={{ height: '100px', width: '16px' }}>
                        {/* Background track */}
                        <div 
                          className="absolute"
                          style={{
                            width: '2px',
                            height: '100px',
                            backgroundColor: 'rgb(63, 63, 70)',
                            borderRadius: '1px',
                            left: '50%',
                            transform: 'translateX(-50%)'
                          }}
                        />
                        {/* Progress fill */}
                        <div 
                          ref={volumeProgressFillRef}
                          className="absolute bottom-0"
                          style={{
                            width: '2px',
                            height: `${(isMuted ? 0 : volume) * 100}%`,
                            backgroundColor: themeColors.primary,
                            borderRadius: '1px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            transition: isDraggingVolumeRef.current ? 'none' : 'height 0.1s ease'
                          }}
                        />
                        {/* Slider input */}
                        <div 
                          className="absolute"
                          style={{
                            width: '100px',
                            height: '2px',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%) rotate(-90deg)',
                            transformOrigin: 'center center',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <input
                            ref={volumeSliderVerticalRef}
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={isMuted ? 0 : volume}
                            onChange={handleVolumeChange}
                            onMouseDown={handleVolumeMouseDown}
                            onMouseUp={handleVolumeMouseUp}
                            className="volume-slider-vertical"
                            style={{
                              width: '100%',
                              height: '100%',
                              color: themeColors.primary, // Verde Legolas
                              margin: 0,
                              padding: 0,
                              display: 'block',
                              accentColor: themeColors.primary // Para navegadores modernos
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => setPlayerMinimized(false)} 
                  className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
                  style={{ color: themeColors.primaryLight }}
                  title="Expandir player"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="px-3 pt-1 pb-2">
              <div 
                className="w-full h-3 cursor-pointer relative shadow-md rounded-full overflow-hidden"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  logger.debug('🎯 Progress bar clicked (minimized)', { clientX: e.clientX, duration, currentTime, isReady });
                  handleProgressClick(e);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  logger.debug('🎯 Progress bar mouse down (minimized)', { clientX: e.clientX, duration, currentTime, isReady });
                  handleProgressMouseDown(e);
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  isDraggingRef.current = true;
                  isSeekingRef.current = true;
                  
                  const touch = e.touches[0];
                  const progressElement = e.currentTarget;
                  seekToPosition(touch.clientX, progressElement);
                  
                  const handleTouchMove = (e: TouchEvent) => {
                    if (!isDraggingRef.current || e.touches.length === 0) return;
                    e.preventDefault();
                    const touch = e.touches[0];
                    seekToPosition(touch.clientX, progressElement);
                  };
                  
                  const handleTouchEnd = (e: TouchEvent) => {
                    e.preventDefault();
                    
                    isDraggingRef.current = false;
                    
                    document.removeEventListener('touchmove', handleTouchMove);
                    document.removeEventListener('touchend', handleTouchEnd);
                    
                    setTimeout(() => {
                      isSeekingRef.current = false;
                    }, 300);
                  };
                  
                  document.addEventListener('touchmove', handleTouchMove, { passive: false });
                  document.addEventListener('touchend', handleTouchEnd);
                }}
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.4)',
                  zIndex: 10
                }}
              >
                <div 
                  className="h-full transition-all duration-100 relative pointer-events-none"
                  style={{ 
                    width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                    backgroundColor: themeColors.primary,
                    boxShadow: `inset 0 1px 1px rgba(0,0,0,0.2)`
                  }}
                >
                  {/* Progress Thumb */}
                  <div  
                    className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow-lg transition-all duration-100 border border-white/30 pointer-events-none"
                    style={{ 
                      backgroundColor: themeColors.primary,
                      opacity: duration > 0 ? 1 : 0,
                      boxShadow: `0 1px 4px rgba(0,0,0,0.4), 0 0 0 1px ${themeColors.primary}60`
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Album Modal */}
        {showAlbumModal && getAlbumData() && (
          <AlbumModal
            isOpen={showAlbumModal}
            onClose={() => setShowAlbumModal(false)}
            albumData={getAlbumData()!}
            themeColors={themeColors}
          />
        )}

        {/* Music Study Modal */}
        <MusicStudyModal
          isOpen={showMusicStudyModal}
          onClose={() => setShowMusicStudyModal(false)}
        />
      </>
    );
  }

  return (
    <>
      <div 
        className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl transition-all duration-300"
        style={{
          background: currentFile 
            ? `linear-gradient(135deg, 
                ${playerDominantColor.replace('0.2', '0.4')} 0%, 
                rgba(0, 0, 0, 0.7) 70%, 
                rgba(15, 23, 42, 0.8) 100%
              )`
            : `linear-gradient(135deg, 
                rgba(0, 0, 0, 0.3) 0%, 
                rgba(0, 0, 0, 0.5) 100%
              )`,
        }}
      >
        {/* Desktop Layout */}
        <div className="hidden sm:flex flex-col px-6 py-3 relative" style={{ height: 90 }}>
          <div 
            className="absolute inset-0 rounded-lg overflow-hidden backdrop-blur-md flex items-center justify-center" 
            style={{ 
              background: `rgba(0, 0, 0, 0.2)`,
              boxShadow: `0 4px 16px ${themeColors.background}, inset 0 1px 0 rgba(255, 255, 255, 0.05)`
            }}
          >
            <div ref={waveformDesktopRef} className="w-full" style={{ height: 70, minHeight: 70, minWidth: 100 }} />
            {!isWaveReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <LoadingSpinner size="lg" themeColors={themeColors} isLoading={!isWaveReady} />
              </div>
            )}
            
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 rounded-lg backdrop-blur-sm">
                <LoadingSpinner size="md" themeColors={themeColors} isLoading={isLoading} />
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="absolute left-0 right-0 z-30" style={{ top: '-8px' }}>
            <div 
              className="w-full h-4 cursor-pointer relative shadow-lg backdrop-blur-sm py-1"
              onClick={handleProgressClick}
              onMouseDown={handleProgressMouseDown}
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                borderColor: 'rgba(255, 255, 255, 0.2)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 3px rgba(0, 0, 0, 0.4)'
              }}
            >
              <div 
                className="h-full transition-all duration-100 relative shadow-inner"
                style={{ 
                  width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                  backgroundColor: themeColors.primary,
                  boxShadow: `inset 0 1px 2px rgba(0,0,0,0.3), 0 1px 2px ${themeColors.primary}30`
                }}
              >
                {/* Progress Thumb */}
                <div  
                  className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full shadow-lg transition-all duration-100 border-2 border-white/20"
                  style={{ 
                    backgroundColor: themeColors.primary,
                    opacity: duration > 0 ? 1 : 0,
                    boxShadow: `0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px ${themeColors.primary}80`
                  }}
                />
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-center px-4 py-2" style={{ height: 90 }}>
            <div className="w-full max-w-7xl flex items-center">
            {/* Foto do álbum */}
            <div className="flex-shrink-0">
              <button onClick={handleAlbumClick} className="hover:scale-105 transition-transform duration-200">
                <Image
                  src={getThumbnailUrl(currentFile.name)}
                  alt={currentFile.title || currentFile.displayName}
                  width={70}
                  height={70}
                  className="object-cover bg-zinc-800 rounded-lg cursor-pointer shadow-lg"
                  style={{ width: 70, height: 70 }}
                />
              </button>
            </div>

            {/* Informações da música */}
            <div className="flex-1 px-4 min-w-0 flex flex-col justify-center">
              <div className="text-white font-bold text-lg leading-tight truncate">
                {currentFile.title || currentFile.displayName}
              </div>
              <div className="text-base truncate font-medium mt-0.5 flex items-center gap-2" style={{ color: themeColors.primary }}>
                <div 
                  className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{ 
                    backgroundColor: `${themeColors.primary}25`,
                    border: `1px solid ${themeColors.primary}40`
                  }}
                >
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </div>
                {currentFile.artist || '-'}
              </div>
              <div className="flex items-center gap-3 mt-1">
                {currentFile.bpm && (
                  <span 
                    className="px-2 py-0.5 rounded text-xs font-bold border"
                    style={{ 
                      backgroundColor: themeColors.background,
                      color: themeColors.primary,
                      borderColor: themeColors.border
                    }}
                  >
                    {currentFile.bpm} bpm
                  </span>
                )}
                {currentFile.key && (
                  <span 
                    className="px-2 py-0.5 rounded text-xs font-bold border"
                    style={{ 
                      backgroundColor: themeColors.background,
                      color: themeColors.primary,
                      borderColor: themeColors.border
                    }}
                  >
                    {currentFile.key}
                  </span>
                )}
                <div className="flex gap-1 text-zinc-100 text-sm font-semibold">
                  <span>{formatTime(currentTime)}</span>
                  <span>/</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>

            {/* Controles de reprodução */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <button 
                onClick={handlePrev} 
                className="text-white player-button hover:scale-110 transition-transform duration-200" 
                style={{ color: themeColors.primaryLight }}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
              </button>

              <button 
                onClick={togglePlay} 
                className="w-12 h-12 rounded-full flex items-center justify-center text-white player-button hover:scale-110 transition-transform duration-200 shadow-lg"
                style={{ backgroundColor: themeColors.primary }}
              >
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                ) : (
                  <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>

              <button 
                onClick={handleNext} 
                className="text-white player-button hover:scale-110 transition-transform duration-200"
                style={{ color: themeColors.primaryLight }}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </button>
            </div>

            {/* Controles de volume */}
            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
              <button 
                onClick={toggleMute} 
                className="text-zinc-400 player-button hover:scale-110 transition-transform duration-200"
                style={{ color: isMuted ? 'rgb(239, 68, 68)' : themeColors.primaryLight }}
              >
                {isMuted || volume === 0 ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                )}
              </button>
              <input
                ref={volumeSliderHorizontalRef}
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                onMouseDown={handleVolumeMouseDown}
                onMouseUp={handleVolumeMouseUp}
                className="w-20 audio-slider"
                style={{
                  color: themeColors.primary,
                  background: `linear-gradient(to right, ${themeColors.primary} 0%, ${themeColors.primary} ${(isMuted ? 0 : volume) * 100}%, rgb(63, 63, 70) ${(isMuted ? 0 : volume) * 100}%, rgb(63, 63, 70) 100%)`,
                  transition: isDraggingVolumeRef.current ? 'none' : 'background 0.1s ease'
                }}
              />
            </div>

            {/* Botão adicionar à playlist */}
            <div className="flex-shrink-0 ml-3">
              <button 
                onClick={handleAddToPlaylist}
                className="w-8 h-8 flex items-center justify-center transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
                style={{ 
                  color: isInPlaylist(currentFile.name) ? themeColors.primary : themeColors.primaryLight,
                  backgroundColor: isInPlaylist(currentFile.name) ? `${themeColors.primary}20` : 'transparent'
                }}
                title={isInPlaylist(currentFile.name) ? 'Remover da playlist' : 'Adicionar à playlist'}
              >
                {isInPlaylist(currentFile.name) ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
              </button>
            </div>

            {/* Botão análise de música */}
            <div className="flex-shrink-0 ml-3">
              <button 
                onClick={handleMusicStudyClick}
                className="w-8 h-8 flex items-center justify-center transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
                style={{ 
                  color: themeColors.primaryLight,
                  backgroundColor: 'transparent'
                }}
                title="Análise de Música Eletrônica"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>
            </div>

            {/* Botão minimizar */}
            <div className="flex-shrink-0 ml-3">
              <button 
                onClick={() => setPlayerMinimized(true)} 
                className="w-8 h-8 flex items-center justify-center transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
                style={{ color: themeColors.primaryLight }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="5" y="17" width="14" height="2" rx="1" fill="currentColor" />
                </svg>
              </button>
            </div>
            </div>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="flex sm:hidden justify-center p-3">
          <div className="w-full max-w-7xl flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <button onClick={handleAlbumClick} className="hover:scale-105 transition-transform duration-200">
                <Image
                  src={getThumbnailUrl(currentFile.name)}
                  alt={currentFile.title || currentFile.displayName}
                  width={60}
                  height={60}
                  className="object-cover bg-zinc-800 rounded-lg cursor-pointer shadow-lg"
                  style={{ width: 60, height: 60 }}
                />
              </button>
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="text-white font-bold text-base leading-tight truncate">
                {currentFile.title || currentFile.displayName}
              </div>
              <div className="text-sm truncate font-medium mt-0.5 flex items-center gap-2" style={{ color: themeColors.primary }}>
                <div 
                  className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{ 
                    backgroundColor: `${themeColors.primary}25`,
                    border: `1px solid ${themeColors.primary}40`
                  }}
                >
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </div>
                {currentFile.artist || '-'}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {currentFile.bpm && (
                  <span 
                    className="px-1.5 py-0.5 rounded-md text-xs font-bold border"
                    style={{ 
                      backgroundColor: themeColors.background,
                      color: themeColors.primary,
                      borderColor: themeColors.border
                    }}
                  >
                    {currentFile.bpm} bpm
                  </span>
                )}
                {currentFile.key && (
                  <span 
                    className="px-1.5 py-0.5 rounded-md text-xs font-bold border"
                    style={{ 
                      backgroundColor: themeColors.background,
                      color: themeColors.primary,
                      borderColor: themeColors.border
                    }}
                  >
                    {currentFile.key}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col">
            <div 
              className="w-full rounded-xl overflow-hidden relative backdrop-blur-sm shadow-lg" 
              style={{ 
                height: 80, 
                minHeight: 80,
                background: `rgba(0, 0, 0, 0.2)`
              }}
            >
              <div ref={waveformMobileRef} className="w-full h-full" style={{ minHeight: 80, minWidth: 100 }} />
              {!isWaveReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <LoadingSpinner size="lg" themeColors={themeColors} isLoading={!isWaveReady} />
                </div>
              )}
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10 rounded-xl backdrop-blur-sm">
                  <LoadingSpinner size="md" themeColors={themeColors} isLoading={isLoading} />
                </div>
              )}
              
              {/* Mobile Progress Overlay */}
              <div className="absolute bottom-3 left-3 right-3 z-30">
                <div 
                  className="w-full h-6 cursor-pointer rounded-full relative shadow-lg backdrop-blur-sm border-2 py-2"
                  onClick={handleProgressClick}
                  onMouseDown={handleProgressMouseDown}
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 3px rgba(0, 0, 0, 0.4)'
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                                          // Touch start no progresso
                    
                    isDraggingRef.current = true;
                    isSeekingRef.current = true;
                    
                    const touch = e.touches[0];
                    const progressElement = e.currentTarget;
                    seekToPosition(touch.clientX, progressElement);
                    
                    const handleTouchMove = (e: TouchEvent) => {
                      if (!isDraggingRef.current || e.touches.length === 0) return;
                      e.preventDefault();
                      const touch = e.touches[0];
                      seekToPosition(touch.clientX, progressElement);
                    };
                    
                    const handleTouchEnd = (e: TouchEvent) => {
                                              // Touch end no progresso
                      e.preventDefault();
                      
                      isDraggingRef.current = false;
                      
                      document.removeEventListener('touchmove', handleTouchMove);
                      document.removeEventListener('touchend', handleTouchEnd);
                      
                      setTimeout(() => {
                        isSeekingRef.current = false;
                        // TOUCH FINALIZADO - liberando handleTimeUpdate
                      }, 300);
                    };
                    
                    document.addEventListener('touchmove', handleTouchMove, { passive: false });
                    document.addEventListener('touchend', handleTouchEnd);
                  }}
                >
                  <div 
                    className="h-full rounded-full transition-all duration-100 relative shadow-inner"
                    style={{ 
                      width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                      backgroundColor: themeColors.primary,
                      boxShadow: `inset 0 1px 2px rgba(0,0,0,0.3), 0 1px 2px ${themeColors.primary}30`
                    }}
                  >
                    {/* Mobile Progress Thumb */}
                    <div 
                      className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-lg transition-all duration-100 border-2 border-white/20"
                      style={{ 
                        backgroundColor: themeColors.primary,
                        opacity: duration > 0 ? 1 : 0,
                        boxShadow: `0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px ${themeColors.primary}80`
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-between w-full text-xs text-zinc-100 mt-2 font-semibold">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            {/* Controles de reprodução */}
            <div className="flex items-center gap-2">
              <button 
                onClick={handlePrev} 
                className="text-white player-button hover:scale-110 transition-transform duration-200"
                style={{ color: themeColors.primaryLight }}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
              </button>

              <button 
                onClick={togglePlay} 
                className="w-12 h-12 rounded-full flex items-center justify-center text-white player-button hover:scale-110 transition-transform duration-200 shadow-lg mx-2"
                style={{ backgroundColor: themeColors.primary }}
              >
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                ) : (
                  <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>

              <button 
                onClick={handleNext} 
                className="text-white player-button hover:scale-110 transition-transform duration-200"
                style={{ color: themeColors.primaryLight }}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </button>
            </div>

            {/* Botão adicionar à playlist */}
            <button 
              onClick={handleAddToPlaylist}
              className="w-9 h-9 flex items-center justify-center transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
              style={{ 
                color: isInPlaylist(currentFile.name) ? themeColors.primary : themeColors.primaryLight,
                backgroundColor: isInPlaylist(currentFile.name) ? `${themeColors.primary}20` : 'transparent'
              }}
              title={isInPlaylist(currentFile.name) ? 'Remover da playlist' : 'Adicionar à playlist'}
            >
              {isInPlaylist(currentFile.name) ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )}
            </button>

            {/* Botão análise de música */}
            <button 
              onClick={handleMusicStudyClick}
              className="w-9 h-9 flex items-center justify-center transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
              style={{ 
                color: themeColors.primaryLight,
                backgroundColor: 'transparent'
              }}
              title="Análise de Música Eletrônica"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>

            {/* Botão minimizar */}
            <button 
              onClick={() => setPlayerMinimized(true)} 
              className="w-9 h-9 flex items-center justify-center transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
              style={{ color: themeColors.primaryLight }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="5" y="17" width="14" height="2" rx="1" fill="currentColor" />
              </svg>
            </button>
          </div>
          </div>
        </div>
      </div>

      {/* Album Modal */}
      {showAlbumModal && getAlbumData() && (
        <AlbumModal
          isOpen={showAlbumModal}
          onClose={() => setShowAlbumModal(false)}
          albumData={getAlbumData()!}
          themeColors={themeColors}
        />
      )}

      {/* Music Study Modal */}
      <MusicStudyModal
        isOpen={showMusicStudyModal}
        onClose={() => setShowMusicStudyModal(false)}
      />
    </>
  );
} 