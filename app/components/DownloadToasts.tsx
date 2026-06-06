'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDownload } from '../contexts/DownloadContext';
import SoundWave from './SoundWave';

interface DownloadToastsProps {
  setShowQueue: (show: boolean) => void;
}

// Máximo de cards (individuais ou de álbum) exibidos simultaneamente; acima disso vira resumo.
const MAX_CARDS = 3;
// Mínimo de faixas do mesmo álbum para agrupar em um único card.
const ALBUM_MIN = 2;

const EM = '16, 185, 129'; // emerald-500
const RED = '239, 68, 68';
const AMBER = '251, 191, 36';

// ---------- helpers ----------
function fmtClock(ms: number) {
  if (!isFinite(ms) || ms < 0) return '--:--';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function safeHost(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Tenta achar a capa/thumbnail nos metadados (disponível conforme o download avança).
function thumbOf(item: any): string | null {
  const m = item?.metadata || {};
  return item?.thumbnail || m.thumbnail || m.cover || m.image || m.albumArt || null;
}

// Detecta a "fase" do download a partir do texto do passo atual.
function phaseOf(step?: string): { key: string; label: string } {
  const s = (step || '').toLowerCase();
  if (/erro|falh|cancel/.test(s)) return { key: 'error', label: 'Erro' };
  if (/conclu|salv|finaliz|🎉/.test(s)) return { key: 'save', label: 'Salvando' };
  if (/beatport|metadad|enrich|tag|capa|cover/.test(s)) return { key: 'meta', label: 'Metadados' };
  if (/convert|flac|mp3|áudio|audio|process/.test(s)) return { key: 'convert', label: 'Convertendo' };
  if (/conect|inici|extra|resolv|buscan|search/.test(s)) return { key: 'connect', label: 'Conectando' };
  return { key: 'download', label: 'Baixando' };
}

const isFailedItem = (it: any) =>
  it.status === 'error' ||
  (it.isPlaylist && it.playlistItems?.some((t: any) => t.status === 'error' || t.trackState === 'failed'));

// Chave de agrupamento por álbum (somente faixas individuais com álbum definido).
function albumKeyOf(it: any): string | null {
  if (it.isPlaylist || !it.albumName) return null;
  return `${(it.albumArtist || '').toLowerCase().trim()}::${it.albumName.toLowerCase().trim()}`;
}

type AlbumGroup = {
  kind: 'album';
  id: string;
  albumName: string;
  albumArtist?: string;
  items: any[];
};
type SingleCard = { kind: 'single'; id: string; item: any };
type Renderable = AlbumGroup | SingleCard;

export default function DownloadToasts({ setShowQueue }: DownloadToastsProps) {
  const { queue, retryItem, cancelDownload, setFocusDownloadId } = useDownload();
  // Cards dispensados localmente (não cancela o download — só esconde o toast).
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Resumo dispensado pelo usuário (volta a aparecer quando a fila esvazia e enche de novo).
  const [summaryDismissed, setSummaryDismissed] = useState(false);
  // Relógio para tempo decorrido / ETA (só roda enquanto há download ativo).
  const [now, setNow] = useState(() => Date.now());

  const openQueue = (id?: string) => {
    if (id) setFocusDownloadId(id);
    setShowQueue(true);
  };

  const { renderables, downloadingCount, queuedCount, failedCount } = useMemo(() => {
    const downloadingCount = queue.filter(it => it.status === 'downloading').length;
    const queuedCount = queue.filter(it => it.status === 'pending' || it.status === 'queued').length;
    const failedCount = queue.filter(isFailedItem).length;

    const visible = queue.filter(it => !dismissed.has(it.id));

    // 1) Agrupar faixas individuais do mesmo álbum.
    const groups = new Map<string, any[]>();
    for (const it of visible) {
      const key = albumKeyOf(it);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(it);
    }

    const groupedIds = new Set<string>();
    const albumCards: AlbumGroup[] = [];
    for (const [key, items] of groups) {
      const hasActiveOrFailed = items.some(it => it.status === 'downloading' || isFailedItem(it));
      if (items.length >= ALBUM_MIN && hasActiveOrFailed) {
        items.forEach(it => groupedIds.add(it.id));
        albumCards.push({
          kind: 'album',
          id: `album::${key}`,
          albumName: items[0].albumName,
          albumArtist: items[0].albumArtist,
          items,
        });
      }
    }

    // 2) Cards individuais: falhas + ativos que não foram agrupados.
    const failedSingles = visible.filter(it => isFailedItem(it) && !groupedIds.has(it.id));
    const activeSingles = visible.filter(
      it => it.status === 'downloading' && !isFailedItem(it) && !groupedIds.has(it.id),
    );

    const albumFailed = albumCards.filter(a => a.items.some(isFailedItem));
    const albumOk = albumCards.filter(a => !a.items.some(isFailedItem));

    // Ordem: falhas primeiro (álbuns e individuais), depois ativos.
    const renderables: Renderable[] = [
      ...albumFailed,
      ...failedSingles.map(it => ({ kind: 'single', id: it.id, item: it } as SingleCard)),
      ...albumOk,
      ...activeSingles.map(it => ({ kind: 'single', id: it.id, item: it } as SingleCard)),
    ];

    return { renderables, downloadingCount, queuedCount, failedCount };
  }, [queue, dismissed]);

  // Tick de 1s apenas quando há algo baixando (para tempo/ETA ao vivo).
  useEffect(() => {
    if (downloadingCount === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [downloadingCount]);

  // Quando a fila esvazia, "rearma" o resumo para reaparecer em downloads futuros.
  useEffect(() => {
    if (downloadingCount + queuedCount + failedCount === 0 && summaryDismissed) {
      setSummaryDismissed(false);
    }
  }, [downloadingCount, queuedCount, failedCount, summaryDismissed]);

  const cards = renderables.slice(0, MAX_CARDS);

  // Itens (em estados relevantes) ainda não representados pelos cards visíveis → mostrar resumo.
  const shownIds = new Set<string>();
  cards.forEach(c => (c.kind === 'album' ? c.items.forEach(i => shownIds.add(i.id)) : shownIds.add(c.item.id)));
  const remaining = queue.filter(
    it =>
      (it.status === 'downloading' ||
        it.status === 'pending' ||
        it.status === 'queued' ||
        isFailedItem(it)) &&
      !shownIds.has(it.id),
  );
  const summaryNeeded = renderables.length > MAX_CARDS || remaining.length > 0;

  if (cards.length === 0 && !(downloadingCount || queuedCount || failedCount)) {
    return null;
  }

  const dismiss = (id: string) => setDismissed(prev => new Set(prev).add(id));
  const dismissMany = (ids: string[]) =>
    setDismissed(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });

  const playlistStat = (it: any) => {
    if (!it.isPlaylist || !it.playlistItems?.length) return null;
    const total = it.playlistItems.length;
    const done = it.playlistItems.filter((t: any) => t.status === 'completed').length;
    const errs = it.playlistItems.filter((t: any) => t.status === 'error').length;
    const downloading = it.playlistItems.filter((t: any) => t.status === 'downloading').length;
    return { total, done, errs, downloading };
  };

  // ---------- card individual (faixa única ou playlist) ----------
  function renderSingleCard(item: any) {
    const stat = playlistStat(item);
    const failedItem = isFailedItem(item);
    const isError = item.status === 'error';

    const pct = stat ? Math.round((stat.done / stat.total) * 100) : Math.round(item.progress || 0);

    const elapsed = item.startTime ? now - item.startTime : 0;
    const eta = pct > 2 && pct < 100 && elapsed > 1500 ? (elapsed / pct) * (100 - pct) : null;

    const phase = phaseOf(item.currentStep);
    const subtitle = [item.albumArtist, item.albumName].filter(Boolean).join(' — ') || safeHost(item.url);

    const accent = isError ? RED : failedItem ? AMBER : EM;

    return (
      <div
        key={item.id}
        className="relative overflow-hidden rounded-2xl backdrop-blur-xl animate-slide-down"
        style={{
          background:
            'linear-gradient(160deg, rgba(16,185,129,0.07) 0%, rgba(0,0,0,0.55) 45%, rgba(15,23,42,0.78) 100%)',
          border: `1px solid rgba(${accent}, 0.32)`,
          boxShadow: `0 16px 44px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset, 0 0 32px rgba(${accent},0.10)`,
        }}
      >
        <div className="p-3.5">
          {/* ---- header ---- */}
          <div className="flex items-start gap-3">
            {/* avatar com anel de progresso + capa/onda */}
            {(() => {
              const R = 21;
              const C = 2 * Math.PI * R;
              const ringPct = isError ? 100 : pct;
              const thumb = thumbOf(item);
              return (
                <div className="relative w-12 h-12 flex-shrink-0">
                  {/* glow pulsante (apenas ativo) */}
                  {!isError && !failedItem && (
                    <div
                      className="absolute inset-0 rounded-full animate-pulse"
                      style={{ boxShadow: `0 0 16px rgba(${accent},0.45)` }}
                    />
                  )}
                  {/* anel de progresso */}
                  <svg className="absolute inset-0 -rotate-90" width="48" height="48" viewBox="0 0 48 48">
                    <circle cx="24" cy="24" r={R} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="3" />
                    <circle
                      cx="24" cy="24" r={R} fill="none"
                      stroke={`rgb(${accent})`} strokeWidth="3" strokeLinecap="round"
                      strokeDasharray={C}
                      strokeDashoffset={C * (1 - ringPct / 100)}
                      style={{ transition: 'stroke-dashoffset 0.5s ease', filter: `drop-shadow(0 0 4px rgba(${accent},0.6))` }}
                    />
                  </svg>
                  {/* miolo */}
                  <div
                    className="absolute rounded-full flex items-center justify-center overflow-hidden"
                    style={{
                      inset: 5,
                      background: `radial-gradient(circle at 35% 30%, rgba(${accent},0.20), rgba(0,0,0,0.4))`,
                    }}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                    ) : isError ? (
                      <span style={{ color: `rgb(${RED})` }} className="text-base font-bold">✕</span>
                    ) : failedItem ? (
                      <span style={{ color: `rgb(${AMBER})` }} className="text-base">⚠</span>
                    ) : (
                      <SoundWave color={`rgb(${EM})`} size="small" isPlaying />
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-white text-sm font-semibold truncate flex-1" title={item.title}>
                  {item.title || 'Download'}
                </p>
                <button
                  onClick={() => dismiss(item.id)}
                  title="Fechar (não cancela o download)"
                  className="w-6 h-6 -mr-1 -mt-0.5 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors text-sm leading-none flex-shrink-0"
                >
                  ✕
                </button>
              </div>
              {subtitle && (
                <p className="text-[11px] text-zinc-400 truncate mt-0.5" title={subtitle}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* ---- corpo ---- */}
          {isError ? (
            <p className="text-xs mt-2.5 leading-snug" style={{ color: 'rgba(252,165,165,0.95)' }}>
              {item.error || 'Falhou'}
            </p>
          ) : (
            <div className="mt-3">
              {/* fase + step atual */}
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md flex items-center gap-1.5"
                  style={{ color: `rgb(${accent})`, background: `rgba(${accent},0.13)`, border: `1px solid rgba(${accent},0.25)` }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: `rgb(${accent})` }} />
                  {phase.label}
                </span>
                {item.currentStep && (
                  <span className="text-[11px] text-zinc-400 truncate flex-1" title={`${item.currentStep}${item.currentSubstep ? ' • ' + item.currentSubstep : ''}`}>
                    {item.currentStep}
                    {item.currentSubstep ? ` • ${item.currentSubstep}` : ''}
                  </span>
                )}
              </div>

              {/* barra de progresso + % */}
              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-2 rounded-full overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500 relative overflow-hidden"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, rgba(${accent},0.85), rgb(${accent}))`,
                    }}
                  >
                    <div
                      className="absolute inset-0 opacity-50"
                      style={{
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)',
                        animation: 'shimmer 1.8s infinite',
                      }}
                    />
                  </div>
                </div>
                <span className="text-sm font-bold tabular-nums" style={{ color: `rgb(${accent})`, minWidth: 38, textAlign: 'right' }}>
                  {pct}%
                </span>
              </div>

              {/* mini-segmentos de playlist */}
              {stat && (
                <div className="flex gap-1 mt-2">
                  {item.playlistItems.slice(0, 24).map((t: any, i: number) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full"
                      style={{
                        background:
                          t.status === 'completed'
                            ? `rgb(${EM})`
                            : t.status === 'error'
                            ? `rgb(${RED})`
                            : t.status === 'downloading'
                            ? `rgba(${EM},0.55)`
                            : 'rgba(255,255,255,0.12)',
                      }}
                    />
                  ))}
                </div>
              )}

              {/* chips de info */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-[11px] text-zinc-400">
                {stat ? (
                  <span className="flex items-center gap-1">
                    <span className="text-zinc-500">faixas</span>
                    <b className="text-zinc-200">{stat.done}/{stat.total}</b>
                    {stat.errs > 0 && <span style={{ color: `rgb(${RED})` }}>· ⚠{stat.errs}</span>}
                  </span>
                ) : null}
                {elapsed > 0 && (
                  <span className="flex items-center gap-1 tabular-nums">
                    <span className="text-zinc-500">⏱</span> {fmtClock(elapsed)}
                  </span>
                )}
                {eta != null && (
                  <span className="flex items-center gap-1 tabular-nums">
                    <span className="text-zinc-500">resta</span> ~{fmtClock(eta)}
                  </span>
                )}
                {item.format && (
                  <span className="font-semibold px-1.5 py-0.5 rounded" style={{ color: `rgb(${EM})`, background: `rgba(${EM},0.12)`, border: `1px solid rgba(${EM},0.25)` }}>
                    {item.format.toUpperCase()}
                  </span>
                )}
                {item.enrichWithBeatport && (
                  <span className="font-semibold px-1.5 py-0.5 rounded text-[10px]" style={{ color: '#a7f3d0', background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.22)' }}>
                    ✓ Beatport
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ---- ações ---- */}
          <div className="flex items-center gap-2 mt-3">
            {failedItem && (
              <button
                onClick={() => { retryItem(item.id); dismiss(item.id); }}
                className="flex-1 h-8 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                style={{ background: `rgba(${EM},0.18)`, color: `rgb(${EM})`, border: `1px solid rgba(${EM},0.35)` }}
              >
                ↻ Tentar novamente
              </button>
            )}
            {failedItem ? (
              <button
                onClick={() => openQueue(item.id)}
                className="h-8 px-3 rounded-lg text-xs font-semibold transition-all"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                Detalhes
              </button>
            ) : (
              <>
                <button
                  onClick={() => openQueue(item.id)}
                  className="flex-1 h-8 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  ☰ Abrir fila
                </button>
                <button
                  onClick={() => cancelDownload(item.id)}
                  className="h-8 px-3 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                  style={{ background: `rgba(${RED},0.15)`, color: 'rgba(252,165,165,0.95)', border: `1px solid rgba(${RED},0.3)` }}
                >
                  ⛔ Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- card agrupado de álbum (várias faixas individuais do mesmo álbum) ----------
  function renderAlbumCard(group: AlbumGroup) {
    const items = group.items;
    const total = items.length;
    const done = items.filter(i => i.status === 'completed').length;
    const downloading = items.filter(i => i.status === 'downloading').length;
    const queued = items.filter(i => i.status === 'pending' || i.status === 'queued').length;
    const errs = items.filter(i => i.status === 'error').length;
    const pct = Math.round(
      items.reduce((s, i) => s + (i.status === 'completed' ? 100 : i.progress || 0), 0) / total,
    );

    const allFailed = errs === total;
    const accent = allFailed ? RED : errs > 0 ? AMBER : EM;
    const thumb = items.map(thumbOf).find(Boolean) || null;
    const ids = items.map(i => i.id);
    const failedItems = items.filter(i => i.status === 'error');

    const phaseLabel = allFailed ? 'Erro' : downloading > 0 ? 'Baixando' : queued > 0 ? 'Na fila' : 'Processando';
    const subtitle = [group.albumArtist, `${total} faixa${total !== 1 ? 's' : ''}`].filter(Boolean).join(' · ');

    const earliest = Math.min(...items.map(i => i.startTime || now));
    const elapsed = now - earliest;

    const R = 21;
    const C = 2 * Math.PI * R;
    const ringPct = allFailed ? 100 : pct;

    // faixa "em foco" para abrir a fila (primeira baixando, senão a primeira).
    const focusId = (items.find(i => i.status === 'downloading') || items[0]).id;

    return (
      <div
        key={group.id}
        className="relative overflow-hidden rounded-2xl backdrop-blur-xl animate-slide-down"
        style={{
          background:
            'linear-gradient(160deg, rgba(16,185,129,0.07) 0%, rgba(0,0,0,0.55) 45%, rgba(15,23,42,0.78) 100%)',
          border: `1px solid rgba(${accent}, 0.32)`,
          boxShadow: `0 16px 44px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset, 0 0 32px rgba(${accent},0.10)`,
        }}
      >
        <div className="p-3.5">
          {/* ---- header ---- */}
          <div className="flex items-start gap-3">
            {/* avatar com anel de progresso agregado + capa do álbum (com pilha) */}
            <div className="relative w-12 h-12 flex-shrink-0">
              {/* "pilha" de discos para sugerir agrupamento */}
              <div
                className="absolute rounded-full"
                style={{ inset: 5, transform: 'translate(3px,3px)', background: 'rgba(255,255,255,0.06)', border: `1px solid rgba(${accent},0.18)` }}
              />
              {!allFailed && (
                <div className="absolute inset-0 rounded-full animate-pulse" style={{ boxShadow: `0 0 16px rgba(${accent},0.45)` }} />
              )}
              <svg className="absolute inset-0 -rotate-90" width="48" height="48" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r={R} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="3" />
                <circle
                  cx="24" cy="24" r={R} fill="none"
                  stroke={`rgb(${accent})`} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - ringPct / 100)}
                  style={{ transition: 'stroke-dashoffset 0.5s ease', filter: `drop-shadow(0 0 4px rgba(${accent},0.6))` }}
                />
              </svg>
              <div
                className="absolute rounded-full flex items-center justify-center overflow-hidden"
                style={{ inset: 5, background: `radial-gradient(circle at 35% 30%, rgba(${accent},0.20), rgba(0,0,0,0.4))` }}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="w-full h-full object-cover" />
                ) : allFailed ? (
                  <span style={{ color: `rgb(${RED})` }} className="text-base">⚠</span>
                ) : (
                  <SoundWave color={`rgb(${EM})`} size="small" isPlaying />
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={{ color: `rgb(${accent})`, background: `rgba(${accent},0.13)`, border: `1px solid rgba(${accent},0.25)` }}
                >
                  Álbum
                </span>
                <p className="text-white text-sm font-semibold truncate flex-1" title={group.albumName}>
                  {group.albumName}
                </p>
                <button
                  onClick={() => dismissMany(ids)}
                  title="Fechar (não cancela os downloads)"
                  className="w-6 h-6 -mr-1 -mt-0.5 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors text-sm leading-none flex-shrink-0"
                >
                  ✕
                </button>
              </div>
              {subtitle && (
                <p className="text-[11px] text-zinc-400 truncate mt-0.5" title={subtitle}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* ---- corpo ---- */}
          <div className="mt-3">
            {/* fase + contagem */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md flex items-center gap-1.5"
                style={{ color: `rgb(${accent})`, background: `rgba(${accent},0.13)`, border: `1px solid rgba(${accent},0.25)` }}
              >
                {!allFailed && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: `rgb(${accent})` }} />}
                {phaseLabel}
              </span>
              <span className="text-[11px] text-zinc-400 truncate flex-1">
                {downloading > 0 && `${downloading} baixando`}
                {downloading > 0 && queued > 0 && ' · '}
                {queued > 0 && `${queued} na fila`}
                {errs > 0 && `${downloading || queued ? ' · ' : ''}${errs} com erro`}
              </span>
            </div>

            {/* barra de progresso agregada + % */}
            <div className="flex items-center gap-2.5">
              <div className="flex-1 h-2 rounded-full overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500 relative overflow-hidden"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, rgba(${accent},0.85), rgb(${accent}))` }}
                >
                  {!allFailed && (
                    <div
                      className="absolute inset-0 opacity-50"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)', animation: 'shimmer 1.8s infinite' }}
                    />
                  )}
                </div>
              </div>
              <span className="text-sm font-bold tabular-nums" style={{ color: `rgb(${accent})`, minWidth: 38, textAlign: 'right' }}>
                {pct}%
              </span>
            </div>

            {/* mini-segmentos: um por faixa do álbum */}
            <div className="flex gap-1 mt-2">
              {items.slice(0, 24).map((t, i) => (
                <div
                  key={i}
                  title={t.title}
                  className="h-1 flex-1 rounded-full"
                  style={{
                    background:
                      t.status === 'completed'
                        ? `rgb(${EM})`
                        : t.status === 'error'
                        ? `rgb(${RED})`
                        : t.status === 'downloading'
                        ? `rgba(${EM},0.55)`
                        : 'rgba(255,255,255,0.12)',
                  }}
                />
              ))}
            </div>

            {/* chips de info */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <span className="text-zinc-500">faixas</span>
                <b className="text-zinc-200">{done}/{total}</b>
                {errs > 0 && <span style={{ color: `rgb(${RED})` }}>· ⚠{errs}</span>}
              </span>
              {elapsed > 0 && (
                <span className="flex items-center gap-1 tabular-nums">
                  <span className="text-zinc-500">⏱</span> {fmtClock(elapsed)}
                </span>
              )}
              {items[0]?.format && (
                <span className="font-semibold px-1.5 py-0.5 rounded" style={{ color: `rgb(${EM})`, background: `rgba(${EM},0.12)`, border: `1px solid rgba(${EM},0.25)` }}>
                  {items[0].format.toUpperCase()}
                </span>
              )}
              {items.some(i => i.enrichWithBeatport) && (
                <span className="font-semibold px-1.5 py-0.5 rounded text-[10px]" style={{ color: '#a7f3d0', background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.22)' }}>
                  ✓ Beatport
                </span>
              )}
            </div>
          </div>

          {/* ---- ações ---- */}
          <div className="flex items-center gap-2 mt-3">
            {failedItems.length > 0 && (
              <button
                onClick={() => failedItems.forEach(i => retryItem(i.id))}
                className="flex-1 h-8 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                style={{ background: `rgba(${EM},0.18)`, color: `rgb(${EM})`, border: `1px solid rgba(${EM},0.35)` }}
              >
                ↻ Tentar {failedItems.length} faixa{failedItems.length !== 1 ? 's' : ''}
              </button>
            )}
            <button
              onClick={() => openQueue(focusId)}
              className="flex-1 h-8 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              ☰ Abrir fila
            </button>
            {!allFailed && (
              <button
                onClick={() => items.forEach(i => cancelDownload(i.id))}
                title="Cancelar todas as faixas do álbum"
                className="h-8 px-3 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                style={{ background: `rgba(${RED},0.15)`, color: 'rgba(252,165,165,0.95)', border: `1px solid rgba(${RED},0.3)` }}
              >
                ⛔ Cancelar tudo
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 w-[372px] max-w-[92vw]">
      {cards.map(c => (c.kind === 'album' ? renderAlbumCard(c) : renderSingleCard(c.item)))}

      {/* ---- card de resumo ---- */}
      {summaryNeeded && !summaryDismissed && (
        <div
          className="rounded-2xl backdrop-blur-xl p-3 animate-slide-down"
          style={{
            background: 'linear-gradient(160deg, rgba(16,185,129,0.07) 0%, rgba(0,0,0,0.55) 60%, rgba(15,23,42,0.78) 100%)',
            border: `1px solid rgba(${EM},0.28)`,
            boxShadow: '0 16px 44px rgba(0,0,0,0.5)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base" style={{ color: `rgb(${EM})` }}>⬇</span>
            <div className="flex-1 text-xs">
              <span className="text-white font-semibold">{downloadingCount}</span>
              <span className="text-zinc-400"> baixando</span>
              {queuedCount > 0 && (
                <>
                  <span className="text-zinc-600"> · </span>
                  <span className="text-zinc-300">{queuedCount}</span>
                  <span className="text-zinc-500"> na fila</span>
                </>
              )}
              {failedCount > 0 && (
                <span style={{ color: 'rgba(252,165,165,0.95)' }}> · ✕{failedCount}</span>
              )}
            </div>
            <button
              onClick={() => openQueue()}
              className="h-7 px-3 rounded-lg text-xs font-semibold transition-all"
              style={{ background: `rgba(${EM},0.2)`, color: '#fff', border: `1px solid rgba(${EM},0.35)` }}
            >
              Ver tudo
            </button>
            <button
              onClick={() => setSummaryDismissed(true)}
              title="Dispensar (não cancela)"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-colors text-sm leading-none"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
