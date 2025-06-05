// Cache de thumbnails centralizado para toda a aplicação
const thumbnailCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

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
  }
  
  // Verificar cache primeiro
  const cached = thumbnailCache.get(filename);
  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    return cached.url;
  }
  
  // Se não tem cache válido, armazenar nova URL (SEM timestamp para evitar re-requests)
  const apiUrl = `/api/thumbnail/${encodeURIComponent(filename)}`;
  thumbnailCache.set(filename, {
    url: apiUrl,
    timestamp: now
  });
  
  return apiUrl;
}

// Função para limpar o cache manualmente se necessário
export function clearThumbnailCache(): void {
  thumbnailCache.clear();
}

// Função para verificar o tamanho do cache (para debug)
export function getCacheSize(): number {
  return thumbnailCache.size;
} 