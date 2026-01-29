"use client";

import Image from 'next/image';

interface TrackMetadata {
  title: string;
  artist: string;
  thumbnail?: string;
  duration?: string;
  url?: string;
  videoId?: string;
  source?: 'youtube-music' | 'youtube';
}

interface PlaylistTrackItemProps {
  track: {
    title: string;
    artist: string;
  };
  index: number;
  themeColors: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    background: string;
    border: string;
  };
  enabled: boolean;
  onToggle: (index: number) => void;
  onMetadataUpdate?: (index: number, metadata: TrackMetadata) => void;
  metadata?: TrackMetadata | null;
  isLoading?: boolean;
  isDownloaded?: boolean;
}

export default function PlaylistTrackItem({ 
  track, 
  index, 
  themeColors, 
  enabled,
  onToggle,
  onMetadataUpdate,
  metadata: externalMetadata,
  isLoading: externalLoading,
  isDownloaded = false
}: PlaylistTrackItemProps) {
  // Usar metadados externos se fornecidos, senão usar estado local
  const metadata = externalMetadata !== undefined ? externalMetadata : null;
  const loading = externalLoading !== undefined ? externalLoading : false;

  return (
    <div 
      className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-200 ${
        !enabled ? 'opacity-50' : ''
      }`}
      style={{
        background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
        border: `1px solid ${themeColors.border}`,
        boxShadow: `0 2px 8px ${themeColors.primary}15, inset 0 1px 0 rgba(255, 255, 255, 0.05)`
      }}
    >
      {/* Thumbnail */}
      <div className="flex-shrink-0 relative">
        {loading ? (
          <div 
            className="w-16 h-16 rounded-lg animate-pulse flex items-center justify-center"
            style={{ backgroundColor: themeColors.background }}
          >
            <svg className="w-6 h-6 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: themeColors.primary }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
        ) : metadata?.thumbnail ? (
          <Image
            src={metadata.thumbnail}
            alt={metadata.title}
            width={64}
            height={64}
            className="w-16 h-16 rounded-lg object-cover"
            unoptimized
          />
        ) : (
          <div 
            className="w-16 h-16 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: themeColors.background }}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: themeColors.primary }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
        )}
        
        {/* Indicador de vídeo do YouTube ou YouTube Music */}
        {metadata?.source && (
          <div 
            className="absolute -top-1 -right-1 flex items-center justify-center text-[10px] font-bold leading-none"
            style={{
              backgroundColor: '#FF0000',
              color: 'white',
              borderRadius: metadata.source === 'youtube-music' ? '4px' : '50%',
              width: metadata.source === 'youtube-music' ? '22px' : '20px',
              height: metadata.source === 'youtube-music' ? '22px' : '20px',
              boxShadow: `0 2px 4px rgba(0, 0, 0, 0.3)`
            }}
            title={metadata.source === 'youtube-music' ? 'YouTube Music' : 'Vídeo do YouTube'}
          >
            {metadata.source === 'youtube-music' ? (
              // Badge do YouTube Music com "M"
              <span className="font-bold">M</span>
            ) : (
              // Ícone do YouTube (play button)
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            )}
          </div>
        )}
      </div>

      {/* Informações da faixa */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="text-white font-semibold text-sm truncate">
              {loading ? (
                <span className="inline-block w-32 h-4 rounded animate-pulse" style={{ backgroundColor: themeColors.background }} />
              ) : (
                metadata?.title || track.title
              )}
            </h4>
            <p className="text-zinc-400 text-xs truncate mt-0.5">
              {loading ? (
                <span className="inline-block w-24 h-3 rounded animate-pulse mt-1" style={{ backgroundColor: themeColors.background }} />
              ) : (
                metadata?.artist || track.artist
              )}
            </p>
            
            {/* Duração do vídeo e indicador de já baixada */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {metadata && !loading && metadata.duration && (
                <span 
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: themeColors.background,
                    color: themeColors.primary,
                    border: `1px solid ${themeColors.border}`
                  }}
                >
                  {metadata.duration}
                </span>
              )}
              {isDownloaded && (
                <span 
                  className="text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1"
                  style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                    color: '#22c55e',
                    border: '1px solid rgba(34, 197, 94, 0.4)'
                  }}
                  title="Esta música já foi baixada"
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Já baixada
                </span>
              )}
            </div>
          </div>

          {/* Controles: Play e Toggle */}
          <div className="flex-shrink-0 flex items-center gap-2">
            {/* Botão de Play */}
            {metadata?.url && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(metadata.url, '_blank', 'noopener,noreferrer');
                }}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 backdrop-blur-md hover:shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.primary} 0%, ${themeColors.primaryDark} 100%)`,
                  border: `1px solid ${themeColors.border}`,
                  boxShadow: `0 2px 8px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                }}
                title={`Tocar no YouTube: ${metadata.title || track.title}`}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px) scale(1.1)';
                  e.currentTarget.style.boxShadow = `0 4px 12px ${themeColors.primary}40, inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = `0 2px 8px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.1)`;
                }}
              >
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </button>
            )}
            
            {/* Toggle */}
            <label className={`relative inline-flex items-center ${isDownloaded ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={() => !isDownloaded && onToggle(index)}
                disabled={isDownloaded}
                className="sr-only peer"
              />
              <div 
                className="w-11 h-6 rounded-full transition-all relative backdrop-blur-sm"
                style={{
                  background: enabled 
                    ? `linear-gradient(135deg, ${themeColors.primary} 0%, ${themeColors.primaryDark} 100%)` 
                    : 'linear-gradient(135deg, rgba(63, 63, 70, 0.8) 0%, rgba(63, 63, 70, 0.9) 100%)',
                  border: `1px solid ${enabled ? themeColors.border : 'rgba(82, 82, 91, 0.5)'}`,
                  boxShadow: enabled 
                    ? `0 2px 8px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.1)` 
                    : '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                }}
              >
                <div 
                  className="w-5 h-5 bg-white rounded-full transition-all absolute top-0.5 left-0.5 shadow-lg"
                  style={{
                    transform: enabled ? 'translateX(20px)' : 'translateX(0px)',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.1)'
                  }}
                />
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
