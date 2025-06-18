// 🎯 SCRAPER COM CLIQUES PARA REVELAR LINKS DAS PLATAFORMAS
const { chromium } = require('playwright');
const path = require('path');

async function extrairLinksComCliques(url) {
  console.log('🎵 Iniciando extração com cliques nos ícones das plataformas...');
  
  const browser = await chromium.launch({ 
    headless: false, // Ver o que está acontecendo
    timeout: 60000 
  });

  try {
    const page = await browser.newPage();
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    console.log('🌐 Carregando página...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    await page.waitForTimeout(5000); // Aguardar carregar bem
    
    // Aguardar interação manual se necessário
    console.log('\n🔧 Se houver proteções, resolva manualmente no navegador');
    console.log('📍 Pressione ENTER quando as músicas estiverem visíveis...');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    await new Promise(resolve => {
      rl.question('Pressione ENTER para extrair: ', () => {
        rl.close();
        resolve();
      });
    });
    
    console.log('🔍 Buscando faixas e seus ícones clicáveis...');
    
    // Primeiro, identificar todas as faixas e seus containers
    const trackContainers = await page.evaluate(() => {
      const containers = [];
      
      // Procurar por elementos que contenham números de posição
      const allElements = document.querySelectorAll('*');
      
      for (let element of allElements) {
        const text = element.textContent || '';
        
        // Verificar se contém um número de faixa
        if (text.match(/^\s*0?\d{1,2}\s*$/) && text.trim().length <= 3) {
          let parent = element.parentElement;
          
          // Procurar o container pai da faixa
          while (parent && parent !== document.body) {
            const parentText = parent.textContent || '';
            
            // Verificar se contém informação de música
            if (parentText.includes(' - ') && parentText.length > 20 && parentText.length < 500) {
              
              // Procurar ícones clicáveis dentro deste container
              const icons = parent.querySelectorAll('img, svg, [class*="icon"], [class*="play"], [class*="link"], a');
              const clickableIcons = [];
              
              icons.forEach((icon, iconIndex) => {
                const rect = icon.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) { // Elemento visível
                  clickableIcons.push({
                    element: icon,
                    index: iconIndex,
                    className: icon.className || '',
                    title: icon.title || '',
                    alt: icon.alt || '',
                    tagName: icon.tagName
                  });
                }
              });
              
              containers.push({
                trackNumber: text.trim(),
                trackText: parentText.replace(/\s+/g, ' ').trim(),
                containerIndex: containers.length,
                clickableIcons: clickableIcons.length
              });
              break;
            }
            parent = parent.parentElement;
          }
        }
      }
      
      return containers;
    });
    
    console.log(`📊 Encontradas ${trackContainers.length} faixas para processar`);
    
    const tracks = [];
    
    // Processar cada faixa individualmente
    for (let i = 0; i < trackContainers.length; i++) {
      const container = trackContainers[i];
      console.log(`\n🎵 Processando faixa ${container.trackNumber}: ${container.trackText.substring(0, 50)}...`);
      
      // Extrair título da faixa
      let title = container.trackText;
      const lines = title.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      for (let line of lines) {
        if (line.includes(' - ') && line.length > 10 && line.length < 200) {
          title = line.replace(/^\d+\s*/, '').trim();
          break;
        }
      }
      
      // Agora vamos clicar nos ícones desta faixa específica
      const links = await page.evaluate(async (containerIndex) => {
        const foundLinks = [];
        
        // Re-encontrar o container desta faixa
        const allElements = document.querySelectorAll('*');
        let trackContainer = null;
        let currentIndex = 0;
        
        for (let element of allElements) {
          const text = element.textContent || '';
          
          if (text.match(/^\s*0?\d{1,2}\s*$/) && text.trim().length <= 3) {
            let parent = element.parentElement;
            
            while (parent && parent !== document.body) {
              const parentText = parent.textContent || '';
              
              if (parentText.includes(' - ') && parentText.length > 20 && parentText.length < 500) {
                if (currentIndex === containerIndex) {
                  trackContainer = parent;
                  break;
                }
                currentIndex++;
                break;
              }
              parent = parent.parentElement;
            }
            
            if (trackContainer) break;
          }
        }
        
        if (!trackContainer) return foundLinks;
        
        // Encontrar todos os ícones clicáveis neste container
        const icons = trackContainer.querySelectorAll('img, svg, [class*="icon"], [class*="play"], [class*="link"], a, button, div[onclick], span[onclick]');
        
        console.log(`Encontrados ${icons.length} elementos clicáveis`);
        
        for (let icon of icons) {
          try {
            const rect = icon.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue; // Elemento não visível
            
            const context = (icon.className + ' ' + icon.title + ' ' + icon.alt + ' ' + (icon.getAttribute('onclick') || '')).toLowerCase();
            
            // Identificar se é um ícone de plataforma - PRIORIDADE: YouTube, SoundCloud, outros, Spotify por último
            let platform = '';
            if (context.includes('youtube')) platform = 'YouTube';
            else if (context.includes('soundcloud')) platform = 'SoundCloud';
            else if (context.includes('beatport')) platform = 'Beatport';
            else if (context.includes('apple')) platform = 'Apple Music';
            else if (context.includes('tidal')) platform = 'Tidal';
            else if (context.includes('deezer')) platform = 'Deezer';
            else if (context.includes('bandcamp')) platform = 'Bandcamp';
            else if (context.includes('spotify')) platform = 'Spotify'; // Spotify por último
            
            if (platform) {
              console.log(`Clicando no ícone do ${platform}...`);
              
              // Fazer scroll até o elemento
              icon.scrollIntoView({ behavior: 'smooth', block: 'center' });
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Clicar no ícone
              icon.click();
              
              // Aguardar um pouco para o link aparecer
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Procurar por links que podem ter aparecido
              const newLinks = document.querySelectorAll('a[href]');
              for (let link of newLinks) {
                const href = link.href;
                if (!href || href.length < 10) continue;
                
                const url = href.toLowerCase();
                let linkPlatform = '';
                
                // Mesma prioridade na identificação dos links
                if (url.includes('youtube.com') || url.includes('youtu.be')) linkPlatform = 'YouTube';
                else if (url.includes('soundcloud.com')) linkPlatform = 'SoundCloud';
                else if (url.includes('beatport.com')) linkPlatform = 'Beatport';
                else if (url.includes('music.apple.com')) linkPlatform = 'Apple Music';
                else if (url.includes('tidal.com')) linkPlatform = 'Tidal';
                else if (url.includes('deezer.com')) linkPlatform = 'Deezer';
                else if (url.includes('bandcamp.com')) linkPlatform = 'Bandcamp';
                else if (url.includes('spotify.com')) linkPlatform = 'Spotify'; // Spotify por último
                
                if (linkPlatform === platform) {
                  // Verificar se é um link novo/real
                  if (!foundLinks.some(existing => existing.url === href)) {
                    foundLinks.push({ platform: linkPlatform, url: href });
                    console.log(`✅ Link encontrado para ${platform}: ${href}`);
                  }
                }
              }
              
              // Aguardar mais um pouco antes do próximo clique
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (error) {
            console.log(`Erro ao clicar no ícone: ${error.message}`);
          }
        }
        
        return foundLinks;
      }, i);
      
      tracks.push({
        position: container.trackNumber,
        title: title.substring(0, 150),
        links: links
      });
      
      console.log(`   ✅ Faixa processada: ${links.length} links encontrados`);
    }
    
    // Resultados
    const resultado = {
      success: true,
      tracks: tracks,
      totalTracks: tracks.length,
      tracksWithLinks: tracks.filter(t => t.links.length > 0).length
    };
    
    console.log('\n🎉 EXTRAÇÃO COM CLIQUES COMPLETA!');
    console.log(`📊 Total: ${resultado.totalTracks} faixas`);
    console.log(`🔗 Com links: ${resultado.tracksWithLinks} faixas`);
    
    return resultado;
    
  } finally {
    console.log('\n💡 Navegador permanece aberto para verificação...');
    // await browser.close();
  }
}

// Executar
const url = 'https://www.1001tracklists.com/tracklist/p0wm1xt/joris-voorn-spectrum-radio-422-silo-brooklyn-united-states-2024-03-30-2025-05-23.html';

extrairLinksComCliques(url).then(resultado => {
  if (resultado && resultado.success) {
    console.log('\n🎵 MÚSICAS E LINKS ENCONTRADOS:');
    console.log('='.repeat(60));
    
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
    
    // Salvar resultado
    const fs = require('fs');
    fs.writeFileSync('links-extraidos.json', JSON.stringify(resultado, null, 2));
    console.log('💾 Links salvos em: links-extraidos.json');
    
  } else {
    console.log('❌ Extração falhou');
  }
}).catch(error => {
  console.error('💥 ERRO:', error.message);
}); 