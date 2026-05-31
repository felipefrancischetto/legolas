import { extractYouTubeVideoId, youtubeWatchUrl } from '@/lib/utils/youtubeUrl';

export interface ParsedPlaylistTrack {
  title: string;
  artist: string;
  videoId?: string;
  youtubeUrl?: string;
}

/** Linha que é só timestamp ou lixo de playlist (ex.: "0:00 - 2:16"). */
function isTimestampOrJunkLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^\d{1,2}:\d{2}(\s*[-–]\s*\d{1,2}:\d{2})?\s*$/.test(trimmed)) return true;
  if (/^[\[\(\*]*\d{1,2}:\d{2}/.test(trimmed)) return true;
  return false;
}

/** Remove numeração no início: "1.", "01)", "3 -", etc. */
function stripLeadingTrackNumber(line: string): string {
  return line.replace(/^\d+[\.\)\:\-]\s*/, '').trim();
}

/** Remove timestamps e formatação comum de playlists coladas do YouTube/Spotify. */
function stripTimestampNoise(line: string): string {
  return line
    .replace(/\*\*\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\*\*/g, '')
    .replace(/\[\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\]/g, '')
    .replace(/\(\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\)/g, '')
    .replace(/\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}/g, '')
    .replace(/\*\*\d{1,2}:\d{2}\*\*/g, '')
    .replace(/\d{1,2}:\d{2}(?=\s*$)/g, '')
    .replace(/\d+::\d{2}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Interpreta uma linha no formato "Artista - Título".
 * Usa apenas o primeiro separador " - " para não quebrar remixes com hífens.
 */
export function parsePlaylistLine(line: string): ParsedPlaylistTrack | null {
  let clean = stripTimestampNoise(line);
  if (!clean || isTimestampOrJunkLine(clean)) return null;

  clean = stripLeadingTrackNumber(clean);
  if (!clean || isTimestampOrJunkLine(clean)) return null;

  const videoId = extractYouTubeVideoId(clean);
  if (videoId) {
    return {
      title: clean,
      artist: '',
      videoId,
      youtubeUrl: youtubeWatchUrl(videoId),
    };
  }

  const match = clean.match(/^(.+?)\s+[-–]\s+(.+)$/);
  if (!match) {
    const idInLine = extractYouTubeVideoId(clean);
    if (idInLine) {
      return {
        title: clean,
        artist: '',
        videoId: idInLine,
        youtubeUrl: youtubeWatchUrl(idInLine),
      };
    }
    return { title: clean, artist: '' };
  }

  const artist = match[1].trim();
  const title = match[2].trim();
  if (!title) return null;

  return { title, artist };
}

export function parsePlaylistLines(lines: string[]): ParsedPlaylistTrack[] {
  const tracks: ParsedPlaylistTrack[] = [];
  for (const line of lines) {
    const parsed = parsePlaylistLine(line);
    if (parsed) tracks.push(parsed);
  }
  return tracks;
}
