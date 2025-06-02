import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { chromium } from 'playwright';
import retry from 'p-retry';
import PQueue from 'p-queue';
import UserAgent from 'user-agents';
import { createHash } from 'crypto';
import _ from 'lodash';

import { 
  ScrapingResult, 
  ScrapingOptions, 
  Track, 
  TrackLink, 
  PlaylistMetadata 
} from './types';
import { cacheManager } from './utils/cache';
import { scrapingLogger } from './utils/logger';
import { validationUtils } from './utils/validation';

// Request queue for rate limiting
const requestQueue = new PQueue({ 
  concurrency: 3, 
  interval: 1000, 
  intervalCap: 3 
});

// Enhanced user agents pool with real browser fingerprints
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36', 
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

// Real browser headers patterns
const getRealisticHeaders = (userAgent: string): Record<string, string> => {
  const baseHeaders: Record<string, string> = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9,pt;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"'
  };

  // Add randomization
  if (Math.random() > 0.5) {
    baseHeaders['Referer'] = 'https://www.google.com/';
  }

  return baseHeaders;
};

// Human-like delays
const humanDelay = () => Math.floor(Math.random() * 2000) + 1000; // 1-3 seconds

class TracklistScraper {
  private defaultOptions: Required<ScrapingOptions> = {
    timeout: 30000,
    retries: 3,
    delay: 1000,
    useCache: true,
    cacheTTL: 3600,
    method: 'auto',
    userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
    proxy: '',
    headers: {},
    validateLinks: true,
    includeMetadata: true,
    exportFormat: 'json'
  };

  async scrapeTracklist(url: string, options: Partial<ScrapingOptions> = {}): Promise<ScrapingResult> {
    const startTime = Date.now();
    const finalOptions = { ...this.defaultOptions, ...options };
    
    // Validate URL
    if (!validationUtils.validate1001TracklistsUrl(url)) {
      throw new Error('Invalid 1001tracklists.com URL format');
    }

    // Check cache first
    if (finalOptions.useCache) {
      const cached = await cacheManager.get(url, finalOptions);
      if (cached) {
        scrapingLogger.cacheHit(url);
        return cached;
      }
      scrapingLogger.cacheMiss(url);
    }

    const perfLogger = scrapingLogger.start(url, finalOptions.method);

    try {
      // Determine scraping method
      const method = this.determineBestMethod(finalOptions.method);
      perfLogger.checkpoint('method-determined', { method });

      let result: ScrapingResult;

      // Execute scraping with retry logic
      result = await retry(
        async () => {
          switch (method) {
            case 'cheerio':
              return await this.scrapeWithCheerio(url, finalOptions);
            case 'puppeteer':
              return await this.scrapeWithPuppeteer(url, finalOptions);
            case 'playwright':
              return await this.scrapeWithPlaywright(url, finalOptions);
            default:
              throw new Error(`Unsupported scraping method: ${method}`);
          }
        },
        {
          retries: finalOptions.retries,
          onFailedAttempt: (error: any) => {
            scrapingLogger.retry(url, error.attemptNumber, finalOptions.retries, error.message);
          },
          minTimeout: finalOptions.delay,
          maxTimeout: finalOptions.delay * 5,
          factor: 2
        }
      );

      // Post-process result
      result = await this.postProcessResult(result, finalOptions);
      
      const duration = perfLogger.end({ 
        tracksFound: result.tracks.length,
        method: result.stats.method 
      });

      // Cache successful result
      if (finalOptions.useCache && result.success) {
        await cacheManager.set(url, result, finalOptions, finalOptions.cacheTTL);
      }

      scrapingLogger.success(url, result.tracks.length, duration);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const duration = perfLogger.end({ error: errorMessage });
      scrapingLogger.error(url, error instanceof Error ? error : new Error(String(error)), finalOptions.method);
      
      // Return error result
      return {
        success: false,
        metadata: {
          title: 'Failed to scrape',
          artist: 'Unknown',
          url,
          totalTracks: 0,
          scrapedAt: new Date()
        },
        tracks: [],
        stats: {
          totalTracks: 0,
          tracksWithLinks: 0,
          uniquePlatforms: [],
          scrapingTime: duration,
          method: 'cheerio'
        },
        errors: [errorMessage]
      };
    }
  }

