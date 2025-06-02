import NodeCache from 'node-cache';
import { createHash } from 'crypto';
import { ScrapingResult, CacheEntry } from '../types';
import { logger } from './logger';

class CacheManager {
  private cache: NodeCache;
  private persistentCache: Map<string, CacheEntry>;
  private readonly defaultTTL = 60 * 60; // 1 hour in seconds
  private readonly maxSize = 1000;

  constructor() {
    this.cache = new NodeCache({
      stdTTL: this.defaultTTL,
      checkperiod: 120, // Check for expired keys every 2 minutes
      useClones: false,
      maxKeys: this.maxSize
    });

    this.persistentCache = new Map();

    // Setup event listeners
    this.cache.on('set', (key, value) => {
      logger.debug('Cache entry set', { key, size: JSON.stringify(value).length });
    });

    this.cache.on('del', (key, value) => {
      logger.debug('Cache entry deleted', { key });
    });

    this.cache.on('expired', (key, value) => {
      logger.debug('Cache entry expired', { key });
    });

    // Cleanup old persistent cache entries
    setInterval(() => this.cleanupPersistentCache(), 5 * 60 * 1000); // Every 5 minutes
  }

  private generateKey(url: string, options?: any): string {
    const optionsStr = options ? JSON.stringify(options) : '';
    return createHash('md5').update(url + optionsStr).digest('hex');
  }

  private cleanupPersistentCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.persistentCache.entries()) {
      if (now - entry.timestamp > entry.ttl * 1000) {
        this.persistentCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired persistent cache entries`);
    }
  }

  async get(url: string, options?: any): Promise<ScrapingResult | null> {
    const key = this.generateKey(url, options);

    try {
      // Try memory cache first
      const cached = this.cache.get<ScrapingResult>(key);
      if (cached) {
        logger.debug('Cache hit (memory)', { key, url });
        return cached;
      }

      // Try persistent cache
      const persistentEntry = this.persistentCache.get(key);
      if (persistentEntry) {
        const now = Date.now();
        if (now - persistentEntry.timestamp <= persistentEntry.ttl * 1000) {
          logger.debug('Cache hit (persistent)', { key, url });
          // Promote to memory cache
          this.cache.set(key, persistentEntry.data);
          return persistentEntry.data;
        } else {
          // Remove expired entry
          this.persistentCache.delete(key);
        }
      }

      logger.debug('Cache miss', { key, url });
      return null;
    } catch (error) {
      logger.error('Cache get error', { key, url, error });
      return null;
    }
  }

  async set(
    url: string, 
    data: ScrapingResult, 
    options?: any, 
    ttl?: number
  ): Promise<void> {
    const key = this.generateKey(url, options);
    const cacheTTL = ttl || this.defaultTTL;

    try {
      // Set in memory cache
      this.cache.set(key, data, cacheTTL);

      // Set in persistent cache for longer term storage
      this.persistentCache.set(key, {
        data,
        timestamp: Date.now(),
        ttl: cacheTTL
      });

      logger.debug('Cache entry stored', { 
        key, 
        url, 
        ttl: cacheTTL,
        size: JSON.stringify(data).length 
      });
    } catch (error) {
      logger.error('Cache set error', { key, url, error });
    }
  }

  async invalidate(url: string, options?: any): Promise<void> {
    const key = this.generateKey(url, options);
    
    try {
      this.cache.del(key);
      this.persistentCache.delete(key);
      logger.debug('Cache entry invalidated', { key, url });
    } catch (error) {
      logger.error('Cache invalidate error', { key, url, error });
    }
  }

  async clear(): Promise<void> {
    try {
      this.cache.flushAll();
      this.persistentCache.clear();
      logger.info('Cache cleared completely');
    } catch (error) {
      logger.error('Cache clear error', { error });
    }
  }

  getStats(): { 
    memoryKeys: number; 
    persistentKeys: number; 
    memoryHits: number; 
    memoryMisses: number;
  } {
    const stats = this.cache.getStats();
    return {
      memoryKeys: this.cache.keys().length,
      persistentKeys: this.persistentCache.size,
      memoryHits: stats.hits,
      memoryMisses: stats.misses
    };
  }

  // Smart cache warming for popular patterns
  async warmCache(urls: string[]): Promise<void> {
    logger.info(`Starting cache warming for ${urls.length} URLs`);
    
    for (const url of urls) {
      try {
        const cached = await this.get(url);
        if (!cached) {
          logger.debug('Cache warming - URL not cached', { url });
        }
      } catch (error) {
        logger.error('Cache warming error', { url, error });
      }
    }
  }

  // Cache size management
  private async manageCacheSize(): Promise<void> {
    const stats = this.getStats();
    
    if (stats.persistentKeys > this.maxSize) {
      // Remove oldest entries
      const entries = Array.from(this.persistentCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, entries.length - this.maxSize);
      for (const [key] of toRemove) {
        this.persistentCache.delete(key);
      }
      
      logger.info(`Cache size management: removed ${toRemove.length} entries`);
    }
  }
}

// Singleton instance
export const cacheManager = new CacheManager();

// Utility functions
export const cacheUtils = {
  generateCacheKey: (url: string, options?: any) => {
    return createHash('md5').update(url + JSON.stringify(options || {})).digest('hex');
  },

  isExpired: (entry: CacheEntry) => {
    return Date.now() - entry.timestamp > entry.ttl * 1000;
  },

  formatCacheStats: (stats: ReturnType<typeof cacheManager.getStats>) => {
    const hitRate = stats.memoryHits / (stats.memoryHits + stats.memoryMisses) * 100;
    return {
      ...stats,
      hitRate: `${hitRate.toFixed(2)}%`
    };
  }
}; 