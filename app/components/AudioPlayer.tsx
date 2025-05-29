'use client';

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import Image from 'next/image';
import WaveSurfer from 'wavesurfer.js';

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

interface AudioPlayerProps {
  file: FileInfo;
  onClose: () => void;
  autoPlay?: boolean;
  onReady?: () => void;
}

const AudioPlayer = forwardRef(function AudioPlayer({ file, onClose, autoPlay = false, onReady }: AudioPlayerProps, ref) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('audioPlayerVolume');
      if (saved !== null) return parseFloat(saved);
    }
    return 1;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(autoPlay);
  const prevReady = useRef(false);

  useEffect(() => {
    let wavesurfer: WaveSurfer | null = null;
    setIsReady(false);
    setShouldAutoPlay(autoPlay);
    const initWaveSurfer = async () => {
      if (waveformRef.current) {
        waveformRef.current.innerHTML = '';
      }
      if (waveformRef.current && !wavesurferRef.current) {
        try {
          console.log('Iniciando WaveSurfer...');
          wavesurfer = WaveSurfer.create({
            container: waveformRef.current,
            waveColor: '#00e1ff',
            progressColor: '#fff',
            height: 64,
            barWidth: 2,
            cursorColor: '#fff',
            backend: 'MediaElement',
            mediaControls: false,
            normalize: true,
            interact: true,
          });
          const audioUrl = `/api/downloads/${encodeURIComponent(file.name)}`;
          console.log('Carregando áudio:', audioUrl);
          
          try {
            await wavesurfer.load(audioUrl);
            console.log('Áudio carregado com sucesso');
            wavesurferRef.current = wavesurfer;
            setIsReady(true); // Marca como pronto assim que o áudio é carregado
            
            wavesurfer.on('error', (err) => {
              console.error('Erro no WaveSurfer:', err);
              setIsReady(false);
            });
            
            wavesurfer.on('interaction', (progress: number) => {
              if (wavesurfer && duration) {
                const time = progress * duration;
                wavesurfer.seekTo(progress);
                setCurrentTime(time);
              }
            });
            
            wavesurfer.on('audioprocess', () => {
              setCurrentTime(wavesurfer!.getCurrentTime());
            });
            
            wavesurfer.on('ready', () => {
              console.log('WaveSurfer pronto para tocar');
              setDuration(wavesurfer!.getDuration());
              if (shouldAutoPlay) {
                setTimeout(() => {
                  if (wavesurfer && shouldAutoPlay) {
                    wavesurfer.play();
                    setIsPlaying(true);
                    setShouldAutoPlay(false);
                  }
                }, 5000);
              }
            });
            
            wavesurfer.on('finish', () => {
              setIsPlaying(false);
              setCurrentTime(0);
            });

            wavesurfer.setVolume(volume);
          } catch (loadError) {
            console.error('Erro ao carregar áudio:', loadError);
            setIsReady(false);
            if (wavesurfer) {
              wavesurfer.destroy();
            }
          }
        } catch (error) {
          console.error('Erro ao criar WaveSurfer:', error);
          if (wavesurfer) {
            wavesurfer.destroy();
          }
          setIsReady(false);
        }
      }
    };
    initWaveSurfer();
    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      if (waveformRef.current) {
        waveformRef.current.innerHTML = '';
      }
    };
  }, [file.name, autoPlay]);

  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(volume);
      if (isMuted) {
        wavesurferRef.current.setVolume(0);
      }
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('audioPlayerVolume', String(volume));
    }
  }, [volume, isMuted]);

  const togglePlay = async () => {
    if (!wavesurferRef.current || !isReady) return;
    try {
      if (isPlaying) {
        await wavesurferRef.current.pause();
        setIsPlaying(false);
      } else {
        await wavesurferRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Erro no togglePlay:', error);
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (wavesurferRef.current && duration) {
      const progress = time / duration;
      wavesurferRef.current.seekTo(progress);
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
    setVolume((prev) => (prev === 0 ? 1 : 0));
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  useImperativeHandle(ref, () => ({
    play: () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.play();
        setIsPlaying(true);
      }
    }
  }));

  // Sempre que mudar a música ou a prop autoPlay, reseta o shouldAutoPlay
  useEffect(() => {
    setShouldAutoPlay(autoPlay);
  }, [file.name, autoPlay]);

  useEffect(() => {
    if (isReady && !prevReady.current && onReady) {
      onReady();
    }
    prevReady.current = isReady;
  }, [isReady, onReady]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center bg-black px-4 py-2 border-t border-zinc-800 w-full" style={{ minHeight: 80 }}>
      {/* Info da faixa */}
      <div className="flex items-center gap-4 min-w-[260px]">
        <Image
          src={`/api/thumbnail/${encodeURIComponent(file.name)}`}
          alt={file.title || file.displayName}
          width={56}
          height={56}
          className="object-cover w-14 h-14 bg-zinc-800"
        />
        <div className="flex flex-col justify-center">
          <div className="text-white font-bold text-base leading-tight truncate max-w-[180px]">{file.title || file.displayName}</div>
          <div className="text-gray-400 text-xs truncate max-w-[180px]">{file.artist || '-'}</div>
          <div className="text-gray-500 text-xs flex gap-2">
            {file.bpm && <span>{file.bpm} bpm</span>}
            {file.key && <span>{file.key}</span>}
          </div>
          <div className="text-gray-500 text-xs truncate max-w-[180px]">{file.label || ''}</div>
        </div>
      </div>
      {/* Waveform */}
      <div className="flex-1 flex flex-col items-center mx-6 min-w-[300px]">
        <div ref={waveformRef} className="w-full" style={{ height: 64, minWidth: 300 }} />
        <div className="flex justify-between w-full text-xs text-gray-300 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      {/* Controles */}
      <div className="flex items-center gap-3 min-w-[180px] justify-end">
        <button
          onClick={togglePlay}
          disabled={!isReady}
          className={`w-12 h-12 flex items-center justify-center rounded-full bg-zinc-900 border border-zinc-700 text-white hover:bg-zinc-800 transition-colors text-2xl ${!isReady ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isPlaying ? (
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <polygon points="8,5 8,19 21,12" />
            </svg>
          )}
        </button>
        <button
          onClick={toggleMute}
          className="w-8 h-8 flex items-center justify-center text-white hover:text-cyan-400 transition-colors"
        >
          {isMuted ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={handleVolumeChange}
          className="w-20 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
        />
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
});

export default AudioPlayer; 