'use client';

import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';

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
  fetchFiles: (force?: boolean) => Promise<void>;
  selectDownloadsFolder: () => Promise<void>;
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

  const fetchFiles = useCallback(async (force = false) => {
    console.log('🔄 [FileContext] Buscando lista de arquivos... (force:', force, ')');
    setLoading(true);
    try {
      const response = await fetch('/api/files');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Verificar se realmente houve mudanças para evitar updates desnecessários
      setFiles(prevFiles => {
        const newFiles = data.files || [];
        if (JSON.stringify(prevFiles) === JSON.stringify(newFiles)) {
          console.log('🔄 [FileContext] Lista não mudou, mantendo estado atual');
          return prevFiles;
        }
        console.log(`🔄 [FileContext] Lista atualizada: ${newFiles.length} arquivos`);
        return newFiles;
      });
    } catch (error) {
      console.error('❌ [FileContext] Erro ao carregar arquivos:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectDownloadsFolder = async () => {
    try {
      // @ts-ignore
      const directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads'
      });
      
      const newPath = directoryHandle.name;
      const currentPath = localStorage.getItem('customDownloadsPath');
      
      if (newPath !== currentPath) {
        localStorage.setItem('customDownloadsPath', newPath);
        
        await fetch('/api/set-downloads-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: newPath }),
        });
        
        setCustomDownloadsPath(newPath); // Atualiza o estado no contexto
        console.log('📂 Pasta de downloads alterada, disparando refresh automático.');
      } else {
        console.log('📂 Pasta selecionada é a mesma atual, sem refresh necessário');
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('❌ Erro ao selecionar pasta:', error);
      }
    }
  };

  useEffect(() => {
    const savedPath = localStorage.getItem('customDownloadsPath');
    if (savedPath) {
      setCustomDownloadsPath(savedPath);
    }
    fetchFiles(true); // Fetch inicial
  }, [fetchFiles]);
  
  // Re-fetch files quando o caminho da pasta de download é alterado
  useEffect(() => {
    if (customDownloadsPath !== null) {
      fetchFiles(true);
    }
  }, [customDownloadsPath, fetchFiles]);

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
      fetchFiles,
      selectDownloadsFolder
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