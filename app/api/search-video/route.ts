import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { hasValidCookiesFile } from '../utils/common';
import { searchYouTubeMusic as searchYouTubeMusicService } from '@/lib/services/youtubeSearchService';

const execAsync = promisify(exec);

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

async function searchYouTubeMusic(query: string): Promise<any | null> {
  // Usar o novo serviço unificado
  const results = await searchYouTubeMusicService(query, { maxResults: 1, preferMusic: true });
  
  if (results.length === 0) {
    return null;
  }
  
  const result = results[0];
  
  // Buscar informações completas do vídeo usando yt-dlp
  try {
    const hasValidCookies = await hasValidCookiesFile();
    const cookiesFlag = hasValidCookies ? '--cookies "cookies.txt" ' : '';
    const { stdout } = await execAsync(
      `yt-dlp --dump-json ${cookiesFlag}"https://www.youtube.com/watch?v=${result.videoId}"`,
      { maxBuffer: 1024 * 1024 * 10, timeout: 10000 }
    );
    
    const videoInfo = JSON.parse(stdout);
    return {
      title: videoInfo.title || result.title,
      thumbnail: videoInfo.thumbnail || videoInfo.thumbnails?.[0]?.url || result.thumbnail || '',
      duration: formatDuration(videoInfo.duration),
      url: videoInfo.webpage_url || result.url,
      videoId: videoInfo.id || result.videoId,
      uploader: videoInfo.uploader || result.artist || videoInfo.channel || '',
      viewCount: videoInfo.view_count || 0,
      source: result.source
    };
  } catch (ytdlpError) {
    console.warn(`⚠️ [YouTube Music] Erro ao buscar detalhes com yt-dlp, usando dados básicos:`, ytdlpError);
    // Retornar dados básicos mesmo se yt-dlp falhar
    return {
      title: result.title,
      thumbnail: result.thumbnail || `https://img.youtube.com/vi/${result.videoId}/maxresdefault.jpg`,
      duration: result.duration,
      url: result.url,
      videoId: result.videoId,
      uploader: result.artist || '',
      viewCount: 0,
      source: result.source
    };
  }
}


export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const platform = searchParams.get('platform') || 'youtube-music'; // Padrão: YouTube Music
    
    if (!query) {
      return NextResponse.json(
        { error: 'Query é obrigatória' },
        { status: 400 }
      );
    }

    console.log(`🔍 Buscando vídeo para: "${query}" na plataforma: ${platform}`);

    // Se for YouTube Music, tentar primeiro e FORÇAR retorno apenas se encontrar
    if (platform === 'youtube-music') {
      const musicResult = await searchYouTubeMusic(query);
      if (musicResult) {
        console.log(`✅ Vídeo encontrado: ${musicResult.title} (${musicResult.source})`);
        return NextResponse.json(musicResult);
      }
      console.log('⚠️ Não encontrado no YouTube Music, tentando YouTube normal...');
    }

    // Fallback para YouTube normal usando yt-dlp
    const hasValidCookies = await hasValidCookiesFile();
    let infoJson: string;
    
    try {
      const cookiesFlag = hasValidCookies ? '--cookies "cookies.txt" ' : '';
      const command = `yt-dlp --dump-json ${cookiesFlag}--default-search "ytsearch" "${query}"`;
      
      console.log(`📝 Executando: ${command}`);
      
      const { stdout } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });
      
      // yt-dlp pode retornar múltiplos resultados (um por linha)
      // Pegar apenas o primeiro resultado
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        throw new Error('Nenhum resultado encontrado');
      }
      
      infoJson = lines[0];
    } catch (error) {
      // Se falhar com cookies, tentar sem cookies
      if (hasValidCookies && error instanceof Error && error.message.includes('does not look like a Netscape format')) {
        console.log('Cookies inválidos, tentando sem cookies...');
        const { stdout } = await execAsync(
          `yt-dlp --dump-json --default-search "ytsearch" "${query}"`,
          {
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
          }
        );
        
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        if (lines.length === 0) {
          throw new Error('Nenhum resultado encontrado');
        }
        
        infoJson = lines[0];
      } else {
        throw error;
      }
    }
    
    const videoInfo = JSON.parse(infoJson);
    
    // Extrair informações relevantes
    const result = {
      title: videoInfo.title || 'Sem título',
      thumbnail: videoInfo.thumbnail || videoInfo.thumbnails?.[0]?.url || '',
      duration: formatDuration(videoInfo.duration),
      url: videoInfo.webpage_url || videoInfo.url || `https://www.youtube.com/watch?v=${videoInfo.id}`,
      videoId: videoInfo.id,
      uploader: videoInfo.uploader || videoInfo.channel || '',
      viewCount: videoInfo.view_count || 0,
      source: 'youtube'
    };

    console.log(`✅ Vídeo encontrado no YouTube: ${result.title}`);

    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ Erro ao buscar vídeo:', error);
    
    // Extrair mensagem de erro mais útil
    let errorMessage = 'Erro ao buscar vídeo';
    if (error instanceof Error) {
      if (error.message.includes('Sign in to confirm you')) {
        errorMessage = 'O YouTube está solicitando verificação. Tente novamente em alguns minutos.';
      } else if (error.message.includes('Video unavailable') || error.message.includes('Nenhum resultado encontrado')) {
        errorMessage = 'Nenhum vídeo encontrado';
      } else if (error.message.includes('This video is not available')) {
        errorMessage = 'Este vídeo não está disponível no momento.';
      } else if (error.message.includes('does not look like a Netscape format')) {
        errorMessage = 'Arquivo de cookies inválido. Tente novamente.';
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, platform = 'youtube-music' } = body;
    
    if (!query) {
      return NextResponse.json(
        { error: 'Query é obrigatória' },
        { status: 400 }
      );
    }

    // Criar uma nova URL com os parâmetros
    const url = new URL(request.url);
    url.searchParams.set('q', query);
    url.searchParams.set('platform', platform);

    // Criar uma nova requisição GET
    const getRequest = new NextRequest(url, {
      method: 'GET',
      headers: request.headers,
    });

    return GET(getRequest);
  } catch (error) {
    console.error('❌ Erro ao processar requisição POST:', error);
    return NextResponse.json(
      { error: 'Erro ao processar requisição' },
      { status: 500 }
    );
  }
}

