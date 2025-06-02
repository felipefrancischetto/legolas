import { z } from 'zod';

// URL validation with specific platform patterns
const urlSchema = z.string().url().refine((url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}, "Invalid URL format");

// Platform-specific URL validation
const platformUrlSchemas = {
  spotify: z.string().refine(
    (url) => url.includes('spotify.com') || url.includes('open.spotify.com'),
    "Invalid Spotify URL"
  ),
  youtube: z.string().refine(
    (url) => url.includes('youtube.com') || url.includes('youtu.be'),
    "Invalid YouTube URL"
  ),
  soundcloud: z.string().refine(
    (url) => url.includes('soundcloud.com'),
    "Invalid SoundCloud URL"
  ),
  beatport: z.string().refine(
    (url) => url.includes('beatport.com'),
    "Invalid Beatport URL"
  ),
  appleMusic: z.string().refine(
    (url) => url.includes('music.apple.com'),
    "Invalid Apple Music URL"
  ),
  tidal: z.string().refine(
    (url) => url.includes('tidal.com'),
    "Invalid Tidal URL"
  ),
  deezer: z.string().refine(
    (url) => url.includes('deezer.com'),
    "Invalid Deezer URL"
  )
};

// Track link validation
export const trackLinkSchema = z.object({
  platform: z.enum(['Spotify', 'YouTube', 'SoundCloud', 'Beatport', 'Apple Music', 'Tidal', 'Deezer', 'Other']),
  url: urlSchema,
  verified: z.boolean().default(false)
}).refine((data) => {
  // Additional platform-specific URL validation
  const platformMap: Record<string, keyof typeof platformUrlSchemas> = {
    'Spotify': 'spotify',
    'YouTube': 'youtube',
    'SoundCloud': 'soundcloud',
    'Beatport': 'beatport',
    'Apple Music': 'appleMusic',
    'Tidal': 'tidal',
    'Deezer': 'deezer'
  };

  const platformKey = platformMap[data.platform];
  if (platformKey && platformUrlSchemas[platformKey]) {
    return platformUrlSchemas[platformKey].safeParse(data.url).success;
  }
  
  return true; // Allow 'Other' platform without specific validation
}, "URL doesn't match the specified platform");

// Track validation
export const trackSchema = z.object({
  id: z.string().min(1, "Track ID is required"),
  title: z.string().min(1, "Track title is required"),
  artist: z.string().optional(),
  remix: z.string().optional(),
  label: z.string().optional(),
  time: z.string().optional(),
  position: z.number().positive().optional(),
  links: z.array(trackLinkSchema).default([]),
  metadata: z.object({
    genre: z.string().optional(),
    bpm: z.number().positive().max(300).optional(),
    key: z.string().optional(),
    year: z.number().min(1900).max(new Date().getFullYear() + 1).optional(),
    duration: z.string().optional()
  }).optional()
});

// Playlist metadata validation
export const playlistMetadataSchema = z.object({
  title: z.string().min(1, "Playlist title is required"),
  artist: z.string().min(1, "Artist name is required"),
  venue: z.string().optional(),
  date: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  image: urlSchema.optional(),
  url: urlSchema,
  totalTracks: z.number().nonnegative(),
  scrapedAt: z.date()
});

// Scraping options validation
export const scrapingOptionsSchema = z.object({
  timeout: z.number().positive().max(300000).default(30000), // Max 5 minutes
  retries: z.number().nonnegative().max(10).default(3),
  delay: z.number().nonnegative().max(10000).default(1000), // Max 10 seconds
  useCache: z.boolean().default(true),
  cacheTTL: z.number().positive().max(86400).default(3600), // Max 24 hours
  method: z.enum(['auto', 'cheerio', 'puppeteer', 'playwright']).default('auto'),
  userAgent: z.string().optional(),
  proxy: z.string().optional(),
  headers: z.record(z.string()).optional(),
  validateLinks: z.boolean().default(true),
  includeMetadata: z.boolean().default(true),
  exportFormat: z.enum(['json', 'csv', 'xlsx']).default('json')
});

