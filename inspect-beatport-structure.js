// Script para inspecionar a estrutura HTML do Beatport
const puppeteer = require('puppeteer');

async function inspectBeatportStructure() {
  console.log('🔍 Inspecionando estrutura HTML do Beatport...\n');
  
  const browser = await puppeteer.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Ir direto para uma track conhecida
    const trackUrl = 'https://www.beatport.com/track/animals/4459187';
    console.log(`🌐 Navegando para: ${trackUrl}`);
    
    await page.goto(trackUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log(`📄 Título: ${await page.title()}`);
    console.log(`🔗 URL: ${page.url()}\n`);
    
    // Inspecionar toda a estrutura da página
    const pageStructure = await page.evaluate(() => {
      console.log('🔍 Analisando estrutura da página...');
      
      // Buscar por texto que contenha BPM, Key, Genre, Label
      const allElements = document.querySelectorAll('*');
      const relevantElements = [];
      
      // Buscar elementos que contenham informações de metadados
      const keywords = ['BPM', 'Key', 'Genre', 'Label', 'Electronica', 'Progressive', 'Trance', 'House'];
      
      for (const element of allElements) {
        const text = element.textContent?.trim() || '';
        
        for (const keyword of keywords) {
          if (text.includes(keyword) && text.length < 200) {
            relevantElements.push({
              tag: element.tagName,
              text: text,
              className: element.className,
              id: element.id,
              innerHTML: element.innerHTML?.slice(0, 300),
              selector: getSelector(element)
            });
            break;
          }
        }
      }
      
      // Helper para gerar seletor CSS
      function getSelector(element) {
        if (element.id) return `#${element.id}`;
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c && !c.match(/^\d/));
          if (classes.length > 0) return `.${classes.join('.')}`;
        }
        return element.tagName.toLowerCase();
      }
      
      // Buscar especificamente por números que parecem BPM (80-200)
      const bodyText = document.body.textContent || '';
      const bpmMatches = bodyText.match(/\b(8[0-9]|9[0-9]|1[0-9][0-9]|200)\b/g) || [];
      
      // Buscar por keys musicais
      const keyMatches = bodyText.match(/\b([A-G][#♯♭b]?\s*(maj|min|major|minor))\b/gi) || [];
      
      console.log('📊 Elementos relevantes encontrados:', relevantElements.length);
      console.log('🎵 Possíveis BPMs:', bpmMatches);
      console.log('🔑 Possíveis Keys:', keyMatches);
      
      return {
        relevantElements: relevantElements.slice(0, 20), // Limitar para não sobrecarregar
        possibleBPMs: bpmMatches,
        possibleKeys: keyMatches,
        pageText: bodyText.slice(0, 1000) // Primeiro KB do texto
      };
    });
    
    console.log('📊 Estrutura da página analisada:\n');
    
    console.log('🎵 Possíveis BPMs encontrados:', pageStructure.possibleBPMs);
    console.log('🔑 Possíveis Keys encontradas:', pageStructure.possibleKeys);
    
    console.log('\n📋 Elementos relevantes:');
    pageStructure.relevantElements.forEach((el, i) => {
      console.log(`\n${i + 1}. ${el.tag} (${el.selector})`);
      console.log(`   Classes: ${el.className}`);
      console.log(`   Texto: "${el.text}"`);
      console.log(`   HTML: ${el.innerHTML?.slice(0, 100)}...`);
    });
    
    console.log('\n📝 Primeiro KB do texto da página:');
    console.log(pageStructure.pageText);
    
    // Buscar especificamente por divs com dados estruturados
    const structuredData = await page.evaluate(() => {
      // Buscar por diferentes padrões de organização de dados
      const patterns = [
        '.track-details',
        '.track-info',
        '.track-data',
        '.metadata',
        '.track-stats',
        '.details',
        '[data-testid]',
        '.track-detail'
      ];
      
      const results = {};
      
      for (const pattern of patterns) {
        const elements = document.querySelectorAll(pattern);
        if (elements.length > 0) {
          results[pattern] = Array.from(elements).map(el => ({
            text: el.textContent?.slice(0, 200),
            html: el.innerHTML?.slice(0, 300),
            classes: el.className
          }));
        }
      }
      
      return results;
    });
    
    console.log('\n🏗️  Dados estruturados encontrados:');
    Object.entries(structuredData).forEach(([selector, elements]) => {
      console.log(`\n${selector} (${elements.length} elementos):`);
      elements.forEach((el, i) => {
        console.log(`  ${i + 1}. "${el.text?.slice(0, 100)}..."`);
      });
    });
    
    console.log('\n⏳ Aguardando 30 segundos para inspeção manual...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await browser.close();
  }
}

inspectBeatportStructure().catch(console.error); 