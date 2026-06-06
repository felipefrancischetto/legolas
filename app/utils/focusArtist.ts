// Atalho de navegação: leva à aba "Novidades" focada num artista — e, quando o
// álbum é informado, já abre o modal daquele lançamento. Pode ser disparado de
// qualquer lugar (player, biblioteca, modais) e é ouvido por:
//   - page.tsx     → troca para a aba Novidades
//   - ArtistFeed   → foca o artista (Coleção) e abre o álbum correspondente
//
// Segue o padrão de CustomEvent já usado na app (ver 'refresh-files' em page.tsx),
// evitando acoplar componentes distantes por contexto/props.

export const FOCUS_ARTIST_EVENT = 'legolas:focus-artist';

export interface FocusArtistDetail {
  artist: string;
  album?: string;
}

// Rótulos de "sem artista" que não devem virar um atalho clicável.
const PLACEHOLDERS = new Set(['', '-', 'Artista desconhecido', 'Artista Desconhecido']);

// Foco pendente: o ArtistFeed pode ainda NÃO estar montado quando o atalho é
// disparado a partir da Biblioteca (a aba só monta ao ser aberta). Guardamos o
// último pedido aqui para que o ArtistFeed o consuma assim que montar, além de
// ouvir o evento ao vivo para quando já estiver montado.
let pendingFocus: FocusArtistDetail | null = null;

export function focusArtistInFeed(artist?: string | null, album?: string | null): void {
  const name = (artist || '').trim();
  if (PLACEHOLDERS.has(name)) return;
  if (typeof window === 'undefined') return;

  const detail: FocusArtistDetail = { artist: name, album: (album || '').trim() || undefined };
  pendingFocus = detail;
  window.dispatchEvent(new CustomEvent<FocusArtistDetail>(FOCUS_ARTIST_EVENT, { detail }));
}

// Lê e limpa o foco pendente (chamado pelo ArtistFeed ao montar).
export function consumePendingArtistFocus(): FocusArtistDetail | null {
  const f = pendingFocus;
  pendingFocus = null;
  return f;
}
