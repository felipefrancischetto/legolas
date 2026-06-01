'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDownload } from '../contexts/DownloadContext';

interface DownloadToastsProps {
  setShowQueue: (show: boolean) => void;
}

// Máximo de cards por download exibidos simultaneamente (acima disso, vira resumo).
const MAX_CARDS = 3;

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

  const { failed, active, summaryNeeded, downloadingCount, queuedCount, failedCount } = useMemo(() => {
    const isFailed = (it: any) =>
      it.status === 'error' ||
      (it.isPlaylist && it.playlistItems?.some((t: any) => t.status === 'error' || t.trackState === 'failed'));

    const failed = queue.filter(it => isFailed(it) && !dismissed.has(it.id));
    const active = queue.filter(it => it.status === 'downloading' && !isFailed(it) && !dismissed.has(it.id));

    const downloadingCount = queue.filter(it => it.status === 'downloading').length;
    const queuedCount = queue.filter(it => it.status === 'pending' || it.status === 'queued').length;
    const failedCount = queue.filter(isFailed).length;

    const shown = [...failed, ...active];
    const summaryNeeded =
      shown.length > MAX_CARDS || downloadingCount + queuedCount + failedCount > shown.slice(0, MAX_CARDS).length;

    return { failed, active, summaryNeeded, downloadingCount, queuedCount, failedCount };
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

  const cards = [...failed, ...active].slice(0, MAX_CARDS);

  if (cards.length === 0 && !(downloadingCount || queuedCount || failedCount)) {
    return null;
  }

  const dismiss = (id: string) => setDismissed(prev => new Set(prev).add(id));

  const playlistStat = (it: any) => {
    if (!it.isPlaylist || !it.playlistItems?.length) return null;
    const total = it.playlistItems.length;
    const done = it.playlistItems.filter((t: any) => t.status === 'completed').length;
    const errs = it.playlistItems.filter((t: any) => t.status === 'error').length;
    const downloading = it.playlistItems.filter((t: any) => t.status === 'downloading').length;
    return { total, done, errs, downloading };
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 w-[372px] max-w-[92vw]">
      {cards.map(item => {
        const stat = playlistStat(item);
        const failedItem =
          item.status === 'error' ||
          (item.isPlaylist && item.playlistItems?.some((t: any) => t.status === 'error' || t.trackState === 'failed'));
        const isError = item.status === 'error';

        const pct = stat
          ? Math.round((stat.done / stat.total) * 100)
          : Math.round(item.progress || 0);

        const elapsed = item.startTime ? now - item.startTime : 0;
        const eta = pct > 2 && pct < 100 && elapsed > 1500 ? (elapsed / pct) * (100 - pct) : null;

        const phase = phaseOf(item.currentStep);
        const subtitle =
          [item.albumArtist, item.albumName].filter(Boolean).join(' — ') || safeHost(item.url);

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
            {/* trilho de progresso no topo */}
            {!isError && (
              <div
                className="absolute top-0 left-0 h-[3px] transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, rgba(${accent},0.5), rgb(${accent}))`,
                  boxShadow: `0 0 12px rgba(${accent},0.7)`,
                }}
              />
            )}

            <div className="p-3.5">
              {/* ---- header ---- */}
              <div className="flex items-start gap-3">
                {/* ícone de fase / capa */}
                <div
                  className="relative w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `radial-gradient(circle at 35% 30%, rgba(${accent},0.22), rgba(${accent},0.06))`,
                    border: `1px solid rgba(${accent},0.3)`,
                  }}
                >
                  {isError ? (
                    <span style={{ color: `rgb(${RED})` }} className="text-lg font-bold">✕</span>
                  ) : failedItem ? (
                    <span style={{ color: `rgb(${AMBER})` }} className="text-lg">⚠</span>
                  ) : (
                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" style={{ color: `rgb(${EM})` }}>
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
                      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  )}
                </div>

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
      })}

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
