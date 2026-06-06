'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface CuratedArtist {
  name: string;
  trackCount: number;
  lastSeen: string;
  enabled: boolean;
}

interface ManageArtistsModalProps {
  open: boolean;
  onClose: () => void;
  artists: CuratedArtist[];
  saving: boolean;
  /** Persiste a lista completa (enable/disable/adicionar/remover). */
  onPersist: (next: CuratedArtist[]) => void;
  /** Re-escaneia a biblioteca e mescla com a lista atual. */
  onSync: () => void;
}

// --- helpers visuais (espelham os do ArtistFeed) ---------------------------
const AVATAR_GRADIENTS = [
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-fuchsia-600',
  'from-sky-500 to-indigo-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-blue-600',
  'from-lime-500 to-emerald-600',
  'from-purple-500 to-violet-700',
];
function gradientFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ManageArtistsModal({
  open,
  onClose,
  artists,
  saving,
  onPersist,
  onSync,
}: ManageArtistsModalProps) {
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ESC para fechar + travar o scroll do body enquanto aberto.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // foco no campo de adicionar ao abrir
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  const total = artists.length;
  const enabledCount = useMemo(() => artists.filter((a) => a.enabled).length, [artists]);

  // Lista exibida: filtro por busca + ordenação alfabética (não altera a ordem persistida).
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return artists
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [artists, search]);

  const existsCI = (name: string) =>
    artists.some((a) => a.name.toLowerCase() === name.trim().toLowerCase());

  const addArtist = () => {
    const name = newName.trim();
    if (!name) return;
    if (existsCI(name)) {
      // Já existe: garante que está ativo e limpa o campo.
      onPersist(artists.map((a) => (a.name.toLowerCase() === name.toLowerCase() ? { ...a, enabled: true } : a)));
      setNewName('');
      return;
    }
    onPersist([
      ...artists,
      { name, trackCount: 0, lastSeen: new Date().toISOString(), enabled: true },
    ]);
    setNewName('');
    inputRef.current?.focus();
  };

  const toggle = (name: string) =>
    onPersist(artists.map((a) => (a.name === name ? { ...a, enabled: !a.enabled } : a)));
  const remove = (name: string) => onPersist(artists.filter((a) => a.name !== name));
  const setAll = (enabled: boolean) => onPersist(artists.map((a) => ({ ...a, enabled })));

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl overflow-hidden animate-slide-up">
        {/* Cabeçalho */}
        <div className="flex-shrink-0 p-5 border-b border-white/10">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/5 hover:bg-white/90 hover:text-black text-white flex items-center justify-center transition"
            title="Fechar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-3-6.5" /></svg>
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold text-white leading-tight">Gerenciar artistas</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {total === 0 ? 'Nenhum artista monitorado' : `${enabledCount} ativo${enabledCount !== 1 ? 's' : ''} de ${total}`}
                {saving && <span className="ml-2 text-emerald-400">salvando…</span>}
              </p>
            </div>
          </div>

          {/* Adicionar artista */}
          <div className="flex items-center gap-2 mt-4">
            <div className="relative flex-1">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addArtist(); }}
                placeholder="Adicionar artista (ex.: Boris Brejcha)…"
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-zinc-900 border border-white/10 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
            <button
              onClick={addArtist}
              disabled={!newName.trim()}
              className="h-10 px-4 rounded-xl text-sm font-bold bg-emerald-500 text-black hover:bg-emerald-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Adicionar
            </button>
          </div>
        </div>

        {/* Barra de ações */}
        <div className="flex-shrink-0 flex items-center gap-2 px-5 py-3 border-b border-white/5 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar…"
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-zinc-900 border border-white/10 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
            />
          </div>
          <button onClick={() => setAll(true)} disabled={total === 0} className="h-9 px-3 rounded-lg text-xs font-semibold border border-white/10 bg-white/5 text-white/90 hover:bg-white/10 transition disabled:opacity-40">Ativar todas</button>
          <button onClick={() => setAll(false)} disabled={total === 0} className="h-9 px-3 rounded-lg text-xs font-semibold border border-white/10 bg-white/5 text-white/90 hover:bg-white/10 transition disabled:opacity-40">Desativar todas</button>
          <button onClick={onSync} disabled={saving} className="h-9 px-3 rounded-lg text-xs font-semibold border border-blue-500/50 bg-blue-600/90 text-white hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-1.5">
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            Sincronizar
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto custom-scroll p-3">
          {total === 0 ? (
            <div className="text-center py-12 px-6">
              <p className="text-sm text-zinc-300 font-medium">Nenhum artista monitorado ainda</p>
              <p className="text-xs text-zinc-500 mt-1">Adicione um artista acima ou clique em “Sincronizar” para importar da sua biblioteca.</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="text-center py-12 text-sm text-zinc-400">Nenhum artista corresponde a “{search}”.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {shown.map((a) => (
                <div
                  key={a.name}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl border transition ${a.enabled ? 'bg-white/5 border-white/10' : 'bg-transparent border-white/5 opacity-55'}`}
                >
                  <span className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white bg-gradient-to-br ${gradientFor(a.name)} flex-shrink-0`}>{initialsOf(a.name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate" title={a.name}>{a.name}</p>
                    <p className="text-[11px] text-zinc-500">{a.trackCount} {a.trackCount === 1 ? 'faixa' : 'faixas'} na biblioteca</p>
                  </div>

                  {/* Toggle ativar/desativar */}
                  <button
                    onClick={() => toggle(a.name)}
                    role="switch"
                    aria-checked={a.enabled}
                    title={a.enabled ? 'Monitorando — clique para pausar' : 'Pausado — clique para monitorar'}
                    className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${a.enabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${a.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>

                  {/* Remover */}
                  <button
                    onClick={() => remove(a.name)}
                    className="text-zinc-600 hover:text-red-400 transition flex-shrink-0 opacity-0 group-hover:opacity-100"
                    title="Remover artista"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
