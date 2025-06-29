const puppeteer = require('puppeteer');

async function testGenreDetection() {
  console.log('🎭 [Genre Test] Testando detecção de gênero "Minimal / Deep Tech"...');
  
  const browser = await puppeteer.launch({ 
    headless: false, // Browser visível para debug
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

    // Navegar diretamente para a URL da track da imagem
    const trackUrl = 'https://www.beatport.com/track/individual-life-in-human-society/18873888';
    console.log(`🌐 [Genre Test] Navegando para: ${trackUrl}`);
    
    await page.goto(trackUrl, { waitUntil: 'networkidle0', timeout: 45000 });
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Aceitar cookies se aparecerem
    try {
      await page.evaluate(() => {
        const cookieButtons = Array.from(document.querySelectorAll('button'));
        for (const button of cookieButtons) {
          const text = (button.textContent || '').toLowerCase();
          if (text.includes('accept') || text.includes('aceitar') || text.includes('i accept')) {
            button.click();
            return true;
          }
        }
        return false;
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      console.log('⚠️  [Genre Test] Sem cookies para aceitar');
    }

    // Aguardar carregamento completo
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Extrair gênero com vários métodos
    const genreAnalysis = await page.evaluate(() => {
      console.log('[DEBUG] Iniciando análise de gênero...');
      
      const bodyText = document.body.textContent || '';
      const pageHTML = document.body.innerHTML || '';
      
      // Método 1: Regex patterns atualizados
      const genrePatterns = [
        /(?:Genre|Gênero):\s*(Minimal[^<\n]*Deep[^<\n]*Tech)/gi,
        /(?:Genre|Gênero):\s*(Minimal[^<\n]*\/[^<\n]*Deep[^<\n]*Tech)/gi,
        /(?:Genre|Gênero):\s*(Deep[^<\n]*Tech)/gi,
        /(?:Genre|Gênero):\s*(Minimal)/gi,
        /(?:Genre|Gênero):\s*(Tech[^<\n]*House)/gi,
        /(?:Genre|Gênero):\s*(Progressive[^<\n]*House)/gi,
        /(?:Genre|Gênero):\s*(House)/gi,
        /(?:Genre|Gênero):\s*([A-Za-z][A-Za-z\s\/\-]+)/gi,
      ];
      
      const foundGenres = [];
      for (const pattern of genrePatterns) {
        const matches = bodyText.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const genre = match.replace(/(?:Genre|Gênero):\s*/gi, '').trim();
            if (genre && genre.length > 2) {
              foundGenres.push({ method: 'regex', pattern: pattern.toString(), genre });
            }
          });
        }
      }

      // Método 2: Seletores CSS específicos para gênero
      const genreSelectors = [
        '.track-detail-data td:nth-child(3) a',
        '[data-testid="track-genre"] a',
        '.track-stats .genre a',
        '.track-genre a',
        '.genre-link',
        '.interior-track-content .genre a',
        '.track-detail-data .genre a',
        '.genre a',
        'a[href*="/genre/"]',
        '.TrackMeta-style__MetaItem-sc-9c332570-0:contains("Gênero") span',
        '.TrackMeta-style__MetaItem-sc-9c332570-0:contains("Genre") span'
      ];

      const selectorResults = [];
      for (const selector of genreSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            const text = element.textContent?.trim();
            if (text && text.length > 2 && !text.toLowerCase().includes('n/a')) {
              selectorResults.push({ 
                method: 'selector', 
                selector, 
                text,
                href: element.href || 'N/A'
              });
            }
          }
        } catch (e) {
          // Ignorar seletores inválidos
        }
      }

      // Método 3: Análise de estrutura da página (procurar por tags com "Minimal" ou "Deep Tech")
      const structureAnalysis = [];
      const allElements = document.querySelectorAll('*');
      for (let i = 0; i < allElements.length; i++) {
        const element = allElements[i];
        const text = element.textContent?.trim() || '';
        
        // Buscar por padrões de gênero específicos
        if (text.match(/\b(Minimal|Deep Tech|Tech House|Progressive House|House|Electronica)\b/i)) {
          const tagName = element.tagName.toLowerCase();
          const className = element.className || '';
          const parentTag = element.parentElement?.tagName.toLowerCase() || '';
          
          structureAnalysis.push({
            method: 'structure',
            text: text.substring(0, 100), // Limitar tamanho
            tagName,
            className: className.substring(0, 50),
            parentTag
          });
        }
      }

      // Buscar especificamente por "Minimal / Deep Tech" no HTML
      const specificSearch = {
        hasMinimalDeepTech: pageHTML.includes('Minimal') && pageHTML.includes('Deep') && pageHTML.includes('Tech'),
        minimalMatches: (pageHTML.match(/Minimal/gi) || []).length,
        deepTechMatches: (pageHTML.match(/Deep.*Tech/gi) || []).length,
        genreKeywordContext: []
      };

      // Buscar contexto ao redor da palavra "Genre" ou "Gênero"
      const genreKeywordRegex = /(.{0,50}(?:Genre|Gênero).{0,50})/gi;
      const contextMatches = bodyText.match(genreKeywordRegex) || [];
      specificSearch.genreKeywordContext = contextMatches;

      return {
        url: window.location.href,
        pageTitle: document.title,
        foundGenres,
        selectorResults,
        structureAnalysis: structureAnalysis.slice(0, 10), // Limitar para evitar spam
        specificSearch,
        bodyTextSample: bodyText.substring(0, 500) // Sample do texto da página
      };
    });

    console.log('\n📊 [Genre Test] Resultados da análise:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 URL: ${genreAnalysis.url}`);
    console.log(`📄 Título: ${genreAnalysis.pageTitle}`);
    
    console.log('\n🎯 [Método 1] Gêneros encontrados por REGEX:');
    if (genreAnalysis.foundGenres.length > 0) {
      genreAnalysis.foundGenres.forEach((result, i) => {
        console.log(`   ${i + 1}. "${result.genre}" (Pattern: ${result.pattern})`);
      });
    } else {
      console.log('   ❌ Nenhum gênero encontrado por regex');
    }

    console.log('\n🎯 [Método 2] Gêneros encontrados por SELETORES CSS:');
    if (genreAnalysis.selectorResults.length > 0) {
      genreAnalysis.selectorResults.forEach((result, i) => {
        console.log(`   ${i + 1}. "${result.text}" (Seletor: ${result.selector})`);
        if (result.href !== 'N/A') {
          console.log(`      Link: ${result.href}`);
        }
      });
    } else {
      console.log('   ❌ Nenhum gênero encontrado por seletores CSS');
    }

    console.log('\n🎯 [Método 3] Análise de ESTRUTURA da página:');
    if (genreAnalysis.structureAnalysis.length > 0) {
      genreAnalysis.structureAnalysis.forEach((result, i) => {
        console.log(`   ${i + 1}. "${result.text}" (Tag: ${result.tagName}, Class: ${result.className})`);
      });
    } else {
      console.log('   ❌ Nenhuma estrutura relevante encontrada');
    }

    console.log('\n🔍 [Busca Específica] "Minimal / Deep Tech":');
    console.log(`   Tem "Minimal" + "Deep" + "Tech": ${genreAnalysis.specificSearch.hasMinimalDeepTech}`);
    console.log(`   Ocorrências "Minimal": ${genreAnalysis.specificSearch.minimalMatches}`);
    console.log(`   Ocorrências "Deep Tech": ${genreAnalysis.specificSearch.deepTechMatches}`);
    
    console.log('\n📝 [Contexto] Texto ao redor de "Genre/Gênero":');
    genreAnalysis.specificSearch.genreKeywordContext.forEach((context, i) => {
      console.log(`   ${i + 1}. "${context}"`);
    });

    console.log('\n📄 [Sample] Amostra do texto da página:');
    console.log(`"${genreAnalysis.bodyTextSample}"`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Determinar melhor resultado
    let bestGenre = null;
    if (genreAnalysis.foundGenres.length > 0) {
      bestGenre = genreAnalysis.foundGenres[0].genre;
    } else if (genreAnalysis.selectorResults.length > 0) {
      bestGenre = genreAnalysis.selectorResults[0].text;
    }

    console.log(`\n🎯 [RESULTADO FINAL] Melhor gênero detectado: "${bestGenre || 'N/A'}"`);
    
    if (bestGenre) {
      console.log('✅ [SUCESSO] Gênero detectado com sucesso!');
    } else {
      console.log('❌ [FALHA] Não foi possível detectar o gênero');
    }

    await browser.close();
    return bestGenre;

  } catch (error) {
    console.error('❌ [Genre Test] Erro:', error);
    await browser.close();
    return null;
  }
}

// Executar teste
testGenreDetection().then(result => {
  console.log(`\n🏁 [FINAL] Resultado do teste: ${result || 'FALHA'}`);
  process.exit(result ? 0 : 1);
}); 