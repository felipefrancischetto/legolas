const puppeteer = require('puppeteer');

async function debugKeyExtraction() {
  console.log('🔍 [Debug Key Extraction] Investigando extração de Key/Tom...\n');
  
  // Teste com uma música conhecida que deve ter key
  const testTrack = {
    title: 'Strobe',
    artist: 'deadmau5',
    expectedKey: 'F Minor'
  };
  
  console.log(`🎵 Testando: "${testTrack.title}" - "${testTrack.artist}"`);
  console.log(`🎯 Key esperada: ${testTrack.expectedKey}`);
  console.log('=' .repeat(80));
  
  let browser;
  try {
    const puppeteer = await import('puppeteer');
    console.log(`📦 [Debug] Puppeteer importado com sucesso`);
    
    browser = await puppeteer.default.launch({ 
      headless: true,
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
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Buscar na página de search
    const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(`${testTrack.artist} ${testTrack.title}`)}`;
    console.log(`🔍 [Debug] Buscando em: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Aceitar cookies se necessário
    try {
      await page.click('button:has-text("Accept"), button:has-text("Aceitar"), button[id*="accept"]');
    } catch (e) {
      // Ignorar se não houver botão de cookies
    }
    
    // Encontrar melhor match para a música
    const trackUrl = await page.evaluate((searchTitle, searchArtist) => {
      const links = Array.from(document.querySelectorAll('a[href*="/track/"]'));
      console.log(`🔍 [Debug] Encontrados ${links.length} links de track`);

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
        
        if (score > bestScore) {
          bestScore = score;
          const href = link.getAttribute('href');
          bestMatch = href?.startsWith('http') ? href : `https://www.beatport.com${href}`;
        }
      }
      
      return bestMatch;
    }, testTrack.title, testTrack.artist);
    
    console.log(`🔗 [Debug] Track URL encontrada: ${trackUrl}`);
    
    if (!trackUrl) {
      console.log(`❌ [Debug] Nenhuma URL de track encontrada`);
      await browser.close();
      return;
    }
    
    // Ir para a página da música
    console.log(`🌐 [Debug] Navegando para URL: ${trackUrl}`);
    await page.goto(trackUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // DEBUG ESPECÍFICO PARA KEY/TOM
    const keyDebug = await page.evaluate(() => {
      console.log('\n🔍 [KEY DEBUG] INICIANDO DEBUG ESPECÍFICO PARA KEY/TOM');
      
      const result = {
        pageTitle: document.title,
        url: window.location.href,
        allText: document.body.textContent || '',
        keyElements: [],
        tomElements: [],
        metaElements: [],
        keyPatterns: [],
        tomPatterns: []
      };
      
      // 1. Buscar todos os elementos que contenham "key" ou "tom"
      const allElements = document.querySelectorAll('*');
      console.log(`🔍 [KEY DEBUG] Total de elementos na página: ${allElements.length}`);
      
      allElements.forEach((el, idx) => {
        const text = el.textContent?.trim() || '';
        const className = el.className?.toString() || '';
        const tagName = el.tagName || '';
        
        // Buscar elementos que contenham "key" (case insensitive)
        if (text.toLowerCase().includes('key') || className.toLowerCase().includes('key')) {
          result.keyElements.push({
            index: idx,
            text: text,
            tagName: tagName,
            className: className,
            html: el.outerHTML.substring(0, 200)
          });
        }
        
        // Buscar elementos que contenham "tom" (case insensitive)
        if (text.toLowerCase().includes('tom') || className.toLowerCase().includes('tom')) {
          result.tomElements.push({
            index: idx,
            text: text,
            tagName: tagName,
            className: className,
            html: el.outerHTML.substring(0, 200)
          });
        }
        
        // Buscar elementos com "meta" no nome da classe
        if (className.toLowerCase().includes('meta')) {
          result.metaElements.push({
            index: idx,
            text: text,
            tagName: tagName,
            className: className,
            html: el.outerHTML.substring(0, 200)
          });
        }
      });
      
      // 2. Buscar padrões de key no texto completo
      const bodyText = document.body.textContent || '';
      
      // Padrões para key em inglês
      const keyPatterns = [
        /Key[:\s]*([A-G][#♯♭b]?\s*(?:Minor|Major|Min|Maj))/gi,
        /([A-G][#♯♭b]?\s*(?:Minor|Major|Min|Maj))/gi,
        /Key[:\s]*([A-G][#♯♭b]?\s*(?:m|M))/gi
      ];
      
      // Padrões para tom em português
      const tomPatterns = [
        /Tom[:\s]*([A-G][#♯♭b]?\s*(?:Minor|Major|Min|Maj))/gi,
        /Tom[:\s]*([A-G][#♯♭b]?\s*(?:m|M))/gi
      ];
      
      keyPatterns.forEach((pattern, idx) => {
        const matches = bodyText.match(pattern);
        if (matches) {
          result.keyPatterns.push({
            pattern: pattern.toString(),
            matches: matches
          });
        }
      });
      
      tomPatterns.forEach((pattern, idx) => {
        const matches = bodyText.match(pattern);
        if (matches) {
          result.tomPatterns.push({
            pattern: pattern.toString(),
            matches: matches
          });
        }
      });
      
      console.log(`🔍 [KEY DEBUG] Elementos com "key": ${result.keyElements.length}`);
      console.log(`🔍 [KEY DEBUG] Elementos com "tom": ${result.tomElements.length}`);
      console.log(`🔍 [KEY DEBUG] Elementos com "meta": ${result.metaElements.length}`);
      console.log(`🔍 [KEY DEBUG] Padrões de key encontrados: ${result.keyPatterns.length}`);
      console.log(`🔍 [KEY DEBUG] Padrões de tom encontrados: ${result.tomPatterns.length}`);
      
      return result;
    });
    
    console.log('\n📊 [KEY DEBUG] RESULTADO DA ANÁLISE:');
    console.log(`   📄 Título da página: ${keyDebug.pageTitle}`);
    console.log(`   🌐 URL: ${keyDebug.url}`);
    console.log(`   📝 Tamanho do texto: ${keyDebug.allText.length} caracteres`);
    
    console.log('\n🔑 ELEMENTOS COM "KEY":');
    if (keyDebug.keyElements.length > 0) {
      keyDebug.keyElements.slice(0, 5).forEach((el, idx) => {
        console.log(`   ${idx + 1}. "${el.text}" - ${el.tagName}.${el.className}`);
      });
    } else {
      console.log('   ❌ Nenhum elemento com "key" encontrado');
    }
    
    console.log('\n🎵 ELEMENTOS COM "TOM":');
    if (keyDebug.tomElements.length > 0) {
      keyDebug.tomElements.slice(0, 5).forEach((el, idx) => {
        console.log(`   ${idx + 1}. "${el.text}" - ${el.tagName}.${el.className}`);
      });
    } else {
      console.log('   ❌ Nenhum elemento com "tom" encontrado');
    }
    
    console.log('\n📦 ELEMENTOS COM "META":');
    if (keyDebug.metaElements.length > 0) {
      keyDebug.metaElements.slice(0, 5).forEach((el, idx) => {
        console.log(`   ${idx + 1}. "${el.text}" - ${el.tagName}.${el.className}`);
      });
    } else {
      console.log('   ❌ Nenhum elemento com "meta" encontrado');
    }
    
    console.log('\n🎯 PADRÕES DE KEY ENCONTRADOS:');
    if (keyDebug.keyPatterns.length > 0) {
      keyDebug.keyPatterns.forEach((pattern, idx) => {
        console.log(`   ${idx + 1}. Padrão: ${pattern.pattern}`);
        console.log(`      Matches: ${pattern.matches.join(', ')}`);
      });
    } else {
      console.log('   ❌ Nenhum padrão de key encontrado');
    }
    
    console.log('\n🎵 PADRÕES DE TOM ENCONTRADOS:');
    if (keyDebug.tomPatterns.length > 0) {
      keyDebug.tomPatterns.forEach((pattern, idx) => {
        console.log(`   ${idx + 1}. Padrão: ${pattern.pattern}`);
        console.log(`      Matches: ${pattern.matches.join(', ')}`);
      });
    } else {
      console.log('   ❌ Nenhum padrão de tom encontrado');
    }
    
    // Testar a extração atual do código
    console.log('\n🧪 TESTANDO EXTRAÇÃO ATUAL DO CÓDIGO:');
    const currentExtraction = await page.evaluate(() => {
      const result = {};
      
      // Título da música
      const titleEl = document.querySelector('h1[data-testid="track-title"], h1');
      if (titleEl) {
        result.title = titleEl.textContent?.trim().replace(/\s+(Original Mix|Extended Mix|Club Mix|Radio Edit).*$/i, '');
      }

      // Artista
      const artistEl = document.querySelector('a[data-testid="artist-link"], a[href*="/artist/"]');
      if (artistEl) {
        result.artist = artistEl.textContent?.trim();
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
        
        metaItems.forEach((item, idx) => {
          const label = item.querySelector('div, span')?.textContent?.trim().toLowerCase();
          const value = item.querySelector('span:last-child')?.textContent?.trim();
          
          if (!label || !value) return;
          
          if (label.includes('tamanho')) {
            const [min, sec] = value.split(':').map(Number);
            result.duration = min * 60 + sec;
            foundFields++;
          } else if (label.includes('lançamento')) {
            result.year = parseInt(value.split('-')[0]);
            foundFields++;
          } else if (label.includes('bpm')) {
            result.bpm = parseInt(value);
            foundFields++;
          } else if (label.includes('tom')) {
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
        
        result.foundFields = foundFields;
      } else {
        result.foundFields = 0;
      }

      return result;
    });
    
    console.log(`   📊 Resultado da extração atual:`);
    console.log(`      • Title: ${currentExtraction.title || 'N/A'}`);
    console.log(`      • Artist: ${currentExtraction.artist || 'N/A'}`);
    console.log(`      • BPM: ${currentExtraction.bpm || 'N/A'}`);
    console.log(`      • Key: ${currentExtraction.key || 'N/A'}`);
    console.log(`      • Genre: ${currentExtraction.genre || 'N/A'}`);
    console.log(`      • Label: ${currentExtraction.label || 'N/A'}`);
    console.log(`      • Found Fields: ${currentExtraction.foundFields || 0}`);
    
    await browser.close();
    
  } catch (error) {
    console.error(`❌ [Debug] Erro:`, error instanceof Error ? error.message : error);
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error(`❌ [Debug] Erro ao fechar browser:`, closeError);
      }
    }
  }
}

// Executar o debug
debugKeyExtraction().catch(console.error); 