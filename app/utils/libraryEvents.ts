// Sinalização de "a biblioteca mudou" (download concluído), consumida pelo
// ArtistFeed para sincronizar artistas novos no radar de Novidades.
//
// Dois canais complementares:
//  - Evento ao vivo (LIBRARY_UPDATED_EVENT): quando o ArtistFeed JÁ está montado.
//  - Flag "dirty": cobre downloads ocorridos ENQUANTO a aba Novidades nunca foi
//    aberta (o componente não existe para ouvir o evento). Ao montar, o ArtistFeed
//    consome a flag e sincroniza — então o custo só acontece se houve download.
//
// Mantido separado de 'refresh-files' (atualiza a lista da Biblioteca) para não
// acoplar responsabilidades nem disparar sync a cada troca de aba.

export const LIBRARY_UPDATED_EVENT = 'legolas:library-updated';

let libraryDirty = false;

/** Chamado quando um download entra na biblioteca. */
export function notifyLibraryUpdated(): void {
  libraryDirty = true;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LIBRARY_UPDATED_EVENT));
  }
}

/** Lê e limpa a flag (chamado pelo ArtistFeed ao montar). */
export function consumeLibraryDirty(): boolean {
  const dirty = libraryDirty;
  libraryDirty = false;
  return dirty;
}
