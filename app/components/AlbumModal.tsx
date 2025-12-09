'use client';

import Image from 'next/image';
import { useSettings } from '../hooks/useSettings';

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
    fileSize?: string;
    format?: string;
    bitrate?: string;
    sampleRate?: string;
    channels?: string;
    encoder?: string;
    dateAdded?: string;
    lastPlayed?: string;
    playCount?: number;
    album?: string;
    track?: string;
    disc?: string;
    composer?: string;
    publisher?: string;
    isrc?: string;
    catalog?: string;
  };
  themeColors?: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    background: string;
    border: string;
  };
}

export default function AlbumModal({ isOpen, onClose, albumData, themeColors }: AlbumModalProps) {
  const { settings } = useSettings();
  
  if (!isOpen) return null;

  // Cores padrão caso não sejam fornecidas
  const defaultColors = {
    primary: 'rgb(16, 185, 129)',
    primaryLight: 'rgba(16, 185, 129, 0.9)',
    primaryDark: 'rgba(16, 185, 129, 0.7)',
    background: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)'
  };
  
  // Usar cores padrão se cores dinâmicas estiverem desabilitadas
  const colors = (settings.disableDynamicColors || !themeColors) ? defaultColors : themeColors;

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
      <div 
        className="rounded-xl backdrop-blur-xl max-w-5xl w-full shadow-2xl relative animate-fade-in border max-h-[90vh] overflow-y-auto custom-scroll"
        style={{
          background: 'linear-gradient(135deg, rgba(39, 39, 42, 0.7) 0%, rgba(24, 24, 27, 0.8) 100%)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
        }}
      >
        {/* Header */}
        <div 
          className="flex justify-between items-center p-8 border-b sm:p-6"
          style={{
            background: `linear-gradient(135deg, ${colors.background} 0%, rgba(39, 39, 42, 0.5) 100%)`,
            borderColor: colors.border
          }}
        >
          <div className="flex items-center gap-3">
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colors.primary }}
            />
            <h2 
              className="text-2xl font-bold sm:text-xl"
              style={{ color: colors.primary }}
            >
              Informações da Música
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-all duration-200 p-2 rounded-full hover:scale-105"
            style={{
              backgroundColor: 'rgba(63, 63, 70, 0.5)',
              border: '1px solid rgba(82, 82, 91, 0.5)'
            }}
          >
            <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="p-8 sm:p-6">
          {/* Layout responsivo: desktop lado a lado, mobile empilhado */}
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
            {/* Album Artwork */}
            <div className="flex-shrink-0 flex justify-center lg:justify-start">
              <div 
                className="relative w-80 h-80 lg:w-96 lg:h-96 rounded-xl overflow-hidden shadow-2xl border group sm:w-72 sm:h-72"
                style={{ borderColor: colors.border }}
              >
                {albumData.artwork ? (
                  <Image
                    src={albumData.artwork}
                    alt={albumData.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    priority
                  />
                ) : (
                  <div 
                    className="w-full h-full flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${colors.primaryDark} 0%, ${colors.primary} 100%)`
                    }}
                  >
                    <svg className="w-32 h-32 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                    </svg>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
            </div>
            
            {/* Informações da música */}
            <div className="flex-1 min-w-0">
              {/* Title and Artist */}
              <div className="mb-8 text-center lg:text-left">
                <h3 className="text-3xl font-bold text-white mb-3 leading-tight sm:text-2xl">{albumData.title}</h3>
                <p 
                  className="font-semibold text-xl sm:text-lg"
                  style={{ color: colors.primary }}
                >
                  {albumData.artist}
                </p>
                {albumData.album && albumData.album !== albumData.title && (
                  <p className="text-gray-400 text-lg mt-2 sm:text-base">Álbum: {albumData.album}</p>
                )}
              </div>
              
              {/* Informações organizadas em seções */}
              <div className="space-y-8">
                
                {/* Seção: Informações Básicas */}
                <div>
                  <h4 
                    className="text-lg font-semibold mb-4 pb-2 border-b"
                    style={{ 
                      color: colors.primary,
                      borderColor: colors.border
                    }}
                  >
                    Informações Básicas
                  </h4>
                  <div className="space-y-3">
                    {albumData.genre && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Gênero</span>
                        <span className="text-white font-medium">{albumData.genre}</span>
                      </div>
                    )}
                    {albumData.year && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Ano</span>
                        <span className="text-white font-medium">{albumData.year}</span>
                      </div>
                    )}
                    {albumData.label && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Gravadora</span>
                        <span className="text-white font-medium">{albumData.label}</span>
                      </div>
                    )}
                    {albumData.duration && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Duração</span>
                        <span className="text-white font-medium">{albumData.duration}</span>
                      </div>
                    )}
                    {albumData.track && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Faixa</span>
                        <span className="text-white font-medium">{albumData.track}</span>
                      </div>
                    )}
                    {albumData.disc && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Disco</span>
                        <span className="text-white font-medium">{albumData.disc}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Seção: Informações Técnicas de Áudio */}
                <div>
                  <h4 
                    className="text-lg font-semibold mb-4 pb-2 border-b"
                    style={{ 
                      color: colors.primary,
                      borderColor: colors.border
                    }}
                  >
                    Especificações Técnicas
                  </h4>
                  <div className="space-y-3">
                    {albumData.bpm && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">BPM</span>
                        <span 
                          className="font-medium"
                          style={{ color: colors.primaryLight }}
                        >
                          {albumData.bpm}
                        </span>
                      </div>
                    )}
                    {albumData.key && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Tonalidade</span>
                        <span 
                          className="font-medium"
                          style={{ color: colors.primaryLight }}
                        >
                          {albumData.key}
                        </span>
                      </div>
                    )}
                    {albumData.format && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Formato</span>
                        <span className="text-white font-medium">{albumData.format.toUpperCase()}</span>
                      </div>
                    )}
                    {albumData.bitrate && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Bitrate</span>
                        <span className="text-white font-medium">{albumData.bitrate}</span>
                      </div>
                    )}
                    {albumData.sampleRate && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Sample Rate</span>
                        <span className="text-white font-medium">{albumData.sampleRate}</span>
                      </div>
                    )}
                    {albumData.channels && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Canais</span>
                        <span className="text-white font-medium">{albumData.channels}</span>
                      </div>
                    )}
                    {albumData.encoder && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Encoder</span>
                        <span className="text-white font-medium">{albumData.encoder}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Seção: Metadados Adicionais */}
                {(albumData.composer || albumData.publisher || albumData.isrc || albumData.catalog) && (
                  <div>
                    <h4 
                      className="text-lg font-semibold mb-4 pb-2 border-b"
                      style={{ 
                        color: colors.primary,
                        borderColor: colors.border
                      }}
                    >
                      Metadados
                    </h4>
                    <div className="space-y-3">
                      {albumData.composer && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 text-sm">Compositor</span>
                          <span className="text-white font-medium">{albumData.composer}</span>
                        </div>
                      )}
                      {albumData.publisher && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 text-sm">Editora</span>
                          <span className="text-white font-medium">{albumData.publisher}</span>
                        </div>
                      )}
                      {albumData.isrc && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 text-sm">ISRC</span>
                          <span className="text-white font-medium">{albumData.isrc}</span>
                        </div>
                      )}
                      {albumData.catalog && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 text-sm">Catálogo</span>
                          <span className="text-white font-medium">{albumData.catalog}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Seção: Informações do Arquivo */}
                <div>
                  <h4 
                    className="text-lg font-semibold mb-4 pb-2 border-b"
                    style={{ 
                      color: colors.primary,
                      borderColor: colors.border
                    }}
                  >
                    Arquivo
                  </h4>
                  <div className="space-y-3">
                    {albumData.filename && (
                      <div className="flex justify-between items-start">
                        <span className="text-gray-400 text-sm">Nome do Arquivo</span>
                        <span className="text-white font-medium text-xs text-right max-w-64 break-all">
                          {albumData.filename}
                        </span>
                      </div>
                    )}
                    {albumData.fileSize && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Tamanho</span>
                        <span className="text-white font-medium">{albumData.fileSize}</span>
                      </div>
                    )}
                    {albumData.dateAdded && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Adicionado em</span>
                        <span className="text-white font-medium">{albumData.dateAdded}</span>
                      </div>
                    )}
                    {albumData.lastPlayed && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Última reprodução</span>
                        <span className="text-white font-medium">{albumData.lastPlayed}</span>
                      </div>
                    )}
                    {albumData.playCount !== undefined && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Reproduções</span>
                        <span 
                          className="font-medium"
                          style={{ color: colors.primaryLight }}
                        >
                          {albumData.playCount}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div 
          className="p-8 border-t sm:p-6"
          style={{ borderColor: colors.border }}
        >
          <button
            onClick={onClose}
            className="w-full px-6 py-3 text-white rounded-xl transition-all duration-200 font-semibold text-lg shadow-lg hover:scale-105"
            style={{
              backgroundColor: colors.primary,
              border: `1px solid ${colors.border}`,
              boxShadow: `0 4px 16px ${colors.background}`
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
} 