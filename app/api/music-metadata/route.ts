import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { title, artist } = await req.json();
  const prompt = `Você é um especialista em música. Dado o título e artista abaixo, retorne um JSON com os campos: titulo, artista, album, ano, genero, e uma breve descricao. Se não souber algum campo, deixe vazio.\n\nTítulo: ${title}\nArtista: ${artist}\n\nResponda apenas com o JSON, sem explicações.`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY não configurada.' }, { status: 500 });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  let metadata = {};
  try {
    metadata = JSON.parse(content);
  } catch {
    metadata = { titulo: title, artista: artist };
  }

  return NextResponse.json(metadata);
} 