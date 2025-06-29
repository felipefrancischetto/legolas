const puppeteer = require('puppeteer');

async function debugYearExtraction() {
  console.log('🔍 [DEBUG] Iniciando debug da extração de ano...');
  
  const browser = await puppeteer.launch({
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
  });

  try {
    const page = await browser.newPage();
    
    // Testar com uma URL específica que sabemos que tem ano
    const testUrl = 'https://www.beatport.com/track/forcing-function/20539076';
    
    console.log(`🌐 Navegando para: ${testUrl}`);
    await page.goto(testUrl, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Debug da extração de ano
    const yearDebug = await page.evaluate(() => {
      console.log('🔍 [DEBUG] Iniciando extração de ano...');
      
      const result = {
        year: null,
        debug: {
          metaWrapperFound: false,
          metaItemsCount: 0,
          allLabels: [],
          allValues: [],
          rawText: ''
        }
      };
      
      // Buscar MetaWrapper
      let metaWrapper = document.querySelector('[class*="MetaWrapper"]');
      if (!metaWrapper) {
        // Fallback: buscar próximo ao título
        const titleEl = document.querySelector('h1[data-testid="track-title"], h1');
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
      }
      
      if (metaWrapper) {
        result.debug.metaWrapperFound = true;
        result.debug.rawText = metaWrapper.textContent || '';
        
        const metaItems = metaWrapper.querySelectorAll('[class*="MetaItem"]');
        result.debug.metaItemsCount = metaItems.length;
        
        console.log(`📊 Encontrados ${metaItems.length} meta items`);
        
        metaItems.forEach((item, index) => {
          const label = item.querySelector('div, span')?.textContent?.trim().toLowerCase();
          const value = item.querySelector('span:last-child')?.textContent?.trim();
          
          if (label && value) {
            result.debug.allLabels.push(label);
            result.debug.allValues.push(value);
            
            console.log(`   Item ${index + 1}: "${label}" = "${value}"`);
            
            // Verificar se é ano
            if (label.includes('lançamento') || label.includes('release') || label.includes('data')) {
              console.log(`   🎯 POSSÍVEL ANO ENCONTRADO: "${value}"`);
              
              // Tentar extrair ano de diferentes formatos
              const yearMatch = value.match(/(\d{4})/);
              if (yearMatch) {
                const year = parseInt(yearMatch[1]);
                if (year >= 1900 && year <= 2030) {
                  result.year = year;
                  console.log(`   ✅ Ano extraído: ${year}`);
                }
              }
            }
          }
        });
        
        // Fallback: buscar por regex no texto completo
        if (!result.year) {
          console.log('🔍 Tentando regex no texto completo...');
          const yearRegex = /(\d{4})/g;
          const matches = result.debug.rawText.match(yearRegex);
          
          if (matches) {
            console.log(`   Regex encontrou: ${matches.join(', ')}`);
            for (const match of matches) {
              const year = parseInt(match);
              if (year >= 1900 && year <= 2030) {
                result.year = year;
                console.log(`   ✅ Ano extraído via regex: ${year}`);
                break;
              }
            }
          }
        }
      } else {
        console.log('❌ MetaWrapper não encontrado');
      }
      
      return result;
    });
    
    console.log('\n📊 RESULTADO DA EXTRAÇÃO DE ANO:');
    console.log(`   Ano extraído: ${yearDebug.year || 'N/A'}`);
    console.log(`   MetaWrapper encontrado: ${yearDebug.debug.metaWrapperFound}`);
    console.log(`   Meta items encontrados: ${yearDebug.debug.metaItemsCount}`);
    console.log(`   Labels encontrados: ${yearDebug.debug.allLabels.join(', ')}`);
    console.log(`   Valores encontrados: ${yearDebug.debug.allValues.join(', ')}`);
    console.log(`   Texto bruto (primeiros 200 chars): "${yearDebug.debug.rawText.slice(0, 200)}"`);
    
    if (!yearDebug.year) {
      console.log('\n❌ ANO NÃO ENCONTRADO!');
      console.log('   Possíveis problemas:');
      console.log('   1. Label não contém "lançamento", "release" ou "data"');
      console.log('   2. Formato de data não é reconhecido');
      console.log('   3. MetaWrapper não está sendo encontrado');
    } else {
      console.log('\n✅ ANO ENCONTRADO COM SUCESSO!');
    }
    
  } catch (error) {
    console.error('❌ Erro durante debug:', error);
  } finally {
    await browser.close();
  }
}

debugYearExtraction().catch(console.error); 