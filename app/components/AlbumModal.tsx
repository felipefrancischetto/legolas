'use client';

import Image from 'next/image';

interface AlbumModalProps {
  isOpen: boolean;
  onClose: () => void;
  albumData: {
    title: string;
    artist: string;
    artwork?: string;
    year?: string;
    genre?: string;
    label?: string;
    bpm?: string;
    key?: string;
    duration?: string;
    filename?: string;
  };
}

export default function AlbumModal({ isOpen, onClose, albumData }: AlbumModalProps) {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 sm:p-2"
      onClick={handleBackdropClick}
    >
      <div className="bg-zinc-900/95 backdrop-blur-xl rounded-2xl max-w-4xl w-full shadow-2xl relative animate-fade-in border border-zinc-700/50 glass-effect">
        {/* Header */}
        <div className="flex justify-between items-center p-8 border-b border-zinc-700/50 bg-gradient-to-r from-emerald-900/20 to-zinc-900/20 sm:p-6">
          <h2 className="text-2xl font-bold text-white sm:text-xl">Informações do Álbum</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-zinc-700/50"
          >
            <svg className="w-7 h-7 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="p-8 sm:p-6">
          {/* Layout responsivo: desktop lado a lado, mobile empilhado */}
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
            {/* Album Artwork - Muito maior */}
            <div className="flex-shrink-0 flex justify-center lg:justify-start">
              <div className="relative w-80 h-80 lg:w-96 lg:h-96 rounded-3xl overflow-hidden shadow-2xl border border-zinc-700/50 group sm:w-72 sm:h-72">
                {albumData.artwork ? (
                  <Image
                    src={albumData.artwork}
                    alt={albumData.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    priority
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 flex items-center justify-center">
                    <svg className="w-32 h-32 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                    </svg>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
            </div>
            
            {/* Informações do álbum */}
            <div className="flex-1 min-w-0">
              {/* Title and Artist */}
              <div className="mb-8 text-center lg:text-left">
                <h3 className="text-3xl font-bold text-white mb-3 leading-tight sm:text-2xl">{albumData.title}</h3>
                <p className="text-emerald-400 font-semibold text-xl sm:text-lg">{albumData.artist}</p>
              </div>
              
              {/* Album Details */}
              <div className="space-y-4">
            {albumData.year && (
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-gray-400 text-sm">Ano</span>
                <span className="text-white font-medium">{albumData.year}</span>
              </div>
            )}
            
            {albumData.genre && (
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-gray-400 text-sm">Gênero</span>
                <span className="text-white font-medium">{albumData.genre}</span>
              </div>
            )}
            
            {albumData.label && (
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-gray-400 text-sm">Gravadora</span>
                <span className="text-white font-medium">{albumData.label}</span>
              </div>
            )}
            
            {albumData.bpm && (
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-gray-400 text-sm">BPM</span>
                <span className="text-emerald-400 font-medium">{albumData.bpm}</span>
              </div>
            )}
            
            {albumData.key && (
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-gray-400 text-sm">Tonalidade</span>
                <span className="text-emerald-400 font-medium">{albumData.key}</span>
              </div>
            )}
            
            {albumData.duration && (
              <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                <span className="text-gray-400 text-sm">Duração</span>
                <span className="text-white font-medium">{albumData.duration}</span>
              </div>
            )}
            
            {albumData.filename && (
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-400 text-sm">Arquivo</span>
                <span className="text-white font-medium text-xs truncate max-w-48" title={albumData.filename}>
                  {albumData.filename}
                </span>
              </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-8 border-t border-zinc-700/50 sm:p-6">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl hover:from-emerald-700 hover:to-emerald-800 transition-all duration-200 font-semibold text-lg shadow-lg"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
} 