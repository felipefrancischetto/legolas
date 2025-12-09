const puppeteer = require('puppeteer');

async function testSimpleExtraction() {
  console.log('🎯 Teste ultra-simples: extração direta da página específica\n');
  
  const browser = await puppeteer.launch({ 
    headless: false, // Browser visível para debug
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Ir direto para a URL específica que sabemos que funciona
    const trackUrl = 'https://www.beatport.com/track/be-wise-be-warned-o-rulers-of-the-earth/16078330';
    console.log(`🌐 Navegando diretamente para: ${trackUrl}`);
    
    await page.goto(trackUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Tratar cookies se aparecerem
    try {
      await page.evaluate(function() {
        var buttons = document.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
          var text = (buttons[i].textContent || '').toLowerCase();
          if (text.includes('accept') || text.includes('aceitar')) {
            buttons[i].click();
            return true;
          }
        }
        return false;
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (e) {}
    
    // Extração ultra-simples com JavaScript puro
    const result = await page.evaluate(function() {
      var bodyText = document.body.textContent || '';
      
      console.log('[EXTRACTION] Texto da página capturado, tamanho:', bodyText.length);
      
      // BPM: buscar "BPM: 127"
      var bpm = null;
      var bpmMatches = bodyText.match(/BPM:\s*(\d+)/);
      if (bpmMatches) {
        bpm = parseInt(bpmMatches[1]);
        console.log('[EXTRACTION] BPM encontrado:', bpm);
      } else {
        console.log('[EXTRACTION] BPM não encontrado');
      }
      
      // Key: buscar "Key: F Minor" em português e inglês
      var key = null;
      var keyMatches = bodyText.match(/(?:Key|Tom):\s*([A-G][#♯♭b]?\s*(?:Minor|Major|Min|Maj))/);
      if (keyMatches) {
        key = keyMatches[1]
          .replace(/\bMin\b/g, 'Minor')
          .replace(/\bMaj\b/g, 'Major');
        console.log('[EXTRACTION] Key encontrada:', key);
      } else {
        console.log('[EXTRACTION] Key não encontrada');
      }
      
      // Genre: buscar "Genre: Electronica" em português e inglês
      var genre = null;
      var genreMatches = bodyText.match(/(?:Genre|Gênero):\s*(Electronica|Progressive House|Tech House|House|Trance|Big Room)/);
      if (genreMatches) {
        genre = genreMatches[1];
        console.log('[EXTRACTION] Genre encontrado:', genre);
      } else {
        console.log('[EXTRACTION] Genre não encontrado');
      }
      
      // Label: buscar "Label: Cronos" em português e inglês
      var label = null;
      var labelMatches = bodyText.match(/(?:Label|Gravadora):\s*(Cronos|Virgin|STMPD RCRDS|Revealed|Armada|Ultra|Spinnin)/);
      if (labelMatches) {
        label = labelMatches[1];
        console.log('[EXTRACTION] Label encontrada:', label);
      } else {
        console.log('[EXTRACTION] Label não encontrada');
      }
      
      // Artist do título
      var artist = '';
      var title = document.title || '';
      var artistMatches = title.match(/^(.+?)\s*-/);
      if (artistMatches) {
        artist = artistMatches[1].trim();
        console.log('[EXTRACTION] Artist encontrado:', artist);
      }
      
      return {
        artist: artist,
        bpm: bpm,
        key: key,
        genre: genre,
        label: label,
        pageTitle: title,
        textLength: bodyText.length
      };
    });
    
    await browser.close();
    
    console.log('\n📊 Resultado da extração:');
    console.log(`   🎤 Artist: ${result.artist || 'N/A'}`);
    console.log(`   🎵 BPM: ${result.bpm || 'N/A'}`);
    console.log(`   🔑 Key: ${result.key || 'N/A'}`);
    console.log(`   🎭 Genre: ${result.genre || 'N/A'}`);
    console.log(`   🏷️  Label: ${result.label || 'N/A'}`);
    console.log(`   📄 Título da página: ${result.pageTitle}`);
    console.log(`   📏 Tamanho do texto: ${result.textLength} caracteres`);
    
    // Validação contra dados conhecidos
    console.log('\n✅ Validação contra dados confirmados:');
    console.log(`   BPM: ${result.bpm === 127 ? '✅ CORRETO' : '❌ INCORRETO'} (${result.bpm} vs 127)`);
    console.log(`   Key: ${result.key === 'F Minor' ? '✅ CORRETO' : '❌ INCORRETO'} (${result.key} vs F Minor)`);
    console.log(`   Genre: ${result.genre === 'Electronica' ? '✅ CORRETO' : '❌ INCORRETO'} (${result.genre} vs Electronica)`);
    console.log(`   Label: ${result.label === 'Cronos' ? '✅ CORRETO' : '❌ INCORRETO'} (${result.label} vs Cronos)`);
    
    const successCount = [
      result.bpm === 127,
      result.key === 'F Minor', 
      result.genre === 'Electronica',
      result.label === 'Cronos'
    ].filter(Boolean).length;
    
    console.log(`\n🎯 Taxa de sucesso: ${successCount}/4 (${Math.round(successCount/4*100)}%)`);
    
    if (successCount === 4) {
      console.log('🎉 PERFEITO! Todos os dados extraídos corretamente!');
    } else if (successCount >= 2) {
      console.log('⚠️  PARCIAL: Alguns dados corretos, outros precisam ajuste');
    } else {
      console.log('❌ FALHOU: Poucos dados corretos');
    }
    
  } catch (error) {
    await browser.close();
    console.error('❌ Erro:', error.message);
  }
}

testSimpleExtraction().catch(console.error); 