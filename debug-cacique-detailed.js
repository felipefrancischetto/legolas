const puppeteer = require('puppeteer');

async function debugCaciqueDetailed() {
  console.log('🔍 [Debug Cacique Detailed] Analisando problema de matching...');
  
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
    const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent('Barac Cacique')}`;
    console.log(`🌐 [Cacique] URL de busca: ${searchUrl}`);
    
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
      console.log(`⚠️  [Cacique] Erro ao tratar cookies: ${cookieError.message}`);
    }
    
    // Analisar todos os links com algoritmo atual vs correto
    const searchResults = await page.evaluate((searchTitle, searchArtist) => {
      const links = Array.from(document.querySelectorAll('a[href*="/track/"]'));
      console.log(`🔍 [Cacique Debug] Encontrados ${links.length} links de track`);
      
      const allLinks = [];
      let bestCurrentHref = null;
      let bestCurrentScore = -Infinity;
      let bestCorrectedHref = null;
      let bestCorrectedScore = -Infinity;
      
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const text = (link.textContent || '').trim();
        const href = link.getAttribute('href');
        
        // ALGORITMO ATUAL (PROBLEMÁTICO)
        let currentScore = 0;
        const titleWords = searchTitle.toLowerCase().split(/\s+/);
        const textLower = text.toLowerCase();
        
        // Bonus por cada palavra do título encontrada
        let titleWordMatches = 0;
        titleWords.forEach(word => {
          if (textLower.includes(word) && word.length > 2) {
            titleWordMatches++;
            currentScore += 200;
          }
        });
        
        // Bonus se artista for encontrado
        if (textLower.includes(searchArtist.toLowerCase())) {
          currentScore += 300;
        }
        
        // ALGORITMO CORRIGIDO (MELHOR)
        let correctedScore = 0;
        
        // PRIORIDADE 1: Título da música deve estar presente
        const hasTitleWord = textLower.includes(searchTitle.toLowerCase());
        if (hasTitleWord) {
          correctedScore += 1000; // MUITO IMPORTANTE
        }
        
        // PRIORIDADE 2: Artista deve estar presente  
        const hasArtist = textLower.includes(searchArtist.toLowerCase());
        if (hasArtist) {
          correctedScore += 500;
        }
        
        // BONUS: Se tem ambos título E artista
        if (hasTitleWord && hasArtist) {
          correctedScore += 2000; // BONUS GIGANTE para match perfeito
        }
        
        // PENALIDADE: Se tem apenas artista mas não o título (evita confusão)
        if (hasArtist && !hasTitleWord) {
          correctedScore -= 500; // PENALIDADE para evitar tracks como "Barac" do Oliver Schories
        }
        
        allLinks.push({
          index: i + 1,
          text: text,
          href: href,
          currentScore: currentScore,
          correctedScore: correctedScore,
          hasTitleWord: hasTitleWord,
          hasArtist: hasArtist,
          titleWordMatches: titleWordMatches,
          isCorrectTrack: (hasTitleWord && hasArtist) // Lógica para identificar track correta
        });
        
        // Algoritmo atual
        if (currentScore > bestCurrentScore) {
          bestCurrentScore = currentScore;
          bestCurrentHref = (href && href.startsWith('http')) ? href : `https://www.beatport.com${href}`;
        }
        
        // Algoritmo corrigido
        if (correctedScore > bestCorrectedScore) {
          bestCorrectedScore = correctedScore;
          bestCorrectedHref = (href && href.startsWith('http')) ? href : `https://www.beatport.com${href}`;
        }
      }
      
      // Ordenar por score corrigido
      allLinks.sort((a, b) => b.correctedScore - a.correctedScore);
      
      return {
        totalLinks: links.length,
        allLinks: allLinks,
        bestCurrentHref: bestCurrentHref,
        bestCurrentScore: bestCurrentScore,
        bestCorrectedHref: bestCorrectedHref,
        bestCorrectedScore: bestCorrectedScore,
        pageUrl: window.location.href,
        pageTitle: document.title
      };
    }, 'cacique', 'barac');
    
    console.log(`📊 [Cacique] Análise de Algoritmos:`);
    console.log(`   🌐 URL da página: ${searchResults.pageUrl}`);
    console.log(`   🔗 Total de links: ${searchResults.totalLinks}`);
    console.log(`\n🔀 [Cacique] COMPARAÇÃO DE ALGORITMOS:`);
    console.log(`   ❌ Algoritmo ATUAL (problemático):`);
    console.log(`      URL: ${searchResults.bestCurrentHref}`);
    console.log(`      Score: ${searchResults.bestCurrentScore}`);
    console.log(`   ✅ Algoritmo CORRIGIDO (melhor):`);
    console.log(`      URL: ${searchResults.bestCorrectedHref}`);
    console.log(`      Score: ${searchResults.bestCorrectedScore}`);
    
    console.log(`\n📋 [Cacique] RANKING CORRIGIDO (Top 10):`);
    searchResults.allLinks.slice(0, 10).forEach((link, i) => {
      const statusIcon = link.isCorrectTrack ? '✅' : (link.hasArtist && !link.hasTitleWord ? '❌' : '⚠️');
      console.log(`   ${statusIcon} ${i + 1}. "${link.text}"`);
      console.log(`      URL: ${link.href}`);
      console.log(`      Score Atual: ${link.currentScore} | Score Corrigido: ${link.correctedScore}`);
      console.log(`      Título: ${link.hasTitleWord} | Artista: ${link.hasArtist} | Palavras: ${link.titleWordMatches}`);
      console.log(`      Track Correta: ${link.isCorrectTrack ? 'SIM' : 'NÃO'}`);
      console.log('');
    });
    
    // Verificar se tem a URL correta (13645096)
    const correctTrack = searchResults.allLinks.find(link => 
      link.href && link.href.includes('13645096')
    );
    
    if (correctTrack) {
      console.log(`🎯 [Cacique] TRACK CORRETA ENCONTRADA:`);
      console.log(`   ✅ "${correctTrack.text}"`);
      console.log(`   🔗 URL: ${correctTrack.href}`);
      console.log(`   📊 Score Atual: ${correctTrack.currentScore} | Score Corrigido: ${correctTrack.correctedScore}`);
      console.log(`   🏆 Posição no ranking atual: ${searchResults.allLinks.findIndex(l => l.href === correctTrack.href) + 1}`);
    } else {
      console.log(`❌ [Cacique] Track correta (13645096) NÃO encontrada nos resultados!`);
    }
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ [Cacique] Erro:', error.message);
    await browser.close();
  }
}

debugCaciqueDetailed(); 