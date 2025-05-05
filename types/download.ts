export interface DownloadItem {
  id: string;
  url: string;
  title: string;
  status: 'pending' | 'queued' | 'downloading' | 'completed' | 'error';
  progress: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
  isPlaylist: boolean;
  playlistItems?: Array<{
    title: string;
    status: 'pending' | 'downloading' | 'completed' | 'error';
    progress: number;
  }>;
  metadata?: {
    titulo?: string;
    artista?: string;
    album?: string;
    ano?: string;
    genero?: string;
    descricao?: string;
    [key: string]: any;
  };
}

export interface DownloadHistory {
  id: string;
  title: string;
  url: string;
  downloadedAt: string;
  isPlaylist: boolean;
  playlistItems?: Array<{
    title: string;
    downloadedAt: string;
  }>;
} 