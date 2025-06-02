'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface FileInfo {
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
}

interface FileContextType {
  files: FileInfo[];
  setFiles: (files: FileInfo[]) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  currentFile: FileInfo | null;
  setCurrentFile: (file: FileInfo | null) => void;
  metadataStatus: { [fileName: string]: 'idle' | 'loading' | 'success' | 'error' | string };
  setMetadataStatus: (status: { [fileName: string]: 'idle' | 'loading' | 'success' | 'error' | string }) => void;
  isUpdatingAll: boolean;
  setIsUpdatingAll: (updating: boolean) => void;
  updateProgress: { current: number; total: number };
  setUpdateProgress: (progress: { current: number; total: number }) => void;
  customDownloadsPath: string | null;
  setCustomDownloadsPath: (path: string | null) => void;
  fetchFiles: () => Promise<void>;
}

const FileContext = createContext<FileContextType | undefined>(undefined);

export function FileProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFile, setCurrentFile] = useState<FileInfo | null>(null);
  const [metadataStatus, setMetadataStatus] = useState<{ [fileName: string]: 'idle' | 'loading' | 'success' | 'error' | string }>({});
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [updateProgress, setUpdateProgress] = useState({ current: 0, total: 0 });
  const [customDownloadsPath, setCustomDownloadsPath] = useState<string | null>(null);

  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/files');
      const data = await response.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error('Erro ao carregar arquivos:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <FileContext.Provider value={{
      files,
      setFiles,
      loading,
      setLoading,
      currentFile,
      setCurrentFile,
      metadataStatus,
      setMetadataStatus,
      isUpdatingAll,
      setIsUpdatingAll,
      updateProgress,
      setUpdateProgress,
      customDownloadsPath,
      setCustomDownloadsPath,
      fetchFiles
    }}>
      {children}
    </FileContext.Provider>
  );
}

export function useFile() {
  const context = useContext(FileContext);
  if (context === undefined) {
    throw new Error('useFile must be used within a FileProvider');
  }
  return context;
} 