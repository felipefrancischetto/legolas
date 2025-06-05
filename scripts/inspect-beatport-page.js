/**
 * Inspeção da estrutura da página do Beatport
 */

const puppeteer = require('puppeteer');

async function inspectBeatportPage() {
  console.log('🔍 INSPEÇÃO DA ESTRUTURA DA PÁGINA DO BEATPORT\n');

  try {
    const browser = await puppeteer.launch({ 
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Ir direto para a página da track que sabemos que existe
    const trackUrl = 'https://www.beatport.com/pt/track/animals/4459187';
    console.log(`🌐 Acessando: ${trackUrl}`);
    
    await page.goto(trackUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Extrair toda a estrutura da página para análise
    const pageStructure = await page.evaluate(() => {
      
      // Função para encontrar elementos que podem conter BPM
      const findPossibleBPM = () => {
        const possibleBPM = [];
        const allElements = document.querySelectorAll('*');
        
        for (const element of allElements) {
          const text = element.textContent?.trim();
          if (text && /\b\d{2,3}\s*BPM\b/i.test(text)) {
            possibleBPM.push({
              text: text,
              tagName: element.tagName,
              className: element.className?.toString() || '',
              id: element.id || '',
              selector: element.tagName.toLowerCase() + 
                        (element.id ? `#${element.id}` : '') + 
                        (element.className ? `.${element.className.toString().replace(/\s+/g, '.')}` : '')
            });
          }
        }
        return possibleBPM;
      };

      // Função para encontrar elementos que podem conter Key
      const findPossibleKey = () => {
        const possibleKey = [];
        const allElements = document.querySelectorAll('*');
        
        for (const element of allElements) {
          const text = element.textContent?.trim();
          if (text && /\b[A-G][#b]?\s*(maj|min|major|minor)\b/i.test(text)) {
            possibleKey.push({
              text: text,
              tagName: element.tagName,
              className: element.className?.toString() || '',
              id: element.id || '',
              selector: element.tagName.toLowerCase() + 
                        (element.id ? `#${element.id}` : '') + 
                        (element.className ? `.${element.className.toString().replace(/\s+/g, '.')}` : '')
            });
          }
        }
        return possibleKey;
      };

      // Função para encontrar elementos que podem conter Genre
      const findPossibleGenre = () => {
        const possibleGenre = [];
        const genreKeywords = ['house', 'techno', 'trance', 'progressive', 'electro', 'drum', 'bass', 'dance', 'edm'];
        const allElements = document.querySelectorAll('*');
        
        for (const element of allElements) {
          const text = element.textContent?.trim().toLowerCase();
          if (text && genreKeywords.some(keyword => text.includes(keyword))) {
            possibleGenre.push({
              text: element.textContent.trim(),
              tagName: element.tagName,
              className: element.className?.toString() || '',
              id: element.id || '',
              selector: element.tagName.toLowerCase() + 
                        (element.id ? `#${element.id}` : '') + 
                        (element.className ? `.${element.className.toString().replace(/\s+/g, '.')}` : '')
            });
          }
        }
        return possibleGenre.slice(0, 10); // Limitar a 10 resultados
      };

      // Função para encontrar elementos que podem conter Label
      const findPossibleLabel = () => {
        const possibleLabel = [];
        const allElements = document.querySelectorAll('*');
        
        for (const element of allElements) {
          const text = element.textContent?.trim();
          if (text && text.length > 5 && text.length < 50 && 
              /^[A-Z][a-zA-Z\s&]+$/.test(text) && 
              !text.includes('Track') && !text.includes('Artist')) {
            
            // Verificar se é provavelmente um label (maiúscula, sem números, etc.)
            const parent = element.parentElement;
            const className = element.className?.toString().toLowerCase() || '';
            const parentClassName = parent?.className?.toString().toLowerCase() || '';
            
            if (parent && (
                parent.textContent?.toLowerCase().includes('label') ||
                parentClassName.includes('label') ||
                className.includes('label')
              )) {
              possibleLabel.push({
                text: text,
                tagName: element.tagName,
                className: element.className?.toString() || '',
                id: element.id || '',
                selector: element.tagName.toLowerCase() + 
                          (element.id ? `#${element.id}` : '') + 
                          (element.className ? `.${element.className.toString().replace(/\s+/g, '.')}` : '')
              });
            }
          }
        }
        return possibleLabel.slice(0, 10);
      };

      return {
        title: document.title,
        url: window.location.href,
        possibleBPM: findPossibleBPM(),
        possibleKey: findPossibleKey(),
        possibleGenre: findPossibleGenre(),
        possibleLabel: findPossibleLabel(),
        
        // Tentar alguns seletores comuns também
        commonSelectors: {
          bpmSelectors: [
            '.bpm',
            '[data-testid*="bpm"]',
            '[class*="bpm"]',
            '[class*="BPM"]',
            '.track-stats .bpm',
            '.track-info .bpm'
          ].map(selector => {
            const element = document.querySelector(selector);
            return {
              selector,
              found: !!element,
              text: element?.textContent?.trim() || null
            };
          }),
          
          keySelectors: [
            '.key',
            '[data-testid*="key"]',
            '[class*="key"]',
            '[class*="Key"]',
            '.track-stats .key',
            '.track-info .key'
          ].map(selector => {
            const element = document.querySelector(selector);
            return {
              selector,
              found: !!element,
              text: element?.textContent?.trim() || null
            };
          })
        }
      };
    });

    console.log('📊 ESTRUTURA DA PÁGINA ANALISADA:\n');
    
    console.log('🎵 POSSÍVEIS ELEMENTOS DE BPM:');
    if (pageStructure.possibleBPM.length > 0) {
      pageStructure.possibleBPM.forEach((item, index) => {
        console.log(`   ${index + 1}. "${item.text}" - ${item.selector}`);
      });
    } else {
      console.log('   ❌ Nenhum elemento com BPM encontrado');
    }

    console.log('\n🔑 POSSÍVEIS ELEMENTOS DE KEY:');
    if (pageStructure.possibleKey.length > 0) {
      pageStructure.possibleKey.forEach((item, index) => {
        console.log(`   ${index + 1}. "${item.text}" - ${item.selector}`);
      });
    } else {
      console.log('   ❌ Nenhum elemento com Key encontrado');
    }

    console.log('\n🎭 POSSÍVEIS ELEMENTOS DE GENRE:');
    if (pageStructure.possibleGenre.length > 0) {
      pageStructure.possibleGenre.forEach((item, index) => {
        console.log(`   ${index + 1}. "${item.text}" - ${item.selector}`);
      });
    } else {
      console.log('   ❌ Nenhum elemento com Genre encontrado');
    }

    console.log('\n🏷️  POSSÍVEIS ELEMENTOS DE LABEL:');
    if (pageStructure.possibleLabel.length > 0) {
      pageStructure.possibleLabel.forEach((item, index) => {
        console.log(`   ${index + 1}. "${item.text}" - ${item.selector}`);
      });
    } else {
      console.log('   ❌ Nenhum elemento com Label encontrado');
    }

    console.log('\n🔍 TESTE DE SELETORES COMUNS:');
    console.log('BPM Selectors:');
    pageStructure.commonSelectors.bpmSelectors.forEach(item => {
      console.log(`   ${item.selector}: ${item.found ? 'ENCONTRADO' : 'NÃO ENCONTRADO'} - "${item.text || 'N/A'}"`);
    });
    
    console.log('Key Selectors:');
    pageStructure.commonSelectors.keySelectors.forEach(item => {
      console.log(`   ${item.selector}: ${item.found ? 'ENCONTRADO' : 'NÃO ENCONTRADO'} - "${item.text || 'N/A'}"`);
    });

    console.log('\n⚠️  Deixe o navegador aberto para inspeção manual...');
    console.log('   Pressione qualquer tecla para fechar');
    
    // Manter o navegador aberto para inspeção manual
    await new Promise(resolve => {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', () => {
        resolve();
      });
    });

    await browser.close();

  } catch (error) {
    console.error('❌ Erro na inspeção:', error.message);
  }
}

inspectBeatportPage().catch(console.error); 