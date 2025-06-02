// 🎯 SCRAPER COM RESOLUÇÃO MANUAL DE CAPTCHA
const { chromium } = require('playwright');
const path = require('path');

async function extrairComCaptcha(url) {
  console.log('🎵 Iniciando scraper com suporte a captcha...');
  
  const browser = await chromium.launch({ 
    headless: false, // SEMPRE visível para interação
    timeout: 60000 
  });

  try {
    const page = await browser.newPage();
    
    // Configurar como usuário real
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://www.1001tracklists.com/'
    });

    console.log('🌐 Carregando página...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Aguardar carregamento inicial
    await page.waitForTimeout(3000);
    
    // Tirar screenshot inicial
    const screenshotPath = path.join(__dirname, 'screenshot-pagina.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot salvo em: ${screenshotPath}`);
    
    // Verificar se há indicações de proteção/captcha
    const pageContent = await page.evaluate(() => {
      const bodyText = document.body.textContent.toLowerCase();
      const title = document.title.toLowerCase();
      
      return {
        hasWaitMessage: bodyText.includes('wait') || bodyText.includes('loading') || 
                       bodyText.includes('please') || bodyText.includes('forwarded'),
        hasCaptcha: bodyText.includes('captcha') || bodyText.includes('verify') ||
                   bodyText.includes('robot') || bodyText.includes('human'),
        title: document.title,
        bodyTextSample: document.body.textContent.substring(0, 500)
      };
    });
    
    console.log('\n📊 ANÁLISE DA PÁGINA:');
    console.log(`Título: ${pageContent.title}`);
    console.log(`Tem mensagem de espera: ${pageContent.hasWaitMessage ? 'SIM' : 'NÃO'}`);
    console.log(`Tem captcha: ${pageContent.hasCaptcha ? 'SIM' : 'NÃO'}`);
    console.log(`Conteúdo: ${pageContent.bodyTextSample}...`);
    
    // Se há proteções, aguardar resolução manual
    if (pageContent.hasWaitMessage || pageContent.hasCaptcha) {
      console.log('\n🚨 PROTEÇÃO DETECTADA!');
      console.log('📸 Screenshot tirado para análise');
      console.log('🔧 RESOLVA MANUALMENTE:');
      console.log('   1. Olhe o navegador que abriu');
      console.log('   2. Resolva qualquer captcha/proteção');
      console.log('   3. Navegue até ver a lista de músicas');
      console.log('   4. Pressione ENTER aqui para continuar...');
      
      // Aguardar input manual
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      await new Promise(resolve => {
        rl.question('Pressione ENTER quando estiver pronto: ', () => {
          rl.close();
          resolve();
        });
      });
      
      console.log('✅ Continuando extração...');
    }
    
    // Aguardar mais um pouco após resolução manual
    await page.waitForTimeout(2000);
    
    // Extrair informações da playlist
    const playlistInfo = await page.evaluate(() => {
      // Tentar múltiplos seletores para título
      const titleSelectors = ['h1', '.page-title', '.tracklist-title', '.title'];
      let title = 'Playlist';
      
      for (const selector of titleSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          title = el.textContent.trim();
          break;
        }
      }
      
      // Tentar múltiplos seletores para artista
      const artistSelectors = ['.artistName', '.artist', '.dj-name', '.performer'];
      let artist = 'Unknown';
      
      for (const selector of artistSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          artist = el.textContent.trim();
          break;
        }
      }
      
      return { title, artist };
    });
    
    console.log(`\n📀 Playlist: ${playlistInfo.title}`);
    console.log(`🎧 Artista: ${playlistInfo.artist}`);
    
    // Procurar faixas com múltiplos seletores
    console.log('\n🔍 Procurando faixas...');
    
    const tracks = await page.evaluate(() => {
      // Tentar vários seletores para encontrar as faixas
      const trackSelectors = [
        'tr.tlpItem',
        'tr[class*="tlp"]',
        'tr[class*="track"]',
        '.track-item',
        '.tracklist-item',
        '.song-item',
        'li[class*="track"]',
        'div[class*="track"]',
        'table tr'
      ];
      
      let trackElements = [];
      let usedSelector = '';
      
      for (const selector of trackSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          // Filtrar elementos que realmente parecem ser faixas
          const validTracks = Array.from(elements).filter(el => {
            const text = el.textContent;
            return text && text.length > 10 && 
                   (text.includes('-') || text.includes('&') || text.includes('feat'));
          });
          
          if (validTracks.length > 0) {
            trackElements = validTracks;
            usedSelector = selector;
            break;
          }
        }
      }
      
      console.log(`Usando seletor: ${usedSelector}, encontradas: ${trackElements.length} faixas`);
      
      const results = [];
      
      trackElements.forEach((trackEl, index) => {
        // Tentar extrair título da faixa
        const titleSelectors = [
          '.trackValue', 
          '.track-title', 
          '.title',
          '.song-title',
          '.name',
          'td:nth-child(2)',
          'span[class*="title"]'
        ];
        
        let title = '';
        for (const selector of titleSelectors) {
          const el = trackEl.querySelector(selector);
          if (el && el.textContent.trim()) {
            title = el.textContent.trim();
            break;
          }
        }
        
        // Se não encontrou título específico, pegar o texto do elemento
        if (!title) {
          const fullText = trackEl.textContent.trim();
          // Pegar primeira linha que pareça ser título
          const lines = fullText.split('\n').filter(line => line.trim());
          for (const line of lines) {
            if (line.length > 10 && line.length < 200 && 
                (line.includes('-') || line.includes('&'))) {
              title = line.trim();
              break;
            }
          }
        }
        
        if (!title || title.length < 3) return;
        
        // Procurar links dentro da faixa
        const links = [];
        const linkElements = trackEl.querySelectorAll('a[href]');
        
        linkElements.forEach(linkEl => {
          const href = linkEl.href;
          if (!href || href.length < 10) return;
          
          let platform = 'Other';
          const url = href.toLowerCase();
          
          if (url.includes('spotify.com')) platform = 'Spotify';
          else if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'YouTube';
          else if (url.includes('soundcloud.com')) platform = 'SoundCloud';
          else if (url.includes('beatport.com')) platform = 'Beatport';
          else if (url.includes('music.apple.com')) platform = 'Apple Music';
          else if (url.includes('tidal.com')) platform = 'Tidal';
          else if (url.includes('deezer.com')) platform = 'Deezer';
          else if (url.includes('bandcamp.com')) platform = 'Bandcamp';
          else return; // Ignorar outros links
          
          // Evitar duplicatas
          if (!links.some(link => link.url === href)) {
            links.push({ platform, url: href });
          }
        });
        
        results.push({
          position: index + 1,
          title: title.substring(0, 150), // Limitar tamanho
          links: links
        });
      });
      
      return results;
    });
    
    console.log(`📊 Encontradas ${tracks.length} faixas`);
    
    // Tirar screenshot final
    const finalScreenshot = path.join(__dirname, 'screenshot-final.png');
    await page.screenshot({ path: finalScreenshot, fullPage: true });
    console.log(`📸 Screenshot final salvo em: ${finalScreenshot}`);
    
    // Resultados
    const resultado = {
      success: true,
      playlist: {
        title: playlistInfo.title,
        artist: playlistInfo.artist,
        url: url
      },
      tracks: tracks,
      totalTracks: tracks.length,
      tracksWithLinks: tracks.filter(t => t.links.length > 0).length,
      screenshots: [screenshotPath, finalScreenshot]
    };
    
    console.log('\n🎉 EXTRAÇÃO COMPLETA!');
    console.log(`📊 Total: ${resultado.totalTracks} faixas`);
    console.log(`🔗 Com links: ${resultado.tracksWithLinks} faixas`);
    
    return resultado;
    
  } finally {
    // NÃO fechar o navegador automaticamente para permitir inspeção
    console.log('\n💡 Navegador permanece aberto para inspeção...');
    console.log('   Feche manualmente quando terminar');
    // await browser.close();
  }
}

// Executar
const url = 'https://www.1001tracklists.com/tracklist/p0wm1xt/joris-voorn-spectrum-radio-422-silo-brooklyn-united-states-2024-03-30-2025-05-23.html';

extrairComCaptcha(url).then(resultado => {
  if (resultado && resultado.success) {
    console.log('\n🎵 FAIXAS ENCONTRADAS:');
    console.log('='.repeat(50));
    
    resultado.tracks.forEach((track) => {
      console.log(`${track.position}. ${track.title}`);
      if (track.links.length > 0) {
        track.links.forEach(link => {
          console.log(`   🔗 ${link.platform}: ${link.url}`);
        });
      } else {
        console.log('   ❌ Nenhum link encontrado');
      }
      console.log('');
    });
    
    console.log(`\n📸 Screenshots salvos para análise`);
    
    // Salvar resultado em arquivo JSON
    const fs = require('fs');
    fs.writeFileSync('resultado-tracklist.json', JSON.stringify(resultado, null, 2));
    console.log('💾 Resultado salvo em: resultado-tracklist.json');
    
  } else {
    console.log('❌ Extração falhou');
  }
}).catch(error => {
  console.error('💥 ERRO:', error.message);
}); 