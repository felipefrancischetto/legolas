'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import WaveSurfer from 'wavesurfer.js';
import { usePlayer } from '../contexts/PlayerContext';
import { useUI } from '../contexts/UIContext';
import { getThumbnailUrl } from '../utils/thumbnailCache';
import { getCachedDominantColor } from '../utils/colorExtractor';
import { useFile } from '../contexts/FileContext';
import AlbumModal from './AlbumModal';

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
  const [playerDominantColor, setPlayerDominantColor] = useState('rgba(16, 185, 129, 0.2)');
  const [isWaveReady, setIsWaveReady] = useState(false);
  const lastInitializedFile = useRef<string | null>(null);

  const { playerState, setPlayerState, pause, resume, setVolume, setIsMuted, play } = usePlayer();
  const { setPlayerOpen, playerMinimized, setPlayerMinimized } = useUI();
  const { files } = useFile();

  // Memoize valores para evitar re-renders desnecessários
  const currentFile = playerState.currentFile;
  const isPlaying = playerState.isPlaying;
  const currentTime = playerState.currentTime;
  const duration = playerState.duration;
  const volume = playerState.volume;
  const isMuted = playerState.isMuted;
  const isLoading = playerState.isLoading;
  const isReady = playerState.isReady;
  const error = playerState.error;

  // Funções de navegação otimizadas
  const handleNext = useCallback(() => {
    if (!currentFile) return;
    const currentIndex = files.findIndex(f => f.name === currentFile.name);
    if (currentIndex < files.length - 1) {
      const nextFile = files[currentIndex + 1];
      console.log('▶️ Próxima música:', nextFile.displayName);
      play(nextFile);
    }
  }, [currentFile, files, play]);

  const handlePrev = useCallback(() => {
    if (!currentFile) return;
    const currentIndex = files.findIndex(f => f.name === currentFile.name);
    if (currentIndex > 0) {
      const prevFile = files[currentIndex - 1];
      console.log('◀️ Música anterior:', prevFile.displayName);
      play(prevFile);
    }
  }, [currentFile, files, play]);

  // Detectar mobile e inicializar cliente
  useEffect(() => {
    setIsClient(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Extrair cor dominante quando arquivo muda
  useEffect(() => {
    if (!currentFile) return;
    
    const extractPlayerColor = async () => {
      try {
        const thumbnailUrl = getThumbnailUrl(currentFile.name);
        const colorData = await getCachedDominantColor(thumbnailUrl);
        const dominantColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.2)`;
        setPlayerDominantColor(dominantColor);
      } catch (error) {
        console.warn('Erro ao extrair cor dominante:', error);
        setPlayerDominantColor('rgba(16, 185, 129, 0.2)');
      }
    };
    
    extractPlayerColor();
  }, [currentFile?.name]);

  // Inicializar áudio nativo
  useEffect(() => {
    if (!currentFile) return;

    const audioUrl = `/api/downloads/${encodeURIComponent(currentFile.name)}`;
    console.log('🎵 Inicializando áudio:', audioUrl);
    
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = isMuted ? 0 : volume;
    audio.crossOrigin = 'anonymous';
    
    // Event listeners otimizados
    const handleLoadedMetadata = () => {
      console.log('✅ Metadados carregados');
      setPlayerState(prev => ({
        ...prev,
        duration: audio.duration || 0,
        isReady: true,
        isLoading: false,
        error: null
      }));
    };

    const handleCanPlay = () => {
      console.log('✅ Áudio pronto para reprodução');
      
      // Aplicar progresso inicial salvo (apenas uma vez quando carrega)
      if (currentTime > 0 && Math.abs(audio.currentTime - currentTime) > 1) {
        console.log('🔄 [AudioPlayer] Aplicando progresso inicial:', currentTime);
        audio.currentTime = currentTime;
      }
      
      setPlayerState(prev => ({
        ...prev,
        isReady: true,
        isLoading: false
      }));
      
      // Auto-play se solicitado
      if (isPlaying && audio.paused) {
        audio.play().catch(err => {
          console.warn('Auto-play falhou:', err);
          pause();
        });
      }
    };

         const handleTimeUpdate = () => {
       // Ignorar completamente se estamos fazendo seek ou arrastando
       if (isSeekingRef.current || isDraggingRef.current) {
         return; // Sem logs para evitar spam
       }
       
       const now = Date.now();
       if (now - lastProgressUpdateTime.current < 200) return; // Throttle aumentado para 200ms
       lastProgressUpdateTime.current = now;
       
       const newTime = audio.currentTime || 0;
       
       // Só atualizar se houve mudança significativa E não estamos em seek
       setPlayerState(prev => {
         // Verificação dupla de seeking antes de atualizar
         if (isSeekingRef.current || isDraggingRef.current) {
           return prev;
         }
         
         // Só atualizar para mudanças maiores que 0.2s
         if (Math.abs(prev.currentTime - newTime) < 0.2) {
           return prev;
         }
         
         return { ...prev, currentTime: newTime };
       });
     };

    const handleEnded = () => {
      console.log('🎵 Música terminou');
      setPlayerState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
      handleNext();
    };

    const handleError = (e: Event) => {
      console.error('❌ Erro no áudio:', e);
      setPlayerState(prev => ({
        ...prev,
        error: 'Erro ao carregar áudio',
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
    
    setPlayerState(prev => ({ 
      ...prev, 
      isLoading: true, 
      error: null, 
      isReady: false
    }));
    
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
  }, [currentFile?.name, handleNext]);

  // Controlar reprodução/pausa
  useEffect(() => {
    if (!audioRef.current) return;
    
    if (isPlaying && audioRef.current.paused) {
      console.log('▶️ Iniciando reprodução');
      audioRef.current.play().catch(err => {
        console.warn('Erro ao reproduzir:', err);
        pause();
      });
    } else if (!isPlaying && !audioRef.current.paused) {
      console.log('⏸️ Pausando reprodução');
      audioRef.current.pause();
    }
  }, [isPlaying, pause]);

  // Controlar volume sem re-render completo
  useEffect(() => {
    if (audioRef.current) {
      const newVolume = isMuted ? 0 : volume;
      if (Math.abs(audioRef.current.volume - newVolume) > 0.01) {
        audioRef.current.volume = newVolume;
      }
    }
  }, [volume, isMuted]);

    // Inicializar WaveSurfer otimizado
  useEffect(() => {
    if (!currentFile || !isClient) return;
    
    // Evitar re-inicialização desnecessária
    if (lastInitializedFile.current === currentFile.name && wavesurferRef.current) {
      return;
    }
    
    let isCancelled = false;
    
    const initWaveSurfer = async () => {
      if (isCancelled) return;
      
      // Aguardar um pouco menos para ser mais responsivo
      await new Promise(resolve => setTimeout(resolve, 50));
      if (isCancelled) return;
      
      const containerRef = isMobile ? waveformMobileRef.current : waveformDesktopRef.current;
      if (!containerRef) return;

      try {
        // Só limpar se já não estiver vazio
        if (containerRef.children.length > 0) {
          containerRef.innerHTML = '';
        }
        
        // Obter cores do tema - mais visíveis para deixar claro
        let waveColor = 'rgba(16, 185, 129, 0.4)';
        let progressColor = 'rgba(16, 185, 129, 0.8)';
        let cursorColor = 'rgba(16, 185, 129, 0.6)';
        
        try {
          const thumbnailUrl = getThumbnailUrl(currentFile.name);
          const colorData = await getCachedDominantColor(thumbnailUrl);
          waveColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.4)`;
          progressColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.8)`;
          cursorColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.6)`;
        } catch (error) {
          console.warn('Usando cores padrão para WaveSurfer');
        }

        if (isCancelled) return;

        const wavesurfer = WaveSurfer.create({
          container: containerRef,
          waveColor,
          progressColor,
          cursorColor,
          height: isMobile ? 80 : 120,
          barWidth: 3,
          barGap: 1,
          barRadius: 2,
          normalize: true,
          interact: false, // Desabilitar interação do WaveSurfer para evitar conflitos
          fillParent: true,
          hideScrollbar: true,
          backend: 'WebAudio', // Usar WebAudio para melhor performance
          mediaControls: false,
          autoplay: false
        });

        if (isCancelled) {
          wavesurfer.destroy();
          return;
        }

        wavesurfer.on('ready', () => {
          if (!isCancelled) {
            console.log('✅ WaveSurfer pronto');
            setIsWaveReady(true);
            lastInitializedFile.current = currentFile.name;
          }
        });

        wavesurfer.on('error', (err) => {
          if (!isCancelled) {
            console.warn('⚠️ WaveSurfer erro (ignorando):', err);
            // Mesmo com erro, marcar como pronto para não travar a UI
            setIsWaveReady(true);
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
            }
          } catch (e) {
            // Ignorar se não conseguir acessar o media element
          }
        }

        // Carregar áudio no WaveSurfer de forma assíncrona
        const audioUrl = `/api/downloads/${encodeURIComponent(currentFile.name)}`;
        
                 // Usar setTimeout para não bloquear a UI e evitar carregamentos múltiplos
         // Delay maior para garantir que o áudio nativo carregue primeiro
         setTimeout(() => {
           if (!isCancelled && wavesurfer) {
             try {
               wavesurfer.load(audioUrl);
             } catch (error) {
               console.warn('Erro ao carregar no WaveSurfer, usando fallback:', error);
               setIsWaveReady(true);
             }
           }
         }, 500);
        
        wavesurferRef.current = wavesurfer;
        
      } catch (error) {
        if (!isCancelled) {
          console.warn('⚠️ Erro ao inicializar WaveSurfer:', error);
          setIsWaveReady(true); // Marcar como pronto mesmo com erro
        }
      }
    };

    initWaveSurfer();

    return () => {
      isCancelled = true;
      setIsWaveReady(false);
      lastInitializedFile.current = null;
      
      if (wavesurferRef.current) {
        try {
          wavesurferRef.current.destroy();
        } catch (e) {
          console.warn('Erro ao destruir WaveSurfer:', e);
        }
        wavesurferRef.current = null;
      }
    };
  }, [currentFile?.name, isMobile, isClient]);

  // Handlers otimizados
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [isPlaying, pause, resume]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, [setVolume, setIsMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted);
  }, [isMuted, setIsMuted]);

  const seekToPosition = useCallback((clientX: number, element: HTMLElement) => {
    if (!audioRef.current || duration === 0) {
      console.log('🎵 [AudioPlayer] Seek cancelado - áudio ou duração inválida');
      return;
    }
    
    const audio = audioRef.current;
    
    // Verificar se o áudio está pronto para seek
    if (!isReady || audio.readyState < 2) {
      console.warn('🎵 [AudioPlayer] Áudio não está pronto para seek. ReadyState:', audio.readyState);
      return;
    }
    
    const rect = element.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * duration;
    
    console.log('🎵 [AudioPlayer] === SEEK DETALHADO ===');
    console.log('🎵 [AudioPlayer] Destino:', newTime.toFixed(2) + 's (' + Math.round(percentage * 100) + '%)');
    console.log('🎵 [AudioPlayer] Audio readyState:', audio.readyState);
    console.log('🎵 [AudioPlayer] Audio paused:', audio.paused);
    console.log('🎵 [AudioPlayer] Audio duration:', audio.duration);
    console.log('🎵 [AudioPlayer] Antes do seek:', audio.currentTime.toFixed(2) + 's');
    
    // Validar se o valor é razoável
    if (isNaN(newTime) || newTime < 0 || newTime > duration) {
      console.warn('🎵 [AudioPlayer] Tempo inválido calculado:', newTime);
      return;
    }
    
    // Bloquear updates
    isSeekingRef.current = true;
    
    try {
      // Método mais robusto - pausar, seek, depois reproduzir se necessário
      const wasPlaying = !audio.paused;
      
      // Se estiver tocando, pausar temporariamente
      if (wasPlaying) {
        audio.pause();
        console.log('🎵 [AudioPlayer] Áudio pausado para seek');
      }
      
      // Aguardar um frame para garantir que o pause foi processado
      requestAnimationFrame(() => {
        try {
          // Definir o novo tempo
          audio.currentTime = newTime;
          console.log('🎵 [AudioPlayer] currentTime definido para:', newTime.toFixed(2) + 's');
          
          // Verificar se foi aplicado
          setTimeout(() => {
            const actualTime = audio.currentTime;
            console.log('🎵 [AudioPlayer] Verificação: tempo real =', actualTime.toFixed(2) + 's');
            
            // Atualizar estado da UI
            setPlayerState(prev => ({ ...prev, currentTime: actualTime }));
            
            // Se estava tocando, retomar reprodução
            if (wasPlaying) {
              audio.play().then(() => {
                console.log('🎵 [AudioPlayer] Reprodução retomada após seek');
              }).catch(err => {
                console.warn('🎵 [AudioPlayer] Erro ao retomar reprodução:', err);
              });
            }
            
            // WaveSurfer sync
            if (wavesurferRef.current && isWaveReady) {
              const actualPercentage = actualTime / duration;
              wavesurferRef.current.seekTo(actualPercentage);
              console.log('🎵 [AudioPlayer] WaveSurfer sincronizado');
            }
            
          }, 50);
          
        } catch (seekError) {
          console.error('🎵 [AudioPlayer] Erro durante o seek:', seekError);
        }
      });
      
    } catch (e) {
      console.error('🎵 [AudioPlayer] Erro no processo de seek:', e);
    }
    
    // Liberar bloqueio após tempo suficiente
    setTimeout(() => {
      isSeekingRef.current = false;
      console.log('🎵 [AudioPlayer] === SEEK FINALIZADO ===');
    }, 1000);
    
  }, [duration, setPlayerState, isWaveReady, isReady]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🎵 [AudioPlayer] Progress bar clicked at:', e.clientX);
    
    // Aplicar seek imediatamente sem delay
    seekToPosition(e.clientX, e.currentTarget);
  }, [seekToPosition]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('🎵 [AudioPlayer] Iniciando drag do progresso');
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
      console.log('🎵 [AudioPlayer] Finalizando drag do progresso');
      e.preventDefault();
      
      isDraggingRef.current = false;
      
      // Fazer um último seek para garantir posição final
      seekToPosition(e.clientX, progressElement);
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Aguardar o mesmo tempo que o seek simples para consistência
      setTimeout(() => {
        isSeekingRef.current = false;
        console.log('🎵 [AudioPlayer] DRAG FINALIZADO - liberando handleTimeUpdate');
      }, 1000);
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

  const getAlbumData = useCallback(() => {
    if (!currentFile) return null;
    
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
      filename: currentFile.name
    };
  }, [currentFile, duration, formatTime]);

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

  // Não renderizar no servidor ou sem arquivo
  if (!isClient || !currentFile) return null;

  // Renderizar erro
  if (error) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-red-900 border-t border-red-700 px-4 py-3">
        <div className="text-red-100 text-center">{error}</div>
      </div>
    );
  }

  return (
    <>
      <div 
        className={`fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl transition-all duration-300 ${
          playerMinimized ? 'pointer-events-none opacity-0 select-none' : ''
        }`}
        style={{
          background: `linear-gradient(135deg, 
            ${playerDominantColor.replace('0.2', '0.4')} 0%, 
            rgba(0, 0, 0, 0.7) 70%, 
            rgba(15, 23, 42, 0.8) 100%
          )`,
          boxShadow: `0 -4px 16px ${themeColors.background}`
        }}
      >
        {/* Desktop Layout */}
        <div className="hidden sm:flex flex-col px-6 py-4 relative" style={{ height: 120 }}>
          <div 
            className="absolute inset-0 rounded-lg overflow-hidden backdrop-blur-md" 
            style={{ 
              background: `rgba(0, 0, 0, 0.2)`,
              boxShadow: `0 4px 16px ${themeColors.background}, inset 0 1px 0 rgba(255, 255, 255, 0.05)`
            }}
          >
            <div ref={waveformDesktopRef} className="w-full h-full" />
            {!isWaveReady && !isLoading && (
              <div className="absolute inset-0 flex items-center justify-center text-zinc-300/80 text-sm font-medium">
                Carregando visualização...
              </div>
            )}
            
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 rounded-lg backdrop-blur-sm">
                <div 
                  className="animate-spin rounded-full h-7 w-7 border-b-2 border-t-2 border-t-transparent" 
                  style={{ borderBottomColor: themeColors.primary }}
                />
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="absolute left-6 right-6 z-30" style={{ top: '8px' }}>
            <div 
              className="w-full h-3 cursor-pointer rounded-full relative shadow-lg backdrop-blur-sm border-2"
              onClick={handleProgressClick}
              onMouseDown={handleProgressMouseDown}
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                borderColor: 'rgba(255, 255, 255, 0.2)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 3px rgba(0, 0, 0, 0.4)'
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
          <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3">
            <button onClick={handleAlbumClick} className="hover:scale-105 transition-transform duration-200 flex-shrink-0">
              <Image
                src={getThumbnailUrl(currentFile.name)}
                alt={currentFile.title || currentFile.displayName}
                width={80}
                height={80}
                className="object-cover w-20 h-20 bg-zinc-800 rounded-lg cursor-pointer"
                style={{ width: 80, height: 80 }}
              />
            </button>

            <div className="flex-1 px-6 min-w-0">
              <div className="text-white font-bold text-lg leading-tight truncate">
                {currentFile.title || currentFile.displayName}
              </div>
              <div className="text-base truncate font-medium" style={{ color: themeColors.primary }}>
                {currentFile.artist || '-'}
              </div>
              <div className="text-zinc-400 text-sm flex gap-3 mt-1">
                {currentFile.bpm && (
                  <span 
                    className="px-2 py-1 rounded text-sm font-medium border"
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
                    className="px-2 py-1 rounded text-sm font-medium border"
                    style={{ 
                      backgroundColor: themeColors.background,
                      color: themeColors.primary,
                      borderColor: themeColors.border
                    }}
                  >
                    {currentFile.key}
                  </span>
                )}
                <div className="flex gap-1 text-zinc-300 font-medium">
                  <span>{formatTime(currentTime)}</span>
                  <span>/</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button 
                onClick={handlePrev} 
                className="text-white player-button" 
                style={{ color: themeColors.primaryLight }}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
              </button>

              <button 
                onClick={togglePlay} 
                className="w-12 h-12 rounded-full flex items-center justify-center text-white player-button"
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
                className="text-white player-button"
                style={{ color: themeColors.primaryLight }}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </button>

              <div className="flex items-center gap-2 ml-4">
                <button 
                  onClick={toggleMute} 
                  className="text-zinc-400 player-button"
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
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 audio-slider"
                  style={{
                    color: themeColors.primary,
                    background: `linear-gradient(to right, ${themeColors.primary} 0%, ${themeColors.primary} ${(isMuted ? 0 : volume) * 100}%, rgb(63, 63, 70) ${(isMuted ? 0 : volume) * 100}%, rgb(63, 63, 70) 100%)`
                  }}
                />
              </div>

              <button 
                onClick={() => setPlayerMinimized(true)} 
                className="w-8 h-8 flex items-center justify-center text-zinc-400 transition-colors rounded-full hover:bg-zinc-800/50"
                style={{ color: themeColors.primaryLight }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="5" y="17" width="14" height="2" rx="1" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="flex sm:hidden flex-col p-5 gap-5">
          <div className="flex items-center gap-4">
            <button onClick={handleAlbumClick} className="hover:scale-105 transition-transform duration-200 flex-shrink-0">
              <Image
                src={getThumbnailUrl(currentFile.name)}
                alt={currentFile.title || currentFile.displayName}
                width={56}
                height={56}
                className="object-cover w-14 h-14 bg-zinc-800 rounded-lg cursor-pointer"
                style={{ width: 56, height: 56 }}
              />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-base leading-tight truncate">
                {currentFile.title || currentFile.displayName}
              </div>
              <div className="text-sm truncate font-medium" style={{ color: themeColors.primary }}>
                {currentFile.artist || '-'}
              </div>
              <div className="text-zinc-400 text-xs flex gap-2 mt-1">
                {currentFile.bpm && (
                  <span 
                    className="px-2 py-0.5 rounded text-xs font-medium border"
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
                    className="px-2 py-0.5 rounded text-xs font-medium border"
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
              <div ref={waveformMobileRef} className="w-full h-full" />
              {!isWaveReady && !isLoading && (
                <div className="absolute inset-0 flex items-center justify-center text-sm font-medium" style={{ color: themeColors.primaryLight }}>
                  Carregando visualização...
                </div>
              )}
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10 rounded-xl backdrop-blur-sm">
                  <div 
                    className="animate-spin rounded-full h-7 w-7 border-b-2 border-t-2 border-t-transparent"
                    style={{ borderBottomColor: themeColors.primary }}
                  />
                </div>
              )}
              
              {/* Mobile Progress Overlay */}
              <div className="absolute bottom-3 left-3 right-3 z-30">
                <div 
                  className="w-full h-2 cursor-pointer rounded-full relative shadow-lg backdrop-blur-sm border-2"
                  onClick={handleProgressClick}
                  onMouseDown={handleProgressMouseDown}
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 3px rgba(0, 0, 0, 0.4)'
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    console.log('🎵 [AudioPlayer] Touch start no progresso');
                    
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
                      console.log('🎵 [AudioPlayer] Touch end no progresso');
                      e.preventDefault();
                      
                      isDraggingRef.current = false;
                      
                      document.removeEventListener('touchmove', handleTouchMove);
                      document.removeEventListener('touchend', handleTouchEnd);
                      
                      setTimeout(() => {
                        isSeekingRef.current = false;
                        console.log('🎵 [AudioPlayer] TOUCH FINALIZADO - liberando handleTimeUpdate');
                      }, 1000);
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
            <div className="flex justify-between w-full text-xs text-zinc-300 mt-2 font-medium">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                             <button 
                 onClick={handlePrev} 
                 className="text-white player-button"
                 style={{ color: themeColors.primaryLight }}
               >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
              </button>

                             <button 
                 onClick={togglePlay} 
                 className="w-12 h-12 rounded-full flex items-center justify-center text-white player-button"
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
                 className="text-white player-button"
                 style={{ color: themeColors.primaryLight }}
               >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </button>
            </div>

            <button 
              onClick={() => setPlayerMinimized(true)} 
              className="w-8 h-8 flex items-center justify-center transition-colors rounded-full hover:bg-zinc-800/50"
              style={{ color: themeColors.primaryLight }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="5" y="17" width="14" height="2" rx="1" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Minimized Player */}
      {playerMinimized && (
        <div 
          className="fixed bottom-8 right-8 z-[100] rounded-xl shadow-2xl flex items-center gap-3 px-4 py-3 min-w-[280px] backdrop-blur-xl"
          style={{
            background: `linear-gradient(135deg, 
              ${playerDominantColor.replace('0.2', '0.4')} 0%, 
              rgba(0, 0, 0, 0.7) 70%, 
              rgba(15, 23, 42, 0.8) 100%
            )`,
            boxShadow: `0 8px 32px ${themeColors.background}, 0 2px 8px rgba(0, 0, 0, 0.3)`
          }}
        >
          <button onClick={handleAlbumClick} className="hover:scale-105 transition-transform duration-200 flex-shrink-0">
            <Image
              src={getThumbnailUrl(currentFile.name)}
              alt={currentFile.title || currentFile.displayName}
              width={48}
              height={48}
              className="object-cover w-12 h-12 bg-zinc-800 rounded-lg cursor-pointer"
              style={{ width: 48, height: 48 }}
            />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-sm truncate">
              {currentFile.title || currentFile.displayName}
            </div>
            <div className="text-xs truncate" style={{ color: themeColors.primary }}>
              {currentFile.artist || '-'}
            </div>
          </div>
          <div className="flex items-center gap-2">
                         <button 
               onClick={togglePlay} 
               className="w-10 h-10 rounded-full flex items-center justify-center text-white player-button"
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
              onClick={() => setPlayerMinimized(false)} 
              className="w-8 h-8 flex items-center justify-center transition-colors rounded-full hover:bg-zinc-800/50"
              style={{ color: themeColors.primaryLight }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Album Modal */}
      {showAlbumModal && getAlbumData() && (
        <AlbumModal
          isOpen={showAlbumModal}
          onClose={() => setShowAlbumModal(false)}
          albumData={getAlbumData()!}
        />
      )}
    </>
  );
} 