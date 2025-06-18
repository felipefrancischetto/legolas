// Debug específico do BeatportProviderV2
const puppeteer = require('puppeteer');

async function debugBeatportV2() {
  console.log('🔍 Debug específico do BeatportProviderV2...\n');
  
  const title = 'Animals';
  const artist = 'Martin Garrix';
  
  const browser = await puppeteer.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Simular exatamente o que o BeatportProviderV2 faz
    console.log('🌐 Fase 1: Busca na página de search');
    const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(`${artist} ${title}`)}`;
    console.log(`   URL: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 45000 });
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    console.log(`   Status: ${page.url()}`);
    
    // Buscar melhor match (copiando lógica do BeatportProviderV2)
    const trackUrl = await page.evaluate((searchTitle, searchArtist) => {
      console.log('🔍 Procurando links de track...');
      const links = Array.from(document.querySelectorAll('a[href*="/track/"]'));
      console.log(`   Encontrados ${links.length} links`);
      
      let bestHref = null;
      let bestScore = -Infinity;
      let bestText = '';
      
      for (const link of links) {
        const text = link.textContent?.trim() || '';
        let score = 0;
        
        if (text.toLowerCase().includes(searchTitle.toLowerCase())) score += 500;
        if (text.toLowerCase().includes(searchArtist.toLowerCase())) score += 200;
        if (text.toLowerCase().includes('original mix')) score += 100;
        
        console.log(`   "${text}" -> Score: ${score}`);
        
        if (score > bestScore) {
          bestScore = score;
          bestHref = link.href;
          bestText = text;
        }
      }
      
      console.log(`   Melhor: "${bestText}" (Score: ${bestScore})`);
      return bestHref;
    }, title, artist);
    
    console.log(`✅ Track selecionada: ${trackUrl}`);
    
    if (!trackUrl) {
      console.log('❌ Nenhuma track encontrada na busca');
      await browser.close();
      return;
    }
    
    console.log('\n🌐 Fase 2: Navegação para página da track');
    await page.goto(trackUrl, { waitUntil: 'networkidle0', timeout: 45000 });
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    console.log(`   URL final: ${page.url()}`);
    console.log(`   Título: ${await page.title()}`);
    
    console.log('\n🔍 Fase 3: Extração de metadados (testando seletores)');
    
    // Testar seletores atualizados EXATAMENTE como no BeatportProviderV2
    const extractionResult = await page.evaluate(() => {
      console.log('=== INÍCIO DA EXTRAÇÃO ===');
      
      // EXATA cópia da função getDetail do BeatportProviderV2
      function getDetail(label) {
        console.log(`\n🔍 Buscando por: "${label}"`);
        
        // Tentar seletores atuais baseados na inspeção
        const metaItems = Array.from(document.querySelectorAll('.TrackMeta-style__MetaItem-sc-9c332570-0, [class*="MetaItem"]'));
        console.log(`   Encontrados ${metaItems.length} meta items`);
        
        for (let i = 0; i < metaItems.length; i++) {
          const item = metaItems[i];
          const labelEl = item.querySelector('div');
          const valueEl = item.querySelector('span');
          
          console.log(`   Item ${i + 1}:`, {
            hasLabelEl: !!labelEl,
            hasValueEl: !!valueEl,
            labelText: labelEl?.textContent?.trim(),
            valueText: valueEl?.textContent?.trim()
          });
          
          if (labelEl && valueEl) {
            const labelText = labelEl.textContent?.trim().replace(':', '') || '';
            const valueText = valueEl.textContent?.trim() || '';
            
            if (labelText.toLowerCase() === label.toLowerCase()) {
              console.log(`   ✅ MATCH encontrado: ${labelText} = ${valueText}`);
              return valueText;
            }
          }
        }
        
        console.log(`   Não encontrado por seletores, tentando fallback...`);
        
        // Fallback: buscar diretamente no texto
        const metaWrapper = document.querySelector('.TrackMeta-style__MetaWrapper-sc-9c332570-1, [class*="MetaWrapper"]');
        console.log(`   MetaWrapper encontrado: ${!!metaWrapper}`);
        
        if (metaWrapper) {
          const text = metaWrapper.textContent || '';
          console.log(`   Texto do wrapper (primeiros 200 chars): "${text.slice(0, 200)}"`);
          
          // Regex patterns para diferentes campos
          const patterns = {
            'BPM': /BPM[:\s]*(\d{2,3})/i,
            'Key': /Tom[:\s]*([A-G][#♯♭b]?\s*(?:maj|min|Major|Minor))/i,
            'Genre': /Gênero[:\s]*([^G]+?)(?:Gravadora|$)/i,
            'Label': /Gravadora[:\s]*([^$]+?)$/i,
            'Tom': /Tom[:\s]*([A-G][#♯♭b]?\s*(?:maj|min|Major|Minor))/i,
            'Gênero': /Gênero[:\s]*([^G]+?)(?:Gravadora|$)/i,
            'Gravadora': /Gravadora[:\s]*([^$]+?)$/i
          };
          
          const pattern = patterns[label];
          console.log(`   Padrão regex para "${label}": ${pattern}`);
          
          if (pattern) {
            const match = text.match(pattern);
            console.log(`   Match do regex: ${match ? match[1] : 'nenhum'}`);
            if (match && match[1]) {
              return match[1].trim();
            }
          }
        }
        
        console.log(`   ❌ "${label}" não encontrado`);
        return undefined;
      }
      
      // Artista (buscar no título da página)
      let artist = '';
      const pageTitle = document.title;
      console.log(`\n👨‍🎤 Extraindo artista do título: "${pageTitle}"`);
      if (pageTitle) {
        const titleMatch = pageTitle.match(/^(.+?)\s*-\s*(.+?)\s*(?:\[|\|)/);
        if (titleMatch && titleMatch[1]) {
          artist = titleMatch[1].trim();
          console.log(`   Artista extraído: "${artist}"`);
        }
      }
      
      // Buscar metadados
      console.log('\n🎵 Buscando metadados...');
      const bpm = getDetail('BPM');
      const key = getDetail('Key') || getDetail('Tom');
      const genre = getDetail('Genre') || getDetail('Gênero');
      const label = getDetail('Label') || getDetail('Gravadora');
      
      console.log('\n📊 RESULTADO FINAL:');
      const result = {
        artist,
        bpm: bpm ? parseInt(bpm) : undefined,
        key: key || undefined,
        genre: genre || undefined,
        label: label || undefined
      };
      
      Object.entries(result).forEach(([k, v]) => {
        console.log(`   ${k}: ${v || 'N/A'}`);
      });
      
      return result;
    });
    
    console.log('\n📊 Resultado da extração:');
    console.log(`   🎤 Artist: ${extractionResult.artist || 'N/A'}`);
    console.log(`   🎵 BPM: ${extractionResult.bpm || 'N/A'}`);
    console.log(`   🔑 Key: ${extractionResult.key || 'N/A'}`);
    console.log(`   🎭 Genre: ${extractionResult.genre || 'N/A'}`);
    console.log(`   🏷️  Label: ${extractionResult.label || 'N/A'}`);
    
    const hasData = extractionResult.bpm || extractionResult.key || extractionResult.genre || extractionResult.label || extractionResult.artist;
    console.log(`\n${hasData ? '🎉 SUCESSO' : '❌ FALHOU'}: ${hasData ? 'Dados encontrados!' : 'Nenhum dado encontrado'}`);
    
    console.log('\n⏳ Aguardando 15 segundos para inspeção...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await browser.close();
  }
}

debugBeatportV2().catch(console.error); 