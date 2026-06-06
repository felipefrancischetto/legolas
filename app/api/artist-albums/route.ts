import { NextRequest, NextResponse } from 'next/server';
import { fetchArtistReleases } from '@/lib/services/artistReleases';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Álbuns de um artista direto do YouTube Music (filtro "Albums").
 *
 * Diferente de /api/search-albums (busca por NOME de álbum), aqui usamos o
 * filtro de álbuns do YT Music sobre o NOME DO ARTISTA. A extração vive em
 * lib/services/artistReleases.ts e é compartilhada com /api/artist-feed.
 */
export async function GET(request: NextRequest) {
  const artist = (request.nextUrl.searchParams.get('artist') || '').trim();
  if (!artist) return NextResponse.json({ error: 'artist é obrigatório' }, { status: 400 });

  try {
    const { releases, image } = await fetchArtistReleases(artist);
    return NextResponse.json({ success: true, albums: releases, image });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ [artist-albums]:', message);
    return NextResponse.json({ success: false, albums: [], error: message }, { status: 500 });
  }
}
