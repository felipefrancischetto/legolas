import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { query } = await req.json();
  if (!query) {
    return NextResponse.json({ error: 'Query obrigatória.' }, { status: 400 });
  }
  try {
    const searchUrl = `https://soundcloud.com/search/sounds?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LegolasDownloader/1.0)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const html = await res.text();
    // Extrai o primeiro link de música usando regex simples
    const match = html.match(/<a href="(\/[^\"]+)"\s*title="Play"/);
    if (match && match[1]) {
      const url = `https://soundcloud.com${match[1]}`;
      return NextResponse.json({ url });
    }
    return NextResponse.json({ error: 'Nenhuma música encontrada.' }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao buscar no SoundCloud.' }, { status: 500 });
  }
} 