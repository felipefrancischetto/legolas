const puppeteer = require('puppeteer');

async function inspectPageData() {
  console.log('🔍 Inspecionando dados exatos das páginas das músicas...\n');
  
  // URLs específicas das músicas que testamos
  const tracks = [
    {
      name: 'Strobe - deadmau5',
      url: 'https://www.beatport.com/pt/track/strobe/1696999',
      expected: { bpm: 128, key: 'B Major', genre: 'Progressive House', label: 'Virgin' }
    },
    {
      name: 'Be Wise, Be Warned - Barac', 
      url: 'https://www.beatport.com/pt/track/be-wise-be-warned-o-rulers-of-the-earth/16078330',
      expected: { bpm: 127, key: 'F Minor', genre: 'Electronica', label: 'Cronos' }
    }
  ];

  const browser = await puppeteer.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    for (const track of tracks) {
      console.log(`\n🎵 Inspecionando: ${track.name}`);
      console.log(`🌐 URL: ${track.url}`);
      console.log(`🎯 Dados esperados: BPM=${track.expected.bpm}, Key=${track.expected.key}, Genre=${track.expected.genre}, Label=${track.expected.label}`);
      console.log('=' .repeat(100));

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      await page.goto(track.url, { waitUntil: 'networkidle0', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Tratar cookies
      try {
        await page.evaluate(() => {
          const cookieButtons = Array.from(document.querySelectorAll('button'));
          for (const button of cookieButtons) {
            const text = button.textContent?.toLowerCase() || '';
            if (text.includes('accept') || text.includes('aceitar')) {
              button.click();
              return true;
            }
          }
          return false;
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {}

      // Extrair TODOS os dados possíveis da página
      const pageData = await page.evaluate(() => {
        const result = {
          pageTitle: document.title,
          url: window.location.href,
          allText: document.body.textContent || '',
          htmlContent: document.body.innerHTML
        };

        // Buscar todos os elementos que podem conter metadados
        const selectors = [
          // Seletores específicos do Beatport
          '[class*="TrackMeta"]',
          '[class*="MetaItem"]', 
          '[class*="MetaWrapper"]',
          '[data-testid*="track"]',
          '.track-detail',
          '.track-info',
          '.track-stats',
          '.interior-track-content',
          // Seletores gerais
          'span',
          'div',
          'td',
          'p'
        ];

        result.elements = {};
        for (const selector of selectors) {
          try {
            const elements = Array.from(document.querySelectorAll(selector));
            result.elements[selector] = elements.map(el => ({
              text: el.textContent?.trim() || '',
              innerHTML: el.innerHTML || '',
              className: el.className || '',
              tagName: el.tagName || ''
            })).filter(item => item.text.length > 0 && item.text.length < 200);
          } catch (e) {
            result.elements[selector] = [];
          }
        }

        // Buscar padrões específicos no texto
        const text = result.allText;
        result.patterns = {
          bpm: text.match(/(\d{2,3})\s*BPM/gi) || [],
          bpm2: text.match(/BPM[:\s]*(\d{2,3})/gi) || [],
          key: text.match(/([A-G][#♯♭b]?\s*(?:maj|min|Major|Minor))/gi) || [],
          tom: text.match(/Tom[:\s]*([A-G][#♯♭b]?\s*(?:maj|min|Major|Minor))/gi) || [],
          genre: text.match(/(Progressive House|Electronica|Tech House|Big Room|Trance|House)/gi) || [],
          label: text.match(/(Virgin|Cronos|STMPD|Revealed|Armada|Ultra|Spinnin)/gi) || []
        };

        return result;
      });

      console.log(`\n📄 Título da página: ${pageData.pageTitle}`);
      console.log(`🔗 URL atual: ${pageData.url}`);
      
      console.log(`\n🔍 Padrões encontrados no texto:`);
      console.log(`   BPM patterns: ${JSON.stringify(pageData.patterns.bpm)}`);
      console.log(`   BPM2 patterns: ${JSON.stringify(pageData.patterns.bpm2)}`);
      console.log(`   Key patterns: ${JSON.stringify(pageData.patterns.key)}`);
      console.log(`   Tom patterns: ${JSON.stringify(pageData.patterns.tom)}`);
      console.log(`   Genre patterns: ${JSON.stringify(pageData.patterns.genre)}`);
      console.log(`   Label patterns: ${JSON.stringify(pageData.patterns.label)}`);

      // Buscar elementos que contêm os dados esperados
      console.log(`\n🎯 Elementos que contêm dados esperados:`);
      
      for (const [selector, elements] of Object.entries(pageData.elements)) {
        const relevantElements = elements.filter(el => {
          const text = el.text.toLowerCase();
          return (
            text.includes(track.expected.bpm.toString()) ||
            text.includes(track.expected.key.toLowerCase()) ||
            text.includes(track.expected.genre.toLowerCase()) ||
            text.includes(track.expected.label.toLowerCase()) ||
            text.includes('bpm') ||
            text.includes('tom') ||
            text.includes('genre') ||
            text.includes('gênero') ||
            text.includes('label') ||
            text.includes('gravadora')
          );
        });

        if (relevantElements.length > 0) {
          console.log(`\n   📍 Seletor: ${selector}`);
          relevantElements.forEach((el, i) => {
            console.log(`      ${i + 1}. "${el.text}" (${el.tagName}, class: "${el.className}")`);
          });
        }
      }

      await page.close();
    }

  } finally {
    await browser.close();
  }

  console.log(`\n🏁 Inspeção concluída!`);
}

inspectPageData().catch(console.error); 