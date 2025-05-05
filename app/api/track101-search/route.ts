import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { query } = await req.json();
  if (!query) {
    return NextResponse.json({ error: 'Query obrigatória.' }, { status: 400 });
  }
  try {
    const searchUrl = `https://track101.com/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LegolasDownloader/1.0)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const html = await res.text();
    // Extrai blocos de músicas
    const musicBlocks = html.match(/<div class="track-result"[\s\S]*?<\/div>\s*<\/div>/g) || [];
    const results = musicBlocks.map(block => {
      const titleMatch = block.match(/<div class="track-title">([^<]+)<\/div>/);
      const title = titleMatch ? titleMatch[1].trim() : '';
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
      return { title, links };
    });
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao buscar no track101.' }, { status: 500 });
  }
} 