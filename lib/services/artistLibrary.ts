/**
 * Utilitários compartilhados para o "Feed de Novidades dos Artistas".
 *
 * Deriva a lista de artistas da biblioteca (arquivos já baixados), normaliza
 * nomes/títulos para dedupe e fornece os tipos persistidos em `artists.json`
 * e `artist-feed-cache.json` (na pasta de downloads).
 */

export interface LibraryFile {
  name: string;
  displayName?: string;
  title?: string;
  artist?: string;
  duration?: string;
}

export interface CuratedArtist {
  name: string;
  trackCount: number;
  lastSeen: string; // ISO
  enabled: boolean;
}

export interface ArtistsFile {
  updatedAt: string;
  artists: CuratedArtist[];
}

export interface FeedTrack {
  title: string;
  artist?: string;
  videoId: string;
  url: string;
  thumbnail?: string;
  duration?: string;
}

/**
 * Um lançamento (álbum/EP/single) recente de um artista monitorado, no formato
 * "feed por release" — espelha um card de álbum/single da busca do YouTube Music.
 */
export interface FeedRelease {
  album: string;
  artist: string;
  /** Ano de lançamento (YYYY) reportado pelo YouTube Music. */
  year?: string;
  /** "Album" | "EP" | "Single". */
  type?: string;
  thumbnail?: string;
  playlistId?: string;
  playlistUrl?: string;
  /** Total de faixas no release (do YT Music), independente de quantas são novas. */
  totalTracks?: number;
  /** Faixas NOVAS (ainda não presentes na biblioteca) deste release. */
  tracks: FeedTrack[];
}

export interface FeedGroup {
  artist: string;
  /** Foto do artista (header da página no YT Music). Fallback: capa do release. */
  image?: string;
  /**
   * Recência do artista (ISO). Derivado do ano do lançamento mais recente quando
   * disponível; caso contrário, do lastSeen na biblioteca. Ordena "Mais recente".
   */
  lastSeen?: string;
  /** Lançamentos com novidades, agrupados por álbum/EP/single (mais novo primeiro). */
  releases: FeedRelease[];
  /** Faixas novas achatadas (todos os releases) — usado em busca/contagem/back-compat. */
  tracks: FeedTrack[];
}

export interface FeedCacheFile {
  fetchedAt: string;
  groups: FeedGroup[];
}

/** Remove acentos, baixa caixa e colapsa espaços. */
export function normalizeName(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza título de faixa para dedupe contra a biblioteca: remove sufixos
 * comuns (feat., remaster, etc.), pontuação e parênteses.
 */
export function normalizeTitle(value: string): string {
  return normalizeName(value)
    .replace(/\((feat|ft|featuring)[^)]*\)/g, '')
    .replace(/\[(feat|ft|featuring)[^\]]*\]/g, '')
    .replace(/\b(feat|ft|featuring)\.?\s.*$/g, '')
    .replace(/\b(remaster(ed)?|official\s+(video|audio|music\s+video)|lyric\s+video|hd|hq)\b/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Divide um campo de artista ("A, B & C feat. D") em artistas individuais.
 * Conservador para evitar quebrar nomes legítimos (não separa por " x ").
 */
export function splitArtists(artistField: string): string[] {
  if (!artistField) return [];
  return artistField
    .split(/\s*(?:,|，|、|&|;|\/|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bvs\.?\b|\bwith\b)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

/** Base URL para chamadas internas (mesmo padrão usado em /api/download). */
export function getInternalBaseUrl(request: Request): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

/** Busca a lista de arquivos da biblioteca via /api/files. */
export async function fetchLibraryFiles(request: Request): Promise<LibraryFile[]> {
  const baseUrl = getInternalBaseUrl(request);
  const res = await fetch(`${baseUrl}/api/files`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`/api/files retornou ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.files) ? (data.files as LibraryFile[]) : [];
}

/** Deriva artistas distintos (com contagem) a partir dos arquivos. */
export function deriveArtistsFromFiles(files: LibraryFile[]): Map<string, { name: string; trackCount: number }> {
  const byKey = new Map<string, { name: string; trackCount: number }>();
  for (const file of files) {
    const names = splitArtists(file.artist || '');
    for (const name of names) {
      const key = normalizeName(name);
      if (!key) continue;
      const existing = byKey.get(key);
      if (existing) {
        existing.trackCount += 1;
      } else {
        byKey.set(key, { name, trackCount: 1 });
      }
    }
  }
  return byKey;
}

/**
 * Conjunto de chaves de faixas da biblioteca para dedupe do feed.
 * Inclui "artista|título" e o título normalizado isolado (fallback).
 */
export function buildLibraryTrackKeys(files: LibraryFile[]): { pairKeys: Set<string>; titleKeys: Set<string> } {
  const pairKeys = new Set<string>();
  const titleKeys = new Set<string>();
  for (const file of files) {
    const title = normalizeTitle(file.title || file.displayName || '');
    if (!title) continue;
    titleKeys.add(title);
    const names = splitArtists(file.artist || '');
    if (names.length === 0) {
      pairKeys.add(`|${title}`);
    } else {
      for (const name of names) {
        pairKeys.add(`${normalizeName(name)}|${title}`);
      }
    }
  }
  return { pairKeys, titleKeys };
}

/** Mescla artistas derivados com a lista curada, preservando edições do usuário. */
export function mergeArtists(
  derived: Map<string, { name: string; trackCount: number }>,
  existing: CuratedArtist[],
  nowIso: string
): CuratedArtist[] {
  const byKey = new Map<string, CuratedArtist>();
  for (const a of existing) {
    byKey.set(normalizeName(a.name), { ...a });
  }
  for (const [key, info] of derived) {
    const current = byKey.get(key);
    if (current) {
      current.trackCount = info.trackCount;
      current.lastSeen = nowIso;
    } else {
      byKey.set(key, {
        name: info.name,
        trackCount: info.trackCount,
        lastSeen: nowIso,
        enabled: true,
      });
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => b.trackCount - a.trackCount || a.name.localeCompare(b.name)
  );
}
