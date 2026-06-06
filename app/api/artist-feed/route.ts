import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getDownloadsPath } from '@/app/api/utils/common';
import { searchYouTubeMusic } from '@/lib/services/youtubeSearchService';
import {
  getInternalBaseUrl,
  normalizeName,
  normalizeTitle,
  splitArtists,
  type ArtistsFile,
  type FeedCacheFile,
  type FeedGroup,
  type FeedRelease,
  type FeedTrack,
} from '@/lib/services/artistLibrary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const MAX_RESULTS_PER_ARTIST = 12;
const CONCURRENCY = 4;

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

const YT_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX94';
const YT_CLIENT_VERSION = '1.20240101.01.00';
/** De quantos releases (mais recentes) resolvemos as faixas no servidor; o resto carrega sob demanda. */
const MAX_RESOLVE_RELEASES = 12;

interface ArtistRelease {
  album?: string;
  artist?: string;
  year?: string;
  type?: string;
  thumbnail?: string;
  playlistId?: string;
  playlistUrl?: string;
}

function findAll(obj: any, key: string, out: any[] = []): any[] {
  if (!obj || typeof obj !== 'object') return out;
  if (obj[key]) out.push(obj[key]);
  if (Array.isArray(obj)) { for (const v of obj) findAll(v, key, out); }
  else { for (const k in obj) findAll(obj[k], key, out); }
  return out;
}

/**
 * Discografia do artista (álbuns/singles/EPs) já ordenada "mais recente primeiro",
 * via /api/artist-albums. Esta é a fonte de verdade do radar de lançamentos —
 * espelha a página do artista no YouTube Music (sem homônimos, com ano).
 */
async function fetchArtistReleases(request: Request, artist: string): Promise<{ releases: ArtistRelease[]; image?: string }> {
  try {
    const baseUrl = getInternalBaseUrl(request);
    const res = await fetch(`${baseUrl}/api/artist-albums?artist=${encodeURIComponent(artist)}`, { cache: 'no-store' });
    if (!res.ok) return { releases: [] };
    const data = await res.json();
    const releases = data?.success && Array.isArray(data.albums) ? (data.albums as ArtistRelease[]) : [];
    return { releases, image: typeof data?.image === 'string' ? data.image : undefined };
  } catch {
    return { releases: [] };
  }
}

