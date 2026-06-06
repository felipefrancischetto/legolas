/**
 * Busca os LANÇAMENTOS de um artista de forma FIEL à página do artista no
 * YouTube Music.
 *
 * Em vez de uma busca textual pelo nome (que ordena por relevância, traz
 * homônimos e mistura faixas antigas), navegamos a página REAL do artista via
 * endpoint `browse`:
 *   1. resolve o `browseId` do canal do artista (UC…, pageType ARTIST);
 *   2. `browse` na página → lê os carrosséis "Álbuns" e "Singles e EPs" — que
 *      o próprio YT Music já devolve do mais novo pro mais antigo.
 * Só caímos no método de busca legado se o `browse` não retornar nada.
 *
 * Compartilhado entre /api/artist-albums (lista sob demanda na UI) e
 * /api/artist-feed (radar de lançamentos recentes).
 */

import { normalizeName, splitArtists } from '@/lib/services/artistLibrary';

const YT_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX94';
const CLIENT_VERSION = '1.20240101.01.00';
/** Filtro de busca "Albums" (sobre o nome do artista) — usado só no fallback. */
const ALBUMS_FILTER = 'EgWKAQIYAWoKEAMQBBAJEAoQBQ%3D%3D';
/** Filtro de busca "Artists" — para resolver o canal do artista. */
const ARTISTS_FILTER = 'EgWKAQIgAWoKEAMQBBAKEAUQCQ%3D%3D';

export interface ArtistRelease {
  album: string;
  artist: string;
  year?: string;
  type?: string;
  thumbnail?: string;
  browseId?: string;
  playlistId?: string;
  playlistUrl?: string;
}

export interface ArtistReleasesResult {
  releases: ArtistRelease[];
  /** Foto do artista (header da página no YT Music), na maior resolução disponível. */
  image?: string;
}

function findAll(obj: any, key: string, out: any[] = []): any[] {
  if (!obj || typeof obj !== 'object') return out;
  if (obj[key]) out.push(obj[key]);
  if (Array.isArray(obj)) { for (const v of obj) findAll(v, key, out); }
  else { for (const k in obj) findAll(obj[k], key, out); }
  return out;
}

const yearOf = (r: ArtistRelease): number => {
  const y = parseInt(r.year || '', 10);
  return Number.isFinite(y) ? y : -1;
};

