import { NextRequest, NextResponse } from 'next/server';
import ytdl from 'ytdl-core';

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Busca o vídeo no YouTube usando a API do ytdl-core
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl);
    const html = await response.text();
    
    // Extrai o ID do primeiro vídeo encontrado
    const videoIdMatch = html.match(/"videoId":"([^"]+)"/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;

    if (!videoId) {
      return NextResponse.json({ error: 'No video found' }, { status: 404 });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    return NextResponse.json({
      videoId,
      videoUrl
    });
  } catch (error) {
    console.error('Error searching YouTube:', error);
    return NextResponse.json({ error: 'Failed to search YouTube' }, { status: 500 });
  }
} 