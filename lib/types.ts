export interface TrackLink {
  platform: 'Spotify' | 'YouTube' | 'SoundCloud' | 'Beatport' | 'Apple Music' | 'Tidal' | 'Deezer' | 'Other';
  url: string;
  verified: boolean;
}

export interface Track {
  id: string;
  title: string;
  artist?: string;
  remix?: string;
  label?: string;
  time?: string;
  position?: number;
  links: TrackLink[];
  metadata?: {
    genre?: string;
    bpm?: number;
    key?: string;
    year?: number;
    duration?: string;
  };
}

export interface PlaylistMetadata {
  title: string;
  artist: string;
  venue?: string;
  date?: string;
  location?: string;
  description?: string;
  image?: string;
  url: string;
  totalTracks: number;
  scrapedAt: Date;
}

export interface ScrapingResult {
  success: boolean;
  metadata: PlaylistMetadata;
  tracks: Track[];
  stats: {
    totalTracks: number;
    tracksWithLinks: number;
    uniquePlatforms: string[];
    scrapingTime: number;
    method: 'cheerio' | 'puppeteer' | 'playwright';
  };
  errors?: string[];
  warnings?: string[];
}

export interface ScrapingOptions {
  timeout?: number;
  retries?: number;
  delay?: number;
  useCache?: boolean;
  cacheTTL?: number;
  method?: 'auto' | 'cheerio' | 'puppeteer' | 'playwright';
  userAgent?: string;
  proxy?: string;
  headers?: Record<string, string>;
  validateLinks?: boolean;
  includeMetadata?: boolean;
  exportFormat?: 'json' | 'csv' | 'xlsx';
  useBeatport?: boolean;
}

export interface CacheEntry {
  data: ScrapingResult;
  timestamp: number;
  ttl: number;
}

export interface ScrapeRequest {
  url: string;
  options?: ScrapingOptions;
}

export interface ScrapeResponse {
  success: boolean;
  data?: ScrapingResult;
  error?: string;
  cached?: boolean;
  processingTime?: number;
} 