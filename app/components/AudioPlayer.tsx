import { useState, useRef, useEffect } from 'react';

interface AudioPlayerProps {
  file: {
    name: string;
    title?: string;
    artist?: string;
    duration?: string;
    thumbnail?: string;
  };
  onClose: () => void;
}

export default function AudioPlayer({ file, onClose }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const vol = parseFloat(e.target.value);
    audioRef.current.volume = vol;
    setVolume(vol);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 p-4 transform transition-transform duration-300 ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}>
      <audio
        ref={audioRef}
        src={`/api/downloads/${encodeURIComponent(file.name)}`}
        preload="metadata"
      />
      
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Thumbnail e Info */}
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-1/3">
            {file.thumbnail && (
              <div className="w-14 h-14 bg-zinc-800 rounded-sm overflow-hidden flex-shrink-0 transform hover:scale-105 transition-transform duration-200">
                <img
                  src={file.thumbnail}
                  alt={file.title || file.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm text-white font-medium truncate">
                {file.title || file.name.replace(/\.mp3$/, '')}
              </div>
              {file.artist && (
                <div className="text-xs text-gray-400 truncate">{file.artist}</div>
              )}
            </div>
          </div>

          {/* Controles */}
          <div className="flex flex-col items-center flex-1 w-full sm:w-auto">
            <div className="flex items-center gap-4 mb-2">
              <button
                onClick={togglePlay}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-all duration-200 transform"
              >
                {isPlaying ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
            </div>
            
            <div className="flex items-center gap-2 w-full">
              <span className="text-xs text-gray-400 w-10 text-right">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleTimeChange}
                className="flex-1 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white hover:[&::-webkit-slider-thumb]:scale-110 transition-transform duration-200"
              />
              <span className="text-xs text-gray-400 w-10">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2 w-full sm:w-1/3 justify-end mt-4 sm:mt-0">
            <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="w-24 h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white hover:[&::-webkit-slider-thumb]:scale-110 transition-transform duration-200"
            />
            <button
              onClick={onClose}
              className="ml-4 text-gray-400 hover:text-white transform hover:scale-110 active:scale-95 transition-transform duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 