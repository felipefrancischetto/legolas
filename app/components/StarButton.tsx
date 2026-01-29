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
      thumbnail: file.thumbnail,
      ...file
    });
  };

  return (
    <button
      onClick={handleClick}
      className={`${sizeClasses[size]} rounded-lg transition-all duration-200 flex items-center justify-center group ${className}`}
      style={{
        backgroundColor: isStarred ? 'rgba(251, 191, 36, 0.15)' : 'transparent',
        border: `1px solid ${isStarred ? 'rgba(251, 191, 36, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
        boxShadow: isStarred 
          ? '0 2px 8px rgba(251, 191, 36, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
          : 'none'
      }}
      onMouseEnter={(e) => {
        if (!isStarred) {
          e.currentTarget.style.backgroundColor = 'rgba(251, 191, 36, 0.1)';
          e.currentTarget.style.borderColor = 'rgba(251, 191, 36, 0.3)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isStarred) {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
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
          color: isStarred ? '#fbbf24' : '#9ca3af',
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
