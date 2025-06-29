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
  youtubeUrl?: string;
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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 sm:p-2">
      <div className="bg-zinc-900 rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col animate-fade-in sm:p-4 sm:max-w-full sm:mx-2 sm:max-h-[90vh]">
        <div className="flex justify-between items-center mb-4 sm:mb-3">
          <h2 className="text-xl font-semibold text-white sm:text-lg">Faixas da Playlist</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scroll sm:pr-1">
          {loading ? (
            <div className="flex justify-center items-center h-32 sm:h-24">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin sm:w-6 sm:h-6"></div>
            </div>
          ) : error ? (
            <div className="text-red-400 text-center py-4 sm:py-3 sm:text-sm">{error}</div>
          ) : (
            <div className="space-y-2 sm:space-y-1">
              {tracks.map((track, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-zinc-800 transition-colors group sm:gap-3 sm:p-2"
                >
                  <div className="w-12 h-12 bg-zinc-800 rounded overflow-hidden flex-shrink-0 sm:w-10 sm:h-10">
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
                        <svg className="w-6 h-6 text-gray-400 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate sm:text-sm">{track.title}</div>
                    <div className="text-gray-400 text-sm truncate sm:text-xs">{track.artist}</div>
                  </div>
                  <div className="text-gray-400 text-sm flex-shrink-0 sm:text-xs">{track.duration}</div>
                  <button
                    onClick={() => window.open(track.youtubeUrl, '_blank')}
                    className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-300 transition-all p-1 sm:opacity-100"
                    title="Abrir no YouTube"
                  >
                    <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-3 pt-4 border-t border-zinc-700 sm:mt-3 sm:gap-2 sm:pt-3 sm:flex-col">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-700 text-white rounded-md hover:bg-zinc-600 transition-colors sm:px-3 sm:py-1.5 sm:text-sm"
          >
            Fechar
          </button>
          <button
            onClick={() => {
              // Implementar download de toda a playlist
              alert('Funcionalidade em desenvolvimento');
            }}
            disabled={loading || tracks.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors sm:px-3 sm:py-1.5 sm:text-sm"
          >
            Baixar Playlist
          </button>
        </div>
      </div>
    </div>
  );
} 