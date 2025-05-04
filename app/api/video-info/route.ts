import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);
const cookiesPath = join(process.cwd(), 'cookies.txt');

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

async function getVideoInfo(videoId: string, retryCount = 0): Promise<any> {
  const maxRetries = 3;
  const commands = [
    // Primeira tentativa: Com cookies do arquivo
    `yt-dlp --dump-json --cookies "${cookiesPath}" "https://www.youtube.com/watch?v=${videoId}"`,
    // Segunda tentativa: Com cookies do arquivo e configurações adicionais
    `yt-dlp --dump-json --cookies "${cookiesPath}" --extractor-args "youtube:player_skip=webpage,configs" "https://www.youtube.com/watch?v=${videoId}"`,
    // Terceira tentativa: Modo mais agressivo com delay
    `yt-dlp --dump-json --extractor-args "youtube:player_client=android" --no-check-certificate --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" --sleep-interval 5 "https://www.youtube.com/watch?v=${videoId}"`
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
    const videoId = searchParams.get('id');
    
    if (!videoId) {
      return NextResponse.json(
        { error: 'ID do vídeo é obrigatório' },
        { status: 400 }
      );
    }

    // Obter informações do vídeo usando yt-dlp
    const { stdout } = await execAsync(
      `yt-dlp --dump-json ` +
      `--cookies "cookies.txt" ` +
      `"https://www.youtube.com/watch?v=${videoId}"`
    );
    const videoInfo = JSON.parse(stdout);

    return NextResponse.json({
      title: videoInfo.title,
      thumbnail: videoInfo.thumbnail,
      duration: formatDuration(videoInfo.duration)
    });

  } catch (error) {
    console.error('Erro ao buscar informações do vídeo:', error);
    
    // Extrair mensagem de erro mais útil
    let errorMessage = 'Erro ao buscar informações do vídeo';
    if (error instanceof Error) {
      if (error.message.includes('Sign in to confirm you')) {
        errorMessage = 'O YouTube está solicitando verificação. Tente novamente em alguns minutos.';
      } else if (error.message.includes('Video unavailable')) {
        errorMessage = 'O vídeo não está disponível. Verifique se é público.';
      } else if (error.message.includes('This video is not available')) {
        errorMessage = 'Este vídeo não está disponível no momento.';
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 