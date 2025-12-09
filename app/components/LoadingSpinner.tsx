'use client';

import { getThemeColors, DEFAULT_THEME_COLORS } from '../utils/themeColors';
import { useEffect, useState } from 'react';

interface LoadingSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  className?: string;
  variant?: 'circular' | 'dots' | 'bars' | 'pulse' | 'wave' | 'music' | 'orbit' | 'fade';
  themeColors?: any;
  speed?: 'slow' | 'normal' | 'fast';
  thickness?: 'thin' | 'normal' | 'thick';
  isLoading?: boolean; // Controle explícito do loading
  timeout?: number; // Timeout para evitar loading infinito
}

export default function LoadingSpinner({
  size = 'md',
  color,
  className = '',
  variant = 'circular',
  themeColors,
  speed = 'normal',
  thickness = 'normal',
  isLoading = true,
  timeout = 30000 // 30 segundos por padrão
}: LoadingSpinnerProps) {
  
  const [shouldShow, setShouldShow] = useState(isLoading);
  
  // Controle de timeout para evitar loading infinito
  useEffect(() => {
    if (isLoading && timeout > 0) {
      const timer = setTimeout(() => {
        setShouldShow(false);
      }, timeout);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading, timeout]);
  
  // Sincronizar com o prop isLoading
  useEffect(() => {
    if (isLoading !== shouldShow) {
      setShouldShow(isLoading);
    }
  }, [isLoading, shouldShow]);
  
  // Se não deve mostrar o spinner, retornar null
  if (!shouldShow) {
    return null;
  }
  
  const theme = getThemeColors(themeColors, false);
  const spinnerColor = color || theme.primary;
  
  const sizeConfig = {
    xs: { size: 'w-3 h-3', strokeWidth: '1.5', fontSize: '12px' },
    sm: { size: 'w-4 h-4', strokeWidth: '2', fontSize: '14px' },
    md: { size: 'w-5 h-5', strokeWidth: '2', fontSize: '16px' },
    lg: { size: 'w-6 h-6', strokeWidth: '2.5', fontSize: '18px' },
    xl: { size: 'w-8 h-8', strokeWidth: '3', fontSize: '20px' }
  };
  
  const speedConfig = {
    slow: 'animate-spin',
    normal: 'animate-spin',
    fast: 'animate-spin'
  };
  
  const thicknessConfig = {
    thin: '1px',
    normal: '2px',
    thick: '3px'
  };
  
  const config = sizeConfig[size];
  const speedClass = speedConfig[speed];
  const borderThickness = thicknessConfig[thickness];
  
  const getSpeedDuration = () => {
    switch(speed) {
      case 'slow': return '2s';
      case 'fast': return '0.5s';
      default: return '1s';
    }
  };
  
  if (variant === 'circular') {
    return (
      <div 
        className={`${config.size} ${speedClass} rounded-full border-2 border-t-transparent ${className}`}
        style={{ 
          borderColor: `${spinnerColor}40`, 
          borderTopColor: 'transparent', 
          borderRightColor: spinnerColor,
          borderWidth: borderThickness,
          animationDuration: getSpeedDuration()
        }}
      />
    );
  }
  
  if (variant === 'dots') {
    return (
      <div className={`flex items-center space-x-1 ${className}`}>
        {[0, 1, 2].map((i) => (
          <div 
            key={i}
            className={`${config.size.replace('w-', 'w-').replace('h-', 'h-').replace(/\d+/g, '2')} rounded-full animate-pulse`}
            style={{ 
              backgroundColor: spinnerColor, 
              animationDelay: `${i * 150}ms`,
              animationDuration: '1s'
            }}
          />
        ))}
      </div>
    );
  }
  
  if (variant === 'bars') {
    return (
      <div className={`flex items-center space-x-0.5 ${className}`}>
        {[0, 1, 2].map((i) => (
          <div 
            key={i}
            className="w-1 animate-pulse"
            style={{ 
              height: config.size.includes('3') ? '12px' : config.size.includes('4') ? '16px' : '20px',
              backgroundColor: spinnerColor,
              animationDelay: `${i * 150}ms`,
              animationDuration: '1s'
            }}
          />
        ))}
      </div>
    );
  }
  
  if (variant === 'pulse') {
    return (
      <div 
        className={`${config.size} rounded-full ${className}`}
        style={{
          backgroundColor: spinnerColor,
          animation: `pulse ${getSpeedDuration()} cubic-bezier(0.4, 0, 0.6, 1) infinite`
        }}
      />
    );
  }
  
  if (variant === 'wave') {
    return (
      <div className={`flex items-center space-x-1 ${className}`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div 
            key={i}
            className="w-1 rounded-full"
            style={{
              height: config.size.includes('3') ? '8px' : config.size.includes('4') ? '12px' : '16px',
              backgroundColor: spinnerColor,
              animation: `wave ${getSpeedDuration()} ease-in-out infinite alternate`,
              animationDelay: `${i * 0.1}s`
            }}
          />
        ))}
      </div>
    );
  }
  
  if (variant === 'music') {
    return (
      <div className={`flex items-center space-x-1 ${className}`}>
        {[0, 1, 2, 3].map((i) => (
          <div 
            key={i}
            className="w-1 rounded-full"
            style={{
              height: config.size.includes('3') ? '10px' : config.size.includes('4') ? '14px' : '18px',
              backgroundColor: spinnerColor,
              animation: `musicBars ${getSpeedDuration()} ease-in-out infinite alternate`,
              animationDelay: `${i * 0.1}s`
            }}
          />
        ))}
      </div>
    );
  }
  
  if (variant === 'orbit') {
    return (
      <div className={`relative ${config.size} ${className}`}>
        <div 
          className="absolute inset-0 rounded-full border-2 border-t-transparent"
          style={{
            borderColor: `${spinnerColor}30`,
            borderTopColor: spinnerColor,
            animation: `spin ${getSpeedDuration()} linear infinite`
          }}
        />
        <div 
          className="absolute inset-1 rounded-full border-2 border-b-transparent"
          style={{
            borderColor: `${spinnerColor}50`,
            borderBottomColor: spinnerColor,
            animation: `spin ${getSpeedDuration()} linear infinite reverse`
          }}
        />
      </div>
    );
  }
  
  if (variant === 'fade') {
    return (
      <div className={`relative ${config.size} ${className}`}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full"
            style={{
              backgroundColor: spinnerColor,
              top: '50%',
              left: '50%',
              transform: `rotate(${i * 45}deg) translate(0, -150%)`,
              transformOrigin: '0 150%',
              animation: `fade ${getSpeedDuration()} linear infinite`,
              animationDelay: `${i * 0.125}s`
            }}
          />
        ))}
      </div>
    );
  }
  
  return null;
}

// Adicionar estilos CSS customizados no final do arquivo
const styles = `
  @keyframes wave {
    0%, 100% { transform: scaleY(0.5); }
    50% { transform: scaleY(1.5); }
  }
  
  @keyframes musicBars {
    0% { transform: scaleY(0.2); }
    50% { transform: scaleY(1.2); }
    100% { transform: scaleY(0.4); }
  }
  
  @keyframes fade {
    0%, 100% { opacity: 0; }
    50% { opacity: 1; }
  }
`;

// Injetar estilos no DOM se ainda não estiverem lá
if (typeof document !== 'undefined') {
  const styleId = 'loading-spinner-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = styles;
    document.head.appendChild(style);
  }
} 