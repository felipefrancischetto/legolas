import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getDownloadsPath } from '@/app/api/utils/common';
import {
  fetchLibraryFiles,
  deriveArtistsFromFiles,
  mergeArtists,
  type ArtistsFile,
  type CuratedArtist,
} from '@/lib/services/artistLibrary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getArtistsFilePath(): Promise<string> {
  const downloadsFolder = await getDownloadsPath();
  return join(downloadsFolder, 'artists.json');
}

async function readArtistsFile(path: string): Promise<ArtistsFile | null> {
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.artists)) return parsed as ArtistsFile;
  } catch (err) {
    console.warn('⚠️ [artists] Falha ao ler artists.json:', err);
  }
  return null;
}

async function writeArtistsFile(path: string, data: ArtistsFile): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * GET → retorna a lista curada de artistas. Se artists.json não existir,
 * deriva da biblioteca (via /api/files) e cria o arquivo.
 */
export async function GET(request: NextRequest) {
  try {
    const path = await getArtistsFilePath();
    const existing = await readArtistsFile(path);
    if (existing) {
      return NextResponse.json(existing);
    }

    const files = await fetchLibraryFiles(request);
    const derived = deriveArtistsFromFiles(files);
    const nowIso = new Date().toISOString();
    const artists = mergeArtists(derived, [], nowIso);
    const data: ArtistsFile = { updatedAt: nowIso, artists };
    await writeArtistsFile(path, data);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ [artists] GET:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST → ações de gerenciamento:
 *  - { action: 'sync' }  : re-scan da biblioteca e merge (preserva edições).
 *  - { action: 'update', artists } : persiste edições (enable/disable/remover).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    const path = await getArtistsFilePath();
    const nowIso = new Date().toISOString();

    if (action === 'sync') {
      const existing = (await readArtistsFile(path))?.artists ?? [];
      const files = await fetchLibraryFiles(request);
      const derived = deriveArtistsFromFiles(files);
      const artists = mergeArtists(derived, existing, nowIso);
      const data: ArtistsFile = { updatedAt: nowIso, artists };
      await writeArtistsFile(path, data);
      return NextResponse.json(data);
    }

    if (action === 'update') {
      if (!Array.isArray(body.artists)) {
        return NextResponse.json({ error: 'Campo "artists" inválido' }, { status: 400 });
      }
      const artists: CuratedArtist[] = body.artists
        .filter((a: any) => a && typeof a.name === 'string' && a.name.trim())
        .map((a: any) => ({
          name: String(a.name).trim(),
          trackCount: Number.isFinite(a.trackCount) ? a.trackCount : 0,
          lastSeen: typeof a.lastSeen === 'string' ? a.lastSeen : nowIso,
          enabled: a.enabled !== false,
        }));
      const data: ArtistsFile = { updatedAt: nowIso, artists };
      await writeArtistsFile(path, data);
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ [artists] POST:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
