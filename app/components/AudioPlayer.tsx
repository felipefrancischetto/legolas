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
import AlbumModal from './AlbumModal';
import LoadingSpinner from './LoadingSpinner';
import { SkeletonAudioPlayer } from './SkeletonComponents';

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
  const isInitializing = useRef(false); // Para evitar múltiplas inicializações simultâneas
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Para debounce

  const { playerState, setPlayerState, pause, resume, setVolume, setIsMuted, play } = usePlayer();
  const { setPlayerOpen, playerMinimized, setPlayerMinimized } = useUI();
  const { files } = useFile();
  const { settings } = useSettings();

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
        console.warn('Erro ao extrair cor dominante:', error);
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
        // Aplicando progresso inicial
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
      console.warn('Erro ao sincronizar WaveSurfer:', error);
    }
  }, [currentTime, duration, isWaveReady]);

    // Inicializar WaveSurfer otimizado
  useEffect(() => {
    if (!currentFile || !isClient) return;

    // Delay fixo para garantir que o container está visível
    let isCancelled = false;
    let timeoutId: NodeJS.Timeout | null = null;

    timeoutId = setTimeout(() => {
      if (isCancelled) return;

      // Evitar re-inicialização desnecessária
      if (lastInitializedFile.current === currentFile.name && wavesurferRef.current) {
        console.log('⚠️ WaveSurfer já inicializado para:', currentFile.name);
        return;
      }

      // Evitar múltiplas inicializações simultâneas
      if (isInitializing.current) {
        console.log('⚠️ WaveSurfer já está sendo inicializado, cancelando nova tentativa');
        return;
      }

      isInitializing.current = true;

      const initWaveSurfer = async () => {
        const containerRef = isMobile ? waveformMobileRef.current : waveformDesktopRef.current;
        if (!containerRef) {
          console.warn('❌ Container do WaveSurfer não encontrado');
          isInitializing.current = false;
          return;
        }
        if (containerRef.offsetWidth === 0 || containerRef.offsetHeight === 0) {
          console.warn('❌ Container do WaveSurfer não tem dimensões válidas');
          isInitializing.current = false;
          return;
        }

        // Verificar se o container tem dimensões válidas
        const rect = containerRef.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          console.warn('❌ Container do WaveSurfer não está visível');
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
              console.warn('Usando cores padrão para WaveSurfer');
            }
          }

          if (isCancelled) return;

          console.log('🎨 Configurando WaveSurfer com cores:', { waveColor, progressColor, cursorColor });
          
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
          
          console.log('✅ WaveSurfer criado:', wavesurfer);

          if (isCancelled) {
            wavesurfer.destroy();
            return;
          }

          wavesurfer.on('ready', () => {
            if (!isCancelled) {
              const duration = wavesurfer.getDuration();
              console.log('✅ WaveSurfer pronto - duração:', duration?.toFixed(2) + 's');
              console.log('✅ WaveSurfer container:', containerRef);
              console.log('✅ WaveSurfer canvas:', containerRef.querySelector('canvas'));
              setIsWaveReady(true);
              lastInitializedFile.current = currentFile.name;
              isInitializing.current = false;
              
              // Sincronizar com posição atual se necessário
              if (currentTime > 0 && duration > 0) {
                const initialPercentage = currentTime / duration;
                try {
                  wavesurfer.seekTo(initialPercentage);
                  console.log('✅ WaveSurfer sincronizado com posição:', initialPercentage);
                } catch (e) {
                  console.warn('Erro na sincronização inicial do WaveSurfer:', e);
                }
              }
            }
          });

          wavesurfer.on('loading', (progress) => {
            if (!isCancelled) {
              console.log('📊 WaveSurfer carregando:', progress + '%');
            }
          });

          wavesurfer.on('decode', () => {
            if (!isCancelled) {
              console.log('🔍 WaveSurfer decodificando áudio...');
            }
          });

          wavesurfer.on('error', (err) => {
            if (!isCancelled) {
              console.warn('⚠️ WaveSurfer erro:', err);
              console.warn('⚠️ Detalhes do erro:', {
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
            console.warn('⚠️ Erro ao inicializar WaveSurfer:', error);
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
        
        console.log('📡 Preparando carregamento do WaveSurfer para:', currentFile.name);
        console.log('📡 URL do áudio:', audioUrl);
        
        // Testar se a URL do áudio está acessível
        fetch(audioUrl, { method: 'HEAD' })
          .then(response => {
            console.log('📡 Status da URL do áudio:', response.status, response.statusText);
            console.log('📡 Headers da resposta:', Object.fromEntries(response.headers.entries()));
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
          })
          .catch(error => {
            console.warn('⚠️ Erro ao verificar URL do áudio:', error);
          });
        
                      // Carregar áudio imediatamente após criar o WaveSurfer
        try {
          console.log('🎵 Carregando WaveSurfer:', currentFile.name);
          console.log('🎵 WaveSurfer instance:', wavesurferRef.current);
          console.log('🎵 Container atual:', containerRef);
          console.log('🎵 URL do áudio:', audioUrl);
          
          // Verificar se o container ainda está válido
          if (containerRef && containerRef.offsetWidth > 0 && containerRef.offsetHeight > 0 && wavesurferRef.current) {
            wavesurferRef.current.load(audioUrl);
            console.log('🎵 Comando load enviado para WaveSurfer');
            
            // Não precisamos de timeout aqui, já temos o timeout de fallback global
            
          } else {
            console.warn('⚠️ Container inválido no momento do carregamento');
            setIsWaveReady(true);
            isInitializing.current = false;
          }
        } catch (error) {
          console.warn('Erro ao carregar WaveSurfer:', error);
          if (!isCancelled) {
            setIsWaveReady(true);
            isInitializing.current = false;
          }
        }
        
                  // Não precisamos mais do loadingTimeoutRef aqui
      };

      initWaveSurfer();
    }, 500);

    return () => {
      isCancelled = true;
      isInitializing.current = false; // Resetar flag de inicialização
      console.log('🔄 Destruindo WaveSurfer para:', currentFile?.name);
      
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
          console.warn('Erro ao destruir WaveSurfer:', e);
        }
        wavesurferRef.current = null;
      }
    };
  }, [currentFile?.name, isMobile, isClient]); // Removido settings.disableDynamicColors para evitar re-execuções

  // Timeout de fallback para evitar loading infinito da wave
  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;
    
    if (!isWaveReady && currentFile) {
      console.log('⏰ Iniciando timeout de fallback para wave (30s)');
      timeout = setTimeout(() => {
        console.warn('⚠️ Timeout da wave - forçando isWaveReady para true');
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

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, [setVolume, setIsMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted);
  }, [isMuted, setIsMuted]);

  const seekToPosition = useCallback((clientX: number, element: HTMLElement) => {
    if (!audioRef.current || duration === 0) return;
    
    const audio = audioRef.current;
    if (!isReady || audio.readyState < 1) return;
    
    const rect = element.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * duration;
    
    if (isNaN(newTime) || newTime < 0 || newTime > duration) return;
    
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
          console.warn('Erro ao sincronizar WaveSurfer:', waveError);
        }
      }
      
    } catch (e) {
      console.error('Erro no seek:', e);
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

      {/* Minimized Player */}
      {playerMinimized && (
        <div 
          className="fixed bottom-6 right-6 z-[100] rounded-xl shadow-2xl flex items-center gap-3 px-3 py-2 min-w-[260px] backdrop-blur-xl"
          style={{
            background: `linear-gradient(135deg, 
              ${playerDominantColor.replace('0.2', '0.4')} 0%, 
              rgba(0, 0, 0, 0.7) 70%, 
              rgba(15, 23, 42, 0.8) 100%
            )`,
            boxShadow: `0 8px 32px ${themeColors.background}, 0 2px 8px rgba(0, 0, 0, 0.3)`,
            height: 60
          }}
        >
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
              onClick={() => setPlayerMinimized(false)} 
              className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
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
          themeColors={themeColors}
        />
      )}
    </>
  );
} 