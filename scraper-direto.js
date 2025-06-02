// 🎯 SCRAPER DIRETO - CLICA E PEGA OS LINKS!
const { chromium } = require('playwright');

async function extrairLinksMusicas(url) {
  console.log('🎵 Abrindo página e extraindo links das músicas...');
  
  const browser = await chromium.launch({ 
    headless: false, // Mostrar navegador para debug
    timeout: 30000 
  });

  try {
    const page = await browser.newPage();
    
    // Configurar como usuário real
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    console.log('🌐 Carregando página...');
    await page.goto(url, { waitUntil: 'networkidle' });
    
    // Aguardar carregar
    await page.waitForTimeout(3000);
    
    // Extrair título da playlist
    const playlistInfo = await page.evaluate(() => {
      const title = document.querySelector('h1')?.textContent?.trim() || 'Playlist';
      const artist = document.querySelector('.artistName')?.textContent?.trim() || 'Unknown';
      return { title, artist };
    });
    
    console.log(`📀 Playlist: ${playlistInfo.title}`);
    console.log(`🎧 Artista: ${playlistInfo.artist}`);
    
    // Encontrar todas as faixas
    console.log('🔍 Procurando faixas...');
    
    const tracks = await page.evaluate(() => {
      const trackElements = document.querySelectorAll('tr.tlpItem, .track-item, .tracklist-item');
      const results = [];
      
      trackElements.forEach((trackEl, index) => {
        // Nome da faixa
        const titleEl = trackEl.querySelector('.trackValue, .track-title, .title');
        const title = titleEl?.textContent?.trim();
        
        if (!title) return;
        
        // Procurar todos os links dentro da faixa
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
          else return;
          
          links.push({ platform, url: href });
        });
        
        results.push({
          position: index + 1,
          title: title,
          links: links,
          element: trackEl // Guardar referência para cliques
        });
      });
      
      return results;
    });
    
    console.log(`📊 Encontradas ${tracks.length} faixas`);
    
    // Para cada faixa, tentar clicar em botões play/player
    for (let i = 0; i < Math.min(tracks.length, 10); i++) { // Limitar a 10 para teste
      const track = tracks[i];
      console.log(`🎵 Processando: ${track.title}`);
      
      try {
        // Tentar encontrar e clicar em botões play dentro da faixa
        const clickResult = await page.evaluate((trackIndex) => {
          const trackElements = document.querySelectorAll('tr.tlpItem, .track-item, .tracklist-item');
          const trackEl = trackElements[trackIndex];
          
          if (!trackEl) return false;
          
          // Procurar botões play/player
          const playButtons = trackEl.querySelectorAll('button, .play-btn, .player-btn, [class*="play"], [class*="player"]');
          
          for (let btn of playButtons) {
            if (btn.style.display !== 'none' && btn.offsetParent !== null) {
              btn.click();
              return true;
            }
          }
          
          // Tentar clicar na própria faixa
          trackEl.click();
          return true;
        }, i);
        
        if (clickResult) {
          // Aguardar possível carregamento de player/links
          await page.waitForTimeout(2000);
          
          // Verificar se novos links apareceram
          const newLinks = await page.evaluate((trackIndex) => {
            const trackElements = document.querySelectorAll('tr.tlpItem, .track-item, .tracklist-item');
            const trackEl = trackElements[trackIndex];
            
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
              else return;
              
              links.push({ platform, url: href });
            });
            
            return links;
          }, i);
          
          // Atualizar links da faixa
          tracks[i].links = newLinks;
        }
        
      } catch (error) {
        console.log(`   ⚠️ Erro ao clicar: ${error.message}`);
      }
    }
    
    // Resultados finais
    const resultado = {
      success: true,
      playlist: {
        title: playlistInfo.title,
        artist: playlistInfo.artist,
        url: url
      },
      tracks: tracks.map(track => ({
        position: track.position,
        title: track.title,
        links: track.links
      })),
      totalTracks: tracks.length,
      tracksWithLinks: tracks.filter(t => t.links.length > 0).length
    };
    
    console.log('\n🎉 EXTRAÇÃO COMPLETA!');
    console.log(`📊 Total: ${resultado.totalTracks} faixas`);
    console.log(`🔗 Com links: ${resultado.tracksWithLinks} faixas`);
    
    return resultado;
    
  } finally {
    await browser.close();
  }
}

// Executar direto
const url = 'https://www.1001tracklists.com/tracklist/p0wm1xt/joris-voorn-spectrum-radio-422-silo-brooklyn-united-states-2024-03-30-2025-05-23.html';

extrairLinksMusicas(url).then(resultado => {
  if (resultado.success) {
    console.log('\n🎵 FAIXAS ENCONTRADAS:');
    console.log('='.repeat(50));
    
    resultado.tracks.forEach((track, i) => {
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
  } else {
    console.log('❌ FALHOU:', resultado.error);
  }
}).catch(error => {
  console.error('💥 ERRO:', error.message);
}); 