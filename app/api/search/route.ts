import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
  }

  try {
    // Search for the track on YouTube Music
    const response = await fetch(`https://music.youtube.com/youtubei/v1/search?key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX94`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Origin': 'https://music.youtube.com',
        'Referer': 'https://music.youtube.com/',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': '1.20240101.01.00',
      },
      body: JSON.stringify({
        query,
        params: 'EgWKAQIIAWoKEAMQBBAJEAoQBQ%3D%3D', // This parameter filters for music
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240101.01.00',
            hl: 'pt-BR',
            gl: 'BR',
            utcOffsetMinutes: -180,
          },
          user: {
            lockedSafetyMode: false,
          },
          request: {
            sessionId: '1234567890',
            internalExperimentFlags: [],
            consistencyTokenJars: [],
          },
        },
      }),
    });

    const data = await response.json();
    
    // Extract the first video result
    const videoResults = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.musicShelfRenderer?.contents;
    
    if (!videoResults || videoResults.length === 0) {
      return NextResponse.json({ error: 'Nenhum resultado encontrado' }, { status: 404 });
    }

    const firstResult = videoResults[0].musicResponsiveListItemRenderer;
    const videoId = firstResult?.playlistItemData?.videoId;
    const title = firstResult?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
    const artist = firstResult?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;

    if (!videoId) {
      return NextResponse.json({ error: 'Não foi possível encontrar o ID do vídeo' }, { status: 404 });
    }

    // Get additional video info using the video-info endpoint
    const videoInfoResponse = await fetch(`/api/video-info?id=${videoId}`);
    const videoInfo = await videoInfoResponse.json();

    if (!videoInfoResponse.ok) {
      console.error('Erro ao buscar informações do vídeo:', videoInfo.error);
      // Continue with basic info if video-info fails
      return NextResponse.json({
        url: `https://music.youtube.com/watch?v=${videoId}`,
        title,
        artist,
      });
    }

    return NextResponse.json({
      url: `https://music.youtube.com/watch?v=${videoId}`,
      title: videoInfo.title || title,
      artist,
      thumbnail: videoInfo.thumbnail,
      duration: videoInfo.duration,
    });
  } catch (error) {
    console.error('Erro ao buscar no YouTube Music:', error);
    return NextResponse.json({ error: 'Falha ao buscar no YouTube Music' }, { status: 500 });
  }
} 