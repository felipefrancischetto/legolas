'use client';

import { memo } from 'react';

interface SkeletonBaseProps {
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
  pulseColor?: string;
}

// Skeleton base com shimmer effect melhorado
const SkeletonBase = memo(({ className = '', style, delay = 0, pulseColor = 'rgba(16, 185, 129, 0.1)' }: SkeletonBaseProps) => (
  <div 
    className={`animate-pulse relative overflow-hidden bg-zinc-700/20 rounded ${className}`}
    style={style}
  >
    <div 
      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-shimmer"
      style={{ 
        animationDelay: `${delay}s`,
        background: `linear-gradient(90deg, transparent, ${pulseColor}, transparent)`
      }}
    />
  </div>
));

SkeletonBase.displayName = 'SkeletonBase';

// Skeleton para thumbnail/imagem
export const SkeletonThumbnail = memo(({ size = 120, className = '', delay = 0 }: { size?: number; className?: string; delay?: number }) => (
  <div className={`relative flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
    <SkeletonBase 
      className="w-full h-full rounded"
      delay={delay}
      pulseColor="rgba(16, 185, 129, 0.12)"
    />
  </div>
));

SkeletonThumbnail.displayName = 'SkeletonThumbnail';

// Skeleton para texto com largura variável
export const SkeletonText = memo(({ 
  width = 'w-24', 
  height = 'h-4', 
  className = '', 
  delay = 0 
}: { 
  width?: string; 
  height?: string; 
  className?: string; 
  delay?: number; 
}) => (
  <SkeletonBase 
    className={`${width} ${height} ${className}`}
    delay={delay}
  />
));

SkeletonText.displayName = 'SkeletonText';

// Skeleton para tag/badge
export const SkeletonTag = memo(({ 
  width = 'w-16', 
  className = '', 
  delay = 0 
}: { 
  width?: string; 
  className?: string; 
  delay?: number; 
}) => (
  <SkeletonBase 
    className={`${width} h-6 rounded-full ${className}`}
    delay={delay}
    pulseColor="rgba(16, 185, 129, 0.06)"
  />
));

SkeletonTag.displayName = 'SkeletonTag';

// Skeleton para card de música (versão desktop)
export const SkeletonMusicCard = memo(({ 
  index = 0, 
  variant = 'desktop' 
}: { 
  index?: number; 
  variant?: 'desktop' | 'mobile'; 
}) => {
  const cardColor = 'rgba(16, 185, 129, 0.08)';
  const cardHeight = variant === 'desktop' ? 'h-[135.5px]' : 'h-[50px]';
  const thumbnailSize = variant === 'desktop' ? 135.5 : 36;
  
  return (
    <div
      className={`backdrop-blur-sm border rounded-xl overflow-hidden transition-all duration-300 ${cardHeight} flex animate-pulse relative`}
      style={{
        borderColor: cardColor.replace('0.08', '0.15'),
        background: `linear-gradient(135deg, 
          ${cardColor.replace('0.08', '0.02')} 0%, 
          ${cardColor.replace('0.08', '0.04')} 30%, 
          rgba(0, 0, 0, 0.3) 70%, 
          rgba(15, 23, 42, 0.4) 100%
        )`,
        boxShadow: `0 4px 16px ${cardColor.replace('0.08', '0.04')}, inset 0 1px 0 rgba(255, 255, 255, 0.03)`
      }}
    >
      {/* Shimmer effect sutil */}
      <div 
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-shimmer"
        style={{
          animationDelay: `${index * 0.1}s`,
          animationDuration: '2.5s'
        }}
      />
      
      {/* Thumbnail */}
      <SkeletonThumbnail size={thumbnailSize} delay={index * 0.05} />
      
      {/* Conteúdo */}
      {variant === 'desktop' ? (
        <div className="flex-1 p-3 flex flex-col min-w-0">
          {/* Título e artista */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0 mr-3">
              <SkeletonText width="w-72" height="h-4" className="mb-1" delay={index * 0.05 + 0.1} />
              <SkeletonText width="w-48" height="h-3" delay={index * 0.05 + 0.15} />
            </div>
            
            {/* Menu button */}
            <SkeletonBase className="w-6 h-6 rounded" delay={index * 0.05 + 0.2} />
          </div>

          {/* Tags/Metadados */}
          <div className="space-y-1 mt-2">
            {/* Primeira linha */}
            <div className="flex flex-wrap items-center gap-1">
              <SkeletonTag width="w-20" delay={index * 0.05 + 0.25} />
              <SkeletonTag width="w-16" delay={index * 0.05 + 0.3} />
              <SkeletonTag width="w-12" delay={index * 0.05 + 0.35} />
              <SkeletonTag width="w-14" delay={index * 0.05 + 0.4} />
            </div>

            {/* Segunda linha */}
            <div className="flex flex-wrap items-center gap-1">
              <SkeletonTag width="w-16" delay={index * 0.05 + 0.45} />
              <SkeletonTag width="w-12" delay={index * 0.05 + 0.5} />
              <SkeletonTag width="w-24" delay={index * 0.05 + 0.55} />
              <SkeletonTag width="w-20" delay={index * 0.05 + 0.6} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-3 px-3">
          <div className="flex-1 min-w-0">
            <SkeletonText width="w-32" height="h-4" delay={index * 0.05} />
          </div>
        </div>
      )}
    </div>
  );
});

SkeletonMusicCard.displayName = 'SkeletonMusicCard';

// Skeleton para header de pesquisa
export const SkeletonSearchHeader = memo(() => (
  <div className="flex flex-col lg:flex-row lg:items-center gap-4 flex-shrink-0 mb-4 mt-2">
    <div className="flex-1 relative">
      <SkeletonBase 
        className="w-full h-11 md:h-10 sm:h-9 rounded-xl border"
        style={{
          borderColor: 'rgba(255, 255, 255, 0.1)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.03)'
        }}
      />
    </div>
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 lg:gap-4">
      <div className="flex items-center gap-3">
        <SkeletonText width="w-20" height="h-4" delay={0.1} />
        <SkeletonBase 
          className="w-32 h-11 md:h-10 sm:h-9 rounded-xl border"
          style={{
            borderColor: 'rgba(255, 255, 255, 0.15)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
          }}
          delay={0.2}
        />
      </div>
      <SkeletonBase 
        className="w-28 h-8 rounded-xl"
        style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.1) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.15)'
        }}
        delay={0.3}
      />
    </div>
  </div>
));

SkeletonSearchHeader.displayName = 'SkeletonSearchHeader';

// Deterministic pseudo-random function for consistent server/client rendering
const seededRandom = (seed: number) => {
  // Simple seeded random function for deterministic values
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

// Skeleton para player de audio
export const SkeletonAudioPlayer = memo(({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) => {
  return (
    <div 
      className={`fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl transition-all duration-300`}
      style={{
        background: `linear-gradient(135deg, 
          rgba(16, 185, 129, 0.3) 0%, 
          rgba(0, 0, 0, 0.6) 70%, 
          rgba(15, 23, 42, 0.7) 100%
        )`,
      }}
    >
      {variant === 'desktop' ? (
        <div className="hidden sm:flex flex-col px-6 py-3 relative" style={{ height: 90 }}>
          {/* Waveform skeleton */}
          <div 
            className="absolute inset-0 rounded-lg overflow-hidden backdrop-blur-md flex items-center justify-center animate-pulse" 
            style={{ 
              background: `rgba(0, 0, 0, 0.2)`,
              boxShadow: `0 4px 16px rgba(16, 185, 129, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.03)`
            }}
          >
            {/* Barras de waveform animadas */}
            <div className="flex items-center justify-center gap-1 h-full">
              {Array.from({ length: 60 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full animate-pulse bg-emerald-500/30"
                  style={{
                    height: `${seededRandom(i) * 40 + 20}%`,
                    animationDelay: `${i * 0.02}s`,
                    animationDuration: '1.5s'
                  }}
                />
              ))}
            </div>
          </div>

          {/* Progress bar skeleton */}
          <div className="absolute left-0 right-0 z-30" style={{ top: '-8px' }}>
            <SkeletonBase 
              className="w-full h-4 rounded-full"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 3px rgba(0, 0, 0, 0.3)'
              }}
            />
          </div>

          {/* Controls skeleton */}
          <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-center px-4 py-2" style={{ height: 90 }}>
            <div className="w-full max-w-7xl flex items-center">
              {/* Thumbnail */}
              <SkeletonThumbnail size={70} />
              
              {/* Informações */}
              <div className="flex-1 px-4 min-w-0 flex flex-col justify-center">
                <SkeletonText width="w-48" height="h-5" className="mb-1" />
                <SkeletonText width="w-32" height="h-4" />
              </div>
              
              {/* Controles */}
              <div className="flex items-center gap-4">
                <SkeletonBase className="w-10 h-10 rounded-full" delay={0.1} />
                <SkeletonBase className="w-12 h-12 rounded-full" delay={0.2} />
                <SkeletonBase className="w-10 h-10 rounded-full" delay={0.3} />
              </div>
              
              {/* Volume */}
              <div className="flex items-center gap-2 ml-6">
                <SkeletonBase className="w-6 h-6 rounded" delay={0.4} />
                <SkeletonBase className="w-24 h-2 rounded-full" delay={0.5} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="sm:hidden flex flex-col px-4 py-3 relative" style={{ height: 180 }}>
          {/* Mobile waveform */}
          <div className="w-full rounded-xl overflow-hidden relative backdrop-blur-sm shadow-lg animate-pulse" style={{ height: 80 }}>
            <div className="flex items-center justify-center gap-1 h-full px-4">
              {Array.from({ length: 30 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full animate-pulse bg-emerald-500/30"
                  style={{
                    height: `${seededRandom(i + 1000) * 50 + 30}%`,
                    animationDelay: `${i * 0.03}s`,
                    animationDuration: '1.5s'
                  }}
                />
              ))}
            </div>
          </div>
          
          {/* Mobile controls */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-3">
              <SkeletonThumbnail size={48} />
              <div>
                <SkeletonText width="w-32" height="h-4" className="mb-1" />
                <SkeletonText width="w-24" height="h-3" />
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <SkeletonBase className="w-8 h-8 rounded-full" delay={0.1} />
              <SkeletonBase className="w-10 h-10 rounded-full" delay={0.2} />
              <SkeletonBase className="w-8 h-8 rounded-full" delay={0.3} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

SkeletonAudioPlayer.displayName = 'SkeletonAudioPlayer';

// Skeleton para lista completa de músicas
export const SkeletonMusicList = memo(({ 
  count = 8, 
  variant = 'desktop' 
}: { 
  count?: number; 
  variant?: 'desktop' | 'mobile'; 
}) => (
  <div className="flex flex-col h-full min-h-0 px-4">
    <SkeletonSearchHeader />
    
    <div className="flex-1 overflow-y-auto space-y-3 custom-scroll-square pb-4">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonMusicCard key={index} index={index} variant={variant} />
      ))}
    </div>
  </div>
));

SkeletonMusicList.displayName = 'SkeletonMusicList';

export default {
  Base: SkeletonBase,
  Thumbnail: SkeletonThumbnail,
  Text: SkeletonText,
  Tag: SkeletonTag,
  MusicCard: SkeletonMusicCard,
  SearchHeader: SkeletonSearchHeader,
  AudioPlayer: SkeletonAudioPlayer,
  MusicList: SkeletonMusicList
}; 