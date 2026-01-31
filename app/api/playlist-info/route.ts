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
  const maxRetries = 4;
  const commands = [
    // Primeira tentativa: Android client (menos detectável, funciona sem cookies)
    `yt-dlp --dump-json --flat-playlist --no-playlist-reverse --playlist-end 0 --extractor-args "youtube:player_client=android" "https://www.youtube.com/playlist?list=${id}"`,
    // Segunda tentativa: iOS client
    `yt-dlp --dump-json --flat-playlist --no-playlist-reverse --playlist-end 0 --extractor-args "youtube:player_client=ios" "https://www.youtube.com/playlist?list=${id}"`,
    // Terceira tentativa: Web client
    `yt-dlp --dump-json --flat-playlist --no-playlist-reverse --playlist-end 0 --extractor-args "youtube:player_client=web" "https://www.youtube.com/playlist?list=${id}"`,
    // Quarta tentativa: Básico sem limite
    `yt-dlp --dump-json --flat-playlist --no-playlist-reverse --playlist-end 0 "https://www.youtube.com/playlist?list=${id}"`,
  ];

  try {
    console.log(`🔄 Tentativa ${retryCount + 1}/${maxRetries} para obter informações da playlist...`);
    const { stdout } = await execAsync(commands[retryCount], { maxBuffer: 1024 * 1024 * 10 });
    const entries = stdout.trim().split('\n').filter(l => l.trim()).map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(e => e !== null);
    
    if (entries.length > 0) {
      console.log(`✅ Método ${retryCount + 1} funcionou! Encontradas ${entries.length} entradas.`);
      return entries;
    } else {
      throw new Error('Nenhuma entrada encontrada');
    }
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ Tentativa ${retryCount + 1} falhou: ${errorMsg.substring(0, 200)}`);
    
    if (retryCount < maxRetries - 1) {
      console.log(`🔄 Tentando método alternativo ${retryCount + 2}...`);
      return getPlaylistInfo(id, retryCount + 1);
    }
    
    // Se todos os métodos falharam, lançar erro
    console.error(`❌ Todos os métodos falharam para obter informações da playlist`);
    throw error;
  }
}

async function getVideoInfo(videoId: string, retryCount = 0): Promise<any> {
  const maxRetries = 3;
  const commands = [
    // Primeira tentativa: Android client (menos detectável)
    `yt-dlp --dump-json --extractor-args "youtube:player_client=android" "https://www.youtube.com/watch?v=${videoId}"`,
    // Segunda tentativa: iOS client
    `yt-dlp --dump-json --extractor-args "youtube:player_client=ios" "https://www.youtube.com/watch?v=${videoId}"`,
    // Terceira tentativa: Configuração básica
    `yt-dlp --dump-json "https://www.youtube.com/watch?v=${videoId}"`
  ];

  try {
    console.log(`🔄 Tentativa ${retryCount + 1}/${maxRetries} para obter informações do vídeo ${videoId}...`);
    const { stdout } = await execAsync(commands[retryCount], { maxBuffer: 1024 * 1024 * 10 });
    const videoInfo = JSON.parse(stdout);
    console.log(`✅ Método ${retryCount + 1} funcionou para o vídeo ${videoId}!`);
    return videoInfo;
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ Tentativa ${retryCount + 1} falhou para vídeo ${videoId}: ${errorMsg.substring(0, 200)}`);
    
    if (retryCount < maxRetries - 1) {
      console.log(`🔄 Tentando método alternativo ${retryCount + 2}...`);
      return getVideoInfo(videoId, retryCount + 1);
    }
    
    console.error(`❌ Todos os métodos falharam para obter informações do vídeo ${videoId}`);
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
        console.log('🍪 Tentando usar cookies do arquivo cookies.txt...');
        const { stdout } = await execAsync(
          `yt-dlp --dump-json --flat-playlist --no-playlist-reverse --playlist-end 0 ` +
          `--cookies "cookies.txt" ` +
          `"https://www.youtube.com/playlist?list=${id}"`,
          { maxBuffer: 1024 * 1024 * 10 }
        );
        const parsedEntries = stdout.trim().split('\n').filter(l => l.trim()).map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return null;
          }
        }).filter(e => e !== null);
        
        if (parsedEntries.length > 0) {
          console.log(`✅ Cookies funcionaram! Encontradas ${parsedEntries.length} entradas.`);
          entries = parsedEntries;
        } else {
          throw new Error('Nenhuma entrada encontrada com cookies');
        }
      } catch (error: any) {
        // Se falhar com cookies, usar métodos alternativos SEM cookies
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️ Falhou com cookies (${errorMsg.substring(0, 100)}), tentando métodos alternativos SEM cookies...`);
        entries = await getPlaylistInfo(id);
      }
    } else {
      // Usar métodos alternativos diretamente (SEM cookies)
      console.log('ℹ️ Arquivo de cookies inválido ou ausente, usando métodos alternativos SEM cookies...');
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
    if (hasValidCookies && entries.length > 0) {
      try {
        console.log(`🍪 Tentando obter informações do primeiro vídeo com cookies...`);
        const { stdout: firstVideoInfo } = await execAsync(
          `yt-dlp --dump-json ` +
          `--cookies "cookies.txt" ` +
          `"https://www.youtube.com/watch?v=${entries[0].id}"`,
          { maxBuffer: 1024 * 1024 * 10 }
        );
        firstVideo = JSON.parse(firstVideoInfo);
        console.log(`✅ Informações do primeiro vídeo obtidas com cookies!`);
      } catch (error: any) {
        // Se falhar com cookies, usar método alternativo SEM cookies
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️ Falhou com cookies para primeiro vídeo (${errorMsg.substring(0, 100)}), usando método alternativo...`);
        firstVideo = await getVideoInfo(entries[0].id);
      }
    } else if (entries.length > 0) {
      firstVideo = await getVideoInfo(entries[0].id);
    } else {
      // Se não houver entradas, retornar erro
      return NextResponse.json(
        { error: 'Nenhuma entrada encontrada na playlist' },
        { status: 404 }
      );
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