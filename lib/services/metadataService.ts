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

  async search(title: string, artist: string): Promise<Partial<EnhancedMetadata> | null> {
    const timeoutMs = 15000;
    console.log(`⏰ [Beatport] Iniciando busca com timeout de ${timeoutMs/1000}s`);
    
    return Promise.race([
      this.performBeatportSearch(title, artist),
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error('Beatport timeout após 15s')), timeoutMs)
      )
    ]);
  }

  private async performBeatportSearch(title: string, artist: string): Promise<Partial<EnhancedMetadata> | null> {
    console.log(`🚀 [Beatport] Lançando browser para busca: "${title}" - "${artist}"`);
    let browser;
    try {
      const puppeteer = await import('puppeteer');
      console.log(`📦 [Beatport] Puppeteer importado com sucesso`);
      
      console.log(`🔧 [Beatport] Configurando opções do browser...`);
      const browserOptions = { 
        headless: true,
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
      
      // Buscar na página de search
      const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(`${artist} ${title}`)}`;
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
          
          // Deve conter o título
          if (text.includes(titleLower)) score += 100;
          
          // Deve conter o artista
          if (text.includes(artistLower)) score += 50;
          
          // Bonus para match completo
          if (text.includes(titleLower) && text.includes(artistLower)) score += 200;
          
          console.log(`   ${i + 1}. "${link.textContent?.trim()}" (Score: ${score})`);
          
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
      }, title, artist);
      
      console.log(`🔗 [Beatport] Track URL encontrada: ${trackUrl}`);
      
      if (!trackUrl) {
        console.log(`❌ [Beatport] Nenhuma URL de track encontrada para "${title}" - "${artist}"`);
        await browser.close();
        return null;
      }
      
      // LOG da URL encontrada para validação
      console.log(`\n🎯 [Beatport] VALIDAÇÃO DE URL ENCONTRADA:`);
      console.log(`   🔍 Busca: "${title}" - "${artist}"`);
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
          bpm: number;
          key: string;
          genre: string;
          label: string;
        }> = {};

        // DEBUG: Logar todos os elementos com classes que contenham 'Meta'
        console.log('\n🔍 [DEBUG] ELEMENTOS ENCONTRADOS:');
        const allElements = document.querySelectorAll('[class*="Meta"]');
        console.log(`Total de elementos com 'Meta' no nome da classe: ${allElements.length}`);
        
        allElements.forEach((el, idx) => {
          console.log(`\nElemento #${idx + 1}:`);
          console.log(`  • Classe: ${el.className}`);
          console.log(`  • HTML: ${el.outerHTML}`);
          console.log(`  • Texto: ${el.textContent?.trim()}`);
        });

        // DEBUG: Logar todos os MetaWrappers e seus labels/valores
        const wrappers = Array.from(document.querySelectorAll('[class*="MetaWrapper"]'));
        console.log(`\n📦 [DEBUG] METAWRAPPERS ENCONTRADOS (${wrappers.length}):`);
        
        wrappers.forEach((wrapper, idx) => {
          console.log(`\nMetaWrapper #${idx + 1}:`);
          console.log(`  • Classe: ${wrapper.className}`);
          console.log(`  • HTML: ${wrapper.outerHTML}`);
          
          const metaItems = wrapper.querySelectorAll('[class*="MetaItem"]');
          console.log(`  • MetaItems encontrados: ${metaItems.length}`);
          
          metaItems.forEach((item, itemIdx) => {
            const label = item.querySelector('div, span')?.textContent?.trim();
            const value = item.querySelector('span:last-child')?.textContent?.trim();
            console.log(`    Item #${itemIdx + 1}:`);
            console.log(`      - Label: '${label}'`);
            console.log(`      - Value: '${value}'`);
            console.log(`      - HTML: ${item.outerHTML}`);
          });
        });

        // Título da música
        const titleEl = document.querySelector('h1[data-testid="track-title"], h1');
        if (titleEl) {
          console.log('\n🎵 [DEBUG] TÍTULO ENCONTRADO:');
          console.log(`  • Texto: ${titleEl.textContent?.trim()}`);
          console.log(`  • HTML: ${titleEl.outerHTML}`);
          result.title = titleEl.textContent?.trim().replace(/\s+(Original Mix|Extended Mix|Club Mix|Radio Edit).*$/i, '');
        }

        // Artista
        const artistEl = document.querySelector('a[data-testid="artist-link"], a[href*="/artist/"]');
        if (artistEl) {
          console.log('\n👨‍🎤 [DEBUG] ARTISTA ENCONTRADO:');
          console.log(`  • Texto: ${artistEl.textContent?.trim()}`);
          console.log(`  • HTML: ${artistEl.outerHTML}`);
          result.artist = artistEl.textContent?.trim();
        }

        // Estratégia: tentar pegar o MetaWrapper logo após o título
        let metaWrapper = null;
        if (titleEl) {
          console.log('\n🔍 [DEBUG] PROCURANDO METAWRAPPER APÓS TÍTULO:');
          let el = titleEl.nextElementSibling;
          let depth = 0;
          while (el && depth < 5) {
            console.log(`  • Elemento ${depth + 1}: ${el.className}`);
            if (el.className && el.className.includes('MetaWrapper')) {
              metaWrapper = el;
              console.log('  ✅ MetaWrapper encontrado após título!');
              break;
            }
            el = el.nextElementSibling;
            depth++;
          }
        }
        
        if (!metaWrapper) {
          console.log('\n⚠️ [DEBUG] MetaWrapper não encontrado após título, tentando querySelector...');
          metaWrapper = document.querySelector('[class*="MetaWrapper"]');
          if (metaWrapper) {
            console.log('  ✅ MetaWrapper encontrado via querySelector!');
          }
        }

        if (metaWrapper) {
          console.log('\n📦 [DEBUG] EXTRAINDO DADOS DO METAWRAPPER:');
          const metaItems = metaWrapper.querySelectorAll('[class*="MetaItem"]');
          let foundFields = 0;
          
          metaItems.forEach((item, idx) => {
            const label = item.querySelector('div, span')?.textContent?.trim().toLowerCase();
            const value = item.querySelector('span:last-child')?.textContent?.trim();
            
            console.log(`\n  Item #${idx + 1}:`);
            console.log(`    • Label: '${label}'`);
            console.log(`    • Value: '${value}'`);
            console.log(`    • HTML: ${item.outerHTML}`);
            
            if (!label || !value) {
              console.log('    ❌ Label ou value vazio, pulando...');
              return;
            }
            
            if (label.includes('tamanho')) {
              const [min, sec] = value.split(':').map(Number);
              result.duration = min * 60 + sec;
              foundFields++;
              console.log('    ✅ Duration extraído!');
            } else if (label.includes('lançamento')) {
              result.year = parseInt(value.split('-')[0]);
              foundFields++;
              console.log('    ✅ Year extraído!');
            } else if (label.includes('bpm')) {
              result.bpm = parseInt(value);
              foundFields++;
              console.log('    ✅ BPM extraído!');
            } else if (label.includes('tom')) {
              result.key = value;
              foundFields++;
              console.log('    ✅ Key extraído!');
            } else if (label.includes('gênero') || label.includes('genre')) {
              result.genre = value;
              foundFields++;
              console.log('    ✅ Genre extraído!');
            } else if (label.includes('gravadora') || label.includes('label')) {
              result.label = value;
              foundFields++;
              console.log('    ✅ Label extraído!');
            } else {
              console.log('    ⚠️ Label não reconhecido');
            }
          });
          
          console.log(`\n📊 [DEBUG] RESUMO DA EXTRAÇÃO:`);
          console.log(`  • Total de campos encontrados: ${foundFields}`);
          console.log(`  • Dados extraídos:`, result);
        } else {
          console.log('\n❌ [DEBUG] NENHUM METAWRAPPER ENCONTRADO!');
        }

        return result;
      });
      
      await browser.close();
      
      // LOG DETALHADO DOS METADADOS EXTRAÍDOS
      if (metadata && (metadata.bpm || metadata.key || metadata.genre || metadata.label || metadata.artist)) {
        console.log(`\n✅ [Beatport] METADADOS EXTRAÍDOS COM SUCESSO:`);
        console.log(`   🌐 URL Beatport: ${trackUrl}`);
        console.log(`   👨‍🎤 Artist: ${metadata.artist || 'N/A'}`);
        console.log(`   🎵 Title: ${metadata.title || 'N/A'}`);
        console.log(`   🎵 BPM: ${metadata.bpm || 'N/A'}`);
        console.log(`   🔑 Key: ${metadata.key || 'N/A'}`);
        console.log(`   🎭 Genre: ${metadata.genre || 'N/A'}`);
        console.log(`   🏷️ Label: ${metadata.label || 'N/A'}`);
        console.log(`   📅 Year: ${metadata.year ?? 'N/A'}`);
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
  async searchMetadata(title: string, artist: string, options: { useBeatport?: boolean } = {}): Promise<EnhancedMetadata> {
    const { useBeatport = false } = options;

    console.log(`\n🔍 [MetadataAggregator] Iniciando busca com opções:`, {
      title,
      artist,
      useBeatport,
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
      const result = await beatportProvider.search(title, artist);
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
        
        console.log(`\n🎯 [MetadataAggregator] Resultado final:`);
        console.log(`      • Title: ${aggregated.title}`);
        console.log(`      • Artist: ${aggregated.artist}`);
        console.log(`      • BPM: ${aggregated.bpm || 'N/A'}`);
        console.log(`      • Key: ${aggregated.key || 'N/A'}`);
        console.log(`      • Genre: ${aggregated.genre || 'N/A'}`);
        console.log(`      • Label: ${aggregated.label || 'N/A'}`);
        console.log(`      • Year: ${aggregated.year || 'N/A'}`);
        const hasUsefulData = aggregated.bpm || aggregated.key || aggregated.genre || aggregated.label;
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