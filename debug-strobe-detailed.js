const puppeteer = require('puppeteer');

async function debugStrobeDetailed() {
  console.log('🔍 [Debug Strobe Detailed] Testando Strobe Club Edit diretamente...');
  
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
    const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent('deadmau5 Strobe Club Edit')}`;
    console.log(`🌐 [Strobe] URL de busca: ${searchUrl}`);
    
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
      console.log(`⚠️  [Strobe] Erro ao tratar cookies: ${cookieError.message}`);
    }
    
    // Buscar links de track com debug detalhado
    const searchResults = await page.evaluate((searchTitle, searchArtist) => {
      const links = Array.from(document.querySelectorAll('a[href*="/track/"]'));
      console.log(`🔍 [Strobe Debug] Encontrados ${links.length} links de track`);
      
      const allLinks = [];
      let bestHref = null;
      let bestScore = -Infinity;
      
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const text = (link.textContent || '').trim();
        let score = 0;
        
                 // Scoring detalhado
         const titleInText = text.toLowerCase().includes(searchTitle.toLowerCase());
         const artistInText = text.toLowerCase().includes(searchArtist.toLowerCase());
         const isOriginal = text.toLowerCase().includes('original');
         const isClub = text.toLowerCase().includes('club');
         const isEdit = text.toLowerCase().includes('edit');
         const isExactClubEdit = isClub && isEdit;
         
         if (titleInText) score += 500;
         if (artistInText) score += 300;
         
         // PRIORIDADE MÁXIMA para "Club Edit" se for solicitado
         if (isExactClubEdit && searchTitle.toLowerCase().includes('club') && searchTitle.toLowerCase().includes('edit')) {
           score += 1000; // Bonus muito alto para match exato de "Club Edit"
         } else if (isClub && searchTitle.toLowerCase().includes('club')) {
           score += 200;
         } else if (isEdit && searchTitle.toLowerCase().includes('edit')) {
           score += 200;
         } else if (isOriginal && !searchTitle.toLowerCase().includes('club') && !searchTitle.toLowerCase().includes('edit')) {
           score += 100; // Bonus para Original só se não for solicitado edit/club
         }
        
        allLinks.push({
          index: i + 1,
          text: text,
          href: link.getAttribute('href'),
          score: score,
          titleMatch: titleInText,
          artistMatch: artistInText,
                     isClub: isClub,
           isEdit: isEdit,
           isOriginal: isOriginal,
           isExactClubEdit: isExactClubEdit,
           searchTitleLower: searchTitle.toLowerCase(),
           hasClubInSearch: searchTitle.toLowerCase().includes('club'),
           hasEditInSearch: searchTitle.toLowerCase().includes('edit')
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
         }, 'strobe club edit', 'deadmau5');
    
    console.log(`📊 [Strobe] Resultados da busca:`);
    console.log(`   🌐 URL da página: ${searchResults.pageUrl}`);
    console.log(`   📝 Título da página: ${searchResults.pageTitle}`);
    console.log(`   🔗 Total de links: ${searchResults.totalLinks}`);
    console.log(`   🎯 Melhor match: ${searchResults.bestHref} (Score: ${searchResults.bestScore})`);
    
    console.log(`\n🔍 [Strobe] Top 10 links encontrados:`);
    searchResults.allLinks.forEach((link, i) => {
             console.log(`   ${i + 1}. "${link.text}"`);
       console.log(`      URL: ${link.href}`);
       console.log(`      Score: ${link.score}`);
       console.log(`      Matches: Title:${link.titleMatch}, Artist:${link.artistMatch}, Club:${link.isClub}, Edit:${link.isEdit}, Original:${link.isOriginal}`);
       console.log(`      ClubEdit: ${link.isExactClubEdit}, SearchClub: ${link.hasClubInSearch}, SearchEdit: ${link.hasEditInSearch}`);
       console.log('');
    });
    
    if (!searchResults.bestHref) {
      console.log('❌ [Strobe] Nenhuma URL válida encontrada');
      await browser.close();
      return;
    }
    
    // Navegar para a melhor track
    console.log(`🌐 [Strobe] Navegando para: ${searchResults.bestHref}`);
    await page.goto(searchResults.bestHref, { waitUntil: 'networkidle0', timeout: 45000 });
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    // Extrair metadados
    const metadata = await page.evaluate(function() {
      console.log('[DEBUG Strobe] Iniciando extração...');
      
      var bodyText = document.body.textContent || '';
      console.log('[DEBUG Strobe] Body text length:', bodyText.length);
      
             // Buscar BPM
       var bpm = null;
       var bmpMatches = bodyText.match(/BPM:\s*(\d+)/);
       if (bmpMatches) {
         bpm = parseInt(bmpMatches[1]);
         console.log('[DEBUG Strobe] BPM encontrado:', bpm);
       } else {
         console.log('[DEBUG Strobe] BPM não encontrado');
       }
      
      // Buscar Key
      var key = null;
      var keyMatches = bodyText.match(/(?:Key|Tom):\s*([A-G][#♯♭b]?\s*(?:Minor|Major|Min|Maj))/);
      if (keyMatches) {
        key = keyMatches[1].trim();
        console.log('[DEBUG Strobe] Key encontrada:', key);
      } else {
        console.log('[DEBUG Strobe] Key não encontrada');
      }
      
      // Buscar Genre
      var genre = null;
      var genreMatches = bodyText.match(/(?:Genre|Gênero):\s*(Progressive\s*House|House|Techno|Electronica|Trance)/i);
      if (genreMatches) {
        genre = genreMatches[1].trim();
        console.log('[DEBUG Strobe] Genre encontrado:', genre);
      } else {
        console.log('[DEBUG Strobe] Genre não encontrado');
      }
      
      // Buscar Label
      var label = null;
      var labelMatches = bodyText.match(/(?:Label|Gravadora):\s*([A-Za-z][A-Za-z0-9\s&.,-]{2,40})/);
      if (labelMatches) {
        label = labelMatches[1].trim();
        console.log('[DEBUG Strobe] Label encontrada:', label);
      } else {
        console.log('[DEBUG Strobe] Label não encontrada');
      }
      
      // Artist do título
      var artist = '';
      var pageTitle = document.title || '';
      var artistMatches = pageTitle.match(/^(.+?)\s*-/);
      if (artistMatches) {
        artist = artistMatches[1].trim();
        console.log('[DEBUG Strobe] Artist do título:', artist);
      } else {
        console.log('[DEBUG Strobe] Artist não encontrado no título');
      }
      
      return {
        url: window.location.href,
        pageTitle: pageTitle,
        artist: artist,
        bpm: bpm,
        key: key,
        genre: genre,
        label: label,
                 hasData: !!(bpm || key || genre || label)
      };
    });
    
    console.log(`\n📊 [Strobe] Metadados extraídos:`);
    console.log(`   🌐 URL: ${metadata.url}`);
    console.log(`   📝 Página: ${metadata.pageTitle}`);
    console.log(`   🎤 Artist: ${metadata.artist || 'N/A'}`);
         console.log(`   🎵 BPM: ${metadata.bpm || 'N/A'}`);     
    console.log(`   🔑 Key: ${metadata.key || 'N/A'}`);
    console.log(`   🎭 Genre: ${metadata.genre || 'N/A'}`);
    console.log(`   🏷️  Label: ${metadata.label || 'N/A'}`);
    console.log(`   ✅ Tem dados: ${metadata.hasData}`);
    
    await browser.close();
    
  } catch (error) {
    console.error('❌ [Strobe] Erro:', error.message);
    await browser.close();
  }
}

debugStrobeDetailed(); 