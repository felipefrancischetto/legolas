// 🔍 INSPETOR DE PÁGINA - VER ESTRUTURA REAL
const { chromium } = require('playwright');

async function inspecionarPagina(url) {
  console.log('🔍 Inspecionando estrutura da página...');
  
  const browser = await chromium.launch({ 
    headless: false, // Mostrar navegador
    timeout: 30000 
  });

  try {
    const page = await browser.newPage();
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    console.log('🌐 Carregando página...');
    await page.goto(url, { waitUntil: 'networkidle' });
    
    // Aguardar carregar completamente
    await page.waitForTimeout(5000);
    
    // Inspecionar elementos da página
    const estrutura = await page.evaluate(() => {
      const info = {
        title: document.title,
        h1: document.querySelector('h1')?.textContent?.trim(),
        bodyClasses: document.body.className,
        allSelectors: []
      };
      
      // Procurar possíveis elementos de faixas
      const possibleSelectors = [
        'tr[class*="track"]',
        'tr[class*="tlp"]', 
        'div[class*="track"]',
        'li[class*="track"]',
        '.track',
        '.song',
        '.tracklist',
        'table tr',
        '[data-track]'
      ];
      
      possibleSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          info.allSelectors.push({
            selector: selector,
            count: elements.length,
            firstElementHTML: elements[0].outerHTML.substring(0, 200),
            classes: elements[0].className
          });
        }
      });
      
      // Listar todas as classes que contêm "track" ou "song"
      const allElements = document.querySelectorAll('*');
      const trackClasses = new Set();
      
      allElements.forEach(el => {
        if (el.className && typeof el.className === 'string') {
          const classes = el.className.split(' ');
          classes.forEach(cls => {
            if (cls.toLowerCase().includes('track') || 
                cls.toLowerCase().includes('song') || 
                cls.toLowerCase().includes('tlp')) {
              trackClasses.add(cls);
            }
          });
        }
      });
      
      info.trackClasses = Array.from(trackClasses);
      
      return info;
    });
    
    console.log('\n📊 ESTRUTURA DA PÁGINA:');
    console.log('='.repeat(50));
    console.log(`Título: ${estrutura.title}`);
    console.log(`H1: ${estrutura.h1}`);
    console.log(`Body classes: ${estrutura.bodyClasses}`);
    
    console.log('\n🎵 POSSÍVEIS ELEMENTOS DE FAIXAS:');
    if (estrutura.allSelectors.length > 0) {
      estrutura.allSelectors.forEach(item => {
        console.log(`\n✅ Seletor: ${item.selector}`);
        console.log(`   Quantidade: ${item.count}`);
        console.log(`   Classes: ${item.classes}`);
        console.log(`   HTML: ${item.firstElementHTML}...`);
      });
    } else {
      console.log('❌ Nenhum elemento encontrado com seletores padrão');
    }
    
    console.log('\n🏷️ CLASSES RELACIONADAS A TRACKS:');
    console.log(estrutura.trackClasses);
    
    // Aguardar para inspecionar manualmente
    console.log('\n⏳ Deixando navegador aberto por 30 segundos para inspeção manual...');
    await page.waitForTimeout(30000);
    
  } finally {
    await browser.close();
  }
}

// URL para inspecionar
const url = 'https://www.1001tracklists.com/tracklist/p0wm1xt/joris-voorn-spectrum-radio-422-silo-brooklyn-united-states-2024-03-30-2025-05-23.html';

inspecionarPagina(url).catch(console.error); 