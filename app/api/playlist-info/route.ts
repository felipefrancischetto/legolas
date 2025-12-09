import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { hasValidCookiesFile } from '@/app/api/utils/common';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

async function getPlaylistInfo(id: string, retryCount = 0): Promise<any> {
  const maxRetries = 3;
  const commands = [
    // Primeira tentativa: Com Token PO e cookies do Chrome
    `yt-dlp --dump-json --flat-playlist --cookies-from-browser chrome --extractor-args "youtube:player_skip=webpage,configs" "https://www.youtube.com/playlist?list=${id}"`,
    // Segunda tentativa: Com Token PO e cookies do Firefox
    `yt-dlp --dump-json --flat-playlist --cookies-from-browser firefox --extractor-args "youtube:player_skip=webpage,configs" "https://www.youtube.com/playlist?list=${id}"`,
    // Terceira tentativa: Modo mais agressivo com delay
    `yt-dlp --dump-json --flat-playlist --extractor-args "youtube:player_client=android" --no-check-certificate --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" --sleep-interval 5 "https://www.youtube.com/playlist?list=${id}"`
  ];

  try {
    const { stdout } = await execAsync(commands[retryCount], { maxBuffer: 1024 * 1024 * 10 });
    return stdout.trim().split('\n').map(line => JSON.parse(line));
  } catch (error) {
    console.error(`Tentativa ${retryCount + 1} falhou:`, error);
    
    if (retryCount < maxRetries - 1) {
      console.log(`Tentando método alternativo ${retryCount + 2}...`);
      return getPlaylistInfo(id, retryCount + 1);
    }
    throw error;
  }
}

async function getVideoInfo(videoId: string, retryCount = 0): Promise<any> {
  const maxRetries = 2;
  const commands = [
    // Primeira tentativa: Configuração básica
    `yt-dlp --dump-json "https://www.youtube.com/watch?v=${videoId}"`,
    // Segunda tentativa: Modo mais agressivo de contornar restrições
    `yt-dlp --dump-json --extractor-args "youtube:player_client=android" --no-check-certificate --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" "https://www.youtube.com/watch?v=${videoId}"`
  ];

  try {
    const { stdout } = await execAsync(commands[retryCount], { maxBuffer: 1024 * 1024 * 10 });
    return JSON.parse(stdout);
  } catch (error) {
    console.error(`Tentativa ${retryCount + 1} falhou:`, error);
    
    if (retryCount < maxRetries - 1) {
      console.log(`Tentando método alternativo ${retryCount + 2}...`);
      return getVideoInfo(videoId, retryCount + 1);
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID da playlist é obrigatório' },
        { status: 400 }
      );
    }

    console.log('Buscando informações da playlist:', id);

    // Verificar se temos cookies válidos
    const hasValidCookies = await hasValidCookiesFile();
    
    let entries: any[];
    
    if (hasValidCookies) {
      // Tentar primeiro com cookies do arquivo
      try {
        const { stdout } = await execAsync(
          `yt-dlp --dump-json --flat-playlist ` +
          `--cookies "cookies.txt" ` +
          `"https://www.youtube.com/playlist?list=${id}"`,
          { maxBuffer: 1024 * 1024 * 10 }
        );
        entries = stdout.trim().split('\n').map(line => JSON.parse(line));
      } catch (error) {
        // Se falhar com cookies, usar métodos alternativos
        console.log('Falhou com cookies, tentando métodos alternativos...');
        entries = await getPlaylistInfo(id);
      }
    } else {
      // Usar métodos alternativos diretamente
      console.log('Arquivo de cookies inválido ou ausente, usando métodos alternativos...');
      entries = await getPlaylistInfo(id);
    }
    
    if (!entries || entries.length === 0) {
      return NextResponse.json(
        { error: 'Playlist vazia ou não encontrada' },
        { status: 404 }
      );
    }

    // Obter informações do primeiro vídeo para pegar a thumbnail da playlist
    let firstVideo: any;
    if (hasValidCookies) {
      try {
        const { stdout: firstVideoInfo } = await execAsync(
          `yt-dlp --dump-json ` +
          `--cookies "cookies.txt" ` +
          `"https://www.youtube.com/watch?v=${entries[0].id}"`,
          { maxBuffer: 1024 * 1024 * 10 }
        );
        firstVideo = JSON.parse(firstVideoInfo);
      } catch (error) {
        // Se falhar com cookies, usar método alternativo
        firstVideo = await getVideoInfo(entries[0].id);
      }
    } else {
      firstVideo = await getVideoInfo(entries[0].id);
    }

    return NextResponse.json({
      title: entries[0].playlist_title || 'Playlist do YouTube',
      thumbnail: firstVideo.thumbnail,
      videos: entries.map((entry: any) => ({
        title: entry.title,
        duration: formatDuration(entry.duration || 0)
      }))
    });

  } catch (error) {
    console.error('Erro ao buscar informações da playlist:', error);
    
    // Extrair mensagem de erro mais útil
    let errorMessage = 'Erro ao buscar informações da playlist';
    if (error instanceof Error) {
      if (error.message.includes('Sign in to confirm you')) {
        errorMessage = 'O YouTube está solicitando verificação. Tente novamente em alguns minutos.';
      } else if (error.message.includes('Video unavailable')) {
        errorMessage = 'A playlist ou vídeo não está disponível. Verifique se é pública.';
      } else if (error.message.includes('This video is not available')) {
        errorMessage = 'Um ou mais vídeos da playlist não estão disponíveis.';
      } else if (error.message.includes('does not look like a Netscape format')) {
        errorMessage = 'Arquivo de cookies inválido. Usando métodos alternativos...';
        // Tentar novamente sem cookies
        try {
          const id = request.nextUrl.searchParams.get('id');
          if (id) {
            const entries = await getPlaylistInfo(id);
            const firstVideo = await getVideoInfo(entries[0].id);
            return NextResponse.json({
              title: entries[0].playlist_title || 'Playlist do YouTube',
              thumbnail: firstVideo.thumbnail,
              videos: entries.map((entry: any) => ({
                title: entry.title,
                duration: formatDuration(entry.duration || 0)
              }))
            });
          }
        } catch (retryError) {
          // Continuar com o erro original
        }
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 