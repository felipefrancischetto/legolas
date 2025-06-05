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

export interface MetadataProvider {
  name: string;
  search(title: string, artist: string): Promise<Partial<EnhancedMetadata> | null>;
  isConfigured(): Promise<boolean>;
}

class SpotifyProvider implements MetadataProvider {
  name = 'Spotify';
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  async isConfigured(): Promise<boolean> {
    return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
  }

  private async getAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!await this.isConfigured()) {
      return null;
    }

    try {
      const response = await axios.post('https://accounts.spotify.com/api/token', 
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 min buffer
      return this.accessToken;
    } catch (error) {
      logger.error('Error getting Spotify access token:', error);
      return null;
    }
  }

  async search(title: string, artist: string): Promise<Partial<EnhancedMetadata> | null> {
    const token = await this.getAccessToken();
    if (!token) return null;

    try {
      // Search for track
      const searchQuery = `track:"${title}" artist:"${artist}"`;
      const searchResponse = await axios.get('https://api.spotify.com/v1/search', {
        headers: { 'Authorization': `Bearer ${token}` },
        params: {
          q: searchQuery,
          type: 'track',
          limit: 1
        }
      });

      const track = searchResponse.data.tracks?.items?.[0];
      if (!track) return null;

      // Get audio features for BPM, key, etc.
      const featuresResponse = await axios.get(`https://api.spotify.com/v1/audio-features/${track.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const features = featuresResponse.data;

      return {
        title: track.name,
        artist: track.artists?.[0]?.name,
        album: track.album?.name,
        year: track.album?.release_date ? parseInt(track.album.release_date.slice(0, 4)) : undefined,
        label: track.album?.label,
        bpm: Math.round(features.tempo) || undefined,
        key: this.convertSpotifyKey(features.key, features.mode),
        duration: Math.round(track.duration_ms / 1000),
        acousticness: features.acousticness,
        danceability: features.danceability,
        energy: features.energy,
        confidence: 0.9 // High confidence for Spotify data
      };
    } catch (error) {
      logger.error('Error searching Spotify:', error);
      return null;
    }
  }

  private convertSpotifyKey(key: number, mode: number): string | undefined {
    if (key === -1) return undefined;
    
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const keyName = keys[key];
    const keyMode = mode === 1 ? 'maj' : 'min';
    
    return `${keyName} ${keyMode}`;
  }
}

class LastFmProvider implements MetadataProvider {
  name = 'Last.fm';

  async isConfigured(): Promise<boolean> {
    return !!process.env.LASTFM_API_KEY;
  }

  async search(title: string, artist: string): Promise<Partial<EnhancedMetadata> | null> {
    if (!await this.isConfigured()) return null;

    try {
      const response = await axios.get('http://ws.audioscrobbler.com/2.0/', {
        params: {
          method: 'track.getInfo',
          api_key: process.env.LASTFM_API_KEY,
          artist: artist,
          track: title,
          format: 'json'
        }
      });

      const track = response.data.track;
      if (!track) return null;

      return {
        title: track.name,
        artist: track.artist?.name,
        album: track.album?.title,
        genre: track.toptags?.tag?.[0]?.name,
        duration: parseInt(track.duration) || undefined,
        confidence: 0.7 // Medium confidence for Last.fm data
      };
    } catch (error) {
      logger.error('Error searching Last.fm:', error);
      return null;
    }
  }
}

class MusicBrainzProvider implements MetadataProvider {
  name = 'MusicBrainz';
  private lastRequest = 0;
  private readonly RATE_LIMIT = 1000; // 1 second between requests

  async isConfigured(): Promise<boolean> {
    return true; // Always available
  }

  private async rateLimitedRequest(url: string): Promise<AxiosResponse> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    
    if (timeSinceLastRequest < this.RATE_LIMIT) {
      await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT - timeSinceLastRequest));
    }
    
    this.lastRequest = Date.now();
    
    return axios.get(url, {
      headers: {
        'User-Agent': 'LegolasDownloader/1.0 (https://github.com/your-repo)'
      }
    });
  }

  async search(title: string, artist: string): Promise<Partial<EnhancedMetadata> | null> {
    try {
      const query = `recording:"${title}" AND artist:"${artist}"`;
      const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=1&inc=releases+artist-credits+labels`;
      
      const response = await this.rateLimitedRequest(url);
      const recording = response.data.recordings?.[0];
      
      if (!recording) return null;

      const release = recording.releases?.[0];
      const label = release?.['label-info']?.[0]?.label?.name;

      return {
        title: recording.title,
        artist: recording['artist-credit']?.[0]?.name,
        album: release?.title,
        year: release?.date ? parseInt(release.date.slice(0, 4)) : undefined,
        label: label,
        isrc: recording.isrcs?.[0],
        confidence: 0.8 // Good confidence for MusicBrainz data
      };
    } catch (error) {
      logger.error('Error searching MusicBrainz:', error);
      return null;
    }
  }
}

class DiscogsProvider implements MetadataProvider {
  name = 'Discogs';

  async isConfigured(): Promise<boolean> {
    return !!process.env.DISCOGS_TOKEN;
  }

