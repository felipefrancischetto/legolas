"use client";

interface SoundWaveProps {
  color?: string;
  size?: 'small' | 'medium' | 'large';
  isPlaying?: boolean;
}

export default function SoundWave({ 
  color = 'rgb(16, 185, 129)', 
  size = 'small',
  isPlaying = true 
}: SoundWaveProps) {
  
  const sizeConfig = {
    small: { width: 20, barWidth: 2.5, barCount: 4, gap: 1.5 },
    medium: { width: 26, barWidth: 3, barCount: 5, gap: 2 },
    large: { width: 32, barWidth: 4, barCount: 6, gap: 2.5 }
  };

  const config = sizeConfig[size];

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
          className="rounded-full"
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