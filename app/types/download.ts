export interface DownloadItem {
  id: string;
  url: string;
  title?: string;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  progress?: number;
  error?: string;
  createdAt: string;
  isPlaylist?: boolean;
  playlistItems?: Array<{
    title: string;
    status: 'pending' | 'downloading' | 'completed' | 'error';
    progress: number;
  }>;
  metadata?: {
    album?: string;
    ano?: string;
    genero?: string;
    descricao?: string;
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