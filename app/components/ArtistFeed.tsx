'use client';

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useDownload } from '../contexts/DownloadContext';
import { usePlayer } from '../contexts/PlayerContext';
import { safeGetItem, safeSetItem } from '../utils/localStorage';

interface FeedTrack {
  title: string;
  artist?: string;
  videoId: string;
  url: string;
  thumbnail?: string;
  duration?: string;
}

interface FeedRelease {
  album: string;
  artist: string;
  year?: string;
  type?: string;
  thumbnail?: string;
  playlistId?: string;
  playlistUrl?: string;
  totalTracks?: number;
  tracks: FeedTrack[];
}

interface FeedGroup {
  artist: string;
  lastSeen?: string;
  releases: FeedRelease[];
  tracks: FeedTrack[];
}

interface CuratedArtist {
  name: string;
  trackCount: number;
  lastSeen: string;
  enabled: boolean;
}

interface AlbumResult {
  album: string;
  artist: string;
  thumbnail?: string;
  playlistUrl?: string;
  playlistId?: string;
  year?: string;
  type?: string;
  totalTracks?: number;
  tracks?: Array<{ title: string; artist: string; videoId: string; url: string }>;
}

type SortKey = 'recent' | 'artist' | 'count' | 'duration';
type ViewMode = 'grouped' | 'grid' | 'list';

const FEED_CACHE_KEY = 'artist-feed-data';
const FEED_PREFS_KEY = 'artist-feed-prefs';

const previewKey = (videoId: string) => `preview:${videoId}`;
const ytThumb = (t: FeedTrack) => t.thumbnail || `https://img.youtube.com/vi/${t.videoId}/hqdefault.jpg`;

// Gradiente determinístico por nome (avatar fallback / acento da seção).
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
function relativeTime(iso?: string): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (isNaN(then)) return null;
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  const months = Math.round(d / 30);
  return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
}

// Versão/tipo da faixa extraído do título (Remix, Extended, etc.).
const TAG_PATTERNS: Array<[RegExp, string]> = [
  [/extended mix/i, 'Extended'],
  [/radio edit/i, 'Radio Edit'],
  [/original mix/i, 'Original'],
  [/\bvip\b/i, 'VIP'],
  [/\bremix\b/i, 'Remix'],
  [/\bbootleg\b/i, 'Bootleg'],
  [/\bmashup\b/i, 'Mashup'],
  [/\bedit\b/i, 'Edit'],
  [/\blive\b/i, 'Live'],
  [/acoustic|acústic/i, 'Acoustic'],
  [/instrumental/i, 'Instrumental'],
];
function extractTags(title: string): string[] {
  const out: string[] = [];
  for (const [re, label] of TAG_PATTERNS) {
    if (re.test(title) && !out.includes(label)) out.push(label);
  }
  return out.slice(0, 2);
}

// ---- Classificação de release (Álbum / EP / Single) ----
type ReleaseKind = 'album' | 'ep' | 'single';
function releaseKind(r: { type?: string; totalTracks?: number; tracks?: FeedTrack[] }): ReleaseKind {
  const t = (r.type || '').toLowerCase();
  if (/single/.test(t)) return 'single';
  if (/\bep\b/.test(t)) return 'ep';
  if (/album|álbum/.test(t)) return 'album';
  // Inferir pelo tamanho quando o YT Music não rotula o tipo.
  const n = r.totalTracks || r.tracks?.length || 0;
  if (n <= 1) return 'single';
  if (n <= 6) return 'ep';
  return 'album';
}
const RELEASE_LABEL: Record<ReleaseKind, string> = { album: 'Álbum', ep: 'EP', single: 'Single' };
const RELEASE_BADGE: Record<ReleaseKind, string> = {
  album: 'bg-violet-500/25 text-violet-100 border-violet-400/40',
  ep: 'bg-sky-500/25 text-sky-100 border-sky-400/40',
  single: 'bg-amber-500/25 text-amber-100 border-amber-400/40',
};
const releaseCover = (r: FeedRelease) => r.thumbnail || (r.tracks[0] ? ytThumb(r.tracks[0]) : '');
const releaseKey = (artist: string, r: FeedRelease, i: number) => `${artist}::${i}::${r.playlistId || r.album}`;

// ---- Equalizador animado (faixa tocando) ----
const Equalizer = ({ className = '' }: { className?: string }) => (
  <div className={`flex items-end gap-[2px] h-3.5 ${className}`} aria-hidden>
    {[0, 1, 2, 3].map((i) => (
      <span
        key={i}
        className="w-[3px] bg-emerald-400 rounded-full"
        style={{ height: '100%', transformOrigin: 'bottom', animation: `soundwave-${i} ${0.45 + i * 0.12}s ease-in-out ${i * 0.08}s infinite alternate` }}
      />
    ))}
  </div>
);

// ---- Card de faixa (memoizado) ----
interface TrackCardProps {
  track: FeedTrack;
  grid: boolean;
  index?: number;
  isPlaying: boolean;
  isQueued: boolean;
  isLoading?: boolean;
  /** Faixa já presente na biblioteca (marca "já tenho"). */
  owned?: boolean;
  onTogglePlay: (t: FeedTrack) => void;
  onDownload: (t: FeedTrack) => void;
  onPrefetch?: (videoId: string) => void;
}

const TagChips = ({ tags, className = '' }: { tags: string[]; className?: string }) => (
  tags.length > 0 ? (
    <span className={`flex items-center gap-1 flex-wrap ${className}`}>
      {tags.map((t) => (
        <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-white/10 text-emerald-300/90 border border-emerald-400/20">{t}</span>
      ))}
    </span>
  ) : null
);

