import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { album } = await request.json();
    if (!album) {
      return NextResponse.json({ error: 'Nome do álbum é obrigatório.' }, { status: 400 });
    }
    console.log(`🔎 [API] Buscar release Beatport para álbum: ${album}`);

    // Puppeteer dinâmico (Next.js edge/server)
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // 1. Buscar releases pelo nome do álbum
    const searchUrl = `https://www.beatport.com/search/releases?q=${encodeURIComponent(album)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 45000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 2. Aceitar cookies se necessário (melhorado)
    try {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        for (const btn of btns) {
          const txt = (btn.textContent || '').toLowerCase();
          if (txt.includes('accept') || txt.includes('aceitar') || txt.includes('i accept') || txt.includes('essential only')) {
            btn.click();
          }
        }
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {}

    // 3. Encontrar a release mais relevante
    const releaseUrl = await page.evaluate((album) => {
      const links = Array.from(document.querySelectorAll('a[href*="/release/"]'));
      let bestHref = null;
      let bestScore = -999;
      for (const link of links) {
        const text = (link.textContent || '').trim().toLowerCase();
        let score = 0;
        if (text === album.toLowerCase()) score += 1000;
        if (text.includes(album.toLowerCase())) score += 500;
        if (score > bestScore) {
          bestScore = score;
          const href = link.getAttribute('href');
          bestHref = href && href.startsWith('http') ? href : 'https://www.beatport.com' + href;
        }
      }
      return bestHref;
    }, album);

    if (!releaseUrl) {
      await browser.close();
      return NextResponse.json({ error: 'Release não encontrada no Beatport.' }, { status: 404 });
    }

    // 4. Acessar página da release
    await page.goto(releaseUrl, { waitUntil: 'networkidle0', timeout: 45000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Aceitar cookies novamente se aparecerem
    try {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        for (const btn of btns) {
          const txt = (btn.textContent || '').toLowerCase();
          if (txt.includes('accept') || txt.includes('aceitar') || txt.includes('i accept') || txt.includes('essential only')) {
            btn.click();
          }
        }
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {}

    // 4.1. Aguardar a presença da tabela de faixas
    await page.waitForSelector('table', { timeout: 15000 });

    // DEBUG: logar HTML do header e da tabela de faixas
    const headerHtml = await page.evaluate(() => {
      const header = document.querySelector('h1')?.parentElement;
      return header ? header.innerHTML : '';
    });
    const tableHtml = await page.evaluate(() => {
      const table = document.querySelector('table');
      return table ? table.innerHTML : '';
    });
    console.log('HEADER HTML:', headerHtml?.slice(0, 1000));
    console.log('TABLE HTML:', tableHtml?.slice(0, 1000));

    // 5. Extrair metadados da release e faixas
    let scrapingResult;
    try {
      scrapingResult = await page.evaluate(() => {
        try {
          // Metadados principais
          const meta = {
            album: '',
            label: '',
            year: '',
            releaseDate: '',
            artists: '',
            cover: '',
            catalogNumber: '',
          };
          // Nome do álbum
          const h1 = document.querySelector('h1');
          if (h1) meta.album = h1.textContent?.trim() || '';
          // Artista principal: primeiro <a> após o <h1>
          let artistMain = null;
          if (h1) {
            let el = h1.nextElementSibling;
            while (el) {
              if (el.tagName === 'A' && el.getAttribute('href')?.includes('/artist/')) {
                artistMain = el.textContent?.trim();
                break;
              }
              el = el.nextElementSibling;
            }
          }
          if (artistMain) meta.artists = artistMain;
          // Label
          const labelEl = document.querySelector('a[href*="/label/"]');
          if (labelEl) meta.label = labelEl.textContent?.trim() || '';
          // Data de lançamento e ano
          const releaseDateEl = Array.from(document.querySelectorAll('li, span')).find(el => el.textContent?.toLowerCase().includes('data de lançamento'));
          if (releaseDateEl && releaseDateEl.textContent) {
            const match = releaseDateEl.textContent.match(/\d{4}-\d{2}-\d{2}/);
            if (match) meta.releaseDate = match[0];
            if (match) meta.year = match[0].slice(0, 4);
          }
          // Número do catálogo
          let catalogNumber = '';
          const catalogEl = Array.from(document.querySelectorAll('li, span')).find(el => el.textContent && el.textContent.match(/cat(á|a)logo/i));
          if (catalogEl && catalogEl.textContent) {
            const match = catalogEl.textContent.match(/([A-Z0-9]{4,})/);
            if (match) catalogNumber = match[1];
          }
          meta.catalogNumber = catalogNumber;
          // Capa
          const img = document.querySelector('img[src*="cloudfront"], img[alt*="cover"]');
          if (img) meta.cover = img.getAttribute('src') || '';
          // Faixas: primeira <table> após o header
          let tracks: any[] = [];
          let table = document.querySelector('table');
          if (table) {
            // Mapear colunas pelo cabeçalho
            const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent?.toLowerCase().trim() || '');
            const rows = Array.from(table.querySelectorAll('tbody tr'));
            rows.forEach(row => {
              const tds = Array.from(row.querySelectorAll('td'));
              let track: any = {};
              headers.forEach((header, idx) => {
                const val = tds[idx]?.textContent?.trim() || '';
                if (header.includes('título')) track.title = val;
                if (header.includes('artista')) track.artists = val;
                if (header.includes('gravadora')) track.label = val;
                if (header.includes('gênero')) track.genre = val;
                if (header.includes('bpm')) track.bpm = val;
                if (header.includes('tom')) track.key = val;
                if (header.includes('dura')) track.duration = val;
                if (header.includes('remix')) track.remixers = val;
                if (header.includes('lançamento')) track.releaseDate = val;
              });
              // Fallback para título: pegar <span> se existir
              if (!track.title) {
                const spanTitle = row.querySelector('span[data-testid*="track-title"], .buk-track-primary-title, .track-title, .bucket-item__title, .track__title');
                if (spanTitle) track.title = spanTitle.textContent?.trim() || '';
              }
              if (track.title) tracks.push(track);
            });
          }
          return { metadata: meta, tracks, error: null };
        } catch (err) {
          return { metadata: {}, tracks: [], error: err instanceof Error ? err.message : String(err) };
        }
      });
    } catch (err) {
      console.error('❌ [API] Erro JS no page.evaluate:', err);
      await browser.close();
      return NextResponse.json({ error: 'Erro JS no scraping: ' + (err instanceof Error ? err.message : String(err)) }, { status: 500 });
    }
    await browser.close();
    if (scrapingResult.error) {
      console.error('❌ [API] Erro no scraping:', scrapingResult.error);
      return NextResponse.json({ error: 'Erro no scraping: ' + scrapingResult.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, album, metadata: scrapingResult.metadata, tracks: scrapingResult.tracks, releaseUrl });
  } catch (error) {
    console.error('❌ [API] Erro ao buscar release Beatport:', error);
    return NextResponse.json({ error: 'Erro ao buscar release Beatport.' }, { status: 500 });
  }
} 