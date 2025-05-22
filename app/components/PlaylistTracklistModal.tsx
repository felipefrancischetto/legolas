"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useDownload } from '../contexts/DownloadContext';

interface Track {
  title: string;
  artist: string;
  duration: string;
  thumbnail?: string;
  url?: string;
}

interface PlaylistTracklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlistUrl: string;
}

export default function PlaylistTracklistModal({ isOpen, onClose, playlistUrl }: PlaylistTracklistModalProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { addToQueue } = useDownload();

  useEffect(() => {
    if (isOpen && playlistUrl) {
      fetchTracks();
    }
  }, [isOpen, playlistUrl]);

  const fetchTracks = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/playlist-info?url=${encodeURIComponent(playlistUrl)}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar playlist');
      }
      
      setTracks(data.tracks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar playlist');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (track: Track) => {
    if (track.url) {
      addToQueue(track.url);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col animate-fade-in">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">Faixas da Playlist</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <div className="text-red-400 text-center py-4">{error}</div>
          ) : (
            <div className="space-y-2">
              {tracks.map((track, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-2 rounded-lg hover:bg-zinc-800 transition-colors group"
                >
                  <div className="w-12 h-12 bg-zinc-800 rounded overflow-hidden flex-shrink-0">
                    {track.thumbnail ? (
                      <Image
                        src={track.thumbnail}
                        alt={track.title}
                        width={48}
                        height={48}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{track.title}</div>
                    <div className="text-gray-400 text-sm truncate">{track.artist}</div>
                  </div>
                  <div className="text-gray-400 text-sm">{track.duration}</div>
                  <button
                    onClick={() => handleDownload(track)}
                    disabled={!track.url}
                    className="px-4 py-2 bg-zinc-700 text-white rounded hover:bg-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Baixar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 