export interface FileInfo {
  name: string;
  displayName: string;
  path: string;
  size: number;
  title?: string;
  artist?: string;
  duration?: string;
  thumbnail?: string;
  bpm?: number;
  key?: string;
  genre?: string;
  album?: string;
  downloadedAt?: string;
  metadata?: {
    album?: string;
    ano?: string;
    genero?: string;
    descricao?: string;
  };
  fileCreatedAt?: string;
  isBeatportFormat?: boolean;
  label?: string;
  ano?: string;
  status?: string;
  remixer?: string;
}

export interface DownloadStatus {
  type: 'individual' | 'playlist';
  status: 'pending' | 'downloading' | 'completed' | 'error' | 'queued';
  progress?: number;
  title: string;
  currentStep?: string;
  currentSubstep?: string;
  detail?: string;
  playlistProgress?: {
    current: number;
    total: number;
    completed: number;
    errors: number;
    downloading?: number;
  };
  error?: string;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
} 