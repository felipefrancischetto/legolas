// Cache de thumbnails centralizado para toda a aplicação
const thumbnailCache = new Map<string, { url: string; timestamp: number; isDefault?: boolean }>();
const failedThumbnails = new Set<string>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos
const FAILED_CACHE_DURATION = 5 * 60 * 1000; // 5 minutos para falhas

// Função única e otimizada para cache de thumbnails
export function getThumbnailUrl(filename: string): string {
  const now = Date.now();
  
  // Limpeza periódica do cache (só a cada 5 minutos para performance)
  if (now % 300000 < 1000) { // Aproximadamente a cada 5 minutos
    for (const [key, cacheEntry] of thumbnailCache.entries()) {
      if (now - cacheEntry.timestamp > CACHE_DURATION) {
        thumbnailCache.delete(key);
      }
    }
    
    // Limpar cache de falhas antigas
    const failedToRemove: string[] = [];
    for (const failedKey of failedThumbnails) {
      const cacheEntry = thumbnailCache.get(failedKey);
      if (!cacheEntry || (now - cacheEntry.timestamp > FAILED_CACHE_DURATION)) {
        failedToRemove.push(failedKey);
      }
    }
    failedToRemove.forEach(key => failedThumbnails.delete(key));
  }
  
  // Verificar cache primeiro
  const cached = thumbnailCache.get(filename);
  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    return cached.url;
  }
  
  // Se já falhou recentemente, retornar URL padrão direto
  if (failedThumbnails.has(filename)) {
    const defaultUrl = `/api/thumbnail/${encodeURIComponent(filename)}`;
    thumbnailCache.set(filename, {
      url: defaultUrl,
      timestamp: now,
      isDefault: true
    });
    return defaultUrl;
  }
  
  // Se não tem cache válido, armazenar nova URL (SEM timestamp para evitar re-requests)
  const apiUrl = `/api/thumbnail/${encodeURIComponent(filename)}`;
  thumbnailCache.set(filename, {
    url: apiUrl,
    timestamp: now
  });
  
  return apiUrl;
}

// Função para marcar thumbnail como falhado
export function markThumbnailAsFailed(filename: string): void {
  failedThumbnails.add(filename);
  const now = Date.now();
  thumbnailCache.set(filename, {
    url: `/api/thumbnail/${encodeURIComponent(filename)}`,
    timestamp: now,
    isDefault: true
  });
}

// Função para verificar se um thumbnail é padrão
export function isThumbnailDefault(filename: string): boolean {
  const cached = thumbnailCache.get(filename);
  return cached?.isDefault === true;
}

// Função para limpar cache manualmente
export function clearThumbnailCache(): void {
  thumbnailCache.clear();
  failedThumbnails.clear();
}

// Função para verificar o tamanho do cache (para debug)
export function getCacheSize(): number {
  return thumbnailCache.size;
} 