  async search(title: string, artist: string): Promise<Partial<EnhancedMetadata> | null> {
    if (!await this.isConfigured()) return null;

    try {
      const response = await axios.get('https://api.discogs.com/database/search', {
        headers: {
          'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN}`,
          'User-Agent': 'LegolasDownloader/1.0'
        },
        params: {
          q: `${artist} ${title}`,
          type: 'release',
          per_page: 1
        }
      });

      const release = response.data.results?.[0];
      if (!release) return null;

      return {
        title: release.title,
        artist: release.artist,
        year: release.year,
        label: release.label?.[0],
        genre: release.genre?.[0],
        confidence: 0.7 // Medium confidence for Discogs data
      };
    } catch (error) {
      logger.error('Error searching Discogs:', error);
      return null;
    }
  }
}

function cleanArtistName(artist: string): string {
  if (!artist) return '';
  // Remove sufixos comuns do YouTube e plataformas
  return artist
    .replace(/\s*[-–—]\s*(Topic|Official|Subject|Channel|VEVO| - .*|\(.*\)|\[.*\])$/gi, '')
    .replace(/\s*\(.*?\)$/g, '')
    .replace(/\s*\[.*?\]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

class BeatportProvider implements MetadataProvider {
  name = 'Beatport';

  async isConfigured(): Promise<boolean> {
    return true; // Sempre disponível via scraping
  }

  async search(title: string, artist: string): Promise<Partial<EnhancedMetadata> | null> {
    try {
      // Primeiro, buscar na página de search do Beatport
      const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(`${artist} ${title}`)}`;
      
      // Usar puppeteer com estratégia anti-detecção mais robusta
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({ 
        headless: true,
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
      });

      try {
        const page = await browser.newPage();
        
        // User-Agent mais realista do Edge no Windows
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0');
        
        // Headers mais convincentes
        await page.setExtraHTTPHeaders({
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,pt;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        });
        
        // Viewport realista
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Remover propriedades que detectam automação
        await page.evaluateOnNewDocument(() => {
          // @ts-ignore
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
          // @ts-ignore
          window.chrome = { runtime: {} };
          // @ts-ignore
          Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
          });
          // @ts-ignore
          Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en', 'pt'],
          });
        });
        
        // Ir para página de busca com timeout maior
        console.log(`🌐 [Beatport] Navegando para: ${searchUrl}`);
        const response = await page.goto(searchUrl, { 
          waitUntil: 'networkidle0',
          timeout: 45000 
        });
        
        // Verificar se foi redirecionado para homepage
        const currentUrl = page.url();
        if (currentUrl === 'https://www.beatport.com/' || currentUrl === 'https://www.beatport.com/pt') {
          console.log(`⚠️  [Beatport] Redirecionado para homepage - possível detecção de bot`);
          console.log(`    URL esperada: ${searchUrl}`);
          console.log(`    URL atual: ${currentUrl}`);
          await browser.close();
          return null;
        }

        // Aguardar carregamento com delay mais longo
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Tratar cookies de forma mais natural
        try {
          await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const button of buttons) {
              const text = button.textContent?.toLowerCase() || '';
              if (text.includes('accept') || text.includes('allow') || text.includes('agree')) {
                (button as HTMLElement).click();
                return true;
              }
            }
            return false;
          });
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (e) {
          // Ignorar erros de cookie
        }

        // Scroll simulando comportamento humano
        await page.evaluate(() => {
          window.scrollTo(0, 200);
        });
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Buscar links de tracks e fazer matching inteligente
        console.log('🔍 [Beatport] Iniciando busca por links de tracks na página...');
        
        const trackMatches = await page.evaluate((searchTitle: string, searchArtist: string) => {
          const trackLinks = Array.from(document.querySelectorAll('a[href*="/track/"]')) as HTMLAnchorElement[];
          const matches: Array<{text: string, href: string, similarity: number}> = [];
          
          // Função para calcular similaridade entre títulos
          const calculateSimilarity = (trackText: string, targetTitle: string, targetArtist: string): number => {
            const trackLower = trackText.toLowerCase();
            const titleLower = targetTitle.toLowerCase();
            const artistLower = targetArtist.toLowerCase();
            
            let score = 0;
            
            // PRIORIDADE MÁXIMA: Match exato do título (400 pontos)
            if (trackLower.includes(titleLower)) {
              score += 400;
              console.log(`[SCORE] +400 por título "${titleLower}" encontrado em "${trackLower}"`);
            }
            
            // Verificar se todas as palavras do título estão presentes
            const titleWords = titleLower.split(/[\s-]+/).filter((w: string) => w.length > 2);
            let titleWordMatches = 0;
            titleWords.forEach((word: string) => {
              if (trackLower.includes(word)) {
                titleWordMatches++;
                score += 100; // +100 por cada palavra do título
                console.log(`[SCORE] +100 por palavra "${word}" do título`);
              }
            });
            
            // Bonus se contém TODAS as palavras do título
            if (titleWordMatches === titleWords.length && titleWords.length > 0) {
              score += 200;
              console.log(`[SCORE] +200 por conter todas as ${titleWords.length} palavras do título`);
            }
            
            // Menor prioridade para artista (só depois do título)
            if (trackLower.includes(artistLower)) {
              score += 50; // Reduzido de 100 para 50
              console.log(`[SCORE] +50 por artista "${artistLower}" encontrado`);
            }
            
            // PENALIDADES SEVERAS para palavras que não estão no título original
            const suspiciousWords = ['remix', 'edit', 'bootleg', 'vip', 'rework', 'flip', 'mix', 'version', 'vocal', 'dub'];
            suspiciousWords.forEach((word: string) => {
              if (trackLower.includes(word) && !titleLower.includes(word)) {
                score -= 100; // Aumentado de -30 para -100
                console.log(`[SCORE] -100 por palavra suspeita "${word}" não presente no título original`);
              }
            });
            
            // Bonus para matches específicos
            if (titleLower.includes('original') && trackLower.includes('original')) {
              score += 150;
              console.log(`[SCORE] +150 por "original" em ambos`);
            }
            if (titleLower.includes('extended') && trackLower.includes('extended')) {
              score += 100;
              console.log(`[SCORE] +100 por "extended" em ambos`);
            }
            
            // Penalidade por diferenças no artista
            const trackArtists = trackLower.split(/[,-]/).map((a: string) => a.trim());
            const hasCorrectArtist = trackArtists.some((a: string) => a.includes(artistLower) || artistLower.includes(a));
            if (!hasCorrectArtist) {
              score -= 50;
              console.log(`[SCORE] -50 por artista não encontrado adequadamente`);
            }
            
            console.log(`[SCORE] Score final para "${trackText}": ${score}`);
            return score;
          };
          
          // Capturar informações para debug
          const debugInfo: Array<{index: number, text: string, href: string, valid: boolean}> = [];
          
          trackLinks.forEach((link: HTMLAnchorElement, index: number) => {
            const trackText = link.textContent?.trim() || '';
            const href = link.href;
            
            debugInfo.push({
              index: index + 1,
              text: trackText,
              href: href,
              valid: !!(trackText && href && trackText.length > 3)
            });
            
            if (trackText && href && trackText.length > 3) {
              const similarity = calculateSimilarity(trackText, searchTitle, searchArtist);
              
              matches.push({
                text: trackText,
                href: href,
                similarity: similarity
              });
            }
          });
          
          // Ordenar por similaridade (maior score primeiro)
          const sortedMatches = matches.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
          
          return {
            totalLinks: trackLinks.length,
            debugInfo: debugInfo,
            matches: sortedMatches,
            pageUrl: window.location.href,
            pageTitle: document.title
          };
        }, title, artist);

        console.log(`📊 [Beatport] Página: ${trackMatches.pageTitle}`);
        console.log(`🌐 [Beatport] URL: ${trackMatches.pageUrl}`);
        console.log(`🔗 [Beatport] Total de links encontrados: ${trackMatches.totalLinks}`);
        
        // Mostrar debug info dos primeiros links
        console.log('🔍 [Beatport] Primeiros links encontrados:');
        trackMatches.debugInfo.slice(0, 5).forEach(link => {
          console.log(`   ${link.index}. "${link.text}" -> ${link.href} (Válido: ${link.valid})`);
        });

        console.log(`🎯 [Beatport] Matches após similaridade: ${trackMatches.matches.length}`);
        trackMatches.matches.forEach((match, i) => {
          console.log(`   ${i + 1}. "${match.text}" (Score: ${match.similarity})`);
          console.log(`      URL: ${match.href}`);
        });

        if (trackMatches.matches.length === 0) {
          console.log('❌ [Beatport] Nenhuma track encontrada após matching');
          await browser.close();
          return null;
        }

        // Usar a track com maior score de similaridade, mas só se o score for razoável
        const bestMatch = trackMatches.matches[0];
        if (bestMatch.similarity < 50) {
          console.log(`❌ [Beatport] Melhor match tem score muito baixo (${bestMatch.similarity}) - não confiável`);
          await browser.close();
          return null;
        }

        console.log(`🎯 [Beatport] Selecionando melhor match: "${bestMatch.text}" (Score: ${bestMatch.similarity})`);
        console.log(`🌐 [Beatport] Navegando para: ${bestMatch.href}`);
        
        // Navegar para página da track com mais cuidado
        try {
          // Fazer movimento do mouse simulando comportamento humano
          await page.mouse.move(500, 400);
          await new Promise(resolve => setTimeout(resolve, 500));
          
          await page.goto(bestMatch.href, { 
            waitUntil: 'networkidle0',
            timeout: 45000 
          });
          console.log('✅ [Beatport] Navegação para página da track bem-sucedida');
        } catch (error) {
          console.log(`❌ [Beatport] Erro ao navegar para página da track: ${error instanceof Error ? error.message : error}`);
          await browser.close();
          return null;
        }
        
        console.log('⏳ [Beatport] Aguardando carregamento da página da track...');
        await new Promise(resolve => setTimeout(resolve, 8000)); // Delay maior

        // Verificar se ainda estamos na URL correta após navegação
        const currentUrlAfterNav = await page.url();
        console.log(`🔗 [Beatport] URL atual após navegação: ${currentUrlAfterNav}`);
        
        if (!currentUrlAfterNav.includes('/track/') || 
            currentUrlAfterNav === 'https://www.beatport.com/pt' || 
            currentUrlAfterNav === 'https://www.beatport.com/') {
          console.log('❌ [Beatport] URL inválida após navegação - possível redirecionamento ou bloqueio');
          console.log(`🔍 [Beatport] URL esperada: ${bestMatch.href}`);
          console.log(`🔍 [Beatport] URL atual: ${currentUrlAfterNav}`);
          await browser.close();
          return null;
        }

        // Tratar cookies novamente na página da track se necessário
        try {
          const cookieResult = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const button of buttons) {
              const text = button.textContent?.toLowerCase() || '';
              if (text.includes('accept') || text.includes('aceitar') || text.includes('allow') || text.includes('agree')) {
                (button as HTMLElement).click();
                return `Clicou em cookie: "${button.textContent}"`;
              }
            }
            return false;
          });
          
          if (cookieResult) {
            console.log(`🍪 [Beatport] ${cookieResult}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (e) {
          console.log('⚠️  [Beatport] Erro ao tratar cookies na página da track');
        }

        // Aguardar um pouco mais para garantir carregamento completo
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Extrair metadados da página da track com foco nos seletores que funcionavam
        const metadata = await page.evaluate(() => {
          console.log('[DEBUG] Iniciando extração de metadados da página da track');
          console.log('[DEBUG] URL atual:', window.location.href);
          console.log('[DEBUG] Título da página:', document.title);
          
          // VALIDAÇÃO CRÍTICA: Verificar se estamos na página de uma track individual
          const currentUrl = window.location.href;
          const isTrackPage = currentUrl.includes('/track/') && currentUrl.split('/').length >= 6;
          
          if (!isTrackPage) {
            console.log('[DEBUG] ❌ ERRO: Não estamos em uma página de track individual!');
            console.log('[DEBUG] URL atual:', currentUrl);
            return {
              error: 'URL_INVALID',
              url: currentUrl,
              pageTitle: document.title,
              hasData: false
            };
          }
          
          console.log('[DEBUG] ✅ Confirmado: estamos em página de track individual');
          
          // Função helper para extrair texto de seletores
          const getTextFromSelectors = (selectors: string[]): string | null => {
            console.log(`[DEBUG] Tentando seletores:`, selectors);
            for (const selector of selectors) {
              try {
                const elements = document.querySelectorAll(selector);
                console.log(`[DEBUG] Seletor "${selector}" encontrou ${elements.length} elementos`);
                
                for (let i = 0; i < elements.length; i++) {
                  const element = elements[i];
                  const text = element.textContent?.trim();
                  console.log(`[DEBUG] Elemento ${i + 1}: texto="${text}"`);
                  
                  if (text && text.length > 0 && text !== '-' && !text.toLowerCase().includes('n/a')) {
                    console.log(`[DEBUG] ✅ Texto válido encontrado com "${selector}": "${text}"`);
                    return text;
                  }
                }
              } catch (e) {
                console.log(`[DEBUG] ❌ Erro com seletor "${selector}": ${e}`);
              }
            }
            return null;
          };

          // Função para buscar por texto usando regex em toda a página
          const findByRegex = (pattern: RegExp, description: string): string | null => {
            const bodyText = document.body.textContent || '';
            const match = bodyText.match(pattern);
            if (match) {
              console.log(`[DEBUG] ${description} encontrado por regex: "${match[1]}"`);
              return match[1];
            }
            return null;
          };

          console.log('[DEBUG] === BUSCANDO ARTISTA ===');
          // NOVO: Seletores específicos para ARTISTA (baseado na imagem do Beatport)
          const artistSelectors = [
            '.interior-track-content .track-artist a',
            '.track-detail .artist a',
            '.track-header .artist-name a',
            '.track-title .artist a',
            '.breadcrumb a[href*="/artist/"]',
            'a[href*="/artist/"]:not([href*="/track/"])',
            '.track-detail-data .artist a',
            '.interior-track-header .artist a'
          ];
          
          let artist = getTextFromSelectors(artistSelectors);
          
          // Se não encontrou por seletores, buscar por regex no texto da página
          if (!artist) {
            console.log('[DEBUG] Artista não encontrado por seletores, tentando regex...');
            // Buscar padrões como "Artist Name" no título da página
            const pageTitle = document.title;
            if (pageTitle) {
              // Extrair artista do título da página (ex: "Track Name - Artist Name :: Beatport")
              const titleMatch = pageTitle.match(/^(.+?)\s*-\s*(.+?)\s*::/);
              if (titleMatch && titleMatch[2]) {
                artist = titleMatch[2].trim();
                console.log(`[DEBUG] Artista extraído do título da página: "${artist}"`);
              }
            }
          }

          console.log('[DEBUG] === BUSCANDO BPM ===');
          // CORRIGIDO: Seletores mais específicos para BPM (baseado na estrutura real do Beatport)
          const bpmSelectors = [
            '.track-stats .stat .value[data-bpm]',  // Novo seletor mais específico
            '.track-detail-data td:nth-child(4)',   // BPM é geralmente a 4ª coluna na tabela
            '[data-testid="track-bpm"] .value',     // Seletor moderno atualizado
            '.bpm-value',                          // Classe específica de BPM
            '.track-stats .bpm .value',
            '.track-info .bpm', 
            '.bpm .value',
            '.playback-controls .bpm',
            'span[title*="BPM"]',
            '.interior-track-content .bpm .value',
            '.track-detail-data .bpm', 
            '[data-bpm]',
            'table td[data-ec-d1]'
          ];
          
          let bpm = getTextFromSelectors(bpmSelectors);
          
          // MELHORADO: Busca por BPM na tabela de detalhes
          if (!bpm) {
            console.log('[DEBUG] BPM não encontrado por seletores, analisando tabela...');
            
            // Buscar na estrutura de tabela mostrada na imagem
            const tableRows = document.querySelectorAll('tr, .track-detail-row');
            for (const row of tableRows) {
              const rowText = row.textContent || '';
              console.log(`[DEBUG] Analisando linha da tabela: "${rowText}"`);
              
              // Procurar por padrão "XXX BPM" na linha
              const bpmMatch = rowText.match(/(\d{2,3})\s*BPM/i);
              if (bpmMatch) {
                const foundBpm = parseInt(bpmMatch[1]);
                // Validar se o BPM é realista para música eletrônica (60-200)
                if (foundBpm >= 60 && foundBpm <= 200) {
                  bpm = foundBpm.toString();
                  console.log(`[DEBUG] ✅ BPM válido encontrado na tabela: ${bpm}`);
                  break;
                }
              }
            }
          }
          
          // Se ainda não encontrou, buscar por regex no texto geral
          if (!bpm) {
            console.log('[DEBUG] BPM não encontrado na tabela, tentando regex geral...');
            // Regex mais rigoroso: buscar apenas números de BPM realistas
            const bpmMatches = document.body.textContent?.match(/\b(\d{2,3})\s*BPM\b/gi) || [];
            
            for (const match of bpmMatches) {
              const numberMatch = match.match(/(\d{2,3})/);
              if (numberMatch) {
                const foundBpm = parseInt(numberMatch[1]);
                if (foundBpm >= 60 && foundBpm <= 200) {
                  bpm = foundBpm.toString();
                  console.log(`[DEBUG] ✅ BPM válido encontrado por regex: ${bpm}`);
                  break;
                }
              }
            }
          }

          console.log('[DEBUG] === BUSCANDO KEY ===');
          // Seletores específicos para Key Musical
          const keySelectors = [
            '.track-stats .stat .value[data-key]',     // Seletor específico para key
            '.track-detail-data td:nth-child(5)',      // Key geralmente na 5ª coluna
            '[data-testid="track-key"] .value',        // Seletor moderno atualizado
            '.key-value',                             // Classe específica de key
            '.track-stats .key .value',
            '.track-info .key',
            '.key .value',
            '.playback-controls .key',
            'span[title*="Key"]',
            '.interior-track-content .key .value',
            '.track-detail-data .key',
            '[data-key]',
            'table td[data-ec-d2]'
          ];
          
          let key = getTextFromSelectors(keySelectors);
          
          // Se não encontrou por seletores, buscar na tabela
          if (!key) {
            console.log('[DEBUG] Key não encontrada por seletores, analisando tabela...');
            const tableRows = document.querySelectorAll('tr, .track-detail-row');
            for (const row of tableRows) {
              const rowText = row.textContent || '';
              // Buscar padrão de key musical (ex: "F Minor", "Bb Major")
              const keyMatch = rowText.match(/\b([A-G][#♯♭b]?\s*(?:maj|min|major|minor))\b/i);
              if (keyMatch) {
                key = keyMatch[1];
                console.log(`[DEBUG] ✅ Key encontrada na tabela: ${key}`);
                break;
              }
            }
          }
          
          // Regex fallback para key
          if (!key) {
            key = findByRegex(/Key[:\s]*([A-G][#♯♭b]?\s*(?:maj|min|major|minor))/i, 'Key');
          }

          console.log('[DEBUG] === BUSCANDO GENRE ===');
          // Seletores para gênero (baseado na estrutura mostrada na imagem)
          const genreSelectors = [
            '.track-detail-data td:nth-child(3) a',    // Gênero geralmente na 3ª coluna
            '[data-testid="track-genre"] a',           // Seletor moderno do Beatport
            '.track-stats .genre a',
            '.track-genre a',
            '.genre-link',
            '.interior-track-content .genre a',
            '.track-detail-data .genre a',
            '.genre a',
            'a[href*="/genre/"]'
          ];
          
          let genre = getTextFromSelectors(genreSelectors);
          
          // Limpar gênero se contiver BPM ou outros dados misturados
          if (genre) {
            // Remover BPM se estiver misturado com o gênero
            const genreClean = genre.replace(/\d+\s*BPM\s*[-\/]?\s*/gi, '').trim();
            const finalGenre = genreClean.replace(/^\d+\s*\/?\s*/, '').trim(); // Remove números do início
            if (finalGenre && finalGenre !== genre) {
              console.log(`[DEBUG] Gênero limpo de "${genre}" para "${finalGenre}"`);
              genre = finalGenre;
            }
          }

          console.log('[DEBUG] === BUSCANDO LABEL ===');
          // Seletores para label/gravadora (baseado na imagem - "Cronos")
          const labelSelectors = [
            '.track-detail-data td:nth-child(2) a',    // Label geralmente na 2ª coluna
            '[data-testid="track-label"] a',           // Seletor moderno do Beatport
            '.track-stats .label a',
            '.track-label a',
            '.record-label a',
            '.interior-track-content .label a',
            '.track-detail-data .label a', 
            '.label a',
            'a[href*="/label/"]'
          ];
          
          let label = getTextFromSelectors(labelSelectors);

          // Limpeza final dos dados
          if (bpm) {
            const bpmClean = bpm.toString().match(/(\d{2,3})/);
            if (bpmClean) {
              bpm = bpmClean[1];
            }
          }
          
          if (key) {
            key = key.trim();
          }
          
          if (genre) {
            // Remover caracteres extras e normalizar
            genre = genre.replace(/\s*\/\s*$/, '').trim(); // Remove barras finais
          }
          
          if (label) {
            label = label.trim();
          }

          if (artist) {
            artist = artist.trim();
          }

          const result = {
            bpm: bpm ? parseInt(bpm.toString()) : undefined,
            key: key || undefined,
            genre: genre || undefined,
            label: label || undefined,
            artist: artist || undefined,  // NOVO: incluir artista no resultado
            url: currentUrl,
            pageTitle: document.title,
            hasData: !!(bpm || key || genre || label || artist),
            debugInfo: {
              foundBpm: !!bpm,
              foundKey: !!key, 
              foundGenre: !!genre,
              foundLabel: !!label,
              foundArtist: !!artist,  // NOVO: debug para artista
              bpmRaw: bpm,
              keyRaw: key,
              genreRaw: genre,
              labelRaw: label,
              artistRaw: artist  // NOVO: debug para artista
            }
          };
          
          console.log('[DEBUG] =======================================');
          console.log('[DEBUG] RESULTADO FINAL DA EXTRAÇÃO:');
          console.log('[DEBUG] =======================================');
          console.log('[DEBUG] URL:', result.url);
          console.log('[DEBUG] Page Title:', result.pageTitle);
          console.log('[DEBUG] Artist:', result.artist);  // NOVO: log do artista
          console.log('[DEBUG] BPM:', result.bpm);
          console.log('[DEBUG] Key:', result.key);
          console.log('[DEBUG] Genre:', result.genre);
          console.log('[DEBUG] Label:', result.label);
          console.log('[DEBUG] Has Data:', result.hasData);
          console.log('[DEBUG] =======================================');
          
          return result;
        });

        await browser.close();

        // Verificar se houve erro na extração usando type guard
        if ('error' in metadata) {
          console.log(`❌ [Beatport] Erro na extração: ${metadata.error}`);
          console.log(`   URL problemática: ${metadata.url}`);
          return null;
        }

        console.log(`✅ [Beatport] Metadados extraídos de: ${metadata.url}`);
        console.log(`   👨‍🎤 Artist: ${metadata.artist || 'N/A'}`);  // NOVO: log do artista
        console.log(`   🎵 BPM: ${metadata.bpm || 'N/A'}`);
        console.log(`   🔑 Key: ${metadata.key || 'N/A'}`);
        console.log(`   🎭 Genre: ${metadata.genre || 'N/A'}`);
        console.log(`   🏷️  Label: ${metadata.label || 'N/A'}`);

        if (!metadata.bpm && !metadata.key && !metadata.genre && !metadata.label && !metadata.artist) {
          console.log('⚠️  [Beatport] Nenhum metadado útil encontrado na página da track');
          return null;
        }

        console.log('🎉 [Beatport] Metadados únicos encontrados com sucesso!');
        return {
          artist: cleanArtistName(metadata.artist || '') || artist || undefined,    // NOVO: retornar artista
          bpm: metadata.bpm,
          key: metadata.key,
          genre: metadata.genre,
          label: metadata.label
        };

      } catch (error) {
        await browser.close();
        throw error;
      }

    } catch (error) {
      console.error('❌ [Beatport] Erro:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }
}

// NOVA VERSÃO: BeatportProviderV2 com seletores aprimorados e extração robusta
class BeatportProviderV2 implements MetadataProvider {
  name = 'BeatportV2';

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async search(title: string, artist: string): Promise<Partial<EnhancedMetadata> | null> {
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({ 
      headless: true,
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
    });
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0');
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,pt;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      });
      await page.setViewport({ width: 1920, height: 1080 });
      await page.evaluateOnNewDocument(() => {
        // @ts-ignore
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // @ts-ignore
        window.chrome = { runtime: {} };
        // @ts-ignore
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        // @ts-ignore
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'pt'] });
      });
      // Buscar na página de search
      const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(`${artist} ${title}`)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 45000 });
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      // Tratar cookies se aparecerem
      try {
        await page.evaluate(() => {
          const cookieButtons = Array.from(document.querySelectorAll('button'));
          for (const button of cookieButtons) {
            const text = button.textContent?.toLowerCase() || '';
            if (text.includes('accept') || text.includes('aceitar') || text.includes('i accept')) {
              button.click();
              return true;
            }
          }
          return false;
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (cookieError) {
        console.log(`⚠️  [BeatportV2] Erro ao tratar cookies: ${cookieError instanceof Error ? cookieError.message : cookieError}`);
      }
      // Buscar melhor match
      const trackUrl = await page.evaluate((searchTitle, searchArtist) => {
        // Procurar todos os links de track
        const links = Array.from(document.querySelectorAll('a[href*="/track/"]'));
        console.log(`🔍 [BeatportV2] Encontrados ${links.length} links de track`);
        
        let bestHref = null;
        let bestScore = -Infinity;
        
        for (let i = 0; i < links.length; i++) {
          const link = links[i];
          const text = link.textContent?.trim() || '';
          let score = 0;
          
          if (text.toLowerCase().includes(searchTitle.toLowerCase())) score += 500;
          if (text.toLowerCase().includes(searchArtist.toLowerCase())) score += 200;
          if (text.toLowerCase().includes('original mix')) score += 100;
          
          console.log(`   Link ${i + 1}: "${text}" (Score: ${score})`);
          
          if (score > bestScore) {
            bestScore = score;
            const href = link.getAttribute('href');
            // Converter URL relativa para absoluta
            bestHref = href?.startsWith('http') ? href : `https://www.beatport.com${href}`;
            console.log(`   ✅ Novo melhor: ${bestHref} (Score: ${bestScore})`);
          }
        }
        
        console.log(`🎯 [BeatportV2] Melhor URL final: ${bestHref}`);
        return bestHref;
      }, title, artist);
      
      console.log(`🔗 [BeatportV2] Track URL encontrada: ${trackUrl}`);
      
      if (!trackUrl) {
        console.log(`❌ [BeatportV2] Nenhuma URL de track encontrada`);
        await browser.close();
        return null;
      }
      
      // Verificar se a URL é válida
      if (!trackUrl.startsWith('http')) {
        console.log(`❌ [BeatportV2] URL inválida: ${trackUrl}`);
        await browser.close();
        return null;
      }
      
      await page.goto(trackUrl, { waitUntil: 'networkidle0', timeout: 45000 });
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      // Tratar cookies novamente na página da track
      try {
        await page.evaluate(() => {
          const cookieButtons = Array.from(document.querySelectorAll('button'));
          for (const button of cookieButtons) {
            const text = button.textContent?.toLowerCase() || '';
            if (text.includes('accept') || text.includes('aceitar') || text.includes('i accept')) {
              button.click();
              return true;
            }
          }
          return false;
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (cookieError) {
        console.log(`⚠️  [BeatportV2] Erro ao tratar cookies na página da track: ${cookieError instanceof Error ? cookieError.message : cookieError}`);
      }
      // Extração precisa usando os seletores identificados na inspeção
      const metadata = await page.evaluate(() => {
        console.log('[DEBUG] Iniciando extração com seletores corretos...');
        
        // Helper para extrair valor de MetaItem usando estrutura div/span
        function getMetaValue(labelText) {
          // Buscar todos os MetaItems
          const metaItems = document.querySelectorAll('.TrackMeta-style__MetaItem-sc-9c332570-0');
          
          for (const item of metaItems) {
            const label = item.querySelector('div');
            const value = item.querySelector('span');
            
                         if (label && value) {
               const labelContent = (label.textContent || '').trim().replace(':', '');
               const valueContent = (value.textContent || '').trim();
               
               console.log(`[DEBUG] MetaItem encontrado: "${labelContent}" = "${valueContent}"`);
               
               if (labelContent === labelText) {
                 console.log(`[DEBUG] ✅ Match encontrado para "${labelText}": "${valueContent}"`);
                 return valueContent;
               }
             }
          }
          return null;
        }
        
        // Extrair dados usando os seletores corretos
        const bpmText = getMetaValue('BPM');
        const keyText = getMetaValue('Tom');
        const genreText = getMetaValue('Gênero');
        const labelText = getMetaValue('Gravadora');
        
        console.log(`[DEBUG] Dados extraídos:`, {
          bpm: bpmText,
          key: keyText,
          genre: genreText,
          label: labelText
        });
        
        // Processar BPM
        let bpm = undefined;
        if (bpmText) {
          const bpmNum = parseInt(bpmText);
          if (bpmNum >= 80 && bpmNum <= 200) {
            bpm = bpmNum;
          }
        }
        
        // Processar Key
        let key = undefined;
        if (keyText) {
          // Normalizar key (ex: "F Min" -> "F Minor")
          key = keyText
            .replace(/\bMin\b/gi, 'Minor')
            .replace(/\bMaj\b/gi, 'Major')
            .replace(/\s+/g, ' ')
            .trim();
        }
        
        // Processar Genre
        let genre = genreText || undefined;
        
        // Processar Label
        let label = labelText || undefined;
        
        // Extrair Artist do título da página
        const pageTitle = document.title;
        let artist = '';
        if (pageTitle) {
          const artistMatch = pageTitle.match(/^(.+?)\s*-\s*/);
          if (artistMatch) {
            artist = artistMatch[1].trim();
          }
        }
        
        const result = {
          artist: artist,
                     bpm: bpm,
          key: key,
          genre: genre,
          label: label
        };
        
        console.log(`[DEBUG] Resultado final:`, result);
        return result;
      });
      await browser.close();
      if (!metadata || (!metadata.bpm && !metadata.key && !metadata.genre && !metadata.label && !metadata.artist)) {
        return null;
      }
      return metadata;
    } catch (error) {
      console.error(`❌ [BeatportV2] Erro detalhado:`, error instanceof Error ? error.message : error);
      console.error(`❌ [BeatportV2] Stack trace:`, error instanceof Error ? error.stack : 'N/A');
      await browser.close();
      return null;
    }
  }
}

export class MetadataAggregator {
  private providers: MetadataProvider[] = [
    new BeatportProvider(),
    new MusicBrainzProvider()  // Apenas como fallback básico
  ];

  async searchMetadata(title: string, artist: string, options?: { useBeatport?: boolean }): Promise<EnhancedMetadata> {
    console.log(`\n🔍 [MetadataAggregator] Iniciando busca para: "${title}" - "${artist}"`);
    console.log(`📋 [MetadataAggregator] Opções: useBeatport=${options?.useBeatport || false}`);
    
    const results: Array<Partial<EnhancedMetadata> & { source: string }> = [];
    
    // Se useBeatport estiver ativado, usar APENAS Beatport
    let providersToUse: MetadataProvider[] = [];
    if (options?.useBeatport) {
      providersToUse = [new BeatportProviderV2()];
      console.log(`🎧 [MetadataAggregator] Modo Beatport ativado - usando BeatportProviderV2`);
    } else {
      providersToUse = [new MusicBrainzProvider()]; // Só MusicBrainz como fallback
      console.log(`🌐 [MetadataAggregator] Modo normal - usando apenas MusicBrainz`);
    }
    
    // Search providers sequentially (não parallel para evitar problemas)
    for (const provider of providersToUse) {
      const startTime = Date.now();
      console.log(`⏳ [${provider.name}] Iniciando busca...`);
      
      if (!await provider.isConfigured()) {
        console.log(`⚠️  [${provider.name}] Provider não configurado - pulando`);
        continue;
      }
      
      try {
        const result = await provider.search(title, artist);
        const duration = Date.now() - startTime;
        
        if (result) {
          console.log(`✅ [${provider.name}] Sucesso em ${duration}ms:`);
          console.log(`      • BPM: ${result.bpm || 'N/A'}`);
          console.log(`      • Key: ${result.key || 'N/A'}`);
          console.log(`      • Genre: ${result.genre || 'N/A'}`);
          console.log(`      • Label: ${result.label || 'N/A'}`);
          console.log(`      • Year: ${result.year || 'N/A'}`);
          console.log(`      • Album: ${result.album || 'N/A'}`);
          
          results.push({ ...result, source: provider.name });
          
          // Se é Beatport e encontrou dados, parar aqui
          if ((provider.name === 'Beatport' || provider.name === 'BeatportV2') && (result.bpm || result.key || result.genre || result.label)) {
            console.log(`🎯 [${provider.name}] Dados úteis encontrados - interrompendo busca`);
            break;
          }
        } else {
          console.log(`❌ [${provider.name}] Nenhum resultado encontrado em ${duration}ms`);
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ [${provider.name}] Erro em ${duration}ms:`, error instanceof Error ? error.message : error);
      }
    }
    
    console.log(`\n📊 [MetadataAggregator] Resumo dos resultados:`);
    console.log(`   ✅ Providers com sucesso: ${results.length}/${providersToUse.length}`);
    if (results.length > 0) {
      console.log(`   📍 Fontes obtidas: ${results.map(r => r.source).join(', ')}`);
    }
    
    // Aggregate results
    const aggregated = this.aggregateResults(results, title, artist);
    
    console.log(`\n🎯 [MetadataAggregator] Resultado final agregado:`);
    console.log(`      • Title: ${aggregated.title}`);
    console.log(`      • Artist: ${aggregated.artist}`);
    console.log(`      • BPM: ${aggregated.bpm || 'N/A'}`);
    console.log(`      • Key: ${aggregated.key || 'N/A'}`);
    console.log(`      • Genre: ${aggregated.genre || 'N/A'}`);
    console.log(`      • Label: ${aggregated.label || 'N/A'}`);
    console.log(`      • Year: ${aggregated.year || 'N/A'}`);
    console.log(`      • Album: ${aggregated.album || 'N/A'}`);
    console.log(`      • Sources: ${aggregated.sources?.join(', ') || 'Nenhuma'}`);
    
    const hasUsefulData = aggregated.bpm || aggregated.key || aggregated.genre || aggregated.label || aggregated.year;
    console.log(`   ✨ Metadados úteis encontrados: ${hasUsefulData ? 'SIM' : 'NÃO'}`);
    
    if (options?.useBeatport && (aggregated.sources?.includes('Beatport') || aggregated.sources?.includes('BeatportV2'))) {
      console.log('🎉 [MetadataAggregator] BEATPORT FUNCIONOU! Dados do Beatport incluídos!');
    }
    
    return aggregated;
  }

  private aggregateResults(results: Array<Partial<EnhancedMetadata> & { source: string }>, originalTitle: string, originalArtist: string): EnhancedMetadata {
    if (results.length === 0) {
      return {
        title: originalTitle,
        artist: originalArtist,
        sources: []
      };
    }

    // Sort by confidence score
    results.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    
    const sources = results.map(r => r.source);
    
    // Use highest confidence result as base, fill gaps with other results
    const base = results[0];
    const aggregated: EnhancedMetadata = {
      title: base.title || originalTitle,
      artist: base.artist || originalArtist,
      sources
    };

    // Aggregate fields from all results
    for (const result of results) {
      if (!aggregated.album && result.album) aggregated.album = result.album;
      if (!aggregated.year && result.year) aggregated.year = result.year;
      if (!aggregated.genre && result.genre) aggregated.genre = result.genre;
      if (!aggregated.label && result.label) aggregated.label = result.label;
      if (!aggregated.bpm && result.bpm) aggregated.bpm = result.bpm;
      if (!aggregated.key && result.key) aggregated.key = result.key;
      if (!aggregated.duration && result.duration) aggregated.duration = result.duration;
      if (!aggregated.isrc && result.isrc) aggregated.isrc = result.isrc;
    }

    // Calculate average for numeric fields where available
    const bpmValues = results.filter(r => r.bpm).map(r => r.bpm!);
    if (bpmValues.length > 1) {
      aggregated.bpm = Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length);
    }

    // Use highest confidence for audio features
    const highestConfidenceWithFeatures = results.find(r => r.acousticness !== undefined);
    if (highestConfidenceWithFeatures) {
      aggregated.acousticness = highestConfidenceWithFeatures.acousticness;
      aggregated.danceability = highestConfidenceWithFeatures.danceability;
      aggregated.energy = highestConfidenceWithFeatures.energy;
    }

    return aggregated;
  }

  async getConfigurationStatus(): Promise<Record<string, boolean>> {
    const status: Record<string, boolean> = {};
    
    for (const provider of this.providers) {
      status[provider.name] = await provider.isConfigured();
    }
    
    return status;
  }
}

// Singleton instance
export const metadataAggregator = new MetadataAggregator(); 