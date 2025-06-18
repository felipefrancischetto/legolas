const puppeteer = require('puppeteer');

async function debugDelusionsDirect() {
  console.log('🔍 [Debug Delusions Direct] Testando How Long Will You Love Delusions...');
  
  const browser = await puppeteer.launch({ 
    headless: true,
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
    
    // Buscar na página de search
    const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent('Barac How Long Will You Love Delusions')}`;
    console.log(`🌐 [Delusions] URL de busca: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 45000 });
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    // Tratar cookies
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
    } catch (cookieError) {
      console.log(`⚠️  [Delusions] Erro ao tratar cookies: ${cookieError.message}`);
    }
    
    // Buscar links de track com debug detalhado
    const searchResults = await page.evaluate((searchTitle, searchArtist) => {
      const links = Array.from(document.querySelectorAll('a[href*="/track/"]'));
      console.log(`🔍 [Delusions Debug] Encontrados ${links.length} links de track`);
      
      const allLinks = [];
      let bestHref = null;
      let bestScore = -Infinity;
      
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const text = (link.textContent || '').trim();
        let score = 0;
        
        // Novo algoritmo de matching
        const titleWords = searchTitle.toLowerCase().split(/\s+/);
        const textLower = text.toLowerCase();
        
        // Bonus por cada palavra do título encontrada
        let titleWordMatches = 0;
        titleWords.forEach(word => {
          if (textLower.includes(word) && word.length > 2) {
            titleWordMatches++;
            score += 200;
          }
        });
        
        // Bonus se artista for encontrado
        if (textLower.includes(searchArtist.toLowerCase())) {
          score += 300;
        }
        
        allLinks.push({
          index: i + 1,
          text: text,
          href: link.getAttribute('href'),
          score: score,
          titleWordMatches: titleWordMatches,
          totalTitleWords: titleWords.length
        });
        
        if (score > bestScore) {
          bestScore = score;
          const href = link.getAttribute('href');
          bestHref = (href && href.startsWith('http')) ? href : `https://www.beatport.com${href}`;
        }
      }
      
      // Ordenar por score
      allLinks.sort((a, b) => b.score - a.score);
      
      return {
        totalLinks: links.length,
        allLinks: allLinks.slice(0, 10), // Top 10
        bestHref: bestHref,
        bestScore: bestScore,
        pageUrl: window.location.href,
        pageTitle: document.title
      };
    }, 'how long will you love delusions', 'barac');
    
    console.log(`📊 [Delusions] Resultados da busca:`);
    console.log(`   🌐 URL da página: ${searchResults.pageUrl}`);
    console.log(`   📝 Título da página: ${searchResults.pageTitle}`);
    console.log(`   🔗 Total de links: ${searchResults.totalLinks}`);
    console.log(`   🎯 Melhor match: ${searchResults.bestHref} (Score: ${searchResults.bestScore})`);
    
    console.log(`\n🔍 [Delusions] Top 10 links encontrados:`);
    searchResults.allLinks.forEach((link, i) => {
      console.log(`   ${i + 1}. "${link.text}"`);
      console.log(`      URL: ${link.href}`);
      console.log(`      Score: ${link.score} (Words: ${link.titleWordMatches}/${link.totalTitleWords})`);
      console.log('');
    });
    
    if (!searchResults.bestHref || searchResults.bestScore < 100) {
      console.log('❌ [Delusions] Nenhuma URL válida encontrada ou score muito baixo');
      await browser.close();
      return;
    }
    
    // Navegar para a melhor track
    console.log(`🌐 [Delusions] Navegando para: ${searchResults.bestHref}`);
    await page.goto(searchResults.bestHref, { waitUntil: 'networkidle0', timeout: 45000 });
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    // Extrair metadados
    const metadata = await page.evaluate(function() {
      console.log('[DEBUG Delusions] Iniciando extração...');
      
      var bodyText = document.body.textContent || '';
      console.log('[DEBUG Delusions] Body text length:', bodyText.length);
      
      // Buscar BPM
      var bpm = null;
      var bmpMatches = bodyText.match(/BPM:\s*(\d+)/);
      if (bmpMatches) {
        bpm = parseInt(bmpMatches[1]);
        console.log('[DEBUG Delusions] BPM encontrado:', bpm);
      } else {
        console.log('[DEBUG Delusions] BPM não encontrado');
      }
      
      // Buscar Key
      var key = null;
      var keyMatches = bodyText.match(/(?:Key|Tom):\s*([A-G][#♯♭b]?\s*(?:Minor|Major|Min|Maj))/);
      if (keyMatches) {
        key = keyMatches[1].trim();
        console.log('[DEBUG Delusions] Key encontrada:', key);
      } else {
        console.log('[DEBUG Delusions] Key não encontrada');
      }
      
      // Buscar Genre
      var genre = null;
      var genreMatches = bodyText.match(/(?:Genre|Gênero):\s*(Minimal[^<\n]*\/[^<\n]*Deep[^<\n]*Tech|Minimal|Deep\s*House|Tech\s*House)/i);
      if (genreMatches) {
        genre = genreMatches[1].trim();
        console.log('[DEBUG Delusions] Genre encontrado:', genre);
      } else {
        console.log('[DEBUG Delusions] Genre não encontrado');
      }
      
      // Buscar Label
      var label = null;
      var labelMatches = bodyText.match(/(?:Label|Gravadora):\s*([A-Za-z][A-Za-z0-9\s&.,-]{2,40})/);
      if (labelMatches) {
        label = labelMatches[1].trim();
        
        // Limpeza inteligente da label
        var knownLabels = ['Cronos', 'Virgin', 'Armada', 'Spinnin', 'Ultra', 'Revealed', 'STMPD'];
        var isKnownLabel = false;
        
        for (var i = 0; i < knownLabels.length; i++) {
          if (label.toLowerCase().startsWith(knownLabels[i].toLowerCase())) {
            label = knownLabels[i];
            isKnownLabel = true;
            break;
          }
        }
        
        if (!isKnownLabel) {
          label = label.replace(/\s*(?:Aparece|em|POWER|Pitch|On|Reproduzir|Adicionar|Play|Add|Queue|Faixas|recomendadas).*$/i, '').trim();
          if (label.length > 15) {
            var firstWord = label.split(/\s+/)[0];
            if (firstWord.length >= 3) {
              label = firstWord;
            }
          }
        }
        
        if (label.length < 2 || label.length > 25) label = null;
        console.log('[DEBUG Delusions] Label encontrada:', label);
      } else {
        console.log('[DEBUG Delusions] Label não encontrada');
      }
      
      return {
        url: window.location.href,
        pageTitle: document.title,
        bpm: bpm,
        key: key,
        genre: genre,
        label: label,
        hasData: !!(bpm || key || genre || label)
      };
    });
    
    console.log(`\n📊 [Delusions] Metadados extraídos:`);
    console.log(`   🌐 URL: ${metadata.url}`);
    console.log(`   📝 Página: ${metadata.pageTitle}`);
    console.log(`   🎵 BPM: ${metadata.bpm || 'N/A'}`);
    console.log(`   🔑 Key: ${metadata.key || 'N/A'}`);
    console.log(`   🎭 Genre: ${metadata.genre || 'N/A'}`);
    console.log(`   🏷️  Label: ${metadata.label || 'N/A'}`);
    console.log(`   ✅ Tem dados: ${metadata.hasData}`);
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ [Delusions] Erro:', error.message);
    await browser.close();
  }
}

debugDelusionsDirect(); 