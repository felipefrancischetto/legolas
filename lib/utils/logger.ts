import winston from 'winston';

const { combine, timestamp, printf, colorize, json } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, service, ...meta }) => {
  const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : '';
  return `${timestamp} [${service || 'SCRAPER'}] ${level}: ${message} ${metaStr}`;
});

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true })
  ),
  defaultMeta: { service: 'tracklist-scraper' },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: combine(
        colorize(),
        consoleFormat
      )
    }),
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: combine(json())
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: combine(json())
    })
  ],
});

// Performance logging utility
export class PerformanceLogger {
  private startTime: number;
  private operation: string;

  constructor(operation: string) {
    this.operation = operation;
    this.startTime = Date.now();
    logger.info(`Starting operation: ${operation}`);
  }

  end(metadata?: any) {
    const duration = Date.now() - this.startTime;
    logger.info(`Completed operation: ${this.operation}`, {
      duration: `${duration}ms`,
      ...metadata
    });
    return duration;
  }

  checkpoint(label: string, metadata?: any) {
    const elapsed = Date.now() - this.startTime;
    logger.debug(`Checkpoint ${label} in ${this.operation}`, {
      elapsed: `${elapsed}ms`,
      ...metadata
    });
  }
}

// Scraping specific logger
export const scrapingLogger = {
  start: (url: string, method: string) => {
    logger.info('Starting scraping operation', { url, method });
    return new PerformanceLogger(`scrape-${method}`);
  },

  success: (url: string, tracksFound: number, duration: number) => {
    logger.info('Scraping completed successfully', {
      url,
      tracksFound,
      duration: `${duration}ms`
    });
  },

  error: (url: string, error: Error, method?: string) => {
    logger.error('Scraping failed', {
      url,
      method,
      error: error.message,
      stack: error.stack
    });
  },

  retry: (url: string, attempt: number, maxRetries: number, error: string) => {
    logger.warn('Retrying scraping operation', {
      url,
      attempt,
      maxRetries,
      error
    });
  },

  cacheHit: (url: string) => {
    logger.info('Cache hit for scraping request', { url });
  },

  cacheMiss: (url: string) => {
    logger.debug('Cache miss for scraping request', { url });
  },

  rateLimit: (url: string, delay: number) => {
    logger.warn('Rate limiting applied', { url, delay: `${delay}ms` });
  },

  trackFound: (title: string, linksCount: number) => {
    logger.debug('Track processed', { title, linksCount });
  },

  linkValidation: (url: string, platform: string, valid: boolean) => {
    logger.debug('Link validation result', { url, platform, valid });
  }
};

// Create logs directory if it doesn't exist
if (typeof window === 'undefined') {
  const fs = require('fs');
  const path = require('path');
  
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} 