'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import Image from 'next/image';
import WaveSurfer from 'wavesurfer.js';
import { usePlayer } from '../contexts/PlayerContext';
import { useUI } from '../contexts/UIContext';
import { getThumbnailUrl } from '../utils/thumbnailCache';
import { useFile } from '../contexts/FileContext';

export default function AudioPlayer() {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const { playerState, setPlayerState, pause, resume, stop, setVolume, setIsMuted, play } = usePlayer();
  const { setPlayerOpen, playerMinimized, setPlayerMinimized } = useUI();
  const { volume, isMuted } = playerState;
  const [] = useState(false);
  const { files } = useFile();

  // Funções para avançar e voltar
  const handleNext = useCallback(() => {
    if (!playerState.currentFile) return;
    const idx = files.findIndex(f => f.name === playerState.currentFile?.name);
    if (idx !== -1 && idx < files.length - 1) {
      const nextFile = files[idx + 1];
      play(nextFile);
    }
  }, [files, playerState.currentFile, play]);

  const handlePrev = useCallback(() => {
    if (!playerState.currentFile) return;
    const idx = files.findIndex(f => f.name === playerState.currentFile?.name);
    if (idx > 0) {
      const prevFile = files[idx - 1];
      play(prevFile);
    }
  }, [files, playerState.currentFile, play]);

  // Abre o player quando houver uma música carregada
  useEffect(() => {
    if (playerState.currentFile) {
      setPlayerOpen(true);
    }
  }, [playerState.currentFile, setPlayerOpen]);

  // Salva as mudanças de volume no localStorage
  useEffect(() => {
    try {
      if (typeof volume === 'number' && !isNaN(volume)) {
        localStorage.setItem('audioPlayerVolume', volume.toString());
      }
    } catch (error) {
      console.error('Erro ao salvar volume no localStorage:', error);
    }
  }, [volume]);

  // Criação única do WaveSurfer
  useEffect(() => {
    if (!waveformRef.current) return;
    if (wavesurferRef.current) return;

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#00e1ff',
      progressColor: '#fff',
      height: 64,
      cursorColor: '#fff',
      backend: 'WebAudio',
      mediaControls: false,
      normalize: true,
      interact: true,
    });

    wavesurfer.on('ready', () => {
      const duration = wavesurfer.getDuration();
      setPlayerState(prev => ({
        ...prev,
        isReady: true,
        isLoading: false,
        duration
      }));
      // Só restaura o progresso salvo se for a mesma música do último refresh
      const lastFile = localStorage.getItem('audioPlayerCurrentFile');
      let lastFileName = null;
      if (lastFile) {
        try {
          lastFileName = JSON.parse(lastFile).name;
        } catch {}
      }
      if (
        playerState.currentFile &&
        playerState.currentFile.name &&
        lastFileName === playerState.currentFile.name &&
        playerState.currentTime > 0
      ) {
        // Só restaura se for a mesma música do último refresh
        wavesurfer.setTime(playerState.currentTime);
      } else {
        // Nova música: sempre começa do início
        wavesurfer.setTime(0);
      }
    });

    wavesurfer.on('audioprocess', () => {
      if (wavesurferRef.current) {
        const currentTime = wavesurferRef.current.getCurrentTime();
        setPlayerState(prev => ({ ...prev, currentTime }));
      }
    });

    wavesurfer.on('finish', () => {
      handleNext();
    });

    wavesurfer.on('error', (err) => {
      if (err && err.name === 'AbortError') {
        // Ignora abortos de carregamento (troca rápida de música ou desmontagem)
        return;
      }
      setPlayerState(prev => ({
        ...prev,
        error: 'Erro ao carregar o áudio',
        isLoading: false
      }));
    });

    wavesurfer.on('loading', (percent) => {
      // Não setar isLoading aqui para evitar re-renders desnecessários
    });

    wavesurferRef.current = wavesurfer;
  }, [stop, setPlayerState, playerState.currentTime, handleNext]);

  // Troca de música
  useEffect(() => {
    if (playerState.currentFile && wavesurferRef.current) {
      const audioUrl = `/api/downloads/${encodeURIComponent(playerState.currentFile.name)}`;
      wavesurferRef.current.load(audioUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState.currentFile]);

  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(isMuted ? 0 : volume);
    }
  }, [volume, isMuted]);

  // Atualiza o estado de playing quando o wavesurfer estiver pronto
  useEffect(() => {
    if (wavesurferRef.current && playerState.isReady) {
      if (playerState.isPlaying) {
        wavesurferRef.current.play();
      } else {
        wavesurferRef.current.pause();
      }
    }
  }, [playerState.isPlaying, playerState.isReady]);

  const togglePlay = useCallback(async () => {
    if (!wavesurferRef.current || !playerState.isReady) return;

    try {
      if (playerState.isPlaying) {
        pause();
      } else {
        resume();
      }
    } catch (error) {
      console.error('Erro ao controlar reprodução:', error);
      setPlayerState({ 
        error: 'Erro ao controlar reprodução', 
        isPlaying: false 
      });
    }
  }, [playerState.isPlaying, playerState.isReady, pause, resume, setPlayerState]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, [setVolume, setIsMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted);
    setVolume(isMuted ? 1 : 0);
  }, [isMuted, setIsMuted, setVolume]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!playerState.currentFile) return null;

  // Renderização sempre do player principal, mas ocultando visualmente quando minimizado

  if (playerState.error) {
    return (
      <div className={`fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center bg-black px-4 py-2 border-t border-zinc-800 w-full transition-all duration-300 ${playerMinimized ? 'pointer-events-none opacity-0 select-none' : ''}`} style={{ minHeight: 80 }}>
        <div className="text-red-500">{playerState.error}</div>
      </div>
    );
  }

  return (
    <>
      <div 
        className={`fixed bottom-0 left-0 right-0 z-50 flex items-center bg-black px-4 py-2 border-t border-zinc-800 w-full transition-all duration-300 ${playerMinimized ? 'pointer-events-none opacity-0 select-none' : ''}`}
        style={{ minHeight: 80 }}
      >
        {/* Info da faixa */}
        <div className="flex items-center gap-4 min-w-[260px]">
          <Image
            src={getThumbnailUrl(playerState.currentFile.name)}
            alt={playerState.currentFile.title || playerState.currentFile.displayName}
            width={56}
            height={56}
            className="object-cover w-14 h-14 bg-zinc-800"
          />
          <div className="flex flex-col justify-center">
            <div className="text-white font-bold text-base leading-tight truncate max-w-[180px]">
              {playerState.currentFile.title || playerState.currentFile.displayName}
            </div>
            <div className="text-gray-400 text-xs truncate max-w-[180px]">
              {playerState.currentFile.artist || '-'}
            </div>
            <div className="text-gray-500 text-xs flex gap-2">
              {playerState.currentFile.bpm && <span>{playerState.currentFile.bpm} bpm</span>}
              {playerState.currentFile.key && <span>{playerState.currentFile.key}</span>}
            </div>
            <div className="text-gray-500 text-xs truncate max-w-[180px]">
              {playerState.currentFile.label || ''}
            </div>
          </div>
        </div>

        {/* Waveform */}
        <div className="flex-1 flex flex-col justify-center mx-6 min-w-[300px] mt-5">
          <div ref={waveformRef} className="w-full" style={{ height: 64, minWidth: 300, position: 'relative' }}>
            {playerState.isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60 z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              </div>
            )}
          </div>
          <div className="flex justify-between w-full text-xs text-gray-300 mt-1">
            <span>{formatTime(playerState.currentTime)}</span>
            <span>{formatTime(playerState.duration)}</span>
          </div>
        </div>

        {/* Controles */}
        <div className="flex items-center gap-4 min-w-[200px] h-full" style={{ alignItems: 'center' }}>
          {/* Botão voltar */}
          <button
            onClick={handlePrev}
            disabled={!playerState.isReady || playerState.isLoading}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Anterior"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <polygon points="16,6 8,12 16,18" fill="currentColor" />
            </svg>
          </button>
          {/* Botão play/pause */}
          <button
            onClick={togglePlay}
            disabled={!playerState.isReady || playerState.isLoading}
            className={`w-10 h-10 flex items-center justify-center rounded-full bg-zinc-800 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {playerState.isPlaying ? (
              // Ícone de pausa: duas barras verticais
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <rect x="7" y="6" width="3" height="12" rx="1" fill="currentColor" />
                <rect x="14" y="6" width="3" height="12" rx="1" fill="currentColor" />
              </svg>
            ) : (
              // Ícone de play: triângulo
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="8,5 19,12 8,19" />
              </svg>
            )}
          </button>
          {/* Botão avançar */}
          <button
            onClick={handleNext}
            disabled={!playerState.isReady || playerState.isLoading}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Próxima"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <polygon points="8,6 16,12 8,18" fill="currentColor" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              disabled={!playerState.isReady || playerState.isLoading}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isMuted ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              disabled={!playerState.isReady || playerState.isLoading}
              className="w-20 disabled:opacity-50"
              style={{ accentColor: '#00e1ff' }}
            />
          </div>

          <button
            onClick={() => setPlayerMinimized(true)}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            title="Minimizar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="5" y="17" width="14" height="2" rx="1" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
      {/* Mini player flutuante, renderizado fora do player principal */}
      {playerMinimized && (
        <div className="fixed bottom-8 right-8 z-[100] bg-zinc-900 rounded-xl shadow-lg flex items-center gap-3 px-3 py-2 min-w-[220px] max-w-[320px] border border-zinc-800">
          <Image
            src={getThumbnailUrl(playerState.currentFile.name)}
            alt={playerState.currentFile.title || playerState.currentFile.displayName}
            width={40}
            height={40}
            className="object-cover w-10 h-10 rounded bg-zinc-800"
          />
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-sm truncate">
              {playerState.currentFile.title || playerState.currentFile.displayName}
            </div>
            <div className="text-gray-400 text-xs truncate">
              {playerState.currentFile.artist || '-'}
            </div>
          </div>
          <button
            onClick={togglePlay}
            disabled={!playerState.isReady || playerState.isLoading}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {playerState.isPlaying ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <rect x="7" y="6" width="3" height="12" rx="1" fill="currentColor" />
                <rect x="14" y="6" width="3" height="12" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="8,5 19,12 8,19" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setPlayerMinimized(false)}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            title="Restaurar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="5" y="5" width="14" height="14" rx="2" strokeWidth="2" />
            </svg>
          </button>
          {/* Botão de fechar */}
          <button
            onClick={() => {
              setPlayerState({ currentFile: null, isPlaying: false, currentTime: 0, isReady: false, isLoading: false })
              setPlayerOpen(false);
            }}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
            title="Fechar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <line x1="6" y1="6" x2="18" y2="18" strokeWidth="2" strokeLinecap="round" />
              <line x1="6" y1="18" x2="18" y2="6" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
} 