const TrackCard = memo(({ track, grid, index, isPlaying, isQueued, isLoading, owned, onTogglePlay, onDownload, onPrefetch }: TrackCardProps) => {
  const [imgError, setImgError] = useState(false);
  const cover = imgError ? `https://img.youtube.com/vi/${track.videoId}/hqdefault.jpg` : ytThumb(track);
  const tags = useMemo(() => extractTags(track.title), [track.title]);
  const prefetch = () => onPrefetch?.(track.videoId);

  if (grid) {
    // ----- Card quadrado (Grade / Carrossel) -----
    return (
      <div className="group/card relative">
        <div className={`relative aspect-square rounded-2xl overflow-hidden bg-zinc-800 shadow-lg transition-all duration-300 ring-1 ${
          isPlaying ? 'ring-2 ring-emerald-400 shadow-emerald-500/20' : 'ring-white/5 group-hover/card:ring-white/15'
        }`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt={track.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
          />
          {/* Overlay gradiente */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-60 group-hover/card:opacity-90 transition-opacity duration-300" />

          {/* Duração */}
          {track.duration && (
            <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[10px] font-medium text-white/90 tabular-nums">
              {track.duration}
            </span>
          )}

          {/* Equalizador quando tocando */}
          {isPlaying && (
            <span className="absolute top-2 left-2 px-1.5 py-1 rounded-md bg-black/55 backdrop-blur-sm">
              <Equalizer />
            </span>
          )}

          {/* Abrir no YouTube */}
          <a
            href={track.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm text-white/90 hover:bg-white/90 hover:text-black flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all"
            style={{ opacity: isPlaying ? 0 : undefined }}
            title="Abrir no YouTube"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </a>

          {/* Play central */}
          <button
            onClick={() => onTogglePlay(track)}
            onMouseEnter={prefetch}
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
              isPlaying || isLoading ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'
            }`}
            title={isLoading ? 'Preparando prévia…' : isPlaying ? 'Pausar prévia' : 'Ouvir prévia'}
          >
            <span className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 ${
              isPlaying ? 'bg-emerald-400 text-black' : 'bg-emerald-500 text-black'
            }`}>
              {isLoading ? (
                <span className="w-6 h-6 border-[3px] border-black/30 border-t-black rounded-full animate-spin" />
              ) : isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
              ) : (
                <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </span>
          </button>

          {/* Download canto inferior */}
          <button
            onClick={() => onDownload(track)}
            disabled={isQueued}
            className={`absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-sm transition-all duration-200 ${
              isQueued
                ? 'bg-emerald-500/90 text-black scale-100'
                : 'bg-black/50 text-white hover:bg-white/90 hover:text-black opacity-0 group-hover/card:opacity-100 translate-y-1 group-hover/card:translate-y-0'
            }`}
            title={isQueued ? 'Já na fila' : 'Baixar (FLAC + Beatport)'}
          >
            {isQueued ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            )}
          </button>
        </div>

        <div className="mt-2 px-0.5">
          <p className="text-sm font-medium text-white truncate leading-tight" title={track.title}>{track.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
            <TagChips tags={tags} className="flex-shrink-0" />
          </div>
        </div>
      </div>
    );
  }

  // ----- Linha compacta (Lista / faixas de álbum) -----
  return (
    <div className={`group/row flex items-center gap-3 px-2.5 py-2 rounded-xl border transition-colors ${
      isPlaying ? 'border-emerald-500/40 bg-emerald-500/[0.07]' : 'border-transparent hover:bg-white/[0.05]'
    }`}>
      {typeof index === 'number' && (
        <span className="w-5 text-right text-xs text-zinc-600 tabular-nums flex-shrink-0 hidden sm:block group-hover/row:text-zinc-400">{index + 1}</span>
      )}
      <button onClick={() => onTogglePlay(track)} onMouseEnter={prefetch} className="relative flex-shrink-0 rounded-lg overflow-hidden" title={isLoading ? 'Preparando prévia…' : isPlaying ? 'Pausar prévia' : 'Ouvir prévia'}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} alt={track.title} width={48} height={48} loading="lazy" onError={() => setImgError(true)} className="w-12 h-12 rounded-lg object-cover bg-zinc-800" />
        <span className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${isPlaying || isLoading ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`}>
          {isLoading ? (
            <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : isPlaying ? (
            <Equalizer />
          ) : (
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          )}
        </span>
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className={`text-sm truncate ${owned ? 'text-zinc-500' : isPlaying ? 'text-emerald-300 font-medium' : 'text-white'}`}>{track.title}</p>
          {owned && (
            <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-white/5 text-zinc-400 border border-white/10" title="Já na biblioteca">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              Tenho
            </span>
          )}
          <TagChips tags={tags} className="flex-shrink-0 hidden sm:flex" />
        </div>
        <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
      </div>
      <a
        href={track.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 transition opacity-0 group-hover/row:opacity-100"
        title="Abrir no YouTube"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
      </a>
      {track.duration && <span className="text-xs text-zinc-500 tabular-nums flex-shrink-0 hidden sm:block w-10 text-right">{track.duration}</span>}
      <button
        onClick={() => onDownload(track)}
        disabled={isQueued}
        className={`flex-shrink-0 rounded-lg text-xs font-semibold border flex items-center gap-1.5 h-9 px-3 transition ${
          isQueued
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 cursor-default'
            : 'border-white/10 bg-white/5 text-white/90 hover:bg-white/15 hover:border-white/20'
        }`}
        title={isQueued ? 'Já na fila' : 'Baixar (FLAC + Beatport)'}
      >
        {isQueued ? (
          <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg><span className="hidden sm:inline">Na fila</span></>
        ) : (
          <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg><span className="hidden sm:inline">Baixar</span></>
        )}
      </button>
    </div>
  );
});
TrackCard.displayName = 'TrackCard';

// ===========================================================================
// Tabela densa estilo Beatport (modo "Lista")
// ===========================================================================

// Larguras compartilhadas entre o cabeçalho e as linhas (mantém o alinhamento)
const feedListCols = {
  index: 'w-8 flex-shrink-0 text-right pr-2',
  title: 'flex-1 min-w-0',
  version: 'w-44 flex-shrink-0 hidden lg:block',
  duration: 'w-16 flex-shrink-0 text-right hidden sm:block',
  actions: 'flex-shrink-0',
} as const;

interface FeedListRowProps {
  track: FeedTrack;
  index: number;
  isPlaying: boolean;
  isQueued: boolean;
  isLoading?: boolean;
  owned?: boolean;
  onTogglePlay: (t: FeedTrack) => void;
  onDownload: (t: FeedTrack) => void;
  onPrefetch?: (videoId: string) => void;
}

const FeedListRow = memo(({ track, index, isPlaying, isQueued, isLoading, owned, onTogglePlay, onDownload, onPrefetch }: FeedListRowProps) => {
  const [imgError, setImgError] = useState(false);
  const cover = imgError ? `https://img.youtube.com/vi/${track.videoId}/hqdefault.jpg` : ytThumb(track);
  const tags = useMemo(() => extractTags(track.title), [track.title]);
  const prefetch = () => onPrefetch?.(track.videoId);

  return (
    <div
      className={`group/row flex items-center gap-3 px-3 h-14 border-b border-white/[0.04] transition-colors ${
        isPlaying ? 'bg-emerald-500/10' : 'hover:bg-white/[0.04]'
      }`}
    >
      {/* Índice */}
      <div className={`${feedListCols.index} text-xs tabular-nums ${isPlaying ? 'text-emerald-400' : 'text-zinc-600 group-hover/row:text-zinc-400'}`}>
        {index + 1}
      </div>

      {/* Capa + play */}
      <button
        onClick={() => onTogglePlay(track)}
        onMouseEnter={prefetch}
        className="w-12 h-12 flex-shrink-0 relative rounded-lg overflow-hidden bg-zinc-800"
        title={isLoading ? 'Preparando prévia…' : isPlaying ? 'Pausar prévia' : 'Ouvir prévia'}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover} alt={track.title} width={48} height={48} loading="lazy" onError={() => setImgError(true)} className="w-12 h-12 object-cover" />
        <span className={`absolute inset-0 flex items-center justify-center bg-black/55 transition-opacity ${isPlaying || isLoading ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`}>
          {isLoading ? (
            <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : isPlaying ? (
            <Equalizer />
          ) : (
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          )}
        </span>
      </button>

      {/* Título / Artistas */}
      <div className={feedListCols.title}>
        <div className="flex items-center gap-1.5 min-w-0">
          <p className={`text-sm truncate leading-tight ${owned ? 'text-zinc-500' : isPlaying ? 'text-emerald-300 font-semibold' : 'text-white font-medium'}`} title={track.title}>
            {track.title}
          </p>
          {owned && (
            <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-white/5 text-zinc-400 border border-white/10" title="Já na biblioteca">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              Tenho
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-400 truncate leading-tight">{track.artist || 'Artista desconhecido'}</p>
      </div>

      {/* Versão (tags extraídas do título) */}
      <div className={`${feedListCols.version}`}>
        {tags.length > 0 ? <TagChips tags={tags} /> : <span className="text-xs text-zinc-600">—</span>}
      </div>

      {/* Duração */}
      <div className={`${feedListCols.duration} text-xs text-zinc-400 tabular-nums`}>
        {track.duration || '—'}
      </div>

      {/* Ações */}
      <div className={`${feedListCols.actions} w-[108px] flex items-center justify-end gap-1`}>
        <a
          href={track.url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 transition opacity-0 group-hover/row:opacity-100"
          title="Abrir no YouTube"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
        </a>
        <button
          onClick={() => onDownload(track)}
          disabled={isQueued}
          className={`w-8 h-8 rounded-lg flex items-center justify-center border transition ${
            isQueued
              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400 cursor-default'
              : 'border-white/10 bg-white/5 text-white/90 hover:bg-white/15 hover:border-white/20'
          }`}
          title={isQueued ? 'Já na fila' : 'Baixar (FLAC + Beatport)'}
        >
          {isQueued ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          )}
        </button>
      </div>
    </div>
  );
});
FeedListRow.displayName = 'FeedListRow';

// Capa de release com fallback: gradiente + iniciais quando não há thumb ou ela falha.
// `referrerPolicy=no-referrer` reduz 403/throttle do googleusercontent ao carregar muitas de uma vez.
const ReleaseThumb = ({ src, name, className = '' }: { src?: string; name: string; className?: string }) => {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className={`flex items-center justify-center font-bold text-white/90 bg-gradient-to-br ${gradientFor(name)} ${className}`}>
        {initialsOf(name)}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} loading="lazy" referrerPolicy="no-referrer" decoding="async" onError={() => setErr(true)} className={`object-cover ${className}`} />;
};

// ---- Card de release (álbum / EP / single) — estilo YouTube Music ----
interface ReleaseCardProps {
  release: FeedRelease;
  showArtist?: boolean;
  isPlaying: boolean;
  allQueued: boolean;
  /** Quantas faixas ainda NÃO estão na biblioteca (0 quando não resolvido ainda). */
  newCount: number;
  onOpen: (r: FeedRelease) => void;
  onPlay: (r: FeedRelease) => void;
  onDownload: (r: FeedRelease) => void;
  onPrefetch?: (videoId: string) => void;
}

const ReleaseCard = memo(({ release, showArtist, isPlaying, allQueued, newCount, onOpen, onPlay, onDownload, onPrefetch }: ReleaseCardProps) => {
  const kind = releaseKind(release);
  const cover = releaseCover(release);
  const total = release.totalTracks || release.tracks.length;
  const prefetch = () => release.tracks[0] && onPrefetch?.(release.tracks[0].videoId);

  return (
    <div className="group/card relative">
      <div
        onClick={() => onOpen(release)}
        className={`relative block w-full aspect-square rounded-2xl overflow-hidden bg-zinc-800 shadow-lg cursor-pointer transition-all duration-300 ring-1 ${
          isPlaying ? 'ring-2 ring-emerald-400 shadow-emerald-500/20' : 'ring-white/5 group-hover/card:ring-white/15'
        }`}
      >
        <ReleaseThumb src={cover} name={release.album} className="absolute inset-0 w-full h-full text-2xl transition-transform duration-500 group-hover/card:scale-110" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-70 group-hover/card:opacity-95 transition-opacity duration-300 pointer-events-none" />

        {/* Tipo + ano (canto superior esquerdo) */}
        <span className={`absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border backdrop-blur-sm ${RELEASE_BADGE[kind]}`}>
          {RELEASE_LABEL[kind]}{release.year ? ` • ${release.year}` : ''}
        </span>

        {/* Contagem de novidades (canto superior direito) */}
        {newCount > 0 && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-emerald-500/90 text-black text-[10px] font-bold tabular-nums">
            {newCount} nova{newCount !== 1 ? 's' : ''}
          </span>
        )}

        {/* Play central (prévia da 1ª faixa nova) */}
        <button
          onClick={(e) => { e.stopPropagation(); onPlay(release); }}
          onMouseEnter={prefetch}
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${isPlaying ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'}`}
          title={isPlaying ? 'Tocando prévia' : 'Ouvir prévia'}
        >
          <span className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform duration-200 hover:scale-110 ${isPlaying ? 'bg-emerald-400 text-black' : 'bg-emerald-500 text-black'}`}>
            {isPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
            ) : (
              <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
          </span>
        </button>

        {/* Total de faixas (canto inferior esquerdo) */}
        {total > 0 && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/55 backdrop-blur-sm text-[10px] font-medium text-white/90 pointer-events-none">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            {total}
          </span>
        )}

        {/* Baixar (canto inferior direito): novidades quando houver, senão o álbum todo */}
        <button
          onClick={(e) => { e.stopPropagation(); onDownload(release); }}
          disabled={allQueued}
          className={`absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-sm transition-all duration-200 ${
            allQueued
              ? 'bg-emerald-500/90 text-black'
              : 'bg-black/50 text-white hover:bg-white/90 hover:text-black opacity-0 group-hover/card:opacity-100 translate-y-1 group-hover/card:translate-y-0'
          }`}
          title={allQueued ? 'Tudo na fila' : newCount > 0 ? `Baixar ${newCount} novidade(s)` : 'Baixar álbum'}
        >
          {allQueued ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          )}
        </button>
      </div>

      <button onClick={() => onOpen(release)} className="mt-2 px-0.5 block w-full text-left">
        <p className="text-sm font-medium text-white truncate leading-tight hover:underline" title={release.album}>{release.album}</p>
        <p className="text-xs text-zinc-400 truncate mt-0.5">
          {[
            showArtist ? release.artist : (total > 0 ? `${RELEASE_LABEL[kind]} · ${total} ${total === 1 ? 'faixa' : 'faixas'}` : RELEASE_LABEL[kind]),
            release.year,
          ].filter(Boolean).join(' · ')}
        </p>
      </button>
    </div>
  );
});
ReleaseCard.displayName = 'ReleaseCard';

// ---- Skeleton de carregamento ----
const SkeletonCard = () => (
  <div className="animate-pulse">
    <div className="aspect-square rounded-2xl bg-white/5 relative overflow-hidden">
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
    <div className="mt-2 space-y-1.5">
      <div className="h-3 rounded bg-white/5 w-4/5" />
      <div className="h-2.5 rounded bg-white/5 w-2/5" />
    </div>
  </div>
);

// Normaliza um título de faixa para casar com a biblioteca ("já tenho").
// Espelha o normalizeTitle do servidor (remove feat./pontuação/acentos).
function normTitleKey(value: string): string {
  return (value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\((feat|ft|featuring)[^)]*\)/g, '')
    .replace(/\[(feat|ft|featuring)[^\]]*\]/g, '')
    .replace(/\b(feat|ft|featuring)\.?\s.*$/g, '')
    .replace(/\b(remaster(ed)?|official\s+(video|audio|music\s+video)|lyric\s+video|hd|hq)\b/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Normaliza grupos vindos da API/cache: garante `releases` (envolve faixas soltas
// de caches antigos num release sintético) e `tracks` achatadas.
function normalizeGroups(raw: any): FeedGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g: any): FeedGroup => {
      const flatTracks: FeedTrack[] = Array.isArray(g?.tracks) ? g.tracks : [];
      let releases: FeedRelease[] = Array.isArray(g?.releases) ? g.releases : [];
      if (releases.length === 0 && flatTracks.length > 0) {
        releases = [{ album: 'Lançamentos recentes', artist: g.artist, type: 'Single', totalTracks: flatTracks.length, tracks: flatTracks }];
      }
      const tracks = flatTracks.length > 0 ? flatTracks : releases.flatMap((r) => r.tracks || []);
      return { artist: g?.artist, lastSeen: g?.lastSeen, releases, tracks };
    })
    .filter((g) => g.artist && (g.tracks.length > 0 || g.releases.length > 0));
}

export default function ArtistFeed() {
  const { addToQueue, addToast } = useDownload();
  const { playerState, play, pause, resume } = usePlayer();

  const [groups, setGroups] = useState<FeedGroup[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [queued, setQueued] = useState<Set<string>>(new Set());

  // Toolbar / preferências
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [view, setView] = useState<ViewMode>('grouped');
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);

  // Prévia: aquecer cache no servidor ao passar o mouse (play percebido instantâneo).
  const prefetched = useState(() => new Set<string>())[0];
  const prefetchPreview = useCallback((videoId: string) => {
    if (prefetched.has(videoId)) return;
    prefetched.add(videoId);
    fetch(`/api/preview-stream?videoId=${encodeURIComponent(videoId)}`, { headers: { Range: 'bytes=0-1' } }).catch(() => {});
  }, [prefetched]);

  // Gerenciar artistas
  const [manageOpen, setManageOpen] = useState(false);
  const [artists, setArtists] = useState<CuratedArtist[]>([]);
  const [savingArtists, setSavingArtists] = useState(false);

  // Discografia por artista (carregada automaticamente na visão "Coleção")
  const [albums, setAlbums] = useState<Record<string, { loading: boolean; items: AlbumResult[] }>>({});

  // Feed por release: modal de detalhe, expansão na Lista e faixas completas (lazy por playlistId).
  const [modalRelease, setModalRelease] = useState<FeedRelease | null>(null);
  const [expandedReleases, setExpandedReleases] = useState<Set<string>>(new Set());
  const [releaseFull, setReleaseFull] = useState<Record<string, { loading: boolean; tracks: FeedTrack[] }>>({});

  // Títulos já presentes na biblioteca — para marcar "já tenho" sem filtrar a discografia.
  const [ownedKeys, setOwnedKeys] = useState<Set<string>>(new Set());
  const loadOwned = useCallback(async () => {
    try {
      const res = await fetch('/api/files', { cache: 'no-store' });
      const data = await res.json();
      const files: any[] = Array.isArray(data?.files) ? data.files : [];
      const keys = new Set<string>();
      for (const f of files) {
        const k = normTitleKey(f.title || f.displayName || f.name || '');
        if (k) keys.add(k);
      }
      setOwnedKeys(keys);
    } catch { /* silencioso */ }
  }, []);
  const isOwned = useCallback((t: FeedTrack) => ownedKeys.size > 0 && ownedKeys.has(normTitleKey(t.title)), [ownedKeys]);
  const newCountOf = useCallback((r: FeedRelease) => r.tracks.reduce((n, t) => (isOwned(t) ? n : n + 1), 0), [isOwned]);

  const loadFeed = useCallback(async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/artist-feed${refresh ? '?refresh=true' : ''}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro HTTP ${res.status}`);
      setGroups(normalizeGroups(data.groups));
      setFetchedAt(data.fetchedAt || null);
      if (data.message) setMessage(data.message);
      safeSetItem(FEED_CACHE_KEY, { groups: data.groups, fetchedAt: data.fetchedAt }, { maxSize: 2 * 1024 * 1024, onError: () => {} });
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar o feed');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadArtists = useCallback(async () => {
    try {
      const res = await fetch('/api/artists', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && Array.isArray(data.artists)) setArtists(data.artists);
    } catch { /* silencioso */ }
  }, []);

  // Cache local instantâneo + carregar prefs + buscar feed e artistas.
  useEffect(() => {
    const cached = safeGetItem<{ groups?: FeedGroup[]; fetchedAt?: string }>(FEED_CACHE_KEY);
    if (cached?.groups) { setGroups(normalizeGroups(cached.groups)); setFetchedAt(cached.fetchedAt || null); }
    const prefs = safeGetItem<{ view?: ViewMode }>(FEED_PREFS_KEY);
    // Ordenação não é restaurada: o feed sempre abre em "Mais recente" em qualquer
    // visualização. O dropdown segue disponível para reordenar dentro da sessão.
    if (prefs?.view) setView(prefs.view);
    loadFeed(false);
    loadArtists();
    loadOwned();
  }, [loadFeed, loadArtists, loadOwned]);

  useEffect(() => {
    // Só a visualização é persistida; a ordenação volta sempre para "Mais recente".
    safeSetItem(FEED_PREFS_KEY, { view }, { maxSize: 1024, onError: () => {} });
  }, [view]);

  // Trava o scroll do body e fecha com ESC enquanto o modal de release está aberto.
  useEffect(() => {
    if (!modalRelease) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModalRelease(null); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = original; document.removeEventListener('keydown', onKey); };
  }, [modalRelease]);

  // ---- Player nativo (prévia) ----
  const playingVideoId = playerState.currentFile?.isPreview && playerState.isPlaying
    ? (playerState.currentFile.name || '').replace('preview:', '')
    : null;

  const handleTogglePlay = useCallback((track: FeedTrack) => {
    const key = previewKey(track.videoId);
    if (playerState.currentFile?.name === key) {
      if (playerState.isPlaying) pause(); else resume();
      return;
    }
    play({
      name: key,
      displayName: track.title,
      path: '',
      size: 0,
      title: track.title,
      artist: track.artist || '',
      duration: track.duration,
      thumbnail: ytThumb(track),
      streamUrl: `/api/preview-stream?videoId=${encodeURIComponent(track.videoId)}`,
      isPreview: true,
    } as any, true);
  }, [play, pause, resume, playerState.currentFile, playerState.isPlaying]);

  // ---- Downloads ----
  const queueTrack = useCallback((track: { url: string; title: string; artist?: string }) => {
    addToQueue({
      url: track.url,
      title: track.title,
      format: 'flac',
      enrichWithBeatport: true,
      showBeatportPage: false,
      isPlaylist: false,
      status: 'pending',
      steps: [],
    });
  }, [addToQueue]);

  const handleDownload = useCallback((track: FeedTrack) => {
    queueTrack(track);
    setQueued((prev) => new Set(prev).add(track.videoId));
    addToast({ title: `📥 "${track.title}" adicionada à fila` });
  }, [queueTrack, addToast]);

  const handleDownloadArtist = useCallback((group: FeedGroup) => {
    // Junta as faixas que ainda NÃO tenho de todos os releases (resolvidos no servidor ou via lazy).
    const all = group.releases.flatMap((r) => {
      const tr = r.tracks.length > 0 ? r.tracks : (r.playlistId ? releaseFull[r.playlistId]?.tracks || [] : []);
      return tr.filter((t) => !isOwned(t));
    });
    let n = 0;
    setQueued((prev) => {
      const next = new Set(prev);
      all.forEach((t) => { if (!next.has(t.videoId)) { queueTrack(t); next.add(t.videoId); n++; } });
      return next;
    });
    addToast({ title: `📥 ${n} novidade(s) de ${group.artist} na fila` });
  }, [releaseFull, isOwned, queueTrack, addToast]);

  // ---- Discografia (lazy via /api/artist-albums) ----
  // Carrega a discografia COMPLETA de um artista uma única vez (idempotente).
  // Não há mais toggle: a discografia é exibida direto na seção do artista.
  const loadAlbums = useCallback(async (artist: string) => {
    let already = false;
    setAlbums((p) => {
      if (p[artist]) { already = true; return p; }
      return { ...p, [artist]: { loading: true, items: [] } };
    });
    if (already) return;
    try {
      const res = await fetch(`/api/artist-albums?artist=${encodeURIComponent(artist)}`, { cache: 'no-store' });
      const data = await res.json();
      const items: AlbumResult[] = res.ok && data.success && Array.isArray(data.albums) ? data.albums : [];
      setAlbums((p) => ({ ...p, [artist]: { loading: false, items } }));
    } catch {
      setAlbums((p) => ({ ...p, [artist]: { loading: false, items: [] } }));
    }
  }, []);

  const extractPlaylistId = (url?: string) => url?.match(/[?&]list=([^&]+)/)?.[1] || null;

  const toFeedTrack = (t: { title: string; artist?: string; videoId: string; url: string }, albumThumb?: string): FeedTrack => ({
    title: t.title,
    artist: t.artist,
    videoId: t.videoId,
    url: t.url || `https://music.youtube.com/watch?v=${t.videoId}`,
    thumbnail: albumThumb || `https://img.youtube.com/vi/${t.videoId}/hqdefault.jpg`,
  });

  // Expandir um álbum para listar suas faixas (todas, via playlistId do YT Music).
  const handleDownloadAlbum = useCallback(async (album: AlbumResult) => {
    let tracks = album.tracks || [];
    const playlistId = extractPlaylistId(album.playlistUrl);
    if (playlistId) {
      try {
        const res = await fetch(`/api/search-albums?playlistId=${encodeURIComponent(playlistId)}`);
        const data = await res.json();
        if (res.ok && data.success && Array.isArray(data.tracks) && data.tracks.length > 0) {
          tracks = data.tracks;
        }
      } catch { /* usa as tracks parciais */ }
    }
    const valid = tracks.filter((t) => t.url);
    if (valid.length === 0) { addToast({ title: '❌ Álbum sem faixas com link' }); return; }
    valid.forEach((t) => queueTrack({ url: t.url, title: t.title, artist: t.artist }));
    addToast({ title: `📥 ${valid.length} faixa(s) do álbum "${album.album}" na fila` });
  }, [queueTrack, addToast]);

  // ---- Feed por release ----
  // Baixar o release COMPLETO (resolve a tracklist inteira via playlistId).
  const handleDownloadReleaseFull = useCallback((r: FeedRelease) => {
    handleDownloadAlbum({
      album: r.album,
      artist: r.artist,
      playlistUrl: r.playlistUrl,
      thumbnail: r.thumbnail,
      tracks: r.tracks.map((t) => ({ title: t.title, artist: t.artist || r.artist, videoId: t.videoId, url: t.url })),
    });
  }, [handleDownloadAlbum]);

  // Carregar a tracklist COMPLETA de um release (lazy, cacheada por playlistId).
  const loadReleaseFull = useCallback(async (r: FeedRelease) => {
    const pid = r.playlistId;
    if (!pid || releaseFull[pid]) return;
    setReleaseFull((p) => ({ ...p, [pid]: { loading: true, tracks: [] } }));
    try {
      const res = await fetch(`/api/search-albums?playlistId=${encodeURIComponent(pid)}`);
      const data = await res.json();
      const tracks: FeedTrack[] = (res.ok && data.success && Array.isArray(data.tracks))
        ? data.tracks.filter((t: any) => t.videoId).map((t: any) => toFeedTrack(t, r.thumbnail))
        : [];
      setReleaseFull((p) => ({ ...p, [pid]: { loading: false, tracks } }));
    } catch {
      setReleaseFull((p) => ({ ...p, [pid]: { loading: false, tracks: [] } }));
    }
  }, [releaseFull]);

  // Faixas resolvidas de um release (do servidor ou do cache lazy).
  const resolvedTracks = useCallback((r: FeedRelease): FeedTrack[] => (
    r.tracks.length > 0 ? r.tracks : (r.playlistId ? releaseFull[r.playlistId]?.tracks || [] : [])
  ), [releaseFull]);

  // Baixar: prioriza as faixas que ainda NÃO tenho; se já tenho tudo, baixa o release inteiro;
  // se ainda não resolveu as faixas, resolve via playlistId e baixa o álbum completo.
  const handleDownloadReleaseNew = useCallback((r: FeedRelease) => {
    const resolved = resolvedTracks(r);
    if (resolved.length === 0) { handleDownloadReleaseFull(r); return; }
    const missing = resolved.filter((t) => !isOwned(t));
    const list = missing.length > 0 ? missing : resolved;
    let n = 0;
    setQueued((prev) => {
      const next = new Set(prev);
      list.forEach((t) => { if (!next.has(t.videoId)) { queueTrack(t); next.add(t.videoId); n++; } });
      return next;
    });
    addToast({ title: `📥 ${n} faixa(s) de "${r.album}" na fila` });
  }, [resolvedTracks, handleDownloadReleaseFull, isOwned, queueTrack, addToast]);

  const playRelease = useCallback((r: FeedRelease) => {
    const first = resolvedTracks(r)[0];
    if (first) { handleTogglePlay(first); return; }
    loadReleaseFull(r); // não resolvido ainda: carrega; o usuário toca ao expandir
  }, [resolvedTracks, handleTogglePlay, loadReleaseFull]);

  const openReleaseModal = useCallback((r: FeedRelease) => { setModalRelease(r); loadReleaseFull(r); }, [loadReleaseFull]);

  const toggleExpandRelease = useCallback((key: string) => {
    setExpandedReleases((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // ---- Gerenciar artistas ----
  const persistArtists = useCallback(async (next: CuratedArtist[]) => {
    setArtists(next);
    setSavingArtists(true);
    try {
      await fetch('/api/artists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update', artists: next }) });
    } catch { addToast({ title: '⚠️ Erro ao salvar artistas' }); } finally { setSavingArtists(false); }
  }, [addToast]);

  const toggleArtist = useCallback((name: string) => {
    persistArtists(artists.map((a) => (a.name === name ? { ...a, enabled: !a.enabled } : a)));
  }, [artists, persistArtists]);
  const removeArtist = useCallback((name: string) => {
    persistArtists(artists.filter((a) => a.name !== name));
  }, [artists, persistArtists]);

  const syncLibrary = useCallback(async () => {
    setSavingArtists(true);
    try {
      const res = await fetch('/api/artists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync' }) });
      const data = await res.json();
      if (res.ok && Array.isArray(data.artists)) {
        setArtists(data.artists);
        addToast({ title: `🔄 ${data.artists.length} artista(s) sincronizado(s)` });
      }
    } catch { addToast({ title: '⚠️ Erro ao sincronizar' }); } finally { setSavingArtists(false); }
  }, [addToast]);

  // ---- Filtro + ordenação (derivado) ----
  // Mantém a discografia COMPLETA (todos os álbuns/singles) — fiel ao YouTube Music.
  // A busca filtra releases por nome do álbum, artista ou faixa, sem exigir faixas resolvidas.
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    let gs = groups.map((g) => {
      const releases = !q
        ? g.releases
        : g.releases.filter((r) =>
            r.album.toLowerCase().includes(q) ||
            r.artist.toLowerCase().includes(q) ||
            r.tracks.some((t) => t.title.toLowerCase().includes(q) || (t.artist || '').toLowerCase().includes(q))
          );
      const tracks = releases.flatMap((r) => r.tracks);
      return { ...g, releases, tracks };
    }).filter((g) => g.releases.length > 0 || (!!q && g.artist.toLowerCase().includes(q)));

    const cmp: Record<SortKey, (a: FeedGroup, b: FeedGroup) => number> = {
      // Mais recente: ano do lançamento mais novo (desc); empate → mais lançamentos primeiro.
      recent: (a, b) => (new Date(b.lastSeen || 0).getTime()) - (new Date(a.lastSeen || 0).getTime()) || (b.releases.length - a.releases.length),
      artist: (a, b) => a.artist.localeCompare(b.artist),
      count: (a, b) => b.releases.length - a.releases.length || a.artist.localeCompare(b.artist),
      duration: (a, b) => a.artist.localeCompare(b.artist),
    };
    return [...gs].sort(cmp[sortKey]);
  }, [groups, search, sortKey]);

  // Filtro por artista selecionado na barra lateral (se ainda existir no resultado).
  const displayedGroups = useMemo(() => {
    if (selectedArtist && filteredGroups.some((g) => g.artist === selectedArtist)) {
      return filteredGroups.filter((g) => g.artist === selectedArtist);
    }
    return filteredGroups;
  }, [filteredGroups, selectedArtist]);

  // Carrega automaticamente a discografia completa dos artistas exibidos na visão
  // "Coleção" (sem botão). `loadAlbums` é idempotente, então só busca o que falta.
  useEffect(() => {
    if (view !== 'grouped') return;
    displayedGroups.forEach((g) => loadAlbums(g.artist));
  }, [view, displayedGroups, loadAlbums]);

  // Lista achatada de releases (todos os artistas exibidos) para a Grade e a Lista.
  const allReleases = useMemo(() => {
    const items = displayedGroups.flatMap((g) =>
      g.releases.map((release) => ({ release, artist: g.artist, lastSeen: g.lastSeen }))
    );
    const yr = (r: FeedRelease) => parseInt(r.year || '', 10) || 0;
    const sorters: Record<SortKey, (a: typeof items[number], b: typeof items[number]) => number> = {
      recent: (a, b) => yr(b.release) - yr(a.release) || b.release.tracks.length - a.release.tracks.length,
      count: (a, b) => b.release.tracks.length - a.release.tracks.length,
      artist: (a, b) => a.artist.localeCompare(b.artist) || a.release.album.localeCompare(b.release.album),
      duration: (a, b) => yr(b.release) - yr(a.release),
    };
    return [...items].sort(sorters[sortKey]);
  }, [displayedGroups, sortKey]);

  const totalReleases = filteredGroups.reduce((s, g) => s + g.releases.length, 0);
  const enabledCount = artists.filter((a) => a.enabled).length;

  // Faixa cuja prévia está sendo preparada (download/transcode no servidor).
  const loadingVideoId = playerState.currentFile?.isPreview && playerState.isLoading
    ? (playerState.currentFile.name || '').replace('preview:', '')
    : null;

  const isPlaying = (videoId: string) => playingVideoId === videoId;
  const isQueued = (videoId: string) => queued.has(videoId);
  const isLoadingTrack = (videoId: string) => loadingVideoId === videoId;
  const releasePlaying = (r: FeedRelease) => resolvedTracks(r).some((t) => isPlaying(t.videoId));
  const releaseAllQueued = (r: FeedRelease) => {
    const missing = resolvedTracks(r).filter((t) => !isOwned(t));
    return missing.length > 0 && missing.every((t) => isQueued(t.videoId));
  };

  const hasData = groups.length > 0;
  const fetchedRel = relativeTime(fetchedAt || undefined);

  // ---- Cabeçalho de uma seção de artista (avatar + colagem de capas) ----
  const renderArtistHeader = (group: FeedGroup) => {
    const covers = group.releases.slice(0, 4).map((r) => r.thumbnail).filter(Boolean) as string[];
    const grad = gradientFor(group.artist);
    const seen = relativeTime(group.lastSeen);
    const newCount = group.releases.reduce((s, r) => s + newCountOf(r), 0);
    return (
      <div className="relative overflow-hidden rounded-2xl mb-3">
        {/* Colagem desfocada ao fundo */}
        <div className="absolute inset-0 flex">
          {covers.map((c, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={c} alt="" aria-hidden className="flex-1 h-full object-cover" />
          ))}
          {covers.length === 0 && <div className={`flex-1 bg-gradient-to-br ${grad}`} />}
        </div>
        <div className="absolute inset-0 bg-black/55 backdrop-blur-xl" />
        <div className={`absolute inset-x-0 bottom-0 h-px bg-gradient-to-r ${grad} opacity-70`} />

        <div className="relative flex items-center gap-3 p-3">
          {/* Avatar */}
          <div className={`relative w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg bg-gradient-to-br ${grad} flex-shrink-0`}>
            {covers[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={covers[0]} alt={group.artist} className="absolute inset-0 w-full h-full rounded-full object-cover" />
            ) : initialsOf(group.artist)}
            <span className="absolute inset-0 rounded-full ring-1 ring-white/20" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white truncate">{group.artist}</h3>
              <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 text-[10px] font-bold uppercase tracking-wide">
                {group.releases.length} lançamento{group.releases.length !== 1 ? 's' : ''}
              </span>
              {newCount > 0 && (
                <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wide">
                  {newCount} nova{newCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {seen && <p className="text-[11px] text-zinc-400 mt-0.5">Último lançamento {seen}</p>}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {newCount > 0 && (
              <button
                onClick={() => handleDownloadArtist(group)}
                className="h-9 px-3.5 rounded-lg text-xs font-bold bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-[1.03] transition flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Baixar novidades ({newCount})
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ---- Discografia completa do artista (carregada automaticamente) ----
  const renderAlbumsPanel = (group: FeedGroup) => {
    const disco = albums[group.artist];
    const loading = !disco || disco.loading;
    const items = disco?.items || [];
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-900/50 p-3">
        <div className="flex items-center gap-2 mb-2.5 px-0.5">
          <h4 className="text-sm font-bold text-white/90">Discografia</h4>
          {items.length > 0 && <span className="text-xs text-zinc-500 tabular-nums">{items.length}</span>}
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-zinc-400 py-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Buscando discografia…
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-zinc-400 py-1">Nenhum álbum encontrado.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((al, i) => {
              const r: FeedRelease = {
                album: al.album,
                artist: al.artist || group.artist,
                year: al.year,
                type: al.type,
                thumbnail: al.thumbnail,
                playlistId: al.playlistId || extractPlaylistId(al.playlistUrl) || undefined,
                playlistUrl: al.playlistUrl,
                totalTracks: al.totalTracks,
                tracks: (al.tracks || []).filter((t) => t.videoId).map((t) => toFeedTrack(t, al.thumbnail)),
              };
              return (
                <ReleaseCard
                  key={`${al.album}-${i}`}
                  release={r}
                  showArtist={false}
                  isPlaying={releasePlaying(r)}
                  allQueued={releaseAllQueued(r)}
                  newCount={newCountOf(r)}
                  onOpen={openReleaseModal}
                  onPlay={playRelease}
                  onDownload={handleDownloadReleaseNew}
                  onPrefetch={prefetchPreview}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ---- Tracklist de um release (faixas + marca "já tenho") ----
  const renderReleaseTracks = (release: FeedRelease, dense = false) => {
    const pid = release.playlistId;
    const full = pid ? releaseFull[pid] : undefined;
    const list = release.tracks.length > 0 ? release.tracks : (full?.tracks || []);
    const loading = list.length === 0 && (!full || full.loading);
    if (list.length === 0) {
      return loading
        ? <div className="flex items-center gap-2 text-xs text-zinc-400 py-3 px-1"><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Carregando faixas…</div>
        : <p className="text-xs text-zinc-500 py-2 px-1">Faixas indisponíveis para este lançamento.</p>;
    }
    return (
      <>
        {list.map((t, ti) => (
          dense
            ? <FeedListRow key={t.videoId} track={t} index={ti} owned={isOwned(t)} isPlaying={isPlaying(t.videoId)} isQueued={isQueued(t.videoId)} isLoading={isLoadingTrack(t.videoId)} onTogglePlay={handleTogglePlay} onDownload={handleDownload} onPrefetch={prefetchPreview} />
            : <TrackCard key={t.videoId} track={t} grid={false} index={ti} owned={isOwned(t)} isPlaying={isPlaying(t.videoId)} isQueued={isQueued(t.videoId)} isLoading={isLoadingTrack(t.videoId)} onTogglePlay={handleTogglePlay} onDownload={handleDownload} onPrefetch={prefetchPreview} />
        ))}
      </>
    );
  };

  // ---- Modal de detalhe do release (estilo página de álbum do YT Music) ----
  const renderReleaseModal = () => {
    if (!modalRelease) return null;
    const r = modalRelease;
    const kind = releaseKind(r);
    const cover = releaseCover(r);
    const tracks = resolvedTracks(r);
    const total = r.totalTracks || tracks.length;
    const newCount = tracks.reduce((n, t) => (isOwned(t) ? n : n + 1), 0);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-fade-in" onClick={() => setModalRelease(null)} />
        <div className="relative w-full max-w-2xl max-h-[86vh] flex flex-col rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl overflow-hidden animate-slide-up">
          {/* Cabeçalho */}
          <div className="relative p-5 flex-shrink-0">
            <div className="absolute inset-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {cover && <img src={cover} alt="" aria-hidden className="w-full h-full object-cover" />}
              <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-2xl" />
            </div>
            <button onClick={() => setModalRelease(null)} className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/40 hover:bg-white/90 hover:text-black text-white flex items-center justify-center transition" title="Fechar">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="relative flex gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {cover
                ? <img src={cover} alt={r.album} className="w-28 h-28 rounded-2xl object-cover shadow-xl ring-1 ring-white/10 flex-shrink-0" />
                : <div className={`w-28 h-28 rounded-2xl bg-gradient-to-br ${gradientFor(r.artist)} flex-shrink-0`} />}
              <div className="min-w-0 flex flex-col justify-end">
                <span className={`self-start px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${RELEASE_BADGE[kind]}`}>
                  {RELEASE_LABEL[kind]}{r.year ? ` • ${r.year}` : ''}
                </span>
                <h3 className="text-xl font-extrabold text-white leading-tight mt-1.5 line-clamp-2" title={r.album}>{r.album}</h3>
                <p className="text-sm text-zinc-300 truncate mt-0.5">{r.artist}</p>
                <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">
                  {total > 0 ? `${total} ${total === 1 ? 'faixa' : 'faixas'}` : RELEASE_LABEL[kind]}
                  {newCount > 0 && <span className="text-emerald-400"> • {newCount} nova{newCount !== 1 ? 's' : ''}</span>}
                </p>
              </div>
            </div>
            <div className="relative flex items-center gap-2 mt-4 flex-wrap">
              {newCount > 0 && (
                <button onClick={() => handleDownloadReleaseNew(r)} className="h-10 px-4 rounded-xl text-sm font-bold bg-emerald-500 text-black hover:bg-emerald-400 transition flex items-center gap-2 shadow-lg shadow-emerald-500/20">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Baixar {newCount} nova{newCount !== 1 ? 's' : ''}
                </button>
              )}
              {r.playlistId && (
                <button onClick={() => handleDownloadReleaseFull(r)} className={`h-10 px-4 rounded-xl text-sm font-semibold border transition ${newCount > 0 ? 'border-white/15 bg-white/10 text-white/90 hover:bg-white/20' : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'}`}>
                  Baixar álbum completo
                </button>
              )}
              {(r.playlistUrl || r.tracks[0]?.url) && (
                <a href={r.playlistUrl || r.tracks[0].url} target="_blank" rel="noopener noreferrer" className="h-10 w-10 rounded-xl border border-white/15 bg-white/5 text-white/80 hover:bg-white/15 flex items-center justify-center transition" title="Abrir no YouTube Music">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              )}
            </div>
          </div>
          {/* Tracklist */}
          <div className="flex-1 overflow-y-auto custom-scroll p-3 space-y-1 border-t border-white/5">
            {renderReleaseTracks(r)}
          </div>
        </div>
      </div>
    );
  };

  // ---- Carrossel de releases (Coleção) ----
  const renderReleaseRow = (title: string, releases: FeedRelease[], showArtist = false) => (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2.5 px-0.5">
        <h4 className="text-sm font-bold text-white/90">{title}</h4>
        <span className="text-xs text-zinc-500 tabular-nums">{releases.length}</span>
      </div>
      <div className="flex gap-4 overflow-x-auto custom-scroll pb-3 -mx-1 px-1 snap-x">
        {releases.map((r, i) => (
          <div key={releaseKey(r.artist, r, i)} className="w-44 sm:w-48 flex-shrink-0 snap-start">
            <ReleaseCard
              release={r}
              showArtist={showArtist}
              isPlaying={releasePlaying(r)}
              allQueued={releaseAllQueued(r)}
              newCount={newCountOf(r)}
              onOpen={openReleaseModal}
              onPlay={playRelease}
              onDownload={handleDownloadReleaseNew}
              onPrefetch={prefetchPreview}
            />
          </div>
        ))}
      </div>
    </div>
  );

  // ---- Bloco de release na Lista (cabeçalho + faixas expansíveis) ----
  const renderReleaseListBlock = (artist: string, release: FeedRelease, idx: number) => {
    const key = releaseKey(artist, release, idx);
    const open = expandedReleases.has(key);
    const kind = releaseKind(release);
    const cover = releaseCover(release);
    const total = release.totalTracks || release.tracks.length;
    const newCount = newCountOf(release);
    const playing = releasePlaying(release);
    const allQueued = releaseAllQueued(release);
    const expand = () => { toggleExpandRelease(key); if (!open && release.tracks.length === 0) loadReleaseFull(release); };
    return (
      <div key={key} className={`rounded-2xl border overflow-hidden transition-colors ${playing ? 'border-emerald-500/40 bg-emerald-500/[0.04]' : 'border-white/10 bg-zinc-900/40'}`}>
        <div className="flex items-center gap-3 p-2.5">
          {/* Capa + play */}
          <button onClick={() => playRelease(release)} className="relative w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden bg-zinc-800 group/cv" title="Ouvir prévia">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cover ? <img src={cover} alt={release.album} className="w-full h-full object-cover" /> : <div className={`w-full h-full bg-gradient-to-br ${gradientFor(artist)}`} />}
            <span className={`absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity ${playing ? 'opacity-100' : 'opacity-0 group-hover/cv:opacity-100'}`}>
              {playing ? <Equalizer /> : <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
            </span>
          </button>

          {/* Título + meta (expande) */}
          <button onClick={expand} className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${RELEASE_BADGE[kind]}`}>{RELEASE_LABEL[kind]}</span>
              <p className="text-sm font-semibold text-white truncate" title={release.album}>{release.album}</p>
            </div>
            <p className="text-xs text-zinc-400 truncate mt-0.5 flex items-center gap-1">
              <span>{release.artist}</span>
              {total > 0 && <><span className="text-zinc-600">·</span><span className="tabular-nums">{total} faixas</span></>}
              {release.year && <><span className="text-zinc-600">·</span><span>{release.year}</span></>}
            </p>
          </button>

          {/* Novidades + ações */}
          {newCount > 0 && (
            <span className="hidden sm:inline-flex flex-shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wide">
              {newCount} nova{newCount !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => handleDownloadReleaseNew(release)}
            disabled={allQueued}
            className={`flex-shrink-0 h-9 px-3 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition ${
              allQueued ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 cursor-default' : 'border-white/10 bg-white/5 text-white/90 hover:bg-white/15'
            }`}
            title={allQueued ? 'Na fila' : newCount > 0 ? 'Baixar novidades' : 'Baixar álbum'}
          >
            {allQueued ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            )}
            <span className="hidden md:inline">Baixar</span>
          </button>
          <button onClick={expand} className="flex-shrink-0 w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition" title={open ? 'Recolher' : 'Expandir'}>
            <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
        </div>
        {open && (
          <div className="px-2.5 pb-2.5 pt-1 border-t border-white/5 space-y-1 animate-slide-down">
            {renderReleaseTracks(release)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto w-full py-4">
      {/* ===== TOOLBAR (sticky) ===== */}
      <div className="sticky top-0 z-20 bg-black/85 backdrop-blur-md -mx-1 px-1 py-2.5 mb-5 border-b border-white/10">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Busca */}
          <div className="relative flex-1 min-w-[180px]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por título ou artista…"
              className="w-full h-10 pl-10 pr-3 rounded-xl bg-zinc-900/80 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition"
            />
            <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white" title="Limpar">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          {/* Ordenação */}
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="h-10 px-3 rounded-xl bg-zinc-900/80 border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition cursor-pointer">
            <option value="recent">Mais recente</option>
            <option value="artist">Artista (A–Z)</option>
            <option value="count">Mais novidades</option>
            <option value="duration">Duração</option>
          </select>
          {/* Visão */}
          <div className="flex rounded-xl border border-white/10 overflow-hidden bg-zinc-900/80">
            {([
              { key: 'grouped', label: 'Coleção', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /> },
              { key: 'grid', label: 'Grade', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /> },
              { key: 'list', label: 'Lista', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /> },
            ] as const).map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`h-10 px-3 text-xs font-semibold transition flex items-center gap-1.5 ${view === v.key ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
                title={v.label}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">{v.icon}</svg>
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>
          {/* Gerenciar artistas */}
          <button onClick={() => setManageOpen((v) => !v)} className={`h-10 px-3.5 rounded-xl text-sm font-semibold border transition flex items-center gap-2 ${manageOpen ? 'border-white/30 bg-white/15 text-white' : 'border-white/10 bg-zinc-900/80 text-white/90 hover:bg-white/10'}`} title="Gerenciar artistas monitorados">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-3-6.5" /></svg>
            <span className="hidden sm:inline">Artistas{enabledCount > 0 ? ` (${enabledCount})` : ''}</span>
          </button>
          {/* Atualizar feed */}
          <button onClick={() => loadFeed(true)} disabled={loading} className="h-10 px-4 rounded-xl text-sm font-bold bg-emerald-500 text-black hover:bg-emerald-400 transition disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-500/25" title={fetchedRel ? `Atualizado ${fetchedRel}` : 'Atualizar lançamentos'}>
            {loading
              ? <span className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
            <span className="hidden sm:inline">{loading ? 'Atualizando…' : 'Atualizar'}</span>
          </button>
        </div>
      </div>

      {/* Painel gerenciar artistas */}
      {manageOpen && (
        <div className="mb-5 rounded-2xl border border-white/10 bg-zinc-900/60 p-4 animate-slide-down">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white/90">Artistas monitorados</h3>
            <button onClick={syncLibrary} disabled={savingArtists} className="h-9 px-3.5 rounded-lg text-xs font-semibold border border-blue-500/50 bg-blue-600/90 text-white hover:bg-blue-600 transition disabled:opacity-50 flex items-center gap-1.5">
              {savingArtists && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              Sincronizar com biblioteca
            </button>
          </div>
          {artists.length === 0 ? (
            <p className="text-xs text-zinc-400">Nenhum artista ainda. Clique em “Sincronizar com biblioteca”.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto custom-scroll pr-1">
              {artists.map((a) => (
                <div key={a.name} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition ${a.enabled ? 'bg-white/5 border-white/5' : 'bg-transparent border-white/5 opacity-50'}`}>
                  <label className="flex items-center gap-2.5 min-w-0 cursor-pointer">
                    <input type="checkbox" checked={a.enabled} onChange={() => toggleArtist(a.name)} className="accent-emerald-500 w-4 h-4" />
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br ${gradientFor(a.name)} flex-shrink-0`}>{initialsOf(a.name)}</span>
                    <span className="text-sm text-white truncate" title={a.name}>{a.name}</span>
                    <span className="text-[10px] text-zinc-500 flex-shrink-0">{a.trackCount}</span>
                  </label>
                  <button onClick={() => removeArtist(a.name)} className="text-zinc-500 hover:text-red-400 transition flex-shrink-0" title="Remover artista">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className="px-4 py-3 mb-4 rounded-xl bg-red-500/20 border border-red-500/50 text-sm text-red-300">⚠️ {error}</div>}
      {!error && message && groups.length === 0 && <div className="px-4 py-3 mb-4 rounded-xl bg-amber-500/15 border border-amber-500/40 text-sm text-amber-200">{message}</div>}

      {/* Skeleton de carregamento */}
      {loading && !hasData && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && !error && !message && !hasData && (
        <div className="text-center py-20 rounded-3xl border border-white/5 bg-white/[0.03]">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-violet-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-400/70" fill="currentColor" viewBox="0 0 24 24"><path d="M9 17V5l12-2v12M9 17a3 3 0 11-6 0 3 3 0 016 0zm12-2a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <p className="text-base text-zinc-200 font-medium">Nenhuma novidade no momento.</p>
          <p className="text-sm text-zinc-400 mt-1">Clique em “Atualizar” para buscar os últimos lançamentos.</p>
        </div>
      )}

      {/* ===== SIDEBAR (filtro de artistas) + CONTEÚDO ===== */}
      {hasData && filteredGroups.length > 0 && (
        <div className="flex gap-5 items-start">
          {/* Barra lateral — desktop */}
          <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 sticky top-[68px] self-start max-h-[calc(100vh-220px)] rounded-2xl border border-white/10 bg-zinc-900/40 overflow-hidden">
            <div className="px-3.5 py-3 border-b border-white/10">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Artistas</p>
            </div>
            <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-1">
              <button
                onClick={() => setSelectedArtist(null)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm font-medium transition ${
                  !selectedArtist ? 'bg-emerald-500/15 text-emerald-300' : 'text-zinc-300 hover:bg-white/5'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`w-1 h-5 rounded-full ${!selectedArtist ? 'bg-emerald-400' : 'bg-transparent'}`} />
                  Todos os lançamentos
                </span>
                <span className="text-[11px] text-zinc-500 tabular-nums">{totalReleases}</span>
              </button>
              {filteredGroups.map((g) => {
                const active = selectedArtist === g.artist;
                return (
                  <button
                    key={g.artist}
                    onClick={() => setSelectedArtist(active ? null : g.artist)}
                    title={g.artist}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition group/side ${
                      active ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <span className={`w-1 h-7 rounded-full flex-shrink-0 ${active ? 'bg-emerald-400' : 'bg-transparent'}`} />
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br ${gradientFor(g.artist)} flex-shrink-0 overflow-hidden`}>
                      {g.releases[0]?.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.releases[0].thumbnail} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : initialsOf(g.artist)}
                    </span>
                    <span className={`flex-1 min-w-0 text-left text-sm truncate ${active ? 'text-white font-semibold' : 'text-zinc-300 group-hover/side:text-white'}`}>{g.artist}</span>
                    <span className={`text-[11px] tabular-nums flex-shrink-0 px-1.5 py-0.5 rounded-full ${active ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-500'}`}>{g.releases.length}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Conteúdo */}
          <div className="flex-1 min-w-0">
            {/* Filtro de artistas — chips horizontais (mobile/tablet) */}
            <div className="lg:hidden flex gap-2 overflow-x-auto custom-scroll pb-3 mb-2 -mx-1 px-1">
              <button
                onClick={() => setSelectedArtist(null)}
                className={`flex-shrink-0 h-8 px-3 rounded-full text-xs font-semibold border transition ${!selectedArtist ? 'bg-emerald-500 text-black border-emerald-500' : 'border-white/15 bg-white/5 text-zinc-300'}`}
              >
                Todas ({totalReleases})
              </button>
              {filteredGroups.map((g) => {
                const active = selectedArtist === g.artist;
                return (
                  <button
                    key={g.artist}
                    onClick={() => setSelectedArtist(active ? null : g.artist)}
                    className={`flex-shrink-0 h-8 px-3 rounded-full text-xs font-semibold border transition flex items-center gap-1.5 ${active ? 'bg-emerald-500 text-black border-emerald-500' : 'border-white/15 bg-white/5 text-zinc-300'}`}
                  >
                    {g.artist}
                    <span className={active ? 'text-black/60' : 'text-zinc-500'}>{g.releases.length}</span>
                  </button>
                );
              })}
            </div>

            {/* GRADE: mosaico de releases (álbuns / EPs / singles) — estilo busca do YT Music */}
            {view === 'grid' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {allReleases.map(({ release, artist }, i) => (
                  <ReleaseCard
                    key={releaseKey(artist, release, i)}
                    release={release}
                    showArtist
                    isPlaying={releasePlaying(release)}
                    allQueued={releaseAllQueued(release)}
                    newCount={newCountOf(release)}
                    onOpen={openReleaseModal}
                    onPlay={playRelease}
                    onDownload={handleDownloadReleaseNew}
                    onPrefetch={prefetchPreview}
                  />
                ))}
              </div>
            )}

            {/* COLEÇÃO: por artista, álbuns/EPs/singles JUNTOS ordenados por data de lançamento (mais recente primeiro) */}
            {view === 'grouped' && (
              <div className="space-y-10">
                {displayedGroups.map((group) => {
                  const yr = (r: FeedRelease) => parseInt(r.year || '', 10) || 0;
                  const releases = [...group.releases].sort(
                    (a, b) => yr(b) - yr(a) || b.tracks.length - a.tracks.length
                  );
                  return (
                    <section key={group.artist}>
                      {renderArtistHeader(group)}
                      {releases.length > 0 && renderReleaseRow('Lançamentos', releases)}
                      {renderAlbumsPanel(group)}
                    </section>
                  );
                })}
              </div>
            )}

            {/* LISTA: feed de releases agrupados (álbum/EP/single) com faixas expansíveis */}
            {view === 'list' && (
              <div className="space-y-3">
                {allReleases.map(({ release, artist }, i) => renderReleaseListBlock(artist, release, i))}
              </div>
            )}
          </div>
        </div>
      )}

      {renderReleaseModal()}
    </div>
  );
}
