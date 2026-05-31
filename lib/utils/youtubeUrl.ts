export type YtDlpTarget =
  | { type: 'url'; url: string; videoId: string }
  | { type: 'search'; query: string };

export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^[\w-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|music\.youtube\.com\/watch\?.*v=)([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/v\/([\w-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function resolveYtDlpTarget(input: string): YtDlpTarget {
  let candidate = input.trim();
  if (candidate.startsWith('- ')) {
    candidate = candidate.slice(2).trim();
  }

  const videoId = extractYouTubeVideoId(candidate);
  if (videoId) {
    return { type: 'url', url: youtubeWatchUrl(videoId), videoId };
  }

  return { type: 'search', query: candidate };
}

export function buildYtDlpDownloadInput(input: string): string {
  const target = resolveYtDlpTarget(input);
  if (target.type === 'url') {
    return target.url;
  }
  return `ytsearch1:${target.query}`;
}
