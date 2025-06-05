/**
 * Debug REAL do Beatport com deadmau5 - Strobe
 */

const puppeteer = require('puppeteer');

async function debugBeatportReal() {
  console.log('🎧 DEBUG REAL DO BEATPORT - deadmau5 Strobe\n');

  const title = 'Strobe';
  const artist = 'deadmau5';
  
  console.log(`🔍 Testando: "${title}" - ${artist}`);
  console.log('─'.repeat(50));

  try {
    const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(`${artist} ${title}`)}`;
    console.log(`📍 URL: ${searchUrl}`);
    
    const browser = await puppeteer.launch({ 
      headless: false, // Vamos VER o que acontece
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1200, height: 800 }
    });

    try {
      const page = await browser.newPage();
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      console.log('🌐 Navegando para Beatport...');
      await page.goto(searchUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      console.log('⏳ Aguardando página carregar...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verificar se tem modal de cookies
      console.log('🍪 Procurando modal de cookies...');
      const hasModal = await page.evaluate(() => {
        // Procurar por elementos que possam ser modais de cookies
        const possibleModals = [
          'div[role="dialog"]',
          '.modal',
          '[data-testid*="cookie"]',
          '[class*="cookie"]',
          '[id*="cookie"]'
        ];
        
        for (const selector of possibleModals) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            return true;
          }
        }
        return false;
      });

      if (hasModal) {
        console.log('🍪 Modal detectada! Tentando fechar...');
        
        // Tentar clicar em botões de aceitar
        const clicked = await page.evaluate(() => {
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
        
        if (clicked) {
          console.log(`✅ ${clicked}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          console.log('❌ Não conseguiu fechar modal automaticamente');
        }
      } else {
        console.log('✅ Nenhuma modal de cookies detectada');
      }

      // Verificar se a página carregou corretamente
      const pageTitle = await page.title();
      console.log(`📄 Título da página: ${pageTitle}`);

      // Procurar por tracks
      console.log('🔍 Procurando tracks na página...');
      const trackInfo = await page.evaluate(() => {
        const trackLinks = Array.from(document.querySelectorAll('a[href*="/track/"]'));
        const results = [];
        
        trackLinks.slice(0, 5).forEach((link, i) => {
          results.push({
            index: i + 1,
            href: link.href,
            text: link.textContent?.trim() || '',
            visible: link.offsetParent !== null
          });
        });
        
        return {
          totalFound: trackLinks.length,
          results: results,
          pageText: document.body.textContent?.substring(0, 500) || ''
        };
      });

      console.log(`📋 Tracks encontradas: ${trackInfo.totalFound}`);
      if (trackInfo.results.length > 0) {
        trackInfo.results.forEach(track => {
          console.log(`   ${track.index}. ${track.href}`);
          console.log(`      Texto: "${track.text}"`);
          console.log(`      Visível: ${track.visible}`);
        });
      } else {
        console.log('❌ Nenhuma track encontrada!');
        console.log('📄 Conteúdo da página (primeiros 500 chars):');
        console.log(trackInfo.pageText);
      }

      if (trackInfo.results.length > 0) {
        const firstTrack = trackInfo.results[0];
        console.log(`\n🎯 Testando primeira track: ${firstTrack.href}`);
        
        await page.goto(firstTrack.href, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Extrair dados da página da track
        const trackData = await page.evaluate(() => {
          const getTextContent = (selector) => {
            const el = document.querySelector(selector);
            return el ? el.textContent?.trim() : null;
          };
          
          // Tentar encontrar QUALQUER elemento que contenha BPM ou Key
          const allElements = Array.from(document.querySelectorAll('*'));
          const bpmElements = allElements.filter(el => {
            const text = el.textContent || '';
            return text.match(/\d{2,3}\s*BPM/i);
          });
          
          const keyElements = allElements.filter(el => {
            const text = el.textContent || '';
            return text.match(/[A-G][#b]?\s*(maj|min)/i);
          });
          
          return {
            pageTitle: document.title,
            url: window.location.href,
            bpmElements: bpmElements.slice(0, 3).map(el => ({
              text: el.textContent?.trim(),
              tagName: el.tagName,
              className: el.className?.toString() || '',
              id: el.id || ''
            })),
            keyElements: keyElements.slice(0, 3).map(el => ({
              text: el.textContent?.trim(),
              tagName: el.tagName,
              className: el.className?.toString() || '',
              id: el.id || ''
            })),
            pageContent: document.body.textContent?.substring(0, 1000) || ''
          };
        });
        
        console.log(`\n📊 DADOS DA TRACK: ${trackData.pageTitle}`);
        console.log(`🌐 URL: ${trackData.url}`);
        
        if (trackData.bpmElements.length > 0) {
          console.log('🎵 ELEMENTOS COM BPM ENCONTRADOS:');
          trackData.bpmElements.forEach((el, i) => {
            console.log(`   ${i + 1}. "${el.text}" - ${el.tagName}.${el.className}${el.id ? '#' + el.id : ''}`);
          });
        } else {
          console.log('❌ Nenhum elemento com BPM encontrado');
        }
        
        if (trackData.keyElements.length > 0) {
          console.log('🔑 ELEMENTOS COM KEY ENCONTRADOS:');
          trackData.keyElements.forEach((el, i) => {
            console.log(`   ${i + 1}. "${el.text}" - ${el.tagName}.${el.className}${el.id ? '#' + el.id : ''}`);
          });
        } else {
          console.log('❌ Nenhum elemento com Key encontrado');
        }
        
        console.log('\n📄 Conteúdo da página (primeiros 1000 chars):');
        console.log(trackData.pageContent);
      }

      console.log('\n⚠️  Deixando navegador aberto para inspeção manual...');
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

debugBeatportReal().catch(console.error); 