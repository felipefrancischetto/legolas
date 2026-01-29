'use client';

import { useState } from 'react';
import { useQuickPlaylist, Playlist } from '../contexts/QuickPlaylistContext';

interface PlaylistManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PlaylistManager({ isOpen, onClose }: PlaylistManagerProps) {
  const {
    playlists,
    currentPlaylistId,
    setCurrentPlaylistId,
    createPlaylist,
    updatePlaylist,
    deletePlaylist
  } = useQuickPlaylist();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');

  if (!isOpen) return null;

  const handleCreatePlaylist = () => {
    if (newPlaylistName.trim()) {
      const id = createPlaylist(newPlaylistName.trim());
      setCurrentPlaylistId(id);
      setNewPlaylistName('');
      onClose();
    }
  };

  const handleStartEdit = (playlist: Playlist) => {
    setEditingId(playlist.id);
    setEditName(playlist.name);
  };

  const handleSaveEdit = (id: string) => {
    if (editName.trim()) {
      updatePlaylist(id, { name: editName.trim() });
      setEditingId(null);
      setEditName('');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja deletar esta playlist?')) {
      deletePlaylist(id);
      if (currentPlaylistId === id) {
        setCurrentPlaylistId('quick-playlist');
      }
    }
  };

  const handleSelectPlaylist = (id: string) => {
    setCurrentPlaylistId(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div 
        className="w-full max-w-2xl max-h-[80vh] bg-gradient-to-br from-zinc-900 to-black rounded-2xl border border-emerald-500/30 shadow-2xl overflow-hidden flex flex-col"
        style={{
          boxShadow: '0 20px 60px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 p-6 border-b border-emerald-500/20 bg-black/40">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Gerenciar Playlists</h2>
              <p className="text-zinc-400 text-sm">Crie e organize suas playlists</p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-lg hover:bg-emerald-500/10 transition-colors text-zinc-400 hover:text-emerald-400 flex items-center justify-center"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Criar nova playlist */}
        <div className="flex-shrink-0 p-4 border-b border-emerald-500/10 bg-black/20">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreatePlaylist()}
              placeholder="Nome da nova playlist..."
              className="flex-1 px-4 py-2 rounded-lg bg-zinc-800/50 border border-emerald-500/20 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            <button
              onClick={handleCreatePlaylist}
              disabled={!newPlaylistName.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-medium transition-colors border border-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Criar
            </button>
          </div>
        </div>

        {/* Lista de playlists */}
        <div className="flex-1 overflow-y-auto p-4 custom-scroll-square space-y-2">
          {playlists.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto mb-4 text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              <p className="text-zinc-400">Nenhuma playlist criada</p>
            </div>
          ) : (
            playlists.map((playlist) => (
              <div
                key={playlist.id}
                className={`group rounded-xl p-4 transition-all duration-200 ${
                  currentPlaylistId === playlist.id
                    ? 'bg-emerald-500/20 border-emerald-500/40'
                    : 'bg-zinc-800/30 border-zinc-700/30 hover:bg-zinc-700/40'
                } border backdrop-blur-sm`}
              >
                {editingId === playlist.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(playlist.id);
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      className="flex-1 px-3 py-2 rounded-lg bg-zinc-900/50 border border-emerald-500/30 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveEdit(playlist.id)}
                      className="px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 transition-colors"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-3 py-2 rounded-lg bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => handleSelectPlaylist(playlist.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          currentPlaylistId === playlist.id
                            ? 'bg-emerald-500/30'
                            : 'bg-zinc-700/50'
                        }`}>
                          <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className={`font-semibold ${
                            currentPlaylistId === playlist.id ? 'text-emerald-300' : 'text-white'
                          }`}>
                            {playlist.name}
                          </h3>
                          <p className="text-xs text-zinc-400">
                            {playlist.tracks.length} {playlist.tracks.length === 1 ? 'música' : 'músicas'}
                          </p>
                        </div>
                        {currentPlaylistId === playlist.id && (
                          <span className="ml-auto px-2 py-1 rounded text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Ativa
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStartEdit(playlist)}
                        className="w-8 h-8 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors flex items-center justify-center"
                        title="Editar nome"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {playlist.id !== 'quick-playlist' && (
                        <button
                          onClick={() => handleDelete(playlist.id)}
                          className="w-8 h-8 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors flex items-center justify-center"
                          title="Deletar playlist"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