  private determineBestMethod(method: ScrapingOptions['method']): 'cheerio' | 'puppeteer' | 'playwright' {
    if (method !== 'auto') {
      return method as 'cheerio' | 'puppeteer' | 'playwright';
    }

    // Smart method selection based on environment and requirements
    const isProduction = process.env.NODE_ENV === 'production';
    const hasHeadlessBrowsers = process.env.DISABLE_HEADLESS !== 'true';

    // For 1001tracklists.com, prefer Playwright due to anti-bot protections
    // In development, use Playwright for better success rate
    if (!isProduction && hasHeadlessBrowsers) {
      return 'playwright'; // Best for anti-detection
    }

    if (!hasHeadlessBrowsers || isProduction) {
      return 'cheerio'; // Lightweight for production
    }

    // Fallback to Playwright for advanced cases
    return 'playwright';
  }

  private async scrapeWithCheerio(url: string, options: Required<ScrapingOptions>): Promise<ScrapingResult> {
    const startTime = Date.now();
    
    const response: AxiosResponse = await requestQueue.add(async () => 
      await axios.get(url, {
        timeout: options.timeout,
        headers: getRealisticHeaders(options.userAgent),
        validateStatus: (status) => status < 500 // Allow 4xx errors for retry logic
      })
    ) as AxiosResponse;

    if (response.status !== 200 && response.status !== 206) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const $ = cheerio.load(response.data);
    
    // Extract metadata
    const metadata = await this.extractMetadata($, url);
    
    // Extract tracks
    const tracks = await this.extractTracks($, options);
    
    const scrapingTime = Date.now() - startTime;
    const uniquePlatforms = _.uniq(tracks.flatMap(track => track.links.map(link => link.platform as string)));

    return {
      success: true,
      metadata,
      tracks,
      stats: {
        totalTracks: tracks.length,
        tracksWithLinks: tracks.filter(track => track.links.length > 0).length,
        uniquePlatforms,
        scrapingTime,
        method: 'cheerio'
      }
    };
  }

