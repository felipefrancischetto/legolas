'use client';

import { useQuickPlaylist } from '../contexts/QuickPlaylistContext';

interface FileInfo {
  name: string;
  displayName?: string;
  title?: string;
  artist?: string;
  path?: string;
  thumbnail?: string;
  [key: string]: any;
}

interface StarButtonProps {
  file: FileInfo;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function StarButton({ file, size = 'md', className = '' }: StarButtonProps) {
  const { isInPlaylist, toggleTrack } = useQuickPlaylist();
  const isStarred = isInPlaylist(file.name);

  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleTrack({
      name: file.name,
      title: file.title || file.displayName,
      artist: file.artist,
      path: file.path,
      thumbnail: file.thumbnail
    });
  };

  const buttonSize = size === 'md' ? 'w-9 h-9' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
  
  return (
    <button
      onClick={handleClick}
      className={`w-7 h-7 rounded-xl backdrop-blur-md transition-all duration-200 hover:scale-105 flex items-center justify-center group ${className}`}
      style={{
        background: isStarred 
          ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(251, 191, 36, 0.15) 100%)'
          : 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.25) 100%)',
        borderColor: isStarred ? 'rgba(251, 191, 36, 0.4)' : 'rgba(16, 185, 129, 0.4)',
        boxShadow: isStarred 
          ? '0 4px 12px rgba(251, 191, 36, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
          : '0 4px 12px rgba(16, 185, 129, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
        if (isStarred) {
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(251, 191, 36, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)';
        } else {
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        if (isStarred) {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(251, 191, 36, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
        } else {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
        }
      }}
      title={isStarred ? 'Remover da quick playlist' : 'Adicionar à quick playlist'}
      type="button"
    >
      <svg 
        className={`${iconSizes[size]} transition-all duration-200 ${isStarred ? 'scale-110' : 'scale-100'}`}
        fill={isStarred ? '#fbbf24' : 'currentColor'}
        stroke={isStarred ? '#fbbf24' : 'currentColor'}
        strokeWidth={isStarred ? 0 : 1.5}
        viewBox="0 0 24 24"
        style={{ 
          color: isStarred ? '#fbbf24' : 'rgb(16, 185, 129)',
          filter: isStarred ? 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.5))' : 'none'
        }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
        />
      </svg>
    </button>
  );
}
