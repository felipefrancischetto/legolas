/**
 * Debug direto do Beatport Provider
 */

const puppeteer = require('puppeteer');

async function testBeatportDirect() {
  console.log('🎧 TESTE DIRETO DO BEATPORT PROVIDER\n');

  const title = 'Animals';
  const artist = 'Martin Garrix';
  
  console.log(`🔍 Buscando: "${title}" - ${artist}`);
  console.log('─'.repeat(50));

  try {
    // Primeiro, tentar buscar na página de search do Beatport
    const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(`${artist} ${title}`)}`;
    console.log(`📍 URL de busca: ${searchUrl}`);
    
    // Usar puppeteer para buscar e extrair dados
    console.log('🚀 Iniciando Puppeteer...');
    const browser = await puppeteer.launch({ 
      headless: false, // Vamos ver o que está acontecendo
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      
      // Configurar user agent realista
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      console.log('🌐 Navegando para a página de busca...');
      // Ir para a página de busca
      await page.goto(searchUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      console.log('⏳ Aguardando resultados carregarem...');
      // Aguardar resultados carregarem
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Verificar se a página carregou
      const title_page = await page.title();
      console.log(`📄 Título da página: ${title_page}`);

      // Buscar o primeiro resultado que seja uma track
      console.log('🔍 Procurando por links de tracks...');
      const trackLinks = await page.evaluate(() => {
        // Diferentes seletores possíveis para links de tracks
        const selectors = [
          'a[href*="/track/"]',
          '.track-row a',
          '.track-list a[href*="/track/"]',
          '[data-ec-name] a[href*="/track/"]'
        ];
        
        const links = [];
        
        for (const selector of selectors) {
          const trackElements = document.querySelectorAll(selector);
          console.log(`Selector ${selector} encontrou ${trackElements.length} elementos`);
          
          for (let i = 0; i < Math.min(3, trackElements.length); i++) {
            const href = trackElements[i].getAttribute('href');
            if (href) {
              const fullUrl = href.startsWith('http') ? href : `https://www.beatport.com${href}`;
              links.push(fullUrl);
            }
          }
          
          if (links.length > 0) break;
        }
        
        return links;
      });

      console.log(`📋 Links de tracks encontrados: ${trackLinks.length}`);
      trackLinks.forEach((link, index) => {
        console.log(`   ${index + 1}. ${link}`);
      });

      if (trackLinks.length === 0) {
        console.log('❌ Nenhum link de track encontrado!');
        
        // Vamos verificar o conteúdo da página
        const pageContent = await page.content();
        console.log('📄 Primeiros 500 caracteres da página:');
        console.log(pageContent.substring(0, 500));
        
        await browser.close();
        return;
      }

      // Tentar extrair dados da primeira track encontrada
      const trackUrl = trackLinks[0];
      console.log(`\n🎯 Tentando extrair dados de: ${trackUrl}`);
      
      await page.goto(trackUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      await new Promise(resolve => setTimeout(resolve, 3000));

      const trackData = await page.evaluate(() => {
        // Extrair informações da página da track
        const getTextBySelector = (selector) => {
          const element = document.querySelector(selector);
          return element?.textContent?.trim() || null;
        };

        // Diferentes seletores possíveis
        const selectors = {
          bpm: [
            '.bpm-key-data .bpm .value',
            '[data-ec-d2="BPM"] .value',
            '.track-detail-bpm .value',
            '.bpm .value',
            '.track-bpm'
          ],
          key: [
            '.bpm-key-data .key .value',
            '[data-ec-d2="Key"] .value', 
            '.track-detail-key .value',
            '.key .value',
            '.track-key'
          ],
          genre: [
            '.interior-track-content .genre a',
            '[data-ec-d2="Genre"] a',
            '.track-detail-genre a',
            '.genre a',
            '.track-genre'
          ],
          label: [
            '.interior-track-content .label a',
            '[data-ec-d2="Label"] a',
            '.track-detail-label a',
            '.label a',
            '.track-label'
          ]
        };

        const result = {};
        
        for (const [field, selectorList] of Object.entries(selectors)) {
          for (const selector of selectorList) {
            const value = getTextBySelector(selector);
            if (value) {
              result[field] = value;
              break;
            }
          }
        }

        // Informações adicionais de debug
        result.pageTitle = document.title;
        result.url = window.location.href;
        
        return result;
      });

      console.log('\n📊 Dados extraídos:');
      console.log(`   📄 Título da página: ${trackData.pageTitle}`);
      console.log(`   🌐 URL: ${trackData.url}`);
      console.log(`   📊 BPM: ${trackData.bpm || 'N/A'}`);
      console.log(`   🎵 Key: ${trackData.key || 'N/A'}`);
      console.log(`   🎭 Genre: ${trackData.genre || 'N/A'}`);
      console.log(`   🏷️  Label: ${trackData.label || 'N/A'}`);

      if (trackData.bpm || trackData.key || trackData.genre || trackData.label) {
        console.log('\n🎉 SUCESSO! Dados encontrados no Beatport!');
      } else {
        console.log('\n⚠️  Nenhum dado útil encontrado. Pode ser que os seletores precisem ser atualizados.');
      }

      await browser.close();

    } catch (error) {
      await browser.close();
      throw error;
    }

  } catch (error) {
    console.error('❌ Erro no teste direto do Beatport:', error.message);
  }
}

testBeatportDirect().catch(console.error); 