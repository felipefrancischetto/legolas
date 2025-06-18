import { useState, useCallback, useRef, useEffect } from 'react';
import { FileInfo } from '../types';

interface UsePlayerProps {
  onTimeUpdate?: (currentTime: number) => void;
  onEnded?: () => void;
}

export function usePlayer({ onTimeUpdate, onEnded }: UsePlayerProps = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [currentTrack, setCurrentTrack] = useState<FileInfo | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const play = useCallback((track: FileInfo) => {
    if (audioRef.current) {
      if (currentTrack?.name === track.name) {
        audioRef.current.play();
        setIsPlaying(true);
      } else {
        setCurrentTrack(track);
        audioRef.current.src = `/api/stream/${encodeURIComponent(track.name)}`;
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  }, [currentTrack]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  }, [isPlaying]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      onTimeUpdate?.(audioRef.current.currentTime);
    }
  }, [onTimeUpdate]);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    onEnded?.();
  }, [onEnded]);

  return {
    isPlaying,
    currentTime,
    duration,
    volume,
    currentTrack,
    audioRef,
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleEnded
  };
} 