// Scraping result validation
export const scrapingResultSchema = z.object({
  success: z.boolean(),
  metadata: playlistMetadataSchema,
  tracks: z.array(trackSchema),
  stats: z.object({
    totalTracks: z.number().nonnegative(),
    tracksWithLinks: z.number().nonnegative(),
    uniquePlatforms: z.array(z.string()),
    scrapingTime: z.number().positive(),
    method: z.enum(['cheerio', 'puppeteer', 'playwright'])
  }),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional()
});

// Request/Response validation
export const scrapeRequestSchema = z.object({
  url: z.string().url().refine(
    (url) => url.includes('1001tracklists.com'),
    "URL must be from 1001tracklists.com"
  ),
  options: scrapingOptionsSchema.optional()
});

export const scrapeResponseSchema = z.object({
  success: z.boolean(),
  data: scrapingResultSchema.optional(),
  error: z.string().optional(),
  cached: z.boolean().optional(),
  processingTime: z.number().optional()
});

// Validation utilities
export class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: any,
    public errors: z.ZodIssue[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const validationUtils = {
  // Validate URL format
  validateUrl: (url: string): boolean => {
    return urlSchema.safeParse(url).success;
  },

  // Validate 1001tracklists URL specifically
  validate1001TracklistsUrl: (url: string): boolean => {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname.includes('1001tracklists.com') &&
             parsedUrl.pathname.includes('/tracklist/');
    } catch {
      return false;
    }
  },

  // Validate track data with detailed error reporting
  validateTrack: (data: any): { valid: boolean; errors?: string[]; track?: any } => {
    const result = trackSchema.safeParse(data);
    
    if (result.success) {
      return { valid: true, track: result.data };
    }
    
    const errors = result.error.issues.map(issue => 
      `${issue.path.join('.')}: ${issue.message}`
    );
    
    return { valid: false, errors };
  },

  // Validate scraping options with defaults
  validateOptions: (options: any): { valid: boolean; errors?: string[]; options?: any } => {
    const result = scrapingOptionsSchema.safeParse(options || {});
    
    if (result.success) {
      return { valid: true, options: result.data };
    }
    
    const errors = result.error.issues.map(issue => 
      `${issue.path.join('.')}: ${issue.message}`
    );
    
    return { valid: false, errors };
  },

  // Sanitize and validate track title
  sanitizeTrackTitle: (title: string): string => {
    return title
      .replace(/[\r\n\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500); // Limit length
  },

  // Extract and validate platform from URL
  extractPlatformFromUrl: (url: string): string => {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('spotify.com')) return 'Spotify';
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'YouTube';
    if (urlLower.includes('soundcloud.com')) return 'SoundCloud';
    if (urlLower.includes('beatport.com')) return 'Beatport';
    if (urlLower.includes('music.apple.com')) return 'Apple Music';
    if (urlLower.includes('tidal.com')) return 'Tidal';
    if (urlLower.includes('deezer.com')) return 'Deezer';
    
    return 'Other';
  },

  // Validate and normalize BPM
  validateBPM: (bpm: string | number): number | null => {
    const numBPM = typeof bpm === 'string' ? parseFloat(bpm) : bpm;
    
    if (isNaN(numBPM) || numBPM <= 0 || numBPM > 300) {
      return null;
    }
    
    return Math.round(numBPM);
  },

  // Validate and parse time format (MM:SS)
  validateTimeFormat: (time: string): boolean => {
    const timeRegex = /^(\d{1,2}):([0-5]\d)$/;
    return timeRegex.test(time);
  },

  // Create validation summary
  createValidationSummary: (errors: z.ZodIssue[]): string => {
    const summary = errors.reduce((acc, issue) => {
      const field = issue.path.join('.');
      if (!acc[field]) acc[field] = [];
      acc[field].push(issue.message);
      return acc;
    }, {} as Record<string, string[]>);

    return Object.entries(summary)
      .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
      .join('; ');
  }
}; 