/** Resolve as faixas tocáveis de um release pelo seu playlistId (OLAK5uy_…) via API `next`. */
async function resolveReleaseTracks(
  playlistId: string
): Promise<Array<{ title: string; artist?: string; videoId: string; duration?: string }>> {
  try {
    const res = await fetch(`https://music.youtube.com/youtubei/v1/next?key=${YT_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Origin': 'https://music.youtube.com',
        'Referer': 'https://music.youtube.com/',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': YT_CLIENT_VERSION,
      },
      body: JSON.stringify({ playlistId, context: { client: { clientName: 'WEB_REMIX', clientVersion: YT_CLIENT_VERSION, hl: 'pt-BR', gl: 'BR' } } }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return findAll(data, 'playlistPanelVideoRenderer')
      .map((it: any) => ({
        title: it.title?.runs?.[0]?.text || '',
        artist: it.longBylineText?.runs?.[0]?.text || it.shortBylineText?.runs?.[0]?.text,
        videoId: it.videoId || '',
        duration: it.lengthText?.runs?.[0]?.text,
      }))
      .filter((t: { title: string; videoId: string }) => t.title && t.videoId);
  } catch {
    return [];
  }
}

/** Executa tarefas com concorrência limitada (evita bloqueio do YouTube). */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Monta o grupo de feed (lançamentos) de UM artista. Extraído para ser reusado
 * tanto pela varredura completa quanto pela atualização incremental (1 artista).
 */
async function buildArtistGroup(
  request: Request,
  artist: { name: string; lastSeen?: string }
): Promise<FeedGroup | null> {
  try {
    const artistKey = normalizeName(artist.name);
    const seen = new Set<string>();
    const releaseGroups: FeedRelease[] = [];
    const extractPlaylistId = (url?: string) => url?.match(/[?&]list=([^&]+)/)?.[1] || null;

    // Discografia COMPLETA do artista (álbuns + singles/EPs), fiel à página do
    // YouTube Music — mais recente primeiro, sem homônimos nem compilações.
    const { releases, image } = await fetchArtistReleases(request, artist.name);

    // Cada lançamento vira um card (fiel ao YT Music). Resolvemos as faixas só
    // dos N mais recentes (para preview/contagem); os demais carregam sob
    // demanda no cliente via playlistId. NÃO filtramos pela biblioteca aqui —
    // o que "já tenho" é marcado no cliente, mantendo a lista fiel.
    const withPlaylist = releases.filter((r) => r.playlistId || extractPlaylistId(r.playlistUrl));
    for (let i = 0; i < withPlaylist.length; i++) {
      const rel = withPlaylist[i];
      const playlistId = (rel.playlistId || extractPlaylistId(rel.playlistUrl)) as string;

      let tracks: FeedTrack[] = [];
      let totalTracks: number | undefined;
      if (i < MAX_RESOLVE_RELEASES) {
        const relTracks = await resolveReleaseTracks(playlistId);
        totalTracks = relTracks.length || undefined;
        tracks = relTracks.map((t) => ({
          title: t.title,
          artist: t.artist || rel.artist || artist.name,
          videoId: t.videoId,
          url: `https://www.youtube.com/watch?v=${t.videoId}`,
          thumbnail: rel.thumbnail || `https://img.youtube.com/vi/${t.videoId}/hqdefault.jpg`,
          duration: t.duration,
        }));
      }

      releaseGroups.push({
        album: rel.album || 'Lançamento',
        artist: rel.artist || artist.name,
        year: rel.year,
        type: rel.type,
        thumbnail: rel.thumbnail,
        playlistId,
        playlistUrl: rel.playlistUrl || `https://music.youtube.com/playlist?list=${playlistId}`,
        totalTracks,
        tracks,
      });
    }

    // FALLBACK: se a discografia não veio (API fora do ar), usa a busca de músicas
    // filtrando pelo artista correto e agrupa os resultados por álbum.
    if (releaseGroups.length === 0) {
      const albumMeta = new Map<string, { year?: string; thumbnail?: string }>();
      for (const rel of releases) {
        if (!rel.album) continue;
        albumMeta.set(normalizeName(rel.album), { year: rel.year, thumbnail: rel.thumbnail });
      }
      const results = await searchYouTubeMusic(artist.name, { maxResults: MAX_RESULTS_PER_ARTIST });
      const byAlbum = new Map<string, FeedRelease>();
      for (const r of results) {
        if (!r.videoId || !r.title) continue;
        const titleKey = normalizeTitle(r.title);
        if (!titleKey) continue;
        // Manter apenas faixas realmente do artista (crédito bate ou álbum na discografia).
        const albumKey = normalizeName(r.album || '');
        const creditMatches = splitArtists(r.artist || '').some((n) => normalizeName(n) === artistKey);
        const albumMatches = albumKey ? albumMeta.has(albumKey) : false;
        if (!creditMatches && !albumMatches) continue;
        if (seen.has(titleKey)) continue;
        seen.add(titleKey);

        const meta = albumKey ? albumMeta.get(albumKey) : undefined;
        const albumName = r.album || 'Lançamentos recentes';
        const gKey = normalizeName(albumName);
        let group = byAlbum.get(gKey);
        if (!group) {
          group = {
            album: albumName,
            artist: artist.name,
            year: meta?.year,
            type: r.album ? undefined : 'Single',
            thumbnail: meta?.thumbnail || r.thumbnail,
            tracks: [],
          };
          byAlbum.set(gKey, group);
        }
        group.tracks.push({
          title: r.title,
          artist: r.artist || artist.name,
          videoId: r.videoId,
          url: r.url || `https://www.youtube.com/watch?v=${r.videoId}`,
          thumbnail: r.thumbnail || group.thumbnail,
          duration: r.duration,
        });
      }
      for (const g of byAlbum.values()) {
        g.totalTracks = g.tracks.length;
        releaseGroups.push(g);
      }
    }

    const tracks: FeedTrack[] = releaseGroups.flatMap((r) => r.tracks);
    if (releaseGroups.length === 0) return null;

    // Recência do grupo = ano do lançamento mais recente (1º de janeiro). Sem isso,
    // todos os artistas teriam o mesmo lastSeen (hora da sincronização) e a ordenação
    // "Mais recente" cairia em ordem alfabética. Com o ano, os artistas com
    // lançamentos mais novos aparecem primeiro.
    const newestYear = releaseGroups.reduce((max, r) => {
      const y = parseInt(r.year || '', 10);
      return Number.isFinite(y) && y > max ? y : max;
    }, 0);
    const lastSeen = newestYear > 0 ? new Date(Date.UTC(newestYear, 0, 1)).toISOString() : artist.lastSeen;

    return { artist: artist.name, image, lastSeen, releases: releaseGroups, tracks };
  } catch (err) {
    console.warn(`⚠️ [artist-feed] Falha ao buscar "${artist.name}":`, err);
    return null;
  }
}

