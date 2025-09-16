const puppeteer = require('puppeteer');

async function testBeatportExtraction() {
  console.log('🔍 TESTE DE EXTRAÇÃO DO BEATPORT');
  console.log('==================================\n');

  let browser;
  try {
    // Configurar browser
    browser = await puppeteer.launch({ 
      headless: false,
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

    // Testar com uma música específica que sabemos que tem label
    const testTitle = '2mysoul';
    const testArtist = '16BL';
    
    console.log(`🎵 Testando extração para: "${testTitle}" - "${testArtist}"`);

    // Buscar na página de search
    const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(`${testArtist} ${testTitle}`)}`;
    console.log(`🌐 Navegando para: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

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
      
      return bestMatch;
    }, testTitle, testArtist);

    console.log(`🔗 Track URL encontrada: ${trackUrl}`);

    if (!trackUrl) {
      console.log('❌ Nenhuma URL de track encontrada');
      return;
    }

    // Ir para a página da música
    console.log(`🌐 Navegando para URL: ${trackUrl}`);
    await page.goto(trackUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extrair metadados
    const metadata = await page.evaluate(() => {
      const result = {};
      
      // Título
      const titleEl = document.querySelector('h1[data-testid="track-title"], h1');
      if (titleEl) {
        result.title = titleEl.textContent?.trim() || '';
      }

      // Artista
      const artistEl = document.querySelector('a[data-testid="artist-link"], a[href*="/artist/"]');
      if (artistEl) {
        result.artist = artistEl.textContent?.trim() || '';
      }

      // MetaWrapper - onde estão os metadados
      const metaWrapper = document.querySelector('[class*="MetaWrapper"]');
      if (metaWrapper) {
        console.log('🔍 MetaWrapper encontrado');
        
        // Mostrar todo o conteúdo do MetaWrapper para debug
        console.log('📋 Conteúdo do MetaWrapper:', metaWrapper.textContent);
        
        const metaItems = metaWrapper.querySelectorAll('[class*="MetaItem"]');
        console.log(`🔍 Encontrados ${metaItems.length} MetaItems`);
        
        metaItems.forEach((item, index) => {
          const label = item.querySelector('div, span')?.textContent?.trim().toLowerCase();
          const value = item.querySelector('span:last-child')?.textContent?.trim();
          
          console.log(`   ${index + 1}. Label: "${label}" | Value: "${value}"`);
          
          if (!label || !value) return;
          
          if (label.includes('tamanho')) {
            const [min, sec] = value.split(':').map(Number);
            result.duration = min * 60 + sec;
          } else if (label.includes('lançamento') || label.includes('release')) {
            result.publishedDate = value;
            const yearMatch = value.match(/(\d{4})/);
            if (yearMatch) {
              result.year = parseInt(yearMatch[1]);
            }
          } else if (label.includes('bpm')) {
            result.bpm = parseInt(value);
          } else if (label.includes('tom') || label.includes('key')) {
            result.key = value;
          } else if (label.includes('gênero') || label.includes('genre')) {
            result.genre = value;
          } else if (label.includes('gravadora') || label.includes('label')) {
            result.label = value;
          }
        });
      } else {
        console.log('❌ MetaWrapper não encontrado');
      }

      // Tentar encontrar label de outras formas
      if (!result.label) {
        console.log('🔍 Tentando encontrar label de outras formas...');
        
        // Buscar por links que contenham "label"
        const labelLinks = Array.from(document.querySelectorAll('a[href*="/label/"]'));
        if (labelLinks.length > 0) {
          result.label = labelLinks[0].textContent?.trim() || '';
          console.log(`🏷️ Label encontrado via link: "${result.label}"`);
        }
        
        // Buscar por texto que contenha "Label:"
        const labelText = document.body.textContent.match(/Label:\s*([^\n\r]+)/i);
        if (labelText) {
          result.label = labelText[1].trim();
          console.log(`🏷️ Label encontrado via texto: "${result.label}"`);
        }
      }

      return result;
    });

    console.log('\n📊 METADADOS EXTRAÍDOS:');
    console.log('─'.repeat(50));
    Object.keys(metadata).forEach(key => {
      const value = metadata[key];
      const status = value ? '✅' : '❌';
      console.log(`   ${status} ${key}: ${value || 'NÃO ENCONTRADO'}`);
    });

    // Verificar se há problemas específicos
    console.log('\n🔍 ANÁLISE DE PROBLEMAS:');
    console.log('─'.repeat(50));
    
    if (!metadata.label) {
      console.log('❌ PROBLEMA: Label não encontrado');
      console.log('   → Verificar se o seletor está correto');
      console.log('   → Verificar se o Beatport mudou a estrutura da página');
    }
    
    if (!metadata.publishedDate) {
      console.log('❌ PROBLEMA: Published Date não encontrado');
      console.log('   → Verificar se o seletor está correto');
      console.log('   → Verificar se o Beatport mudou a estrutura da página');
    }

    if (metadata.label && metadata.publishedDate) {
      console.log('✅ SUCESSO: Todos os metadados encontrados!');
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Executar o teste
testBeatportExtraction(); 