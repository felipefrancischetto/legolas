import axios, { AxiosResponse } from 'axios';
import { logger } from '../utils/logger';

export interface EnhancedMetadata {
  title: string;
  artist: string;
  album?: string;
  year?: number;
  genre?: string;
  label?: string;
  bpm?: number;
  key?: string;
  duration?: number;
  isrc?: string;
  acousticness?: number;
  danceability?: number;
  energy?: number;
  confidence?: number;
  sources?: string[];
}

interface MetadataProvider {
  name: string;
  search(title: string, artist: string): Promise<Partial<EnhancedMetadata> | null>;
  isConfigured(): Promise<boolean>;
}

function cleanArtistName(artist: string): string {
  if (!artist) return '';
  return artist
    .replace(/\s*[-–—]\s*(Topic|Official|Subject|Channel|VEVO| - .*|\(.*\)|\[.*\])$/gi, '')
    .replace(/\s*\(.*?\)$/g, '')
    .replace(/\s*\[.*?\]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

class BeatportProviderV2 implements MetadataProvider {
  name = 'BeatportV2';

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async search(title: string, artist: string): Promise<Partial<EnhancedMetadata> | null> {
    const timeoutMs = 30000;
    console.log(`⏰ [Beatport] Iniciando busca com timeout de ${timeoutMs/1000}s`);
    
    return Promise.race([
      this.performBeatportSearch(title, artist),
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error('Beatport timeout após 30s')), timeoutMs)
      )
    ]);
  }

  private async performBeatportSearch(title: string, artist: string): Promise<Partial<EnhancedMetadata> | null> {
    console.log(`🚀 [Beatport] Lançando browser para busca: "${title}" - "${artist}"`);
    let browser;
    try {
      const puppeteer = await import('puppeteer');
      console.log(`📦 [Beatport] Puppeteer importado com sucesso`);
      
      const browserOptions = { 
        headless: false,
        timeout: 15000,
        protocolTimeout: 20000,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080'
        ]
      };
      
      browser = await puppeteer.default.launch(browserOptions);
      const page = await browser.newPage();
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(`${artist} ${title}`)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        await page.click('button:has-text("Accept"), button:has-text("Aceitar"), button[id*="accept"]');
      } catch (e) {
        // Ignorar se não houver botão de cookies
      }
      
      const trackUrl = await page.evaluate((searchTitle, searchArtist) => {
        const links = Array.from(document.querySelectorAll('a[href*="/track/"]'));
        let bestMatch = null;
        let bestScore = 0;
        
        for (const link of links) {
          const text = (link.textContent || '').toLowerCase();
          const titleLower = searchTitle.toLowerCase();
          const artistLower = searchArtist.toLowerCase();
          
          let score = 0;
          if (text.includes(titleLower)) score += 100;
          if (text.includes(artistLower)) score += 50;
          if (text.includes(titleLower) && text.includes(artistLower)) score += 200;
          
          if (score > bestScore) {
            bestScore = score;
            const href = link.getAttribute('href');
            bestMatch = href?.startsWith('http') ? href : `https://www.beatport.com${href}`;
          }
        }
        
        return bestMatch;
      }, title, artist);
      
      if (!trackUrl) {
        await browser.close();
        return null;
      }
      
      await page.goto(trackUrl, { waitUntil: 'networkidle0', timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const metadata = await page.evaluate(() => {
        const result: Partial<{
          title: string;
          artist: string;
          duration: number;
          year: number;
          bpm: number;
          key: string;
          genre: string;
          label: string;
        }> = {};

        const titleEl = document.querySelector('h1[data-testid="track-title"], h1');
        if (titleEl) {
          result.title = titleEl.textContent?.trim().replace(/\s+(Original Mix|Extended Mix|Club Mix|Radio Edit).*$/i, '');
        }

        const artistEl = document.querySelector('a[data-testid="artist-link"], a[href*="/artist/"]');
        if (artistEl) {
          result.artist = artistEl.textContent?.trim();
        }

        const metaWrapper = document.querySelector('[class*="MetaWrapper"]');
        if (metaWrapper) {
          const metaItems = metaWrapper.querySelectorAll('[class*="MetaItem"]');
          
          metaItems.forEach((item) => {
            const label = item.querySelector('div, span')?.textContent?.trim().toLowerCase();
            const value = item.querySelector('span:last-child')?.textContent?.trim();
            
            if (!label || !value) return;
            
            if (label.includes('tamanho')) {
              const [min, sec] = value.split(':').map(Number);
              result.duration = min * 60 + sec;
            } else if (label.includes('lançamento')) {
              result.year = parseInt(value.split('-')[0]);
            } else if (label.includes('bpm')) {
              result.bpm = parseInt(value);
            } else if (label.includes('tom')) {
              result.key = value;
            } else if (label.includes('gênero') || label.includes('genre')) {
              result.genre = value;
            } else if (label.includes('gravadora') || label.includes('label')) {
              result.label = value;
            }
          });
        }

        return result;
      });
      
      await browser.close();
      
      if (metadata && (metadata.bpm || metadata.key || metadata.genre || metadata.label || metadata.artist)) {
        return metadata;
      }
      
      return null;
      
    } catch (error) {
      console.error(`❌ [Beatport] Erro:`, error instanceof Error ? error.message : error);
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error(`❌ [Beatport] Erro ao fechar browser:`, closeError);
        }
      }
      return null;
    }
  }
}

export class IndividualMetadataAggregator {
  async searchMetadata(title: string, artist: string): Promise<EnhancedMetadata> {
    console.log(`\n🔍 [IndividualMetadataAggregator] Buscando metadados para: "${title}" - "${artist}"`);
    
    const beatportProvider = new BeatportProviderV2();
    const startTime = Date.now();
    
    try {
      const result = await beatportProvider.search(title, artist);
      const duration = Date.now() - startTime;
      
      if (result) {
        console.log(`✅ [Beatport] Sucesso em ${duration}ms`);
        
        const aggregated: EnhancedMetadata = {
          title: result.title || title,
          artist: result.artist || artist,
          album: result.album,
          genre: result.genre,
          label: result.label,
          bpm: result.bpm,
          key: result.key,
          year: result.year,
          sources: ['BeatportV2']
        };
        
        const hasUsefulData = aggregated.bpm || aggregated.key || aggregated.genre || aggregated.label;
        if (hasUsefulData) {
          return aggregated;
        } else {
          return {
            ...aggregated,
            title: `${aggregated.title} (Unreleased)`
          };
        }
      }
      
      return {
        title,
        artist,
        sources: []
      };
      
    } catch (error) {
      console.error(`❌ [IndividualMetadataAggregator] Erro:`, error instanceof Error ? error.message : error);
      return {
        title,
        artist,
        sources: []
      };
    }
  }
}

// Exportar uma instância do IndividualMetadataAggregator
export const individualMetadataAggregator = new IndividualMetadataAggregator(); 