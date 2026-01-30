'use client';

import { useQuickPlaylist } from '../contexts/QuickPlaylistContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useFile } from '../contexts/FileContext';
import { useUI } from '../contexts/UIContext';
import Image from 'next/image';
import { getThumbnailUrl } from '../utils/thumbnailCache';
import { useState, useMemo, useEffect, useRef } from 'react';
import PlaylistManager from './PlaylistManager';

interface QuickPlaylistPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function QuickPlaylistPanel({ isOpen, onClose }: QuickPlaylistPanelProps = {}) {
  const { 
    tracks, 
    removeTrack, 
    clearPlaylist, 
    count,
    playlists,
    currentPlaylistId,
    setCurrentPlaylistId,
    getPlaylist
  } = useQuickPlaylist();
  const { play, playerState } = usePlayer();
  const { files } = useFile();
  const { playerOpen } = useUI();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showPlaylistManager, setShowPlaylistManager] = useState(false);
  
  // Se isOpen for fornecido externamente, usar ele. Senão, usar estado interno
  const isExternallyControlled = isOpen !== undefined;
  const isVisible = isExternallyControlled ? isOpen : !isMinimized;
  
  // Calcular altura disponível considerando o player
  const [availableHeight, setAvailableHeight] = useState('calc(100vh - 120px)');
  
  useEffect(() => {
    const updateHeight = () => {
      if (playerOpen) {
        setAvailableHeight('calc(100vh - 220px)'); // Player aberto
      } else {
        setAvailableHeight('calc(100vh - 120px)'); // Sem player
      }
    };
    
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [playerOpen]);

  // Ref para cache de arquivos para evitar recálculos desnecessários
  const filesRef = useRef(files);
  const tracksRef = useRef(tracks);
  const playlistFilesCacheRef = useRef<any[]>([]);
  
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  
  useEffect(() => {
    tracksRef.current = tracks;
    // Limpar cache quando tracks mudarem para forçar recálculo
    playlistFilesCacheRef.current = [];
  }, [tracks]);
  
  // Encontrar os arquivos completos correspondentes às tracks da playlist
  const playlistFiles = useMemo(() => {
    console.log('[playlistFiles] Recalculando playlistFiles:', {
      tracksCount: tracks.length,
      filesCount: files.length,
      trackNames: tracks.map(t => t.name)
    });
    
    const result = tracks.map((track, idx) => {
      const fullFile = files.find(f => f.name === track.name);
      // Sempre manter o name original da track da playlist para garantir remoção correta
      // Criar um novo objeto com o name preservado da track original
      if (fullFile) {
        const merged = { 
          ...fullFile, 
          name: track.name, // FORÇAR o name da track original da playlist
          // Preservar outros campos da track original que podem ser importantes
          title: track.title || fullFile.title,
          artist: track.artist || fullFile.artist
        };
        return merged;
      }
      return track;
    });
    
    console.log('[playlistFiles] Resultado:', {
      resultCount: result.length,
      resultNames: result.map(r => r.name)
    });
    
    return result;
  }, [tracks, files]);

  const handlePlay = (track: any) => {
    const fullFile = files.find(f => f.name === track.name);
    if (fullFile) {
      play(fullFile);
    }
  };

  // Se controlado externamente e fechado, não renderizar nada
  if (isExternallyControlled && !isOpen) {
    return null;
  }

  if (!isExternallyControlled && isMinimized) {
    return (
      <div className="hidden lg:block fixed right-6 top-6 z-40">
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 rounded-xl p-4 transition-all duration-200 backdrop-blur-xl shadow-lg hover:shadow-xl hover:scale-105"
          style={{
            boxShadow: '0 8px 24px rgba(16, 185, 129, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
          }}
          title="Expandir Quick Playlist"
        >
          <div className="relative">
            <svg className="w-7 h-7 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            {count > 0 && (
              <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border-2 border-black">
                {count > 9 ? '9+' : count}
              </span>
            )}
          </div>
        </button>
      </div>
    );
  }

  return (
    <div 
      className={`hidden lg:flex fixed right-6 top-6 z-40 w-80 flex-col backdrop-blur-xl transition-all duration-300 rounded-2xl overflow-hidden ${
        !isVisible ? 'pointer-events-none opacity-0 select-none' : ''
      }`}
      style={{
        height: availableHeight,
        maxHeight: 'calc(100vh - 140px)',
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.2) 30%, rgba(0, 0, 0, 0.9) 70%, rgba(15, 23, 42, 0.95) 100%)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        boxShadow: '0 20px 60px rgba(16, 185, 129, 0.25), 0 8px 24px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 p-5 border-b border-emerald-500/20 bg-black/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 flex-shrink-0">
              <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-bold text-lg leading-tight truncate">
                {getPlaylist(currentPlaylistId)?.name || 'Quick Playlist'}
              </h2>
              <p className="text-zinc-400 text-xs mt-0.5">
                {count} {count === 1 ? 'música' : 'músicas'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {count > 0 && (
              <span className="bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg text-xs font-bold border border-emerald-500/30">
                {count}
              </span>
            )}
            <button
              onClick={() => setShowPlaylistManager(true)}
              className="w-8 h-8 rounded-lg hover:bg-blue-500/10 transition-colors text-zinc-400 hover:text-blue-400 flex items-center justify-center border border-transparent hover:border-blue-500/20"
              title="Gerenciar playlists"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </button>
            <button
              onClick={() => {
                if (isExternallyControlled && onClose) {
                  onClose();
                } else {
                  setIsMinimized(true);
                }
              }}
              className="w-8 h-8 rounded-lg hover:bg-emerald-500/10 transition-colors text-zinc-400 hover:text-emerald-400 flex items-center justify-center border border-transparent hover:border-emerald-500/20"
              title="Minimizar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Seletor de playlist */}
        {playlists.length > 1 && (
          <div className="mb-3">
            <select
              value={currentPlaylistId}
              onChange={(e) => setCurrentPlaylistId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800/50 border border-emerald-500/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              {playlists.map((playlist) => (
                <option key={playlist.id} value={playlist.id} className="bg-zinc-900">
                  {playlist.name} ({playlist.tracks.length})
                </option>
              ))}
            </select>
          </div>
        )}
        
        {count > 0 && (
          <button
            onClick={() => clearPlaylist()}
            className="w-full px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 text-sm font-semibold transition-all duration-200 border border-red-500/20 hover:border-red-500/30 hover:scale-[1.02] active:scale-[0.98]"
          >
            🗑️ Limpar Playlist
          </button>
        )}
      </div>

      {/* Lista de músicas */}
      <div className="flex-1 overflow-y-auto custom-scroll-square p-3">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <svg className="w-16 h-16 text-zinc-600 mb-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            <p className="text-zinc-400 text-sm font-medium mb-1">Nenhuma música na playlist</p>
            <p className="text-zinc-500 text-xs">Clique na estrela nas músicas para adicionar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {playlistFiles.map((track, index) => {
              const isPlaying = playerState.currentFile?.name === track.name;
              const displayTitle = track.title || track.displayName || track.name;
              const displayArtist = track.artist || 'Artista desconhecido';
              
              return (
                <div
                  key={track.name}
                  className={`group rounded-xl p-3 cursor-pointer transition-all duration-200 ${
                    isPlaying ? 'bg-emerald-500/25 border-emerald-500/50' : 'bg-zinc-800/40 border-zinc-700/40 hover:bg-zinc-700/50'
                  } border backdrop-blur-sm hover:scale-[1.02] active:scale-[0.98]`}
                  onClick={() => handlePlay(track)}
                  style={{
                    boxShadow: isPlaying 
                      ? '0 8px 20px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)' 
                      : '0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
                  }}
                >
                  <div className="flex items-center gap-2">
                    {/* Thumbnail */}
                    <div className="relative flex-shrink-0">
                      <Image
                        src={getThumbnailUrl(track.name)}
                        alt={displayTitle}
                        width={48}
                        height={48}
                        className="w-12 h-12 rounded object-cover bg-zinc-800"
                      />
                      {isPlaying && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
                          {playerState.isPlaying ? (
                            <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                              <polygon points="8,5 19,12 8,19" />
                            </svg>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold truncate ${isPlaying ? 'text-emerald-300' : 'text-white'}`}>
                        {displayTitle}
                      </div>
                      <div className="text-xs text-zinc-400 truncate">
                        {displayArtist}
                      </div>
                      {track.duration && (
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {track.duration}
                        </div>
                      )}
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Encontrar a track original na playlist para garantir que usamos o identificador correto
                        const originalTrack = tracks.find(t => t.name === track.name);
                        const trackNameToRemove = originalTrack?.name || track.name;
                        
                        console.log('[QuickPlaylistPanel] Botão remover clicado:', {
                          trackName: track.name,
                          originalTrackName: originalTrack?.name,
                          trackNameToRemove,
                          allTracksInPlaylist: tracks.map(t => t.name),
                          currentPlaylistId
                        });
                        
                        if (trackNameToRemove) {
                          removeTrack(trackNameToRemove);
                        } else {
                          console.error('[QuickPlaylistPanel] Não foi possível encontrar o nome da track para remover');
                        }
                      }}
                      className="w-6 h-6 rounded hover:bg-red-500/20 transition-colors text-zinc-400 hover:text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100"
                      title="Remover da playlist"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Playlist Manager Modal */}
      <PlaylistManager 
        isOpen={showPlaylistManager} 
        onClose={() => setShowPlaylistManager(false)} 
      />
    </div>
  );
}
