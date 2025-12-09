import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

interface Track {
  titulo: string;
  youtube: string | null;
  soundcloud: string | null;
  spotify: string | null;
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url || !url.startsWith('https://www.1001tracklists.com/tracklist/')) {
    return NextResponse.json({ error: 'URL inválida do 1001tracklists.' }, { status: 400 });
  }

  try {
    const browser = await puppeteer.launch({
      headless: false, // Browser visível para debug
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Referer': 'https://www.1001tracklists.com/',
    });

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    const results = await page.evaluate(() => {
      const tracks: Track[] = [];
      const trackElements = document.querySelectorAll('#tlTab .tlpTog');
      
      trackElements.forEach((element) => {
        const track: Track = {
          titulo: '',
          youtube: null,
          soundcloud: null,
          spotify: null
        };

        // Pegar o título da música
        const trackValue = element.querySelector('.trackValue');
        let artist = '';
        let title = '';
        if (trackValue) {
          const artistElement = trackValue.querySelector('.blueTxt:first-child');
          const titleElement = trackValue.querySelector('.blueTxt:not(:first-child)');
          artist = artistElement?.textContent?.trim() || '';
          title = titleElement?.textContent?.trim() || '';
          track.titulo = `${artist} - ${title}`;
        }

        // Procurar links diretos (caso existam)
        const mediaRow = element.querySelector('.mediaRow');
        if (mediaRow) {
          // Procurar <a> para cada plataforma
          const youtubeA = Array.from(mediaRow.querySelectorAll('a')).find(a => a.href.includes('youtube.com'));
          const soundcloudA = Array.from(mediaRow.querySelectorAll('a')).find(a => a.href.includes('soundcloud.com'));
          const spotifyA = Array.from(mediaRow.querySelectorAll('a')).find(a => a.href.includes('spotify.com'));

          if (youtubeA) track.youtube = youtubeA.href;
          if (soundcloudA) track.soundcloud = soundcloudA.href;
          if (spotifyA) track.spotify = spotifyA.href;
        }

        // Se não houver link direto, gerar link de busca
        const tituloBusca = encodeURIComponent(track.titulo);
        if (!track.youtube && track.titulo) track.youtube = `https://www.youtube.com/results?search_query=${tituloBusca}`;
        if (!track.soundcloud && track.titulo) track.soundcloud = `https://soundcloud.com/search?q=${tituloBusca}`;
        if (!track.spotify && track.titulo) track.spotify = `https://open.spotify.com/search/${tituloBusca}`;

        tracks.push(track);
      });

      return { tracks };
    });

    await browser.close();
    return NextResponse.json({ results });
  } catch (err) {
    console.error('Erro ao buscar o setlist:', err);
    return NextResponse.json({ error: 'Erro ao buscar o setlist.' }, { status: 500 });
  }
} 