/**
 * Atualização INCREMENTAL: busca apenas os artistas informados (?artists=A,B) e os
 * mescla no cache existente. Usada quando um download adiciona artistas novos à
 * biblioteca — evita re-buscar toda a coleção no YouTube. Retorna SÓ os grupos
 * novos; o cliente mescla no estado dele. Não cria o cache do zero (para não
 * mascarar uma varredura completa posterior).
 */
async function handleIncremental(
  request: NextRequest,
  namesCsv: string,
  cachePath: string,
  artistsPath: string
): Promise<NextResponse> {
  const names = namesCsv.split(',').map((s) => s.trim()).filter(Boolean);
  const nowIso = new Date().toISOString();
  if (names.length === 0) {
    return NextResponse.json({ fetchedAt: nowIso, groups: [], partial: true });
  }

  // lastSeen real vem de artists.json quando disponível; senão sintetiza.
  const artistsFile = await readJson<ArtistsFile>(artistsPath);
  const byKey = new Map((artistsFile?.artists ?? []).map((a) => [normalizeName(a.name), a]));
  const targets = names
    .map((n) => byKey.get(normalizeName(n)) ?? { name: n, lastSeen: nowIso, enabled: true })
    .filter((a) => (a as any).enabled !== false);

  const fetched = await runWithConcurrency(targets, CONCURRENCY, (a) => buildArtistGroup(request, a));
  const newGroups = fetched.filter((g): g is FeedGroup => g !== null);

  // Persistência best-effort: mescla no cache só se ele já existir.
  const existing = await readJson<FeedCacheFile>(cachePath);
  if (existing && Array.isArray(existing.groups)) {
    const merged = new Map(existing.groups.map((g) => [normalizeName(g.artist), g]));
    for (const g of newGroups) merged.set(normalizeName(g.artist), g);
    const data: FeedCacheFile = { fetchedAt: existing.fetchedAt || nowIso, groups: Array.from(merged.values()) };
    await writeFile(cachePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  return NextResponse.json({ fetchedAt: nowIso, groups: newGroups, partial: true });
}

export async function GET(request: NextRequest) {
  try {
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
    const downloadsFolder = await getDownloadsPath();
    const cachePath = join(downloadsFolder, 'artist-feed-cache.json');
    const artistsPath = join(downloadsFolder, 'artists.json');

    // Modo incremental: buscar apenas os artistas informados e mesclar no cache.
    const artistsParam = request.nextUrl.searchParams.get('artists');
    if (artistsParam) {
      return await handleIncremental(request, artistsParam, cachePath, artistsPath);
    }

    // Servir cache fresco, salvo refresh explícito.
    if (!refresh) {
      const cache = await readJson<FeedCacheFile>(cachePath);
      if (cache?.fetchedAt && Date.now() - new Date(cache.fetchedAt).getTime() < CACHE_TTL_MS) {
        return NextResponse.json({ ...cache, cached: true });
      }
    }

    const artistsFile = await readJson<ArtistsFile>(artistsPath);
    const enabledArtists = (artistsFile?.artists ?? []).filter((a) => a.enabled !== false);

    if (enabledArtists.length === 0) {
      const empty: FeedCacheFile = { fetchedAt: new Date().toISOString(), groups: [] };
      await writeFile(cachePath, JSON.stringify(empty, null, 2), 'utf-8');
      return NextResponse.json({ ...empty, cached: false, message: 'Nenhum artista habilitado. Sincronize a biblioteca.' });
    }

    const groups = await runWithConcurrency<typeof enabledArtists[number], FeedGroup | null>(
      enabledArtists,
      CONCURRENCY,
      (artist) => buildArtistGroup(request, artist)
    );

    const data: FeedCacheFile = {
      fetchedAt: new Date().toISOString(),
      groups: groups.filter((g): g is FeedGroup => g !== null),
    };
    await writeFile(cachePath, JSON.stringify(data, null, 2), 'utf-8');
    return NextResponse.json({ ...data, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ [artist-feed] GET:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
