"use client";

import LoadingSpinner from './LoadingSpinner';

interface SoundWaveProps {
  color?: string;
  size?: 'small' | 'medium' | 'large';
  isPlaying?: boolean;
  isLoading?: boolean;
}

export default function SoundWave({ 
  color = 'rgb(16, 185, 129)', 
  size = 'small',
  isPlaying = true,
  isLoading = false
}: SoundWaveProps) {
  
  const sizeConfig = {
    small: { width: 20, barWidth: 2.5, barCount: 4, gap: 1.5, spinnerSize: 'xs' as const },
    medium: { width: 26, barWidth: 3, barCount: 5, gap: 2, spinnerSize: 'sm' as const },
    large: { width: 92, barWidth: 7, barCount: 6, gap: 3, spinnerSize: 'md' as const }
  };

  const config = sizeConfig[size];

  // Se estiver carregando, mostrar spinner circular
  if (isLoading) {
    return (
      <div 
        className="flex items-center justify-center"
        style={{ 
          width: config.width, 
          height: config.width
        }}
      >
        <LoadingSpinner 
          size={config.spinnerSize}
          color={color}
          variant="music"
          isLoading={isLoading}
        />
      </div>
    );
  }

  // Definir as animações de cada barra
  const getAnimationStyle = (index: number) => {
    if (!isPlaying) return {};
    
    const delays = ['0s', '0.1s', '0.2s', '0.3s', '0.4s', '0.5s'];
    
    return {
      animation: `soundwave-${index} 0.5s ease-in-out infinite alternate`,
      animationDelay: delays[index] || '0s',
    };
  };

  return (
    <div 
      className="flex items-end justify-center"
      style={{ 
        width: config.width, 
        height: config.width,
        gap: `${config.gap}px`
      }}
    >
      {Array.from({ length: config.barCount }).map((_, index) => (
        <div
          key={index}
          style={{
            width: `${config.barWidth}px`,
            backgroundColor: color,
            height: `${config.barWidth * 3.5}px`,
            transformOrigin: 'bottom',
            ...getAnimationStyle(index),
          }}
        />
      ))}
    </div>
  );
} 