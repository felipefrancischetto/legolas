'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
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
  const [isMobile, setIsMobile] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const { playerState, setPlayerState, pause, resume, setVolume, setIsMuted, play } = usePlayer();
  const { setPlayerOpen, playerMinimized, setPlayerMinimized } = useUI();
  const { volume, isMuted } = playerState;
  const { files } = useFile();

  // Funções de navegação
  const handleNext = useCallback(() => {
    console.log('🎵 handleNext chamado');
    if (!playerState.currentFile) return;
    const idx = files.findIndex(f => f.name === playerState.currentFile?.name);
    if (idx < files.length - 1) {
      const nextFile = files[idx + 1];
      console.log('▶️ Próxima música:', nextFile.name);
      play(nextFile);
    }
  }, [playerState.currentFile, files, play]);

  const handlePrev = useCallback(() => {
    console.log('🎵 handlePrev chamado');
    if (!playerState.currentFile) return;
    const idx = files.findIndex(f => f.name === playerState.currentFile?.name);
    if (idx > 0) {
      const prevFile = files[idx - 1];
      console.log('◀️ Música anterior:', prevFile.name);
      play(prevFile);
    }
  }, [playerState.currentFile, files, play]);
  
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [playerDominantColor, setPlayerDominantColor] = useState('rgba(16, 185, 129, 0.2)');
  const [isAudioReady, setIsAudioReady] = useState(false);

  // Verificar se estamos no cliente
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    
    const checkMobile = () => {
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [isClient]);

  useEffect(() => {
    if (playerState.currentFile) {
      const extractPlayerColor = async () => {
        try {
          const thumbnailUrl = getThumbnailUrl(playerState.currentFile!.name);
          const colorData = await getCachedDominantColor(thumbnailUrl);
          const dominantColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.2)`;
          setPlayerDominantColor(dominantColor);
        } catch (error) {
          console.warn('Erro ao extrair cor dominante:', error);
          setPlayerDominantColor('rgba(16, 185, 129, 0.2)');
        }
      };
      
      extractPlayerColor();
    }
  }, [playerState.currentFile]);

  useEffect(() => {
    if (playerState.currentFile) {
      const audioUrl = `/api/downloads/${encodeURIComponent(playerState.currentFile.name)}`;
      console.log('🎵 Inicializando audio nativo:', audioUrl);
      
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.volume = isMuted ? 0 : volume;
      
      audio.addEventListener('loadedmetadata', () => {
        console.log('✅ Audio nativo pronto para reprodução');
        setIsAudioReady(true);
        setPlayerState(prev => ({
          ...prev,
          isReady: true,
          isLoading: false,
          duration: audio.duration || 0,
          error: null
        }));
      });

      audio.addEventListener('canplay', () => {
        console.log('✅ Audio pode ser reproduzido');
        setPlayerState(prev => ({
          ...prev,
          isReady: true,
          isLoading: false
        }));
      });
      
              let lastUpdateTime = 0;
        
        audio.addEventListener('timeupdate', () => {
          const currentTime = audio.currentTime || 0;
          
          // Throttle updates para reduzir re-renders
          const now = Date.now();
          if (now - lastUpdateTime < 100) return; // Atualizar no máximo a cada 100ms
          lastUpdateTime = now;
          
          setPlayerState(prev => ({ 
            ...prev, 
            currentTime
          }));
          
          // Sincronizar WaveSurfer apenas se não estiver fazendo seek manual
          if (wavesurferRef.current && audio.duration > 0 && !audio.seeking) {
            try {
              const progress = currentTime / audio.duration;
              if (!isNaN(progress) && isFinite(progress)) {
                wavesurferRef.current.seekTo(progress);
              }
            } catch (e) {
              // Ignorar erros de sincronização
            }
          }
        });
      
      audio.addEventListener('ended', () => {
        console.log('🎵 Música terminou - avançando para próxima');
        handleNext();
      });
      
      audio.addEventListener('error', (e) => {
        console.error('❌ Erro no audio nativo:', e);
        setPlayerState(prev => ({
          ...prev,
          error: 'Erro ao carregar áudio',
          isLoading: false,
          isReady: false
        }));
      });
      
      audio.src = audioUrl;
      audioRef.current = audio;
      
      setPlayerState(prev => ({ 
        ...prev, 
        isLoading: true, 
        error: null, 
        isReady: false,
        isPlaying: false 
      }));
      
      return () => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = '';
          audioRef.current = null;
        }
        setIsAudioReady(false);
      };
    }
  }, [playerState.currentFile?.name, handleNext, volume, isMuted]);

  // Função segura para limpar container
  const safeCleanContainer = useCallback((container: HTMLElement) => {
    try {
      // Método mais seguro que não interfere com React DOM
      const children = Array.from(container.children);
      children.forEach(child => {
        try {
          if (child.parentNode === container) {
            container.removeChild(child);
          }
        } catch (e) {
          // Ignorar erros de DOM já removido pelo React
        }
      });
    } catch (e) {
      // Fallback: usar innerHTML se removeChild falhar
      try {
        container.innerHTML = '';
      } catch (innerError) {
        console.warn('⚠️ Erro ao limpar container (ignorado):', innerError);
      }
    }
  }, []);

  useEffect(() => {
    if (!playerState.currentFile || !isClient) return;
    
    let isDestroyed = false;
    let isCancelled = false;
    let waveContainer: HTMLElement | null = null;

    const initWaveSurfer = async () => {
      if (isDestroyed || isCancelled) return;

      // Aguardar um pouco para garantir que o DOM está estável
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (isDestroyed || isCancelled) return;

      const containerRef = isMobile ? waveformMobileRef.current : waveformDesktopRef.current;
      if (!containerRef) return;

      try {
        // Limpar container de forma segura
        safeCleanContainer(containerRef);
        
        if (isDestroyed || isCancelled) return;
        
        // Criar novo container para WaveSurfer
        const container = document.createElement('div');
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.position = 'relative';
        containerRef.appendChild(container);
        waveContainer = container;

        if (isDestroyed || isCancelled) return;

        let waveColor = 'rgba(16, 185, 129, 0.15)';
        let progressColor = 'rgba(16, 185, 129, 0.4)';
        let cursorColor = 'rgba(16, 185, 129, 0.3)';
        
        if (playerState.currentFile) {
          try {
            const thumbnailUrl = getThumbnailUrl(playerState.currentFile.name);
            const colorData = await getCachedDominantColor(thumbnailUrl);
            waveColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.15)`;
            progressColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.4)`;
            cursorColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.3)`;
          } catch (error) {
            console.warn('Usando cores padrão para WaveSurfer');
          }
        }

        if (isDestroyed || isCancelled) return;

        const wavesurfer = WaveSurfer.create({
          container: container,
          waveColor: waveColor,
          progressColor: progressColor,
          height: isMobile ? 64 : 96,
          cursorColor: cursorColor,
          barWidth: 2,
          barGap: 1,
          barRadius: 1,
          normalize: true,
          interact: true,
          fillParent: true,
          hideScrollbar: true,
          backend: 'MediaElement',
          mediaControls: false,
          autoplay: false // WaveSurfer não deve fazer autoplay
        });

        if (isDestroyed || isCancelled) {
          try {
            wavesurfer.destroy();
          } catch (e) {
            // Ignorar erro de destruição
          }
          return;
        }

        console.log('✅ WaveSurfer criado');

        wavesurfer.on('ready', () => {
          if (isDestroyed || isCancelled) return;
          console.log('✅ WaveSurfer carregado e visível');
          
          // Forçar repaint da wave
          try {
            const waveElement = container.querySelector('wave') as HTMLElement;
            if (waveElement) {
              waveElement.style.display = 'block';
              waveElement.style.visibility = 'visible';
            }
          } catch (e) {
            console.warn('⚠️ Erro ao forçar visibilidade da wave:', e);
          }
        });

        wavesurfer.on('error', (err) => {
          if (isDestroyed || isCancelled) return;
          console.warn('⚠️ WaveSurfer error (não crítico):', err);
        });

        // Adicionar evento de click para seeking
        wavesurfer.on('click', (progress) => {
          if (isDestroyed || isCancelled || !audioRef.current) return;
          
          const newTime = progress * (audioRef.current.duration || 0);
          audioRef.current.currentTime = newTime;
          
          setPlayerState(prev => ({
            ...prev,
            currentTime: newTime
          }));
        });

        if (isDestroyed || isCancelled) {
          try {
            wavesurfer.destroy();
          } catch (e) {
            // Ignorar erro de destruição
          }
          return;
        }

        // NÃO carregar áudio no WaveSurfer para evitar lentidão
        // Apenas usar para visualização e seeking
        wavesurferRef.current = wavesurfer;
        
      } catch (error) {
        if (!isDestroyed && !isCancelled) {
          console.warn('⚠️ Erro ao criar WaveSurfer (não crítico):', error);
        }
      }
    };

    initWaveSurfer();

    return () => {
      console.log('🧹 Limpando WaveSurfer...');
      isDestroyed = true;
      isCancelled = true;
      
      if (wavesurferRef.current) {
        try {
          // Pausar antes de destruir para evitar conflitos
          setTimeout(() => {
            if (wavesurferRef.current) {
              try {
                wavesurferRef.current.pause();
              } catch (e) {
                // Ignorar erro de pause
              }
              
              setTimeout(() => {
                if (wavesurferRef.current) {
                  try {
                    wavesurferRef.current.destroy();
                  } catch (e) {
                    console.warn('⚠️ Erro ao destruir WaveSurfer (ignorado):', e);
                  }
                  wavesurferRef.current = null;
                }
              }, 100);
            }
          }, 50);
        } catch (e) {
          console.warn('⚠️ Erro na limpeza do WaveSurfer (ignorado):', e);
        }
      }
      
      // Limpar container de forma segura
      if (waveContainer && waveContainer.parentNode) {
        try {
          setTimeout(() => {
            if (waveContainer && waveContainer.parentNode) {
              try {
                safeCleanContainer(waveContainer);
              } catch (e) {
                console.warn('⚠️ Erro ao limpar container (ignorado):', e);
              }
            }
          }, 200);
        } catch (e) {
          console.warn('⚠️ Erro na limpeza do container (ignorado):', e);
        }
      }
    };
  }, [playerState.currentFile?.name, isMobile, isClient, safeCleanContainer]);



  useEffect(() => {
    console.log('🎵 [AudioPlayer] isPlaying changed:', playerState.isPlaying, 'audioRef:', !!audioRef.current);
    
    if (audioRef.current) {
      if (playerState.isPlaying) {
        console.log('🎵 [AudioPlayer] Tentando reproduzir áudio...');
        // Tentar reproduzir sempre que isPlaying for true
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log('✅ [AudioPlayer] Reprodução iniciada com sucesso');
          }).catch((error) => {
            console.warn('⚠️ [AudioPlayer] Autoplay bloqueado pelo navegador:', error);
            // Se autoplay falhar, pausar o estado para sincronizar
            pause();
          });
        }
      } else {
        console.log('🎵 [AudioPlayer] Pausando áudio...');
        audioRef.current.pause();
      }
    } else {
      console.log('⚠️ [AudioPlayer] audioRef.current é null');
    }
  }, [playerState.isPlaying, pause]);

  // useEffect separado para controle de volume
  useEffect(() => {
    if (audioRef.current) {
      const currentVolume = isMuted ? 0 : volume;
      // Só atualiza se o volume realmente mudou para evitar interrupções
      if (Math.abs(audioRef.current.volume - currentVolume) > 0.01) {
        console.log('🔊 Atualizando volume:', currentVolume);
        audioRef.current.volume = currentVolume;
      }
    }
  }, [volume, isMuted]);



  const togglePlay = () => {
    if (playerState.isPlaying) {
      pause();
    } else {
      // Garantir que o áudio pode tocar com interação do usuário
      if (audioRef.current) {
        console.log('🎵 Tentando reproduzir áudio. Ready:', isAudioReady, 'ReadyState:', audioRef.current.readyState);
        
        // Tentar reproduzir independente do estado de ready
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log('✅ Áudio reproduzindo com sucesso');
            resume();
          }).catch((error) => {
            console.warn('❌ Erro ao reproduzir:', error);
            // Tentar novamente após um pequeno delay
            setTimeout(() => {
              if (audioRef.current) {
                audioRef.current.play().then(() => {
                  console.log('✅ Áudio reproduzindo na segunda tentativa');
                  resume();
                }).catch(() => {
                  console.warn('❌ Falha definitiva na reprodução');
                  setPlayerState(prev => ({ ...prev, isPlaying: false }));
                });
              }
            }, 100);
          });
        } else {
          resume();
        }
      } else {
        resume();
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    
    // Aplicar volume diretamente ANTES de atualizar o estado
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || playerState.duration === 0) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * playerState.duration;
    
    // Aplicar seek no audio e atualizar estado
    audioRef.current.currentTime = newTime;
    
    setPlayerState(prev => ({
      ...prev,
      currentTime: newTime
    }));
    
    // Sincronizar WaveSurfer
    if (wavesurferRef.current) {
      try {
        wavesurferRef.current.seekTo(percentage);
      } catch (e) {
        // Ignorar erro de seek
      }
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleAlbumClick = () => {
    setShowAlbumModal(true);
  };

  const getAlbumData = () => {
    if (!playerState.currentFile) return null;
    
    return {
      title: playerState.currentFile.title || playerState.currentFile.displayName,
      artist: playerState.currentFile.artist || 'Artista Desconhecido',
      artwork: getThumbnailUrl(playerState.currentFile.name),
      year: (playerState.currentFile as any).year,
      genre: (playerState.currentFile as any).genre,
      label: playerState.currentFile.label,
      bpm: playerState.currentFile.bpm?.toString(),
      key: playerState.currentFile.key,
      duration: formatTime(playerState.duration),
      filename: playerState.currentFile.name
    };
  };

  // Não renderizar no servidor
  if (!isClient || !playerState.currentFile) return null;

  if (playerState.error) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-red-900 border-t border-red-700 px-4 py-3">
        <div className="text-red-100 text-center">{playerState.error}</div>
      </div>
    );
  }

  return (
    <>
      <div 
        className={`fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl border-t transition-all duration-300 ${playerMinimized ? 'pointer-events-none opacity-0 select-none' : ''}`}
        style={{
          background: `linear-gradient(135deg, 
            ${playerDominantColor} 0%, 
            rgba(0, 0, 0, 0.9) 70%, 
            rgba(15, 23, 42, 0.95) 100%
          )`,
          borderTop: `1px solid ${playerDominantColor.replace('0.2', '0.4')}`,
          boxShadow: `0 -4px 16px ${playerDominantColor.replace('0.2', '0.1')}`
        }}
      >
        <div className="hidden sm:flex flex-col px-6 py-3 relative" style={{ height: 96 }}>
          <div 
            className="absolute inset-0 border rounded-lg overflow-hidden backdrop-blur-md" 
            style={{ 
              background: `rgba(0, 0, 0, 0.3)`,
              borderColor: playerDominantColor.replace('0.2', '0.3'),
              boxShadow: `0 4px 16px ${playerDominantColor.replace('0.2', '0.1')}, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
            }}
          >
            <div ref={waveformDesktopRef} className="w-full h-full" />
            {!playerState.isReady && !playerState.isLoading && (
              <div className="absolute inset-0 flex items-center justify-center text-emerald-300/80 text-sm font-medium">
                Aguardando áudio...
              </div>
            )}
            
            {playerState.isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 rounded-lg backdrop-blur-sm">
                <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-400 border-t-2 border-t-transparent" />
              </div>
            )}
          </div>

          <div className="absolute top-0 left-0 right-0 z-20">
            <div 
              className="w-full h-1 bg-zinc-700/50 cursor-pointer"
              onClick={handleProgressClick}
            >
              <div 
                className="h-full bg-emerald-500 transition-all duration-100"
                style={{ 
                  width: `${playerState.duration > 0 ? (playerState.currentTime / playerState.duration) * 100 : 0}%` 
                }}
              />
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2">
            <button onClick={handleAlbumClick} className="hover:scale-105 transition-transform duration-200 flex-shrink-0">
              <Image
                src={getThumbnailUrl(playerState.currentFile.name)}
                alt={playerState.currentFile.title || playerState.currentFile.displayName}
                width={80}
                height={80}
                className="object-cover w-20 h-20 bg-zinc-800 rounded-lg cursor-pointer"
                style={{ width: 80, height: 80 }}
              />
            </button>

            <div className="flex-1 px-6 min-w-0">
              <div className="text-white font-bold text-lg leading-tight truncate">
                {playerState.currentFile.title || playerState.currentFile.displayName}
              </div>
              <div className="text-emerald-400 text-base truncate font-medium">
                {playerState.currentFile.artist || '-'}
              </div>
              <div className="text-zinc-400 text-sm flex gap-3 mt-1">
                {playerState.currentFile.bpm && (
                  <span className="bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded text-sm font-medium">
                    {playerState.currentFile.bpm} bpm
                  </span>
                )}
                {playerState.currentFile.key && (
                  <span className="bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded text-sm font-medium">
                    {playerState.currentFile.key}
                  </span>
                )}
                <div className="flex gap-1 text-zinc-300 font-medium">
                  <span>{formatTime(playerState.currentTime)}</span>
                  <span>/</span>
                  <span>{formatTime(playerState.duration)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button onClick={handlePrev} className="text-white hover:text-emerald-400 transition-colors">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
              </button>

              <button 
                onClick={togglePlay} 
                className="w-12 h-12 bg-emerald-600 hover:bg-emerald-500 rounded-full flex items-center justify-center text-white transition-colors"
              >
                {playerState.isPlaying ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                ) : (
                  <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>

              <button onClick={handleNext} className="text-white hover:text-emerald-400 transition-colors">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </button>

              <div className="flex items-center gap-2 ml-4">
                <button onClick={toggleMute} className="text-zinc-400 hover:text-emerald-400 transition-colors">
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
                  className="w-20 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>

              <button onClick={() => setPlayerMinimized(true)} className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-emerald-400 transition-colors rounded-full hover:bg-zinc-800/50">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="5" y="17" width="14" height="2" rx="1" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="flex sm:hidden flex-col p-5 gap-5">
          <div className="flex items-center gap-4">
            <button onClick={handleAlbumClick} className="hover:scale-105 transition-transform duration-200 flex-shrink-0">
              <Image
                src={getThumbnailUrl(playerState.currentFile.name)}
                alt={playerState.currentFile.title || playerState.currentFile.displayName}
                width={56}
                height={56}
                className="object-cover w-14 h-14 bg-zinc-800 rounded-lg cursor-pointer"
                style={{ width: 56, height: 56 }}
              />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-base leading-tight truncate">
                {playerState.currentFile.title || playerState.currentFile.displayName}
              </div>
              <div className="text-emerald-400 text-sm truncate font-medium">
                {playerState.currentFile.artist || '-'}
              </div>
              <div className="text-zinc-400 text-xs flex gap-2 mt-1">
                {playerState.currentFile.bpm && (
                  <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded text-xs font-medium">
                    {playerState.currentFile.bpm} bpm
                  </span>
                )}
                {playerState.currentFile.key && (
                  <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded text-xs font-medium">
                    {playerState.currentFile.key}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col">
            <div 
              className="w-full border border-emerald-500/30 rounded-xl overflow-hidden relative backdrop-blur-sm shadow-lg" 
              style={{ 
                height: 64, 
                minHeight: 64,
                background: `rgba(0, 0, 0, 0.3)`
              }}
            >
              <div ref={waveformMobileRef} className="w-full h-full" />
              {!playerState.isReady && !playerState.isLoading && (
                <div className="absolute inset-0 flex items-center justify-center text-emerald-400/70 text-sm font-medium">
                  Aguardando áudio...
                </div>
              )}
              {playerState.isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10 rounded-xl backdrop-blur-sm">
                  <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-500 border-t-2 border-t-transparent" />
                </div>
              )}
            </div>
            <div className="flex justify-between w-full text-xs text-zinc-300 mt-2 font-medium">
              <span>{formatTime(playerState.currentTime)}</span>
              <span>{formatTime(playerState.duration)}</span>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={handlePrev} className="text-white hover:text-emerald-400 transition-colors">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
              </button>

              <button 
                onClick={togglePlay} 
                className="w-12 h-12 bg-emerald-600 hover:bg-emerald-500 rounded-full flex items-center justify-center text-white transition-colors"
              >
                {playerState.isPlaying ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                ) : (
                  <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>

              <button onClick={handleNext} className="text-white hover:text-emerald-400 transition-colors">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </button>
            </div>

            <button onClick={() => setPlayerMinimized(true)} className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-emerald-400 transition-colors rounded-full hover:bg-zinc-800/50">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="5" y="17" width="14" height="2" rx="1" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {playerMinimized && (
        <div 
          className="fixed bottom-8 right-8 z-[100] border rounded-xl shadow-2xl flex items-center gap-3 px-4 py-3 min-w-[280px] backdrop-blur-xl"
          style={{
            background: `linear-gradient(135deg, 
              ${playerDominantColor} 0%, 
              rgba(0, 0, 0, 0.9) 70%, 
              rgba(15, 23, 42, 0.95) 100%
            )`,
            borderColor: playerDominantColor.replace('0.2', '0.4'),
            boxShadow: `0 8px 32px ${playerDominantColor.replace('0.2', '0.2')}, 0 2px 8px rgba(0, 0, 0, 0.3)`
          }}
        >
          <button onClick={handleAlbumClick} className="hover:scale-105 transition-transform duration-200 flex-shrink-0">
            <Image
              src={getThumbnailUrl(playerState.currentFile.name)}
              alt={playerState.currentFile.title || playerState.currentFile.displayName}
              width={48}
              height={48}
              className="object-cover w-12 h-12 bg-zinc-800 rounded-lg cursor-pointer"
              style={{ width: 48, height: 48 }}
            />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-sm truncate">
              {playerState.currentFile.title || playerState.currentFile.displayName}
            </div>
            <div className="text-emerald-400 text-xs truncate">
              {playerState.currentFile.artist || '-'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={togglePlay} 
              className="w-10 h-10 bg-emerald-600 hover:bg-emerald-500 rounded-full flex items-center justify-center text-white transition-colors"
            >
              {playerState.isPlaying ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
            <button onClick={() => setPlayerMinimized(false)} className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-emerald-400 transition-colors rounded-full hover:bg-zinc-800/50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>
        </div>
      )}

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