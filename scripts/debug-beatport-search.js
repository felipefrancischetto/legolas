/**
 * Debug específico da página de busca do Beatport
 */

const puppeteer = require('puppeteer');

async function debugBeatportSearch() {
  console.log('🔍 DEBUG DA PÁGINA DE BUSCA DO BEATPORT\n');

  const title = 'Strobe';
  const artist = 'deadmau5';
  
  console.log(`🎯 Testando busca: "${artist} ${title}"`);
  console.log('─'.repeat(50));

  try {
    const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(`${artist} ${title}`)}`;
    console.log(`📍 URL: ${searchUrl}`);
    
    const browser = await puppeteer.launch({ 
      headless: false, // Vamos VER o que acontece
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1400, height: 900 }
    });

    try {
      const page = await browser.newPage();
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      console.log('🌐 Navegando para página de busca...');
      await page.goto(searchUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      console.log('⏳ Aguardando carregamento...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Verificar e aceitar cookies
      console.log('🍪 Verificando modal de cookies...');
      const cookieClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const button of buttons) {
          const text = button.textContent?.toLowerCase() || '';
          if (text.includes('accept') || text.includes('aceitar') || text.includes('allow') || text.includes('agree')) {
            button.click();
            return `Clicou em: "${button.textContent}"`;
          }
        }
        return false;
      });
      
      if (cookieClicked) {
        console.log(`✅ ${cookieClicked}`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        console.log('ℹ️  Nenhuma modal de cookies encontrada');
      }

      // Análise completa da página
      console.log('\n📊 ANÁLISE DA PÁGINA:');
      const pageAnalysis = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          bodyText: document.body.textContent?.substring(0, 200) || '',
          hasTrackLinks: document.querySelectorAll('a[href*="/track/"]').length,
          hasPlaylistLinks: document.querySelectorAll('a[href*="/playlist/"]').length,
          hasArtistLinks: document.querySelectorAll('a[href*="/artist/"]').length,
          hasLabelLinks: document.querySelectorAll('a[href*="/label/"]').length,
        };
      });

      console.log(`   📄 Título: ${pageAnalysis.title}`);
      console.log(`   🌐 URL atual: ${pageAnalysis.url}`);
      console.log(`   🔗 Links de tracks: ${pageAnalysis.hasTrackLinks}`);
      console.log(`   🔗 Links de playlists: ${pageAnalysis.hasPlaylistLinks}`);
      console.log(`   🔗 Links de artists: ${pageAnalysis.hasArtistLinks}`);
      console.log(`   🔗 Links de labels: ${pageAnalysis.hasLabelLinks}`);
      console.log(`   📝 Texto da página: "${pageAnalysis.bodyText}"`);

      // Buscar TODOS os tipos de links possíveis
      console.log('\n🔍 BUSCANDO LINKS:');
      const allLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        return links.slice(0, 20).map(link => ({
          href: link.href || 'N/A',
          text: link.textContent?.trim() || 'N/A',
          className: link.className || 'N/A'
        }));
      });

      allLinks.forEach((link, i) => {
        console.log(`   ${i + 1}. "${link.text}" -> ${link.href}`);
        if (link.className !== 'N/A') {
          console.log(`      Classes: ${link.className}`);
        }
      });

      // Buscar especificamente por tracks
      console.log('\n🎵 BUSCANDO TRACKS ESPECIFICAMENTE:');
      const trackSearch = await page.evaluate((searchTitle, searchArtist) => {
        // Tentar diferentes seletores para tracks
        const selectors = [
          'a[href*="/track/"]',
          'a[href*="/pt/track/"]', 
          '[data-testid*="track"]',
          '.track-title a',
          '.track-link',
          '[class*="track"] a'
        ];

        let allTrackLinks = [];
        
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            console.log(`Seletor "${selector}" encontrou ${elements.length} elementos`);
            Array.from(elements).forEach(el => {
              allTrackLinks.push({
                selector: selector,
                href: el.href || el.getAttribute('href') || 'N/A',
                text: el.textContent?.trim() || 'N/A',
                innerHTML: el.innerHTML?.substring(0, 100) || 'N/A'
              });
            });
          }
        });

        // Busca alternativa por texto
        const allElements = Array.from(document.querySelectorAll('*'));
        const elementsWithArtist = allElements.filter(el => {
          const text = el.textContent?.toLowerCase() || '';
          return text.includes(searchArtist.toLowerCase()) && text.includes(searchTitle.toLowerCase());
        });

        return {
          trackLinks: allTrackLinks.slice(0, 10),
          elementsWithArtist: elementsWithArtist.slice(0, 5).map(el => ({
            tagName: el.tagName,
            text: el.textContent?.trim()?.substring(0, 100) || 'N/A',
            className: el.className || 'N/A'
          }))
        };
      }, title, artist);

      if (trackSearch.trackLinks.length > 0) {
        console.log(`✅ Encontradas ${trackSearch.trackLinks.length} tracks:`);
        trackSearch.trackLinks.forEach((track, i) => {
          console.log(`   ${i + 1}. [${track.selector}] "${track.text}"`);
          console.log(`      URL: ${track.href}`);
        });
      } else {
        console.log('❌ Nenhum link de track encontrado!');
      }

      if (trackSearch.elementsWithArtist.length > 0) {
        console.log(`\n🎤 Elementos que contêm "${artist}" e "${title}":`);
        trackSearch.elementsWithArtist.forEach((el, i) => {
          console.log(`   ${i + 1}. ${el.tagName}: "${el.text}"`);
        });
      }

      console.log('\n⏸️  Navegador mantido aberto para inspeção manual...');
      console.log('   Pressione ENTER para fechar');
      
      // Aguardar input do usuário
      await new Promise(resolve => {
        process.stdin.resume();
        process.stdin.once('data', () => {
          resolve();
        });
      });

      await browser.close();

    } catch (error) {
      await browser.close();
      throw error;
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

debugBeatportSearch().catch(console.error); 