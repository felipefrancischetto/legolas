// 🎵 SCRAPER SIMPLES E DIRETO - SÓ PEGA OS LINKS!
const axios = require('axios');
const cheerio = require('cheerio');

// Headers realistas
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1'
};

async function scrapeMusicLinks(url) {
  console.log('🎵 Extraindo links da playlist...');
  
  try {
    // Fazer request simples
    const response = await axios.get(url, { 
      headers,
      timeout: 10000,
      validateStatus: (status) => status < 500
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const $ = cheerio.load(response.data);
    const tracks = [];

    // Extrair título da playlist
    const playlistTitle = $('h1').first().text().trim() || 'Playlist';
    const artist = $('.artistName').first().text().trim() || 'Unknown Artist';

    console.log(`📀 Playlist: ${playlistTitle}`);
    console.log(`🎧 Artist: ${artist}`);
    console.log('🔍 Procurando faixas...\n');

    // Procurar por faixas em diferentes seletores
    const trackSelectors = [
      'tr.tlpItem',
      '.tlpItem', 
      '.track-item',
      '.tracklist-item',
      'tr[class*="track"]'
    ];

    let foundTracks = false;
    
    for (const selector of trackSelectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`✅ Encontrado ${elements.length} faixas com seletor: ${selector}`);
        foundTracks = true;
        
        elements.each((index, element) => {
          const $track = $(element);
          
          // Extrair nome da faixa
          const titleSelectors = ['.trackValue', '.track-title', '.title', '.name'];
          let trackTitle = '';
          
          for (const titleSel of titleSelectors) {
            const title = $track.find(titleSel).text().trim();
            if (title) {
              trackTitle = title;
              break;
            }
          }
          
          if (!trackTitle) {
            trackTitle = $track.text().trim().split('\n')[0].trim();
          }
          
          if (!trackTitle || trackTitle.length < 3) return;
          
          // Extrair links
          const links = [];
          $track.find('a').each((_, linkElem) => {
            const href = $(linkElem).attr('href');
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
            else return; // Ignorar outros links
            
            links.push({ platform, url: href });
          });
          
          if (trackTitle) {
            tracks.push({
              position: index + 1,
              title: trackTitle.substring(0, 100),
              links: links
            });
          }
        });
        
        break; // Encontrou faixas, sair do loop
      }
    }
    
    if (!foundTracks) {
      console.log('❌ Nenhuma faixa encontrada. Conteúdo da página:');
      console.log($('body').text().substring(0, 500) + '...');
    }

    return {
      success: true,
      playlist: {
        title: playlistTitle,
        artist: artist,
        url: url
      },
      tracks: tracks,
      totalTracks: tracks.length,
      tracksWithLinks: tracks.filter(t => t.links.length > 0).length
    };

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return {
      success: false,
      error: error.message,
      tracks: []
    };
  }
}

module.exports = { scrapeMusicLinks }; 