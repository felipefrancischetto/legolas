import { NextRequest, NextResponse } from 'next/server';
import { scrapeTracklist } from '@/lib/tracklistScraper';
import { validationUtils, scrapeRequestSchema } from '@/lib/utils/validation';
import { cacheManager, cacheUtils } from '@/lib/utils/cache';
import { scrapingLogger, logger } from '@/lib/utils/logger';
import { ScrapeRequest, ScrapeResponse, ScrapingOptions } from '@/lib/types';

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
  return `rate_limit:${ip}`;
}

function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    // Reset or create new record
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    });
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS - 1,
      resetTime: now + RATE_LIMIT_WINDOW
    };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime
    };
  }

  record.count++;
  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - record.count,
    resetTime: record.resetTime
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Rate limiting
    const rateLimitKey = getRateLimitKey(request);
    const rateLimit = checkRateLimit(rateLimitKey);
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
          processingTime: Date.now() - startTime
        } as ScrapeResponse,
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': RATE_LIMIT_MAX_REQUESTS.toString(),
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
            'X-RateLimit-Reset': Math.ceil(rateLimit.resetTime / 1000).toString()
          }
        }
      );
    }

    // Parse and validate request body
    const body: ScrapeRequest = await request.json();
    
    const validationResult = scrapeRequestSchema.safeParse(body);
    if (!validationResult.success) {
      scrapingLogger.error(body.url || 'unknown', new Error('Validation failed'), 'api');
      
      return NextResponse.json(
        {
          success: false,
          error: `Validation error: ${validationResult.error.issues.map(i => i.message).join(', ')}`,
          processingTime: Date.now() - startTime
        } as ScrapeResponse,
        { status: 400 }
      );
    }

    const { url, options = {} } = validationResult.data;

    // Log the request
    scrapingLogger.start(url, (options as ScrapingOptions).method || 'auto');

    // Check cache if enabled
    let cached = false;
    if ((options as ScrapingOptions).useCache !== false) {
      const cachedResult = await cacheManager.get(url, options);
      if (cachedResult) {
        cached = true;
        const response: ScrapeResponse = {
          success: true,
          data: cachedResult,
          cached: true,
          processingTime: Date.now() - startTime
        };

        return NextResponse.json(response, {
          headers: {
            'X-Cache': 'HIT',
            'X-RateLimit-Limit': RATE_LIMIT_MAX_REQUESTS.toString(),
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
            'X-RateLimit-Reset': Math.ceil(rateLimit.resetTime / 1000).toString()
          }
        });
      }
    }

    // Execute scraping
    const result = await scrapeTracklist(url, options);

    const processingTime = Date.now() - startTime;
    
    // Log success/failure
    if (result.success) {
      scrapingLogger.success(url, result.tracks.length, processingTime);
    } else {
      scrapingLogger.error(url, new Error(result.errors?.[0] || 'Unknown error'), 'api');
    }

    const response: ScrapeResponse = {
      success: result.success,
      data: result.success ? result : undefined,
      error: result.success ? undefined : (result.errors?.[0] || 'Scraping failed'),
      cached: false,
      processingTime
    };

    return NextResponse.json(response, {
      status: result.success ? 200 : 500,
      headers: {
        'X-Cache': 'MISS',
        'X-Processing-Time': processingTime.toString(),
        'X-RateLimit-Limit': RATE_LIMIT_MAX_REQUESTS.toString(),
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        'X-RateLimit-Reset': Math.ceil(rateLimit.resetTime / 1000).toString()
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const processingTime = Date.now() - startTime;
    
    scrapingLogger.error('api-error', error instanceof Error ? error : new Error(String(error)), 'api');

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        processingTime
      } as ScrapeResponse,
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'stats':
        // Return cache statistics
        const stats = cacheManager.getStats();
        const formattedStats = cacheUtils.formatCacheStats(stats);
        
        return NextResponse.json({
          success: true,
          data: {
            cache: formattedStats,
            rateLimit: {
              window: RATE_LIMIT_WINDOW,
              maxRequests: RATE_LIMIT_MAX_REQUESTS,
              activeKeys: rateLimitStore.size
            }
          }
        });

      case 'health':
        // Health check endpoint
        return NextResponse.json({
          success: true,
          data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            environment: process.env.NODE_ENV || 'development'
          }
        });

      case 'clear-cache':
        // Clear cache (admin only in production)
        if (process.env.NODE_ENV === 'production') {
          const adminKey = request.headers.get('x-admin-key');
          if (adminKey !== process.env.ADMIN_KEY) {
            return NextResponse.json(
              { success: false, error: 'Unauthorized' },
              { status: 401 }
            );
          }
        }
        
        await cacheManager.clear();
        logger.info('Cache cleared via API');
        
        return NextResponse.json({
          success: true,
          message: 'Cache cleared successfully'
        });

      default:
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid action. Available actions: stats, health, clear-cache'
          },
          { status: 400 }
        );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// OPTIONS method for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
    },
  });
} 