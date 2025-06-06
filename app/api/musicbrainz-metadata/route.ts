import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { title, artist } = await req.json();
  if (!title) {
    return NextResponse.json({ error: 'Título é obrigatório.' }, { status: 400 });
  }
  // Monta a query para MusicBrainz
  let query = `recording:${title}`;
  if (artist) query += `%20AND%20artist:${artist}`;
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=1`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'LegolasDownloader/1.0 (seu-email@exemplo.com)',
      },
    });
    const data = await response.json();
    const rec = data.recordings?.[0];
    if (!rec) return NextResponse.json({});
    // Logar o objeto completo para depuração
    console.log('MusicBrainz recording:', JSON.stringify(rec, null, 2));
    // Extrai metadados principais
    const label = rec.releases?.[0]?.['label-info']?.[0]?.label?.name || '';
    // Extrai todos os gêneros/tags relevantes
    let generos = '';
    if (rec.tags && Array.isArray(rec.tags)) {
      generos = rec.tags.map((t: any) => t.name).join(', ');
    }
    // Logar possíveis campos de gênero
    console.log('rec.tags:', rec.tags);
    console.log('rec.genres:', rec.genres);
    console.log('rec.releases[0].genres:', rec.releases?.[0]?.genres);
    const metadata = {
      titulo: rec.title,
      artista: rec['artist-credit']?.[0]?.name || '',
      album: rec.releases?.[0]?.title || '',
      ano: rec.releases?.[0]?.date?.slice(0, 4) || '',
      genero: generos,
      label,
      descricao: '',
    };
    return NextResponse.json(metadata);
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao buscar metadados.' }, { status: 500 });
  }
} 