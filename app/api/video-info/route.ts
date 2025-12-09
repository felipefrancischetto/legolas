import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { formatDuration, hasValidCookiesFile } from '../utils/common';

const execAsync = promisify(exec);
const cookiesPath = join(process.cwd(), 'cookies.txt');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getVideoInfo(videoId: string, retryCount = 0): Promise<any> {
  const maxRetries = 3;
  const hasValidCookies = await hasValidCookiesFile();
  
  const commands = [
    // Primeira tentativa: Com cookies do arquivo (se válido) ou sem cookies
    hasValidCookies
      ? `yt-dlp --dump-json --cookies "${cookiesPath}" "https://www.youtube.com/watch?v=${videoId}"`
      : `yt-dlp --dump-json "https://www.youtube.com/watch?v=${videoId}"`,
    // Segunda tentativa: Com cookies do arquivo e configurações adicionais (se válido) ou sem cookies
    hasValidCookies
      ? `yt-dlp --dump-json --cookies "${cookiesPath}" --extractor-args "youtube:player_skip=webpage,configs" "https://www.youtube.com/watch?v=${videoId}"`
      : `yt-dlp --dump-json --extractor-args "youtube:player_skip=webpage,configs" "https://www.youtube.com/watch?v=${videoId}"`,
    // Terceira tentativa: Modo mais agressivo com delay
    `yt-dlp --dump-json --extractor-args "youtube:player_client=android" --no-check-certificate --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" --sleep-interval 5 "https://www.youtube.com/watch?v=${videoId}"`
  ];

  try {
    const { stdout } = await execAsync(commands[retryCount], { maxBuffer: 1024 * 1024 * 10 });
    return JSON.parse(stdout);
  } catch (error) {
    console.error(`Tentativa ${retryCount + 1} falhou:`, error);
    
    // Se o erro for de cookies inválidos, pular para o próximo método sem cookies
    if (error instanceof Error && error.message.includes('does not look like a Netscape format')) {
      console.log('Cookies inválidos detectados, pulando para método sem cookies...');
      if (retryCount < maxRetries - 1) {
        return getVideoInfo(videoId, Math.max(retryCount + 1, 2)); // Pular para o método sem cookies
      }
    }
    
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

    // Obter informações do vídeo usando yt-dlp com fallback automático
    const videoInfo = await getVideoInfo(videoId);

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
      } else if (error.message.includes('does not look like a Netscape format')) {
        errorMessage = 'Arquivo de cookies inválido. Tente novamente.';
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 