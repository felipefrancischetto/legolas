// Teste direto do BeatportProviderV2 com debugging detalhado
const puppeteer = require('puppeteer');

async function debugBeatportSearch() {
  console.log('🔍 Debug do BeatportProviderV2...\n');
  
  const title = 'Animals';
  const artist = 'Martin Garrix';
  
  console.log(`Testando: "${title}" - "${artist}"`);
  
  const browser = await puppeteer.launch({ 
    headless: false, // MUDEI PARA false PARA VER O QUE ACONTECE
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
    
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'pt'] });
    });
    
    // Buscar na página de search
    const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(`${artist} ${title}`)}`;
    console.log(`🌐 Navegando para: ${searchUrl}`);
    
    const response = await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    console.log(`✅ Status da resposta: ${response.status()}`);
    console.log(`🔗 URL final: ${page.url()}`);
    
    // Esperar carregamento
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Debug: pegar o título da página
    const pageTitle = await page.title();
    console.log(`📄 Título da página: ${pageTitle}`);
    
    // Debug: verificar se foi redirecionado
    const currentUrl = page.url();
    if (currentUrl !== searchUrl && (currentUrl === 'https://www.beatport.com/' || currentUrl === 'https://www.beatport.com/pt')) {
      console.log('❌ Redirecionado para homepage - possível detecção de bot');
      await browser.close();
      return;
    }
    
    // Debug: contar quantos links de track existem
    const trackLinksCount = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/track/"]');
      console.log(`Encontrados ${links.length} links de track`);
      
      // Mostrar os primeiros 5 links
      for (let i = 0; i < Math.min(5, links.length); i++) {
        const link = links[i];
        console.log(`${i + 1}. "${link.textContent?.trim()}" -> ${link.href}`);
      }
      
      return links.length;
    });
    
    console.log(`🔗 Total de links de track encontrados: ${trackLinksCount}`);
    
    if (trackLinksCount === 0) {
      console.log('❌ Nenhum link de track encontrado na página de busca');
      
      // Debug: mostrar conteúdo da página
      const bodyText = await page.evaluate(() => document.body.textContent?.slice(0, 500));
      console.log(`📝 Primeiros 500 chars da página: ${bodyText}`);
      
      await browser.close();
      return;
    }
    
    // Buscar melhor match
    const bestMatch = await page.evaluate((searchTitle, searchArtist) => {
      const links = Array.from(document.querySelectorAll('a[href*="/track/"]'));
      let bestHref = null;
      let bestScore = -Infinity;
      let bestText = '';
      
      for (const link of links) {
        const text = link.textContent?.trim() || '';
        let score = 0;
        
        if (text.toLowerCase().includes(searchTitle.toLowerCase())) score += 500;
        if (text.toLowerCase().includes(searchArtist.toLowerCase())) score += 200;
        if (text.toLowerCase().includes('original mix')) score += 100;
        
        console.log(`Avaliando: "${text}" (Score: ${score})`);
        
        if (score > bestScore) {
          bestScore = score;
          bestHref = link.href;
          bestText = text;
        }
      }
      
      return { href: bestHref, text: bestText, score: bestScore };
    }, title, artist);
    
    console.log(`🎯 Melhor match: "${bestMatch.text}" (Score: ${bestMatch.score})`);
    console.log(`🔗 URL: ${bestMatch.href}`);
    
    if (!bestMatch.href || bestMatch.score < 100) {
      console.log('❌ Nenhum match adequado encontrado');
      await browser.close();
      return;
    }
    
    // Navegar para a página da track
    console.log(`🌐 Navegando para página da track...`);
    await page.goto(bestMatch.href, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Esperar carregamento
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log(`🔗 URL da track: ${page.url()}`);
    const trackPageTitle = await page.title();
    console.log(`📄 Título da página da track: ${trackPageTitle}`);
    
    // Tentar extrair metadados com debug
    const metadata = await page.evaluate(() => {
      console.log('🔍 Iniciando extração de metadados...');
      
      // Helper para buscar label-value
      function getDetail(label) {
        const rows = Array.from(document.querySelectorAll('.interior-track-content .interior-track-details .interior-track-detail'));
        console.log(`Procurando por "${label}" em ${rows.length} rows`);
        
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const labelEl = row.querySelector('.interior-track-detail-label');
          const valueEl = row.querySelector('.interior-track-detail-value');
          
          if (labelEl && valueEl) {
            const labelText = labelEl.textContent?.trim() || '';
            const valueText = valueEl.textContent?.trim() || '';
            console.log(`Row ${i + 1}: "${labelText}" = "${valueText}"`);
            
            if (labelText.toLowerCase() === label.toLowerCase()) {
              console.log(`✅ Encontrado ${label}: ${valueText}`);
              return valueText;
            }
          }
        }
        return undefined;
      }
      
      // Buscar dados
      const bpm = getDetail('BPM');
      const key = getDetail('Key');
      const genre = getDetail('Genre');
      const label = getDetail('Label');
      
      console.log('📊 Resultado da extração:');
      console.log(`  BPM: ${bpm || 'N/A'}`);
      console.log(`  Key: ${key || 'N/A'}`);
      console.log(`  Genre: ${genre || 'N/A'}`);
      console.log(`  Label: ${label || 'N/A'}`);
      
      return { bpm, key, genre, label };
    });
    
    console.log('\n📊 Metadados extraídos:');
    console.log(`  🎵 BPM: ${metadata.bpm || 'N/A'}`);
    console.log(`  🔑 Key: ${metadata.key || 'N/A'}`);
    console.log(`  🎭 Genre: ${metadata.genre || 'N/A'}`);
    console.log(`  🏷️  Label: ${metadata.label || 'N/A'}`);
    
    const hasData = metadata.bpm || metadata.key || metadata.genre || metadata.label;
    console.log(`\n${hasData ? '🎉 SUCESSO' : '❌ FALHOU'}: ${hasData ? 'Metadados encontrados!' : 'Nenhum metadado encontrado'}`);
    
    // Esperar um pouco antes de fechar para ver a página
    console.log('\n⏳ Aguardando 10 segundos para inspecionar a página...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await browser.close();
  }
}

debugBeatportSearch().catch(console.error); 