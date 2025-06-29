// VERSÃO CORRIGIDA: BeatportProviderV2 com JavaScript 100% puro
class BeatportProviderV2Fixed {
  constructor() {
    this.name = 'BeatportV2';
  }

  async isConfigured() {
    return true;
  }

  async search(title, artist) {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ 
      headless: false, // Browser visível
      devtools: false,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080',
        '--start-maximized'
      ]
    });
    
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Buscar na página de search
      const searchUrl = `https://www.beatport.com/search?q=${encodeURIComponent(`${artist} ${title}`)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 45000 });
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      // Tratar cookies com JavaScript puro
      try {
        await page.evaluate(function() {
          var cookieButtons = Array.from(document.querySelectorAll('button'));
          for (var i = 0; i < cookieButtons.length; i++) {
            var button = cookieButtons[i];
            var text = (button.textContent || '').toLowerCase();
            if (text.includes('accept') || text.includes('aceitar')) {
              button.click();
              return true;
            }
          }
          return false;
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {}
      
      // Buscar melhor track com JavaScript puro
      const trackUrl = await page.evaluate(function(searchTitle, searchArtist) {
        var links = Array.from(document.querySelectorAll('a[href*="/track/"]'));
        var bestHref = null;
        var bestScore = -999;
        
        for (var i = 0; i < links.length; i++) {
          var link = links[i];
          var text = (link.textContent || '').trim().toLowerCase();
          var score = 0;
          
          if (text.includes(searchTitle.toLowerCase())) score += 500;
          if (text.includes(searchArtist.toLowerCase())) score += 200;
          if (text.includes('original mix')) score += 100;
          
          if (score > bestScore) {
            bestScore = score;
            var href = link.getAttribute('href');
            bestHref = (href && href.startsWith('http')) ? href : 'https://www.beatport.com' + href;
          }
        }
        
        return bestHref;
      }, title, artist);
      
      if (!trackUrl) {
        // Browser permanece aberto para debug
        console.log('🌐 Nenhum track encontrado. Browser mantido aberto para inspeção.');
        // await browser.close();
        return null;
      }
      
      await page.goto(trackUrl, { waitUntil: 'networkidle0', timeout: 45000 });
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      // Tratar cookies novamente
      try {
        await page.evaluate(function() {
          var cookieButtons = Array.from(document.querySelectorAll('button'));
          for (var i = 0; i < cookieButtons.length; i++) {
            var button = cookieButtons[i];
            var text = (button.textContent || '').toLowerCase();
            if (text.includes('accept') || text.includes('aceitar')) {
              button.click();
              return true;
            }
          }
          return false;
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {}
      
      // Extração com JavaScript 100% puro baseada nos padrões identificados
      const metadata = await page.evaluate(function() {
        var bodyText = document.body.textContent || '';
        
        // BPM: buscar padrão exato "BPM:127"
        var bpm = null;
        var bmpMatch = bodyText.match(/BPM:(\d{2,3})/);
        if (bmpMatch) {
          var bmpValue = parseInt(bmpMatch[1]);
          if (bmpValue >= 80 && bmpValue <= 200) {
            bpm = bmpValue;
          }
        }
        
        // Key: buscar padrão exato "Tom:F Minor"
        var key = null;
        var keyMatch = bodyText.match(/Tom:([A-G][#♯♭b]?\s*(?:Min|Maj|Minor|Major))/);
        if (keyMatch) {
          key = keyMatch[1]
            .replace(/\bMin\b/g, 'Minor')
            .replace(/\bMaj\b/g, 'Major')
            .replace(/\s+/g, ' ')
            .trim();
        }
        
        // Genre: buscar padrão exato "Gênero:Electronica"
        var genre = null;
        var genreMatch = bodyText.match(/Gênero:(Progressive House|Electronica|Tech House|House|Trance|Big Room)/);
        if (genreMatch) {
          genre = genreMatch[1];
        }
        
        // Label: buscar padrão exato "Gravadora:Cronos"
        var label = null;
        var labelMatch = bodyText.match(/Gravadora:(Virgin|Cronos|STMPD RCRDS|Revealed|Armada|Ultra|Spinnin)/);
        if (labelMatch) {
          label = labelMatch[1];
        }
        
        // Artist do título da página
        var artist = '';
        var pageTitle = document.title;
        if (pageTitle) {
          var artistMatch = pageTitle.match(/^(.+?)\s*-\s*/);
          if (artistMatch) {
            artist = artistMatch[1].trim();
          }
        }
        
        return {
          artist: artist,
          bpm: bpm,
          key: key,
          genre: genre,
          label: label
        };
      });
      
      await browser.close();
      
      if (!metadata || (!metadata.bmp && !metadata.key && !metadata.genre && !metadata.label && !metadata.artist)) {
        return null;
      }
      
      return metadata;
      
    } catch (error) {
      console.error('❌ [BeatportV2] Erro:', error.message);
      await browser.close();
      return null;
    }
  }
}

module.exports = { BeatportProviderV2Fixed }; 