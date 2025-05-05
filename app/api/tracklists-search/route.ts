import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { query } = await req.json();
  if (!query) {
    return NextResponse.json({ error: 'Query obrigatória.' }, { status: 400 });
  }
  try {
    // 1. Buscar o setlist
    const searchUrl = `https://www.1001tracklists.com/search/?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LegolasDownloader/1.0)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const html = await res.text();
    // 2. Pegar o link do primeiro resultado
    const match = html.match(/<a href="(\/tracklist\/[^"]+)"/);
    if (!match) {
      return NextResponse.json({ error: 'Nenhum setlist encontrado.' }, { status: 404 });
    }
    const setlistUrl = `https://www.1001tracklists.com${match[1]}`;
    // 3. Buscar a página do setlist
    const setlistRes = await fetch(setlistUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LegolasDownloader/1.0)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const setlistHtml = await setlistRes.text();
    // 4. Extrair faixas e links
    const trackBlocks = setlistHtml.match(/<div class="tlpItem[\s\S]*?<\/div>\s*<\/div>/g) || [];
    const results = trackBlocks.map(block => {
      const titleMatch = block.match(/<span class="trackFormat">([^<]+)<\/span>\s*-\s*<span class="trackTitle">([^<]+)<\/span>/);
      const artist = titleMatch ? titleMatch[1].trim() : '';
      const title = titleMatch ? titleMatch[2].trim() : '';
      const links: { platform: string; url: string }[] = [];
      // YouTube
      const ytMatch = block.match(/href="(https:\/\/www.youtube.com\/watch[^"]+)"/);
      if (ytMatch) links.push({ platform: 'YouTube', url: ytMatch[1] });
      // SoundCloud
      const scMatch = block.match(/href="(https:\/\/soundcloud.com\/[^"]+)"/);
      if (scMatch) links.push({ platform: 'SoundCloud', url: scMatch[1] });
      // Spotify
      const spMatch = block.match(/href="(https:\/\/open.spotify.com\/[^"]+)"/);
      if (spMatch) links.push({ platform: 'Spotify', url: spMatch[1] });
      return { artist, title, links };
    });
    return NextResponse.json({ setlistUrl, results });
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao buscar no 1001tracklists.' }, { status: 500 });
  }
} 