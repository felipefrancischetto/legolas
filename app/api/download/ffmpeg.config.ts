import ffmpeg from 'fluent-ffmpeg';
import { join } from 'path';
import { existsSync } from 'fs';

// Função para detectar o caminho do FFmpeg
function getFfmpegPath(): string | null {
  // 1. Verificar variável de ambiente
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }

  // 2. Tentar encontrar no sistema (Linux/Mac)
  const systemPaths = [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
  ];

  for (const path of systemPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  // 3. Tentar usar o instalador do npm (Windows)
  const isWindows = process.platform === 'win32';
  const npmFfmpegPath = isWindows
    ? join(process.cwd(), 'node_modules', '@ffmpeg-installer', 'ffmpeg', 'ffmpeg.exe')
    : join(process.cwd(), 'node_modules', '@ffmpeg-installer', 'ffmpeg', 'ffmpeg');

  if (existsSync(npmFfmpegPath)) {
    return npmFfmpegPath;
  }

  // 4. Tentar encontrar no PATH
  try {
    const { execSync } = require('child_process');
    const whichCommand = isWindows ? 'where' : 'which';
    const ffmpegInPath = execSync(`${whichCommand} ffmpeg`, { encoding: 'utf-8' }).trim();
    if (ffmpegInPath && existsSync(ffmpegInPath)) {
      return ffmpegInPath;
    }
  } catch (error) {
    // FFmpeg não encontrado no PATH
  }

  return null;
}

// Configurar o caminho do ffmpeg
const ffmpegPath = getFfmpegPath();

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log(`✅ FFmpeg configurado: ${ffmpegPath}`);
} else {
  console.warn('⚠️  FFmpeg não encontrado. Algumas funcionalidades podem não funcionar.');
  console.warn('   Instale FFmpeg ou configure a variável FFMPEG_PATH');
}

export default ffmpeg; 