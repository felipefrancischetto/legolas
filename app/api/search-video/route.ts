import { NextRequest, NextResponse } from 'next/server';
import { searchYouTubeMusic as searchYouTubeMusicService } from '@/lib/services/youtubeSearchService';
import {
  extractYouTubeVideoId,
  getYtDlpUserFacingError,
  resolveYtDlpTarget,
  runYtDlpDumpJson,
  youtubeWatchUrl,
} from '../utils/ytdlp';

export const dynamic = 'force-dynamic';

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return 'N/A';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function videoInfoToResult(
  videoInfo: Record<string, unknown>,
  source: 'youtube-music' | 'youtube' = 'youtube'
) {
  const id = (videoInfo.id as string) || extractYouTubeVideoId(String(videoInfo.webpage_url || ''));
  return {
    title: (videoInfo.title as string) || 'Sem título',
    thumbnail:
      (videoInfo.thumbnail as string) ||
      (videoInfo.thumbnails as { url?: string }[] | undefined)?.[0]?.url ||
      (id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : ''),
    duration: formatDuration(Number(videoInfo.duration)),
    url:
      (videoInfo.webpage_url as string) ||
      (videoInfo.url as string) ||
      (id ? youtubeWatchUrl(id) : ''),
    videoId: id,
    uploader: (videoInfo.uploader as string) || (videoInfo.channel as string) || '',
    viewCount: (videoInfo.view_count as number) || 0,
    source,
  };
}

async function searchYouTubeMusic(query: string): Promise<ReturnType<typeof videoInfoToResult> | null> {
  const results = await searchYouTubeMusicService(query, { maxResults: 1, preferMusic: true });

  if (results.length === 0) {
    return null;
  }

  const result = results[0];
  return {
    title: result.title,
    thumbnail: result.thumbnail || `https://img.youtube.com/vi/${result.videoId}/maxresdefault.jpg`,
    duration: result.duration || 'N/A',
    url: result.url,
    videoId: result.videoId,
    uploader: result.artist || '',
    viewCount: 0,
    source: result.source,
  };
}

async function resolveVideoQuery(
  query: string,
  platform: string
): Promise<ReturnType<typeof videoInfoToResult> | null> {
  const target = resolveYtDlpTarget(query);

  if (target.type === 'url') {
    try {
      const videoInfo = await runYtDlpDumpJson(target.url, { timeoutMs: 15000 });
      return videoInfoToResult(videoInfo, 'youtube');
    } catch {
      return {
        title: 'Vídeo do YouTube',
        thumbnail: `https://img.youtube.com/vi/${target.videoId}/maxresdefault.jpg`,
        duration: 'N/A',
        url: target.url,
        videoId: target.videoId,
        uploader: '',
        viewCount: 0,
        source: 'youtube',
      };
    }
  }

  if (platform === 'youtube-music') {
    const musicResult = await searchYouTubeMusic(query);
    if (musicResult) {
      return musicResult;
    }
  }

  try {
    const videoInfo = await runYtDlpDumpJson(query, { timeoutMs: 15000 });
    return videoInfoToResult(videoInfo, 'youtube');
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const platform = searchParams.get('platform') || 'youtube-music';

    if (!query) {
      return NextResponse.json({ error: 'Query é obrigatória' }, { status: 400 });
    }

    console.log(`🔍 Buscando vídeo para: "${query}" na plataforma: ${platform}`);

    const result = await resolveVideoQuery(query, platform);

    if (!result) {
      return NextResponse.json({ error: 'Nenhum vídeo encontrado' }, { status: 404 });
    }

    console.log(`✅ Vídeo encontrado: ${result.title} (${result.source})`);
    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Erro ao buscar vídeo:', error);
    const errorMessage = getYtDlpUserFacingError(error, 'Erro ao buscar vídeo');
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const platform = body.platform || 'youtube-music';

    if (Array.isArray(body.queries) && body.queries.length > 0) {
      const queries = body.queries as string[];
      const results: Array<{
        index: number;
        ok: boolean;
        data?: ReturnType<typeof videoInfoToResult>;
        error?: string;
      }> = [];

      for (let index = 0; index < queries.length; index++) {
        const query = String(queries[index] ?? '').trim();
        if (!query) {
          results.push({ index, ok: false, error: 'Query vazia' });
          continue;
        }

        try {
          const data = await resolveVideoQuery(query, platform);
          if (data) {
            results.push({ index, ok: true, data });
          } else {
            results.push({ index, ok: false, error: 'Nenhum vídeo encontrado' });
          }
        } catch (error) {
          results.push({
            index,
            ok: false,
            error: getYtDlpUserFacingError(error, 'Erro ao buscar vídeo'),
          });
        }

        if (index < queries.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
      }

      return NextResponse.json({ results });
    }

    const query = body.query;
    if (!query) {
      return NextResponse.json({ error: 'Query é obrigatória' }, { status: 400 });
    }

    const url = new URL(request.url);
    url.searchParams.set('q', query);
    url.searchParams.set('platform', platform);

    const getRequest = new NextRequest(url, {
      method: 'GET',
      headers: request.headers,
    });

    return GET(getRequest);
  } catch (error) {
    console.error('❌ Erro ao processar requisição POST:', error);
    return NextResponse.json(
      { error: getYtDlpUserFacingError(error, 'Erro ao processar requisição') },
      { status: 500 }
    );
  }
}
