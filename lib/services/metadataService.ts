import axios, { AxiosResponse } from 'axios';
import { logger } from '../utils/logger';

export interface EnhancedMetadata {
  title: string;
  artist: string;
  album?: string;
  year?: number;
  publishedDate?: string; // **NOVO: Data de publicação por extenso**
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
  // Remove sufixos comuns do YouTube e plataformas
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

  async search(title: string, artist: string, showBeatportPage: boolean = false): Promise<Partial<EnhancedMetadata> | null> {
    const timeoutMs = 15000;
    console.log(`⏰ [Beatport] Iniciando busca com timeout de ${timeoutMs/1000}s`);
    
    return Promise.race([
      this.performBeatportSearch(title, artist, showBeatportPage),
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error('Beatport timeout após 15s')), timeoutMs)
      )
    ]);
  }

  private async performBeatportSearch(title: string, artist: string, showBeatportPage: boolean = false): Promise<Partial<EnhancedMetadata> | null> {
    console.log(`🚀 [Beatport] Lançando browser para busca: "${title}" - "${artist}"`);
    let browser;
    try {
      const puppeteer = await import('puppeteer');
      console.log(`📦 [Beatport] Puppeteer importado com sucesso`);
      
      console.log(`🔧 [Beatport] Configurando opções do browser...`);
      const browserOptions = { 
        headless: !showBeatportPage, // Browser visível apenas se showBeatportPage for true
        timeout: 10000,
        protocolTimeout: 15000,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-images',
          '--disable-javascript',
          '--memory-pressure-off',
          '--max_old_space_size=4096'
        ]
      };
      console.log(`⚙️ [Beatport] Opções do browser:`, browserOptions);
      
      console.log(`🚀 [Beatport] Iniciando launch do browser...`);
      browser = await puppeteer.default.launch(browserOptions);
      console.log(`✅ [Beatport] Browser lançado com sucesso`);

      const page = await browser.newPage();
      console.log(`📄 [Beatport] Nova página criada`);
      
      // Setup básico da página
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      // **MELHORADO: Limpeza do título para busca mais eficaz**
      let cleanedTitle = title;
      
      // Remover versões apenas para busca, mas preservar para o resultado final
      const versionMatch = title.match(/\(([^)]*?(?:mix|edit|remix|version)[^)]*)\)/i);
      if (versionMatch) {
        cleanedTitle = title.replace(/\s*\([^)]*?(?:mix|edit|remix|version)[^)]*\)/gi, '').trim();
      }
      
      // Buscar na página de search
      const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(`${artist} ${cleanedTitle}`)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Aceitar cookies se necessário
      try {
        await page.click('button:has-text("Accept"), button:has-text("Aceitar"), button[id*="accept"]');
      } catch (e) {
        // Ignorar se não houver botão de cookies
      }

      
      
      // Encontrar melhor match para a música
      const trackUrl = await page.evaluate((searchTitle, searchArtist) => {
        const links = Array.from(document.querySelectorAll('a[href*="/track/"]'));
        console.log(`🔍 [Beatport] Encontrados ${links.length} links de track`);

        let bestMatch = null;
        let bestScore = 0;
        
        for (let i = 0; i < links.length; i++) {
          const link = links[i];
          const text = (link.textContent || '').toLowerCase();
          const titleLower = searchTitle.toLowerCase();
          const artistLower = searchArtist.toLowerCase();
          
          let score = 0;
          
          // **MELHORADO: Algoritmo de scoring mais flexível**
          
          // Deve conter o título (ou parte dele)
          const titleWords = titleLower.split(/\s+/).filter(word => word.length > 2);
          let titleMatches = 0;
          titleWords.forEach(word => {
            if (text.includes(word)) titleMatches++;
          });
          if (titleMatches > 0) {
            score += (titleMatches / titleWords.length) * 100;
          }
          
          // Deve conter o artista (ou parte dele)
          const artistWords = artistLower.split(/\s+/).filter(word => word.length > 2);
          let artistMatches = 0;
          artistWords.forEach(word => {
            if (text.includes(word)) artistMatches++;
          });
          if (artistMatches > 0) {
            score += (artistMatches / artistWords.length) * 50;
          }
          
          // Bonus para match completo
          if (titleMatches > 0 && artistMatches > 0) score += 100;
          
          // Bonus para match exato
          if (text.includes(titleLower)) score += 50;
          if (text.includes(artistLower)) score += 25;
          
          // Penalidade para títulos muito diferentes
          if (text.length > titleLower.length * 2) score -= 20;
          
          console.log(`   ${i + 1}. "${link.textContent?.trim()}" (Score: ${score}, Title: ${titleMatches}/${titleWords.length}, Artist: ${artistMatches}/${artistWords.length})`);
          
          if (score > bestScore) {
            bestScore = score;
            const href = link.getAttribute('href');
            bestMatch = href?.startsWith('http') ? href : `https://www.beatport.com${href}`;
            console.log(`   🎯 ✅ NOVO MELHOR MATCH: ${bestMatch} (Score: ${bestScore})`);
          }
        }
        
        console.log(`\n🎯 [Beatport] RESULTADO DO MATCHING:`);
        console.log(`   🔍 Busca: "${searchTitle}" - "${searchArtist}"`);
        console.log(`   🎯 Melhor match: ${bestMatch || 'NENHUM'}`);
        console.log(`   📊 Score final: ${bestScore}`);
        console.log(`   📋 Total analisados: ${links.length}`);
        console.log(`   ============================================\n`);
        
        return bestMatch;
      }, cleanedTitle, artist);
      
      console.log(`🔗 [Beatport] Track URL encontrada: ${trackUrl}`);
      
      if (!trackUrl) {
        console.log(`❌ [Beatport] Nenhuma URL de track encontrada para "${cleanedTitle}" - "${artist}"`);
        await browser.close();
        return null;
      }
      
      // LOG da URL encontrada para validação
      console.log(`\n🎯 [Beatport] VALIDAÇÃO DE URL ENCONTRADA:`);
      console.log(`   🔍 Busca: "${cleanedTitle}" - "${artist}"`);
      console.log(`   🌐 URL: ${trackUrl}`);
      console.log(`   📋 Copie esta URL para validar manualmente no browser`);
      console.log(`   ======================================================\n`);
      
      // Ir para a página da música
      console.log(`🌐 [Beatport] Navegando para URL: ${trackUrl}`);
      await page.goto(trackUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      console.log(`✅ [Beatport] Página carregada com sucesso`);
      
      // Aguardar um tempo menor para garantir que o conteúdo dinâmico seja carregado
      console.log(`⏳ [Beatport] Aguardando carregamento do conteúdo dinâmico...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`✅ [Beatport] Tempo de espera concluído`);
      
      // Extrair metadados usando seletores específicos do Beatport
      const metadata = await page.evaluate(() => {
        const result: Partial<{
          title: string;
          artist: string;
          duration: number;
          year: number;
          publishedDate: string; // **NOVO: Data de publicação por extenso**
          bpm: number;
          key: string;
          genre: string;
          label: string;
        }> = {};
        // **MELHORADO: Título da música - preservar versões importantes**
        const titleEl = document.querySelector('h1[data-testid="track-title"], h1');
        if (titleEl) {
          const rawTitle = titleEl.textContent?.trim() || '';
          // Preservar Extended Mix, Remix, Edit, etc. mas remover duplicatas
          result.title = rawTitle
            .replace(/\s*\(Extended Mix\)\s*\(Extended Mix\)/gi, ' (Extended Mix)')
            .replace(/\s*\(Remix\)\s*\(Remix\)/gi, ' (Remix)')
            .replace(/\s*\(Edit\)\s*\(Edit\)/gi, ' (Edit)')
            .replace(/\s*\(Original Mix\)\s*\(Original Mix\)/gi, ' (Original Mix)')
            .replace(/\s*\(Club Mix\)\s*\(Club Mix\)/gi, ' (Club Mix)')
            .replace(/\s*\(Radio Edit\)\s*\(Radio Edit\)/gi, ' (Radio Edit)')
            .replace(/\s+/g, ' ')
            .trim();
        }
        // **CORRIGIDO: Extração de artistas específicos da música atual**
        console.log('🔍 [Beatport] Iniciando extração de artistas...');
        
        // Primeiro, tentar encontrar o container específico da música
        const trackContainer = document.querySelector('[data-testid="track-header"], .track-header, .track-info');
        let artistElements: NodeListOf<Element> = document.querySelectorAll('div'); // Inicializar com seletor válido
        
        console.log(`🔍 [Beatport] Track container encontrado: ${!!trackContainer}`);
        
        if (trackContainer) {
          // Buscar artistas apenas dentro do container da música
          artistElements = trackContainer.querySelectorAll('a[data-testid="artist-link"], a[href*="/artist/"], .artist-link');
          console.log(`🔍 [Beatport] Artistas no container específico: ${artistElements.length}`);
        } else {
          // Fallback: buscar por artistas próximos ao título
          const titleEl = document.querySelector('h1[data-testid="track-title"], h1');
          console.log(`🔍 [Beatport] Título encontrado: ${!!titleEl}`);
          
          if (titleEl) {
            // Buscar artistas que estão próximos ao título (dentro do mesmo container ou próximo)
            let parent = titleEl.parentElement;
            let depth = 0;
            while (parent && depth < 3) {
              if (parent.querySelectorAll) {
                artistElements = parent.querySelectorAll('a[data-testid="artist-link"], a[href*="/artist/"], .artist-link');
                console.log(`🔍 [Beatport] Profundidade ${depth}: ${artistElements.length} artistas encontrados`);
                if (artistElements.length > 0) break;
              }
              parent = parent.parentElement;
              depth++;
            }
          }
        }
        
        // **CORRIGIDO: Fallback mais específico - NÃO usar todos os artistas da página**
        if (artistElements.length === 0) {
          console.log('⚠️ [Beatport] Nenhum artista específico encontrado, tentando fallback específico...');
          
          // Tentar buscar artistas apenas na área do título da música
          const titleArea = document.querySelector('h1[data-testid="track-title"], h1')?.closest('div');
          if (titleArea) {
            artistElements = titleArea.querySelectorAll('a[href*="/artist/"]');
            console.log(`🔍 [Beatport] Artistas na área do título: ${artistElements.length}`);
          }
          
          // Se ainda não encontrou, tentar buscar por artistas que contenham o nome do artista original
          if (artistElements.length === 0) {
            console.log('⚠️ [Beatport] Nenhum artista específico encontrado, usando artista original');
            // Não definir result.artist aqui, deixar que use o artista original
          }
        }
        
        // **NOVO: Se ainda não encontrou artistas específicos, usar o artista original**
        if (artistElements.length === 0) {
          console.log('⚠️ [Beatport] Nenhum artista encontrado, usando artista original');
          // Não definir result.artist aqui, deixar que use o artista original
        }
        
        if (artistElements.length > 0) {
          const artists = Array.from(artistElements)
            .map(el => el.textContent?.trim())
            .filter(artist => artist && artist.length > 0);
          
          console.log(`🔍 [Beatport] Artistas encontrados: [${artists.map(a => `"${a}"`).join(', ')}]`);
          
          // **SIMPLIFICADO: Usar apenas os primeiros artistas encontrados (máximo 2)**
          if (artists.length === 1) {
            result.artist = artists[0];
            console.log(`✅ [Beatport] Artista definido: "${result.artist}"`);
          } else if (artists.length > 1) {
            // **CORRIGIDO: Juntar múltiplos artistas com vírgula em vez de "&"**
            result.artist = artists.slice(0, 2).join(', '); // Máximo 2 artistas
            console.log(`✅ [Beatport] Artistas definidos: "${result.artist}"`);
          } else {
            console.log(`⚠️ [Beatport] Nenhum artista encontrado, usando artista original: "${artist}"`);
            // Não definir result.artist, deixar que use o artista original
          }
        }
        // Estratégia: tentar pegar o MetaWrapper logo após o título
        let metaWrapper = null;
        if (titleEl) {
          let el = titleEl.nextElementSibling;
          let depth = 0;
          while (el && depth < 5) {
            if (el.className && el.className.includes('MetaWrapper')) {
              metaWrapper = el;
              break;
            }
            el = el.nextElementSibling;
            depth++;
          }
        }
        if (!metaWrapper) {
          metaWrapper = document.querySelector('[class*="MetaWrapper"]');
        }
        if (metaWrapper) {
          const metaItems = metaWrapper.querySelectorAll('[class*="MetaItem"]');
          let foundFields = 0;
          metaItems.forEach((item) => {
            const label = item.querySelector('div, span')?.textContent?.trim().toLowerCase();
            const value = item.querySelector('span:last-child')?.textContent?.trim();
            if (!label || !value) return;
            if (label.includes('tamanho')) {
              const [min, sec] = value.split(':').map(Number);
              result.duration = min * 60 + sec;
              foundFields++;
            } else if (label.includes('lançamento') || label.includes('release')) {
              // **MELHORADO: Processamento de datas mais robusto**
              const dateValue = value.trim();
              
              console.log(`📅 [Beatport] Data encontrada: "${dateValue}"`);
              
              // **NOVO: Salvar data de publicação por extenso**
              result.publishedDate = dateValue;
              console.log(`📅 [Beatport] Data de publicação salva: "${result.publishedDate}"`);
              
              // Tentar diferentes formatos de data para extrair o ano
              const yearMatch = dateValue.match(/(\d{4})/);
              if (yearMatch) {
                const year = parseInt(yearMatch[1]);
                // Validar se é um ano razoável (entre 1900 e ano atual + 1)
                const currentYear = new Date().getFullYear();
                if (year >= 1900 && year <= currentYear + 1) {
                  result.year = year;
                  foundFields++;
                  console.log(`📅 [Beatport] Ano extraído: ${result.year}`);
                }
              }
            } else if (label.includes('bpm')) {
              const bpmValue = parseInt(value);
              if (bpmValue > 0 && bpmValue <= 200) {
                result.bpm = bpmValue;
                foundFields++;
              }
            } else if (label.includes('tom') || label.includes('key')) {
              result.key = value;
              foundFields++;
            } else if (label.includes('gênero') || label.includes('genre')) {
              result.genre = value;
              foundFields++;
            } else if (label.includes('gravadora') || label.includes('label')) {
              result.label = value;
              foundFields++;
            }
          });
          // Fallback: sempre rodar regex para garantir extração do key
          const wrapperText = metaWrapper?.textContent || '';
          let regexKey = null;
          const keyMatch = wrapperText.match(/Key[:\s]*([A-G][#♯♭b]?\s*(?:Minor|Major|Min|Maj|m|M))/i);
          if (keyMatch) {
            regexKey = keyMatch[1].trim();
          } else {
            const keyPatternMatch = wrapperText.match(/([A-G][#♯♭b]?\s*(?:Minor|Major|Min|Maj|m|M))/i);
            if (keyPatternMatch) {
              regexKey = keyPatternMatch[1].trim();
            }
          }
          // Só sobrescreve se não encontrou no label
          if (!result.key && regexKey) {
            result.key = regexKey;
          }
        }
        return result;
      });
      
      await browser.close();
      
      // LOG DETALHADO DOS METADADOS EXTRAÍDOS
      console.log('[DEBUG NODE] Key extraído:', metadata.key);
      if (metadata && (metadata.bpm || metadata.key || metadata.genre || metadata.label || metadata.artist || metadata.year)) {
        console.log(`\n✅ [Beatport] METADADOS EXTRAÍDOS COM SUCESSO:`);
        console.log(`   🌐 URL Beatport: ${trackUrl}`);
        console.log(`   👨‍🎤 Artist: ${metadata.artist || 'N/A'}`);
        console.log(`   🎵 Title: ${metadata.title || 'N/A'}`);
        console.log(`   🎵 BPM: ${metadata.bpm || 'N/A'}`);
        console.log(`   🔑 Key: ${metadata.key || 'N/A'}`);
        console.log(`   🎭 Genre: ${metadata.genre || 'N/A'}`);
        console.log(`   🏷️ Label: ${metadata.label || 'N/A'}`);
        console.log(`   📅 Year: ${metadata.year ?? 'N/A'}`);
        console.log(`   📅 Published Date: ${metadata.publishedDate || 'N/A'}`);
        console.log(`   =========================================================`);
        console.log(`   🔗 VALIDAÇÃO: Copie a URL acima e verifique se os dados conferem!`);
        console.log(`   =========================================================\n`);
        return metadata;
      } else {
        console.log(`\n❌ [Beatport] NENHUM METADADO ÚTIL EXTRAÍDO:`);
        console.log(`   ⚠️ Verifique se a URL está correta e contém os dados esperados`);
        console.log(`   ==========================================================`);
        return null;
      }
      
    } catch (error) {
      console.error(`❌ [Beatport] Erro detalhado:`, error instanceof Error ? error.message : error);
      console.error(`❌ [Beatport] Stack trace:`, error instanceof Error ? error.stack : 'N/A');
      if (browser) {
        try {
          await browser.close();
          console.log(`✅ [Beatport] Browser fechado após erro`);
        } catch (closeError) {
          console.error(`❌ [Beatport] Erro ao fechar browser:`, closeError);
        }
      }
      return null;
    }
  }
}

export class MetadataAggregator {
  async searchMetadata(title: string, artist: string, options: { useBeatport?: boolean; showBeatportPage?: boolean } = {}): Promise<EnhancedMetadata> {
    const { useBeatport = false, showBeatportPage = false } = options;

    console.log(`\n🔍 [MetadataAggregator] Iniciando busca com opções:`, {
      title,
      artist,
      useBeatport,
      showBeatportPage,
    });
    
    // Se useBeatport estiver desabilitado, retornar dados básicos sem buscar
    if (!useBeatport) {
      console.log(`⏭️ [MetadataAggregator] Beatport desabilitado (useBeatport: ${useBeatport}), pulando busca.`);
      return {
        title,
        artist,
        sources: []
      };
    }
    
    console.log(`\n🚀 [MetadataAggregator] Iniciando busca Beatport para: "${title}" - "${artist}"`);
    
    const beatportProvider = new BeatportProviderV2();
    const startTime = Date.now();
    
    console.log(`⏳ [Beatport] Iniciando busca...`);
    
    try {
      const result = await beatportProvider.search(title, artist, showBeatportPage);
      const duration = Date.now() - startTime;
      
      if (result) {
        console.log(`✅ [Beatport] Sucesso em ${duration}ms:`);
        console.log(`      • Artist: ${result.artist || 'N/A'}`);
        console.log(`      • Title: ${result.title || 'N/A'}`);
        console.log(`      • BPM: ${result.bpm || 'N/A'}`);
        console.log(`      • Key: ${result.key || 'N/A'}`);
        console.log(`      • Genre: ${result.genre || 'N/A'}`);
        console.log(`      • Label: ${result.label || 'N/A'}`);
        console.log(`      • Year: ${result.year || 'N/A'}`);
        console.log(`      • Published Date: ${result.publishedDate || 'N/A'}`);
        
        const aggregated: EnhancedMetadata = {
          title: result.title || title,
          artist: result.artist || artist,
          album: result.album,
          genre: result.genre,
          label: result.label,
          bpm: result.bpm,
          key: result.key,
          year: result.year,
          publishedDate: result.publishedDate, // **NOVO: Incluir data de publicação**
          sources: ['BeatportV2']
        };
        
        console.log(`\n🎯 [MetadataAggregator] Resultado final:`);
        console.log(`      • Title: ${aggregated.title}`);
        console.log(`      • Artist: ${aggregated.artist}`);
        console.log(`      • BPM: ${aggregated.bpm || 'N/A'}`);
        console.log(`      • Key: ${aggregated.key || 'N/A'}`);
        console.log(`      • Genre: ${aggregated.genre || 'N/A'}`);
        console.log(`      • Label: ${aggregated.label || 'N/A'}`);
        console.log(`      • Year: ${aggregated.year || 'N/A'}`);
        console.log(`      • Published Date: ${aggregated.publishedDate || 'N/A'}`);
        const hasUsefulData = aggregated.bpm || aggregated.key || aggregated.genre || aggregated.label || aggregated.year;
        console.log(`   ✨ Metadados úteis encontrados: ${hasUsefulData ? 'SIM' : 'NÃO'}`);
        if (hasUsefulData) {
          console.log('🎉 [MetadataAggregator] BEATPORT FUNCIONOU! Dados obtidos com sucesso!');
          return aggregated;
        } else {
          // Se não encontrou metadados úteis, adiciona (Unreleased) ao título
          return {
            ...aggregated,
            title: `${aggregated.title} (Unreleased)`
          };
        }
      } else {
        console.log(`\n❌ [Beatport] NENHUM METADADO ÚTIL EXTRAÍDO:`);
        console.log(`   ⚠️ Verifique se a URL está correta e contém os dados esperados`);
        console.log(`   ==========================================================`);
        return {
          title,
          artist,
          sources: []
        };
      }
      
    } catch (error) {
      console.error(`❌ [MetadataAggregator] Erro ao buscar metadados:`, error instanceof Error ? error.message : error);
      console.error(`❌ [MetadataAggregator] Stack trace:`, error instanceof Error ? error.stack : 'N/A');
      return {
        title,
        artist,
        sources: []
      };
    }
  }
}

// Exportar uma instância do MetadataAggregator
export const metadataAggregator = new MetadataAggregator();