/** POST para a API interna do YouTube Music (`search` | `browse`). */
async function ytMusic(endpoint: 'search' | 'browse', body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://music.youtube.com/youtubei/v1/${endpoint}?key=${YT_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Origin': 'https://music.youtube.com',
      'Referer': 'https://music.youtube.com/',
      'X-YouTube-Client-Name': '67',
      'X-YouTube-Client-Version': CLIENT_VERSION,
    },
    body: JSON.stringify({
      ...body,
      context: { client: { clientName: 'WEB_REMIX', clientVersion: CLIENT_VERSION, hl: 'pt-BR', gl: 'BR', utcOffsetMinutes: -180 } },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const pageTypeOf = (nav: any): string | undefined =>
  nav?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;

/** Resolve o `browseId` (UC…) do canal do artista, casando o nome quando possível. */
async function resolveArtistBrowseId(name: string): Promise<string | null> {
  const data = await ytMusic('search', { query: name, params: ARTISTS_FILTER });
  const items = findAll(data, 'musicResponsiveListItemRenderer');
  const target = normalizeName(name);
  let fallback: string | null = null;

  for (const it of items) {
    const nav = it.navigationEndpoint;
    const browseId = nav?.browseEndpoint?.browseId;
    if (!browseId || pageTypeOf(nav) !== 'MUSIC_PAGE_TYPE_ARTIST') continue;
    const title = it.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
    if (!fallback) fallback = browseId;
    if (normalizeName(title) === target) return browseId; // match exato do nome
  }
  return fallback;
}

/** Extrai o playlistId tocável (OLAK5uy_…) de dentro de um item de release. */
function extractPlaylistId(item: any): string | undefined {
  for (const btn of findAll(item, 'musicPlayButtonRenderer')) {
    const ep = btn.playNavigationEndpoint;
    const id = ep?.watchPlaylistEndpoint?.playlistId || ep?.watchEndpoint?.playlistId;
    if (id) return id;
  }
  return undefined;
}

/** Constrói um ArtistRelease a partir de um `musicTwoRowItemRenderer` (null se não for álbum). */
function parseTwoRowItem(item: any, name: string, defaultType?: string): ArtistRelease | null {
  const nav = item?.navigationEndpoint;
  if (pageTypeOf(nav) !== 'MUSIC_PAGE_TYPE_ALBUM') return null;

  const album = item.title?.runs?.[0]?.text;
  if (!album) return null;

  const subtitle = (item.subtitle?.runs || []).map((r: any) => r?.text || '').join('');
  const parts = subtitle.split('•').map((s: string) => s.trim()).filter(Boolean);
  // Tipo explícito do subtítulo ("Single"/"EP"/"Album"); senão herda o da prateleira.
  const explicitType = parts.find((p: string) => /^(album|álbum|ep|single)$/i.test(p));
  const year = parts.find((p: string) => /^\d{4}$/.test(p));

  const albumBrowseId = nav?.browseEndpoint?.browseId;
  const playlistId = extractPlaylistId(item);
  const thumbs = item.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails;
  const thumbnail = Array.isArray(thumbs) && thumbs.length ? thumbs[thumbs.length - 1].url : undefined;

  return {
    album,
    artist: name,
    year,
    type: explicitType || defaultType,
    thumbnail,
    browseId: albumBrowseId,
    playlistId,
    playlistUrl: playlistId ? `https://music.youtube.com/playlist?list=${playlistId}` : undefined,
  };
}

/**
 * Foto do artista no header da página (avatar redondo grande), extraída do
 * `musicImmersiveHeaderRenderer` (ou `musicVisualHeaderRenderer`). Pega a maior
 * resolução disponível. É a MESMA resposta `browse` já usada para os releases —
 * nenhuma requisição extra.
 */
function extractArtistImage(data: any): string | undefined {
  const header =
    findAll(data, 'musicImmersiveHeaderRenderer')[0] ||
    findAll(data, 'musicVisualHeaderRenderer')[0];
  const thumbs =
    header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    header?.foregroundThumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
  return Array.isArray(thumbs) && thumbs.length ? thumbs[thumbs.length - 1].url : undefined;
}

/** Título de uma prateleira de carrossel (ex.: "Álbuns", "Singles e EPs"). */
const carouselTitle = (shelf: any): string =>
  shelf?.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text || '';

/** Endpoint "Mostrar tudo" de uma prateleira, se existir. */
function carouselMore(shelf: any): { browseId?: string; params?: string } | null {
  const ep = shelf?.header?.musicCarouselShelfBasicHeaderRenderer?.moreContentButton?.buttonRenderer
    ?.navigationEndpoint?.browseEndpoint;
  return ep?.browseId ? { browseId: ep.browseId, params: ep.params } : null;
}

/** Classifica a prateleira pelo título: 'album' | 'single' | null (ignorar). */
function shelfKind(title: string): 'album' | 'single' | null {
  const t = title.toLowerCase();
  if (/single/.test(t)) return 'single';     // "Singles e EPs"
  if (/álbu|albu/.test(t)) return 'album';    // "Álbuns" / "Albums"
  return null;                                 // "Apresentado em", "Fãs também curtem"…
}

/** Lista COMPLETA de uma prateleira via "Mostrar tudo" (browse com params). */
async function fetchShelfAll(
  more: { browseId?: string; params?: string },
  name: string,
  defaultType: string
): Promise<ArtistRelease[]> {
  if (!more.browseId) return [];
  try {
    const data = await ytMusic('browse', { browseId: more.browseId, params: more.params });
    return findAll(data, 'musicTwoRowItemRenderer')
      .map((it: any) => parseTwoRowItem(it, name, defaultType))
      .filter((r: ArtistRelease | null): r is ArtistRelease => r !== null);
  } catch {
    return [];
  }
}

/**
 * Lança os releases a partir da PÁGINA do artista, fiel ao YouTube Music: lê
 * SOMENTE as prateleiras "Álbuns" e "Singles e EPs" (ignora "Apresentado em",
 * compilações e "Fãs também curtem") e segue o "Mostrar tudo" de cada uma para
 * trazer a discografia COMPLETA — não apenas os primeiros cards do carrossel.
 */
async function fetchReleasesFromArtistPage(browseId: string, name: string): Promise<ArtistReleasesResult> {
  const data = await ytMusic('browse', { browseId });
  const image = extractArtistImage(data);
  const collected: ArtistRelease[] = [];

  for (const shelf of findAll(data, 'musicCarouselShelfRenderer')) {
    const kind = shelfKind(carouselTitle(shelf));
    if (!kind) continue;
    const defaultType = kind === 'single' ? 'Single' : 'Album';

    // Cards já visíveis no carrossel da landing page.
    const inline = (shelf.contents || [])
      .map((c: any) => c?.musicTwoRowItemRenderer)
      .filter(Boolean)
      .map((it: any) => parseTwoRowItem(it, name, defaultType))
      .filter((r: ArtistRelease | null): r is ArtistRelease => r !== null);

    // Lista completa via "Mostrar tudo" quando houver; senão usa só os inline.
    const more = carouselMore(shelf);
    const full = more ? await fetchShelfAll(more, name, defaultType) : [];
    collected.push(...(full.length >= inline.length ? full : inline));
  }

  // Dedupe por browseId/playlistId/álbum.
  const seen = new Set<string>();
  const releases: ArtistRelease[] = [];
  for (const r of collected) {
    const key = (r.browseId || r.playlistId || r.album).toString();
    if (seen.has(key)) continue;
    seen.add(key);
    releases.push(r);
  }

  // Mais recentes primeiro (estável: preserva a ordem dos carrosséis no empate de ano).
  releases.sort((a, b) => yearOf(b) - yearOf(a));
  return { releases, image };
}

/**
 * Fallback legado: busca textual com filtro "Albums" sobre o nome do artista.
 * Usado só quando a página do artista não pôde ser resolvida (ex.: API fora).
 */
async function fetchReleasesViaSearch(name: string): Promise<ArtistRelease[]> {
  const data = await ytMusic('search', { query: name, params: ALBUMS_FILTER });
  const items = findAll(data, 'musicResponsiveListItemRenderer');
  const releases: ArtistRelease[] = [];
  const seen = new Set<string>();
  const artistKey = normalizeName(name);

  for (const it of items) {
    const album = it.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
    const browseId = it.navigationEndpoint?.browseEndpoint?.browseId;
    const playId =
      it.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchPlaylistEndpoint?.playlistId ||
      it.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.playlistId;
    if (!album) continue;

    const subRuns = (it.flexColumns || []).slice(1)
      .flatMap((c: any) => c.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [])
      .map((r: any) => r?.text || '');
    const subtitle = subRuns.join('');
    const parts = subtitle.split('•').map((s: string) => s.trim()).filter(Boolean);
    const type = parts[0] || '';
    if (!/^(album|álbum|ep|single)$/i.test(type)) continue;

    const subArtist = parts[1] || name;
    // A busca textual ("Hertz") retorna álbuns de QUALQUER artista/álbum que
    // contenha o termo (ex.: "Max Killa Hertz" de Bass Mekanik, "Sintonia
    // Hertz" de Pulsar Hertz). Só aceitamos releases cujo crédito de artista
    // bata EXATAMENTE com o nome pedido — mesma regra do /api/artist-feed.
    const creditMatches = splitArtists(subArtist).some((n) => normalizeName(n) === artistKey);
    if (!creditMatches) continue;
    const year = parts.find((p: string) => /^\d{4}$/.test(p));

    const dedupe = (browseId || playId || album).toString();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const thumbs = it.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
    const thumbnail = Array.isArray(thumbs) && thumbs.length ? thumbs[thumbs.length - 1].url : undefined;

    releases.push({
      album,
      artist: subArtist,
      year,
      type,
      thumbnail,
      browseId,
      playlistId: playId,
      playlistUrl: playId ? `https://music.youtube.com/playlist?list=${playId}` : undefined,
    });
  }

  // Já filtrado por artista exato acima: basta ordenar do mais novo p/ o antigo.
  releases.sort((a, b) => {
    const yearDiff = yearOf(b) - yearOf(a);
    if (yearDiff !== 0) return yearDiff;
    return a.album.localeCompare(b.album);
  });

  return releases;
}

/**
 * Retorna os lançamentos do artista, fiéis à página do YouTube Music
 * (mais recentes primeiro). Resolve via página do artista (`browse`) e só usa
 * a busca textual como último recurso.
 */
export async function fetchArtistReleases(artist: string): Promise<ArtistReleasesResult> {
  const name = (artist || '').trim();
  if (!name) return { releases: [] };

  try {
    const browseId = await resolveArtistBrowseId(name);
    if (browseId) {
      const result = await fetchReleasesFromArtistPage(browseId, name);
      if (result.releases.length > 0) return result;
    }
  } catch (err) {
    console.warn(`⚠️ [artistReleases] Página do artista falhou para "${name}", usando busca:`, err);
  }

  return { releases: await fetchReleasesViaSearch(name) };
}

export { yearOf as releaseYear };
