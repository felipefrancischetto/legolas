import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getDownloadsPath } from '@/app/api/utils/common';
import {
  fetchLibraryFiles,
  deriveArtistsFromFiles,
  mergeArtists,
  normalizeName,
  type ArtistsFile,
  type CuratedArtist,
  type FeedCacheFile,
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
 * Poda o cache do feed (artist-feed-cache.json) para conter apenas artistas
 * habilitados. Sem isso, remover/pausar um artista só reflete após o próximo
 * refresh do feed (TTL de 12h) — ele "voltaria" ao recarregar a página.
 */
async function pruneFeedCacheToEnabled(downloadsFolder: string, artists: CuratedArtist[]): Promise<void> {
  const cachePath = join(downloadsFolder, 'artist-feed-cache.json');
  if (!existsSync(cachePath)) return;
  try {
    const cache = JSON.parse(await readFile(cachePath, 'utf-8')) as FeedCacheFile;
    if (!cache || !Array.isArray(cache.groups)) return;
    const enabled = new Set(artists.filter((a) => a.enabled !== false).map((a) => normalizeName(a.name)));
    const groups = cache.groups.filter((g) => enabled.has(normalizeName(g.artist)));
    if (groups.length !== cache.groups.length) {
      await writeFile(cachePath, JSON.stringify({ ...cache, groups }, null, 2), 'utf-8');
    }
  } catch (err) {
    console.warn('⚠️ [artists] Falha ao podar artist-feed-cache.json:', err);
  }
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
      // Artistas que ENTRARAM agora (presentes na biblioteca, ausentes da lista
      // anterior) — usado para atualizar o feed só do que é novo, sem re-buscar tudo.
      const existingKeys = new Set(existing.map((a) => normalizeName(a.name)));
      const added = Array.from(derived.entries())
        .filter(([key]) => !existingKeys.has(key))
        .map(([, info]) => info.name);
      const artists = mergeArtists(derived, existing, nowIso);
      const data: ArtistsFile = { updatedAt: nowIso, artists };
      await writeArtistsFile(path, data);
      await pruneFeedCacheToEnabled(await getDownloadsPath(), artists);
      return NextResponse.json({ ...data, added });
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
      await pruneFeedCacheToEnabled(await getDownloadsPath(), artists);
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ [artists] POST:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
