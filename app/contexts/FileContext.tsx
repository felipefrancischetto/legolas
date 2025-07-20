'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode, useRef } from 'react';

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
  ano?: string;
  status?: string;
  remixer?: string;
  catalogNumber?: string;
  catalog?: string;
}

interface FileContextType {
  files: FileInfo[];
  setFiles: (files: FileInfo[] | ((prev: FileInfo[]) => FileInfo[])) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  currentFile: FileInfo | null;
  setCurrentFile: (file: FileInfo | null) => void;
  metadataStatus: { [fileName: string]: 'idle' | 'loading' | 'success' | 'error' | string };
  setMetadataStatus: (status: { [fileName: string]: string }) => void;
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

// Função otimizada para comparar arrays de arquivos
const compareFileArrays = (arr1: FileInfo[], arr2: FileInfo[]): boolean => {
  if (arr1.length !== arr2.length) return false;
  
  // Comparação otimizada baseada em hash simples
  const hash1 = arr1.reduce((acc, file) => acc + file.name + file.size + (file.fileCreatedAt || ''), '');
  const hash2 = arr2.reduce((acc, file) => acc + file.name + file.size + (file.fileCreatedAt || ''), '');
  
  return hash1 === hash2;
};

export function FileProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFile, setCurrentFile] = useState<FileInfo | null>(null);
  const [metadataStatus, setMetadataStatus] = useState<{ [fileName: string]: 'idle' | 'loading' | 'success' | 'error' | string }>({});
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [updateProgress, setUpdateProgress] = useState({ current: 0, total: 0 });
  const [customDownloadsPath, setCustomDownloadsPath] = useState<string | null>(null);
  
  // Usar ref para evitar recreação da função
  const fetchFilesRef = useRef<(force?: boolean) => Promise<void>>();

  const fetchFiles = useCallback(async (force = false) => {
    // Evitar chamadas paralelas
    if (loading && !force) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/files');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Verificação otimizada sem JSON.stringify
      setFiles(prevFiles => {
        const newFiles = data.files || [];
        if (!force && compareFileArrays(prevFiles, newFiles)) {
          // Lista não mudou, mantendo estado atual
          return prevFiles;
        }
        // Lista atualizada
        return newFiles;
      });
    } catch (error) {
      console.error('❌ [FileContext] Erro ao carregar arquivos:', error);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // Atualizar ref quando função muda
  useEffect(() => {
    fetchFilesRef.current = fetchFiles;
  }, [fetchFiles]);

  const selectDownloadsFolder = useCallback(async () => {
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
        
        setCustomDownloadsPath(newPath);
        console.log('📂 Pasta de downloads alterada, disparando refresh automático.');
      } else {
        console.log('📂 Pasta selecionada é a mesma atual, sem refresh necessário');
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('❌ Erro ao selecionar pasta:', error);
      }
    }
  }, []);

  // Carregar configurações iniciais e fazer fetch inicial
  useEffect(() => {
    const savedPath = localStorage.getItem('customDownloadsPath');
    if (savedPath) {
      setCustomDownloadsPath(savedPath);
    }
    
    // Fazer fetch inicial apenas uma vez
    if (fetchFilesRef.current) {
      fetchFilesRef.current(true);
    }
  }, []); // Dependência vazia para executar apenas uma vez

  // Re-fetch files quando o caminho da pasta de download é alterado
  useEffect(() => {
    if (customDownloadsPath !== null && fetchFilesRef.current) {
      fetchFilesRef.current(true);
    }
  }, [customDownloadsPath]);

  // Listener para refresh automático
  useEffect(() => {
    const handleRefresh = () => {
      if (fetchFilesRef.current) {
        fetchFilesRef.current(true);
      }
    };

    window.addEventListener('refresh-files', handleRefresh);
    
    return () => {
      window.removeEventListener('refresh-files', handleRefresh);
    };
  }, []);

  // Memoizar o value do contexto para evitar re-renders desnecessários
  const contextValue = useMemo(() => ({
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
  }), [
    files,
    loading,
    currentFile,
    metadataStatus,
    isUpdatingAll,
    updateProgress,
    customDownloadsPath,
    fetchFiles,
    selectDownloadsFolder
  ]);

  return (
    <FileContext.Provider value={contextValue}>
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