  private async scrapeWithPuppeteer(url: string, options: Required<ScrapingOptions>): Promise<ScrapingResult> {
    const startTime = Date.now();
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      timeout: options.timeout
    });

    try {
      const page = await browser.newPage();
      
      await page.setUserAgent(options.userAgent);
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Set extra headers
      await page.setExtraHTTPHeaders(getRealisticHeaders(options.userAgent));

      // Navigate with anti-detection measures
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: options.timeout 
      });

      // Wait for content to load
      await page.waitForSelector('tr.tlpItem', { timeout: 10000 });

      // Extract data
      const pageData = await page.evaluate(() => {
        const tracks: any[] = [];
        
        // Extract metadata
        const title = document.querySelector('h1')?.textContent?.trim() || 'Unknown Playlist';
        const artist = document.querySelector('.artistName')?.textContent?.trim() || 'Unknown Artist';
        const venue = document.querySelector('.venueName')?.textContent?.trim();
        const date = document.querySelector('.dateTime')?.textContent?.trim();

        // Extract tracks
        document.querySelectorAll('tr.tlpItem').forEach((element, index) => {
          const titleElement = element.querySelector('.trackValue');
          const trackTitle = titleElement?.textContent?.trim();
          
          if (!trackTitle) return;

          const links: any[] = [];
          element.querySelectorAll('a.linkIcon').forEach(linkElem => {
            const href = linkElem.getAttribute('href');
            if (!href) return;

            let platform = 'Other';
            if (href.includes('spotify.com')) platform = 'Spotify';
            else if (href.includes('youtube.com') || href.includes('youtu.be')) platform = 'YouTube';
            else if (href.includes('soundcloud.com')) platform = 'SoundCloud';
            else if (href.includes('beatport.com')) platform = 'Beatport';
            else if (href.includes('music.apple.com')) platform = 'Apple Music';
            else if (href.includes('tidal.com')) platform = 'Tidal';
            else if (href.includes('deezer.com')) platform = 'Deezer';

            links.push({
              platform,
              url: href,
              verified: false
            });
          });

          tracks.push({
            id: `track-${index + 1}`,
            title: trackTitle,
            position: index + 1,
            links
          });
        });

        return {
          metadata: { title, artist, venue, date },
          tracks
        };
      });

      const scrapingTime = Date.now() - startTime;
      const uniquePlatforms = _.uniq(pageData.tracks.flatMap((track: any) => track.links.map((link: any) => link.platform as string)));

      return {
        success: true,
        metadata: {
          ...pageData.metadata,
          url,
          totalTracks: pageData.tracks.length,
          scrapedAt: new Date()
        },
        tracks: pageData.tracks,
        stats: {
          totalTracks: pageData.tracks.length,
          tracksWithLinks: pageData.tracks.filter((track: any) => track.links.length > 0).length,
          uniquePlatforms,
          scrapingTime,
          method: 'puppeteer'
        }
      };

    } finally {
      await browser.close();
    }
  }

  private async scrapeWithPlaywright(url: string, options: Required<ScrapingOptions>): Promise<ScrapingResult> {
    const startTime = Date.now();
    
    const browser = await chromium.launch({ 
      headless: true,
      timeout: options.timeout,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-component-extensions-with-background-pages',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    try {
      const context = await browser.newContext({
        userAgent: options.userAgent,
        viewport: { width: 1920, height: 1080 },
        extraHTTPHeaders: getRealisticHeaders(options.userAgent),
        locale: 'en-US',
        timezoneId: 'America/New_York',
        permissions: [],
        colorScheme: 'light',
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
        javaScriptEnabled: true,
        acceptDownloads: false,
        ignoreHTTPSErrors: true
      });

      const page = await context.newPage();

      // LEVEL 9000 Anti-detection
      await page.addInitScript(() => {
        // Remove webdriver traces
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });

        // Override automation indicators
        delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
        delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
        delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
        
        // Mock chrome object realistically
        (window as any).chrome = {
          runtime: {
            onConnect: undefined,
            onMessage: undefined,
          },
          app: {
            isInstalled: false,
          },
        };
        
        // Override permissions API
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters: any) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission } as any) :
            originalQuery(parameters)
        );

        // Mock plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [{name: 'PDF Viewer'}, {name: 'Chrome PDF Viewer'}, {name: 'Native Client'}] as any,
        });

        // Mock languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });
      });

      // Try multiple strategies
      let result = null;
      const strategies = [
        {
          name: 'direct',
          action: async () => {
            await page.goto(url, { 
              waitUntil: 'networkidle',
              timeout: options.timeout 
            });
          }
        },
        {
          name: 'with-referer',
          action: async () => {
            // Go to main site first
            await page.goto('https://www.1001tracklists.com/', { waitUntil: 'networkidle' });
            await page.waitForTimeout(humanDelay());
            
            // Then navigate to target
            await page.goto(url, { 
              waitUntil: 'networkidle',
              timeout: options.timeout 
            });
          }
        },
        {
          name: 'mobile-first',
          action: async () => {
            // Try mobile version which might have less protection
            const mobileUrl = url.replace('www.', 'm.');
            await page.goto(mobileUrl, { 
              waitUntil: 'networkidle',
              timeout: options.timeout 
            });
          }
        }
      ];

      for (const strategy of strategies) {
        try {
          await strategy.action();
          
          // Wait and simulate human behavior
          await page.waitForTimeout(humanDelay());
          
          // Simulate mouse movement
          await page.mouse.move(Math.random() * 1000, Math.random() * 600);
          await page.waitForTimeout(500);
          
          // Simulate scroll
          await page.evaluate(() => {
            window.scrollTo(0, Math.random() * 500);
          });
          await page.waitForTimeout(1000);

          // Check if we got redirected to a waiting page
          const pageTitle = await page.title();
          if (pageTitle.includes('wait') || pageTitle.includes('forwarded') || pageTitle.includes('please wait')) {
            // Try to wait longer and look for redirect mechanisms
            await page.waitForTimeout(10000); // Wait 10 seconds
            
            // Look for meta refreshes or JavaScript redirects
            const metaRefresh = await page.locator('meta[http-equiv="refresh"]').count();
            if (metaRefresh > 0) {
              await page.waitForTimeout(15000); // Wait for meta refresh
            }
            
            // Try to find and click any continue buttons
            const continueSelectors = [
              'button:has-text("Continue")',
              'button:has-text("Proceed")', 
              'a:has-text("Continue")',
              'input[type="submit"]',
              '.continue-btn',
              '#continue',
              '[data-action="continue"]',
              'a[href*="tracklist"]',
              'button[onclick]'
            ];
            
            for (const selector of continueSelectors) {
              try {
                const element = await page.locator(selector).first();
                if (await element.isVisible()) {
                  await element.click();
                  await page.waitForTimeout(5000);
                  break;
                }
              } catch (e) {
                // Ignore errors and try next selector
              }
            }
            
            // If still on waiting page, try strategy with JavaScript execution
            const currentTitle = await page.title();
            if (currentTitle.includes('wait') || currentTitle.includes('forwarded')) {
              // Try executing any onload scripts manually
              await page.evaluate(() => {
                // Look for any setTimeout or setInterval functions and execute them
                const scripts = Array.from(document.scripts);
                scripts.forEach(script => {
                  if (script.innerHTML.includes('setTimeout') || script.innerHTML.includes('location.href')) {
                    try {
                      eval(script.innerHTML);
                    } catch (e) {
                      // Ignore script errors
                    }
                  }
                });
              });
              await page.waitForTimeout(5000);
            }
          }

          // Try multiple selectors for tracks
          const trackSelectors = [
            'tr.tlpItem',
            '.tlpItem',
            '.track-item', 
            '.tracklist-item',
            '[data-track]',
            '.trackRow',
            '.track',
            '.songListRow',
            'table tr[class*="track"]',
            'div[class*="track"]',
            '.tracklistTrack'
          ];

          let tracksFound = false;
          for (const selector of trackSelectors) {
            try {
              await page.waitForSelector(selector, { timeout: 5000 });
              const count = await page.locator(selector).count();
              if (count > 0) {
                tracksFound = true;
                break;
              }
            } catch (e) {
              continue;
            }
          }

          if (!tracksFound) {
            // Try scrolling to trigger lazy loading
            await page.evaluate(() => {
              for (let i = 0; i < 5; i++) {
                window.scrollTo(0, (i + 1) * 200);
              }
            });
            await page.waitForTimeout(3000);
            
            // Try again after scrolling
            for (const selector of trackSelectors) {
              try {
                await page.waitForSelector(selector, { timeout: 3000 });
                tracksFound = true;
                break;
              } catch (e) {
                continue;
              }
            }
          }

          // If we found tracks or this is our last strategy, extract data
          if (tracksFound || strategy === strategies[strategies.length - 1]) {
            result = await this.extractDataFromPage(page);
            if (result.tracks.length > 0) {
              break; // Success, exit strategy loop
            }
          }
          
        } catch (error) {
          // Try next strategy
          continue;
        }
      }

      if (!result) {
        result = await this.extractDataFromPage(page);
      }

      const scrapingTime = Date.now() - startTime;
      const uniquePlatforms = _.uniq(result.tracks.flatMap((track: any) => track.links.map((link: any) => link.platform as string)));

      return {
        success: true,
        metadata: {
          ...result.metadata,
          url,
          totalTracks: result.tracks.length,
          scrapedAt: new Date(),
          image: result.metadata.image || undefined,
          venue: result.metadata.venue || undefined,
          date: result.metadata.date || undefined
        },
        tracks: result.tracks,
        stats: {
          totalTracks: result.tracks.length,
          tracksWithLinks: result.tracks.filter((track: any) => track.links.length > 0).length,
          uniquePlatforms,
          scrapingTime,
          method: 'playwright'
        }
      };

    } finally {
      await browser.close();
    }
  }

  private async extractDataFromPage(page: any) {
    return await page.evaluate(() => {
      const tracks: any[] = [];
      
      // Enhanced metadata extraction with multiple selectors
      const getTextBySelectorArray = (selectors: string[]) => {
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            return element.textContent.trim();
          }
        }
        return null;
      };

      const title = getTextBySelectorArray([
        'h1',
        '.playlistTitle', 
        '[data-title]',
        '.tracklist-title',
        '.event-title',
        '.title',
        '.pageTitle',
        'title'
      ]) || 'Unknown Playlist';

      const artist = getTextBySelectorArray([
        '.artistName', 
        '.artist', 
        '[data-artist]',
        '.dj-name',
        '.performer',
        '.djName'
      ]) || 'Unknown Artist';

      const venue = getTextBySelectorArray([
        '.venueName', 
        '.venue', 
        '[data-venue]',
        '.location'
      ]);

      const date = getTextBySelectorArray([
        '.dateTime', 
        '.date', 
        '[data-date]',
        '.event-date'
      ]);

      const image = document.querySelector('img.playlistImage, .coverArt img, .event-image img, .artwork img')?.getAttribute('src');

      // Enhanced track extraction with multiple selectors
      const trackElements = Array.from(
        document.querySelectorAll('tr.tlpItem, .tlpItem, .track-item, .tracklist-item, [data-track], .trackRow, .track, .songListRow, table tr[class*="track"], div[class*="track"], .tracklistTrack')
      );

      trackElements.forEach((element, index) => {
        const titleSelectors = [
          '.trackValue', 
          '.track-title', 
          '.title',
          '.song-title',
          '[data-title]',
          '.name',
          '.trackName',
          '.songName'
        ];
        
        let trackTitle = null;
        for (const selector of titleSelectors) {
          const titleElement = element.querySelector(selector);
          if (titleElement && titleElement.textContent) {
            trackTitle = titleElement.textContent.trim();
            break;
          }
        }
        
        if (!trackTitle) {
          // Try getting text from the element itself if no specific selector works
          const elementText = element.textContent?.trim();
          if (elementText && elementText.length > 5 && elementText.length < 200) {
            trackTitle = elementText.split('\n')[0].trim(); // Take first line
          }
        }
        
        if (!trackTitle) return;

        // Extract additional metadata with multiple selectors
        const getTrackData = (selectors: string[]) => {
          for (const selector of selectors) {
            const el = element.querySelector(selector);
            if (el && el.textContent) return el.textContent.trim();
          }
          return null;
        };

        const artist = getTrackData(['.artist', '.trackArtist', '.performer', '[data-artist]']);
        const time = getTrackData(['.time', '.duration', '.length', '[data-time]']);
        const label = getTrackData(['.label', '.recordLabel', '.release-label', '[data-label]']);

        // Enhanced link extraction
        const links: any[] = [];
        const linkSelectors = [
          'a.linkIcon', 
          '.platform-link', 
          '.streaming-link',
          '.service-link',
          'a[href*="spotify"]',
          'a[href*="youtube"]',
          'a[href*="soundcloud"]',
          'a[href*="beatport"]',
          'a[href*="apple"]',
          'a[href*="tidal"]',
          'a[href*="deezer"]',
          'a[title*="Spotify"]',
          'a[title*="YouTube"]',
          'a[title*="SoundCloud"]',
          'a[class*="spotify"]',
          'a[class*="youtube"]',
          'a[class*="soundcloud"]'
        ];

        linkSelectors.forEach(selector => {
          element.querySelectorAll(selector).forEach(linkElem => {
            const href = linkElem.getAttribute('href');
            if (!href || href.startsWith('#') || href === '/' || href.length < 10) return;

            // Determine platform from URL
            let platform = 'Other';
            const urlLower = href.toLowerCase();
            if (urlLower.includes('spotify.com')) platform = 'Spotify';
            else if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) platform = 'YouTube';
            else if (urlLower.includes('soundcloud.com')) platform = 'SoundCloud';
            else if (urlLower.includes('beatport.com')) platform = 'Beatport';
            else if (urlLower.includes('music.apple.com')) platform = 'Apple Music';
            else if (urlLower.includes('tidal.com')) platform = 'Tidal';
            else if (urlLower.includes('deezer.com')) platform = 'Deezer';
            
            // Avoid duplicates
            if (!links.some(link => link.url === href)) {
              links.push({
                platform,
                url: href,
                verified: false
              });
            }
          });
        });

        tracks.push({
          id: `track-${Date.now()}-${index}`,
          title: trackTitle.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500),
          artist,
          time,
          label,
          position: index + 1,
          links
        });
      });

      return {
        metadata: { title, artist, venue, date, image },
        tracks
      };
    });
  }

  private async extractMetadata($: cheerio.CheerioAPI, url: string): Promise<PlaylistMetadata> {
    const title = $('h1, .playlistTitle').first().text().trim() || 'Unknown Playlist';
    const artist = $('.artistName, .artist').first().text().trim() || 'Unknown Artist';
    const venue = $('.venueName, .venue').first().text().trim();
    const date = $('.dateTime, .date').first().text().trim();
    const location = $('.location, .city').first().text().trim();
    const description = $('.description, .notes').first().text().trim();
    const image = $('img.playlistImage, .coverArt img').first().attr('src');

    return {
      title: validationUtils.sanitizeTrackTitle(title),
      artist: validationUtils.sanitizeTrackTitle(artist),
      venue,
      date,
      location,
      description,
      image,
      url,
      totalTracks: 0, // Will be updated later
      scrapedAt: new Date()
    };
  }

  private async extractTracks($: cheerio.CheerioAPI, options: Required<ScrapingOptions>): Promise<Track[]> {
    const tracks: Track[] = [];

    $('tr.tlpItem, .track-item, .tracklist-item').each((index, element) => {
      const $element = $(element);
      const titleElement = $element.find('.trackValue, .track-title, .title');
      const trackTitle = titleElement.text().trim();

      if (!trackTitle) return;

      // Extract additional metadata
      const artist = $element.find('.artist, .trackArtist').text().trim();
      const time = $element.find('.time, .duration').text().trim();
      const label = $element.find('.label, .recordLabel').text().trim();
      const remix = $element.find('.remix, .version').text().trim();

      const links: TrackLink[] = [];
      $element.find('a.linkIcon, .platform-link, .streaming-link').each((_, linkElem) => {
        const href = $(linkElem).attr('href');
        if (!href) return;

        const platform = validationUtils.extractPlatformFromUrl(href);
        
        links.push({
          platform: platform as any,
          url: href,
          verified: false
        });
      });

      const track: Track = {
        id: createHash('md5').update(`${trackTitle}-${index}`).digest('hex').substring(0, 8),
        title: validationUtils.sanitizeTrackTitle(trackTitle),
        artist: artist || undefined,
        remix: remix || undefined,
        label: label || undefined,
        time: time || undefined,
        position: index + 1,
        links
      };

      tracks.push(track);
      scrapingLogger.trackFound(track.title, track.links.length);
    });

    return tracks;
  }

  private async postProcessResult(result: ScrapingResult, options: Required<ScrapingOptions>): Promise<ScrapingResult> {
    // Update total tracks in metadata
    result.metadata.totalTracks = result.tracks.length;

    // Validate links if requested
    if (options.validateLinks) {
      result = await this.validateLinks(result);
    }

    // Add metadata enhancement if requested
    if (options.includeMetadata) {
      result = await this.enhanceMetadata(result);
    }

    // Remove duplicates
    result.tracks = this.deduplicateTracks(result.tracks);

    return result;
  }

  private async validateLinks(result: ScrapingResult): Promise<ScrapingResult> {
    // Validate links in parallel (limited concurrency)
    const validationQueue = new PQueue({ concurrency: 10 });
    
    for (const track of result.tracks) {
      for (const link of track.links) {
        validationQueue.add(async () => {
          try {
            const response = await axios.head(link.url, { timeout: 5000 });
            link.verified = response.status === 200;
            scrapingLogger.linkValidation(link.url, link.platform, link.verified);
          } catch {
            link.verified = false;
            scrapingLogger.linkValidation(link.url, link.platform, false);
          }
        });
      }
    }

    await validationQueue.onIdle();
    return result;
  }

  private async enhanceMetadata(result: ScrapingResult): Promise<ScrapingResult> {
    // Add metadata enhancement logic here
    // This could include:
    // - BPM detection
    // - Genre classification
    // - Key detection
    // - Duration parsing
    
    for (const track of result.tracks) {
      if (track.time && validationUtils.validateTimeFormat(track.time)) {
        track.metadata = {
          ...track.metadata,
          duration: track.time
        };
      }
    }

    return result;
  }

  private deduplicateTracks(tracks: Track[]): Track[] {
    const seen = new Set<string>();
    return tracks.filter(track => {
      const key = `${track.title.toLowerCase()}-${track.artist?.toLowerCase() || ''}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}

// Create singleton instance
export const tracklistScraper = new TracklistScraper();

// Main export function
export async function scrapeTracklist(
  url: string, 
  options: Partial<ScrapingOptions> = {}
): Promise<ScrapingResult> {
  return tracklistScraper.scrapeTracklist(url, options);
} 