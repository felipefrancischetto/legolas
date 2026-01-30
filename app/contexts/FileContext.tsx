'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode, useRef } from 'react';
import { safeSetItem, safeGetItem } from '../utils/localStorage';

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
  fetchFiles: (force?: boolean, skipLoading?: boolean) => Promise<void>;
  selectDownloadsFolder: () => Promise<void>;
  recentlyAdded: string[];
  recentlyRemoved: string[];
  markAsRemoving: (fileName: string) => void;
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
  // Usar arrays ao invés de Sets para garantir que React detecte mudanças
  const [recentlyAdded, setRecentlyAdded] = useState<string[]>([]);
  const [recentlyRemoved, setRecentlyRemoved] = useState<string[]>([]);
  
  // Usar ref para evitar recreação da função
  const fetchFilesRef = useRef<(force?: boolean, skipLoading?: boolean) => Promise<void>>();

  // Ref para controlar se está fazendo fetch
  const isFetchingRef = useRef(false);
  // Ref para timeout de segurança
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const fetchFiles = useCallback(async (force = false, skipLoading = false) => {
    // Se está fazendo fetch e não é forçado, agendar para depois (mas não bloquear completamente)
    if (isFetchingRef.current && !force) {
      console.log('⏳ [FileContext] Fetch já em andamento, agendando para depois...');
      // Agendar para tentar novamente em 500ms
      setTimeout(() => {
        fetchFiles(true, skipLoading);
      }, 500);
      return;
    }
    
    console.log(`📥 [FileContext] Iniciando fetch de arquivos (force: ${force}, skipLoading: ${skipLoading})...`);
    isFetchingRef.current = true;
    
    // Só mostrar loading se não for uma atualização incremental
    if (!skipLoading) {
      setLoading(true);
      
      // Timeout de segurança: se a requisição demorar mais de 30 segundos, forçar loading = false
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      loadingTimeoutRef.current = setTimeout(() => {
        console.warn('⚠️ [FileContext] Timeout de segurança: forçando loading = false após 30s');
        setLoading(false);
        isFetchingRef.current = false;
      }, 30000);
    }
    
    // Criar AbortController para timeout manual (compatibilidade)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    
    try {
      const response = await fetch('/api/files', {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('❌ [FileContext] Erro ao fazer parse da resposta JSON:', parseError);
        throw new Error('Resposta inválida do servidor');
      }
      
      // Verificar se a resposta foi truncada
      if (data.error && data.message) {
        console.warn(`⚠️ [FileContext] ${data.message}`);
        if (data.total && data.files) {
          console.warn(`⚠️ [FileContext] Recebidos ${data.files.length} de ${data.total} arquivos`);
        }
      }
      
      // Verificação otimizada sem JSON.stringify
      setFiles(prevFiles => {
        const newFiles = data.files || [];
        console.log(`✅ [FileContext] Lista de arquivos recebida: ${newFiles.length} arquivos`);
        
        // Otimizar arquivos: remover campos null/undefined para reduzir tamanho na memória
        const optimizedFiles = newFiles.map((file: FileInfo) => {
          const optimized: FileInfo = {
            name: file.name,
            displayName: file.displayName,
            path: file.path || '', // path pode não vir da API otimizada
            size: file.size,
          };
          
          // Adicionar apenas campos que têm valores
          if (file.title) optimized.title = file.title;
          if (file.artist) optimized.artist = file.artist;
          if (file.duration) optimized.duration = file.duration;
          if (file.thumbnail) optimized.thumbnail = file.thumbnail;
          if (file.bpm) optimized.bpm = file.bpm;
          if (file.key) optimized.key = file.key;
          if (file.genre) optimized.genre = file.genre;
          if (file.album) optimized.album = file.album;
          if (file.downloadedAt) optimized.downloadedAt = file.downloadedAt;
          if (file.fileCreatedAt) optimized.fileCreatedAt = file.fileCreatedAt;
          if (file.isBeatportFormat !== undefined) optimized.isBeatportFormat = file.isBeatportFormat;
          if (file.label) optimized.label = file.label;
          if (file.ano) optimized.ano = file.ano;
          if (file.status) optimized.status = file.status;
          if (file.remixer) optimized.remixer = file.remixer;
          if (file.catalogNumber) optimized.catalogNumber = file.catalogNumber;
          if (file.catalog) optimized.catalog = file.catalog;
          
          return optimized;
        });
        
        // Sempre detectar mudanças incrementais, mesmo se a lista não mudou (para garantir animações)
        const prevFileNames = new Set(prevFiles.map((f: FileInfo) => f.name));
        const newFileNames = new Set(optimizedFiles.map((f: FileInfo) => f.name));
        
        // Arquivos adicionados
        const added = optimizedFiles.filter((f: FileInfo) => !prevFileNames.has(f.name));
        // Arquivos removidos - detectar todos os que não estão mais na nova lista
        // Não filtrar por recentlyRemoved aqui, pois precisamos detectar remoções reais do servidor
        const removed = prevFiles.filter((f: FileInfo) => !newFileNames.has(f.name));
        
        console.log(`🔍 [FileContext] Comparação: ${prevFiles.length} arquivos anteriores, ${optimizedFiles.length} arquivos novos`);
        if (removed.length > 0) {
          console.log(`🗑️ [FileContext] Arquivos que não estão mais na lista do servidor:`, removed.map((f: FileInfo) => f.name));
        }
        
        // Se não há mudanças e não é forçado, manter estado atual
        if (!force && added.length === 0 && removed.length === 0 && compareFileArrays(prevFiles, optimizedFiles)) {
          console.log('📋 [FileContext] Lista não mudou, mantendo estado atual');
          return prevFiles;
        }
        
        if (added.length > 0 || removed.length > 0) {
          console.log(`📋 [FileContext] Mudanças incrementais detectadas: +${added.length} -${removed.length} arquivos`);
          
          // Atualizar estados de animação ANTES de atualizar a lista
          if (added.length > 0) {
            const addedNames = added.map((f: FileInfo) => f.name);
            console.log(`✨ [FileContext] Arquivos adicionados:`, addedNames);
            setRecentlyAdded(prev => {
              const updated = [...new Set([...prev, ...addedNames])];
              // Limpar após animação (600ms para dar tempo da animação completa)
              setTimeout(() => {
                setRecentlyAdded(current => {
                  const cleaned = current.filter(name => !addedNames.includes(name));
                  console.log(`✨ [FileContext] Limpando animação de adição para:`, addedNames);
                  return cleaned;
                });
              }, 600);
              return updated;
            });
          }
          
          if (removed.length > 0) {
            const removedNames = removed.map((f: FileInfo) => f.name);
            console.log(`🗑️ [FileContext] Arquivos removidos detectados:`, removedNames);
            
            // Adicionar aos arquivos removidos para animação
            setRecentlyRemoved(prev => {
              const updated = [...new Set([...prev, ...removedNames])];
              console.log(`🗑️ [FileContext] Estado recentlyRemoved atualizado:`, updated);
              return updated;
            });
            
            // Para remoção, manter os itens temporariamente na lista durante a animação
            // Combinar arquivos novos com arquivos removidos (que ainda estão sendo animados)
            const filesWithRemoved = [
              ...optimizedFiles,
              ...removed.filter((f: FileInfo) => !optimizedFiles.some((nf: FileInfo) => nf.name === f.name))
            ];
            
            // Lista atualizada com itens removidos temporariamente mantidos
            console.log(`📋 [FileContext] Lista atualizada: ${prevFiles.length} -> ${optimizedFiles.length} arquivos (mantendo ${removed.length} removidos temporariamente para animação)`);
            return filesWithRemoved;
          }
          
          // Se só há adições, retornar lista atualizada normalmente
          if (added.length > 0 && removed.length === 0) {
            console.log(`📋 [FileContext] Lista atualizada: ${prevFiles.length} -> ${optimizedFiles.length} arquivos`);
            return optimizedFiles;
          }
        }
        
        // Lista atualizada sem mudanças incrementais detectadas
        console.log(`📋 [FileContext] Lista atualizada: ${prevFiles.length} -> ${optimizedFiles.length} arquivos`);
        return optimizedFiles;
      });
    } catch (error: any) {
      clearTimeout(timeoutId); // Garantir limpeza em caso de erro
      console.error('❌ [FileContext] Erro ao carregar arquivos:', error);
      // Em caso de erro, ainda definir files como array vazio para não ficar em loading infinito
      setFiles([]);
      
      // Se for erro de timeout ou abort, logar especificamente
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        console.warn('⚠️ [FileContext] Requisição cancelada ou timeout');
      }
    } finally {
      // Limpar timeout de segurança
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      if (!skipLoading) {
        setLoading(false);
      }
      isFetchingRef.current = false;
    }
  }, []);

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
      const currentPath = safeGetItem<string>('customDownloadsPath');
      
      if (newPath !== currentPath) {
        safeSetItem('customDownloadsPath', newPath, { maxSize: 1024 });
        
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
    const savedPath = safeGetItem<string>('customDownloadsPath');
    if (savedPath) {
      setCustomDownloadsPath(savedPath);
    }
    
    // Fazer fetch inicial imediatamente - garantir que sempre execute
    console.log('🚀 [FileContext] Iniciando fetch inicial de arquivos...');
    const initialFetch = async () => {
      try {
        await fetchFiles(true);
      } catch (error) {
        console.error('❌ [FileContext] Erro no fetch inicial:', error);
        // Tentar novamente após 2 segundos em caso de erro
        setTimeout(() => {
          console.log('🔄 [FileContext] Tentando fetch inicial novamente...');
          fetchFiles(true);
        }, 2000);
      }
    };
    
    initialFetch();
  }, []); // Dependência vazia para executar apenas uma vez

  // Re-fetch files quando o caminho da pasta de download é alterado
  useEffect(() => {
    if (customDownloadsPath !== null) {
      fetchFiles(true);
    }
  }, [customDownloadsPath, fetchFiles]);

  // Ref para armazenar timeouts de remoção
  const removalTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // Remover itens da lista após a animação de remoção terminar
  useEffect(() => {
    if (recentlyRemoved.length === 0) {
      // Limpar timeouts se não há arquivos removidos
      removalTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      removalTimeoutsRef.current.clear();
      return;
    }
    
    console.log(`🎬 [FileContext] Arquivos em animação de remoção:`, recentlyRemoved);
    
    // Para cada arquivo removido, criar um timeout se ainda não existir
    recentlyRemoved.forEach(fileName => {
      // Se já existe um timeout para este arquivo, não criar outro
      if (removalTimeoutsRef.current.has(fileName)) {
        return;
      }
      
      console.log(`⏱️ [FileContext] Criando timeout para remover ${fileName} após animação`);
      
      const timeoutId = setTimeout(() => {
        console.log(`🗑️ [FileContext] Removendo arquivo da lista após animação: ${fileName}`);
        
        // Remover da lista de arquivos
        setFiles(prevFiles => {
          const beforeCount = prevFiles.length;
          const filtered = prevFiles.filter((f: FileInfo) => f.name !== fileName);
          const afterCount = filtered.length;
          
          if (beforeCount !== afterCount) {
            console.log(`✅ [FileContext] Arquivo removido da lista: ${fileName} (${beforeCount} -> ${afterCount} arquivos)`);
          } else {
            console.warn(`⚠️ [FileContext] Arquivo não encontrado na lista para remover: ${fileName}`);
          }
          
          return filtered;
        });
        
        // Limpar do estado recentlyRemoved
        setRecentlyRemoved(prev => {
          const cleaned = prev.filter(name => name !== fileName);
          if (cleaned.length !== prev.length) {
            console.log(`🧹 [FileContext] Limpando animação de remoção para: ${fileName}`);
          }
          return cleaned;
        });
        
        // Remover o timeout do mapa
        removalTimeoutsRef.current.delete(fileName);
      }, 500); // Um pouco mais que a duração da animação (400ms)
      
      // Armazenar o timeout
      removalTimeoutsRef.current.set(fileName, timeoutId);
    });
    
    // Cleanup: cancelar timeouts para arquivos que não estão mais em recentlyRemoved
    const currentRemoved = new Set(recentlyRemoved);
    removalTimeoutsRef.current.forEach((timeoutId, fileName) => {
      if (!currentRemoved.has(fileName)) {
        console.log(`🧹 [FileContext] Cancelando timeout para arquivo que não está mais em recentlyRemoved: ${fileName}`);
        clearTimeout(timeoutId);
        removalTimeoutsRef.current.delete(fileName);
      }
    });
    
    return () => {
      // Cleanup: cancelar todos os timeouts pendentes quando o componente desmontar
      removalTimeoutsRef.current.forEach((timeoutId, fileName) => {
        console.log(`🧹 [FileContext] Cleanup: cancelando timeout para ${fileName}`);
        clearTimeout(timeoutId);
      });
      removalTimeoutsRef.current.clear();
    };
  }, [recentlyRemoved]);

  // Ref para debounce de refresh
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshTimeRef = useRef<number>(0);
  
  // Listener para refresh automático (com debounce otimizado)
  useEffect(() => {
    const handleRefresh = (event?: CustomEvent) => {
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshTimeRef.current;
      
      // Limpar timeout anterior
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      
      // Verificar se é uma atualização incremental (sem loading)
      const skipLoading = event?.detail?.skipLoading === true;
      
      // Para atualizações incrementais (após download), aguardar um pouco mais para garantir que o arquivo foi salvo
      // Para outras atualizações, usar debounce normal
      const debounceTime = skipLoading 
        ? 800 // Aguardar 800ms para garantir que arquivo foi salvo no sistema de arquivos
        : (timeSinceLastRefresh > 1000 ? 0 : 300);
      
      console.log(`🔄 [FileContext] Evento refresh-files recebido, agendando fetch em ${debounceTime}ms (skipLoading: ${skipLoading})`);
      
      refreshTimeoutRef.current = setTimeout(() => {
        lastRefreshTimeRef.current = Date.now();
        console.log('🔄 [FileContext] Executando refresh agendado...');
        fetchFiles(true, skipLoading);
      }, debounceTime);
    };

    window.addEventListener('refresh-files', handleRefresh as EventListener);
    
    return () => {
      window.removeEventListener('refresh-files', handleRefresh as EventListener);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [fetchFiles]);

  // Função para marcar arquivo como removendo (inicia animação imediatamente)
  const markAsRemoving = useCallback((fileName: string) => {
    setRecentlyRemoved(prev => {
      if (prev.includes(fileName)) {
        return prev; // Já está marcado
      }
      const updated = [...prev, fileName];
      console.log(`🎬 [FileContext] Arquivo marcado como removendo: ${fileName}`);
      return updated;
    });
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
    selectDownloadsFolder,
    recentlyAdded,
    recentlyRemoved,
    markAsRemoving
  }), [
    files,
    loading,
    currentFile,
    metadataStatus,
    isUpdatingAll,
    updateProgress,
    customDownloadsPath,
    fetchFiles,
    selectDownloadsFolder,
    recentlyAdded,
    recentlyRemoved,
    markAsRemoving
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