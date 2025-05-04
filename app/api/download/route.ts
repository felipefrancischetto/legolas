import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, access, unlink, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { constants } from 'fs';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function cleanupTempFiles(filename: string) {
  const basePath = join(process.cwd(), 'downloads');
  const tempFiles = [
    `${basePath}.temp.mp3`,
    `${basePath}.webm`,
    `${basePath}.webm.part`,
    `${basePath}.webp`
  ];

  for (const file of tempFiles) {
    try {
      if (await fileExists(file)) {
        await unlink(file);
      }
    } catch (error) {
      console.warn(`Não foi possível remover arquivo temporário ${file}:`, error);
    }
  }
}

async function getDownloadsPath() {
  try {
    const configPath = join(process.cwd(), 'downloads.config.json');
    const config = await readFile(configPath, 'utf-8');
    const { path } = JSON.parse(config);
    return join(process.cwd(), path);
  } catch (error) {
    // Se não houver configuração, use o caminho padrão
    return join(process.cwd(), 'downloads');
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');
    
    if (!url) {
      return NextResponse.json(
        { error: 'URL é obrigatória' },
        { status: 400 }
      );
    }

    console.log('Iniciando download para URL:', url);

    // Obter o caminho de downloads
    const downloadsFolder = await getDownloadsPath();

    // Criar pasta de downloads se não existir
    await mkdir(downloadsFolder, { recursive: true });
    console.log('Pasta de downloads criada/verificada:', downloadsFolder);

    // Obter informações do vídeo
    const { stdout: infoJson } = await execAsync(
      `yt-dlp --dump-json ` +
      `--cookies "cookies.txt" ` +
      `"${url}"`,
      {
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      }
    );
    const videoInfo = JSON.parse(infoJson);

    // Baixar o vídeo como MP3 com metadados
    console.log('Iniciando download do áudio...');
    const { stdout } = await execAsync(
      `yt-dlp -x --audio-format mp3 --audio-quality 0 ` +
      `--embed-thumbnail --convert-thumbnails jpg ` +
      `--add-metadata ` +
      `--cookies "cookies.txt" ` +
      `-o "${downloadsFolder}/%(title)s.%(ext)s" ` +
      `--no-part --force-overwrites "${url}"`,
      {
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      }
    );
    console.log('Download concluído:', stdout);

    return NextResponse.json({
      status: 'concluído',
      message: 'Download concluído com sucesso',
      info: {
        title: videoInfo.title,
        artist: videoInfo.uploader,
        duration: videoInfo.duration,
        thumbnail: videoInfo.thumbnail
      }
    });

  } catch (error) {
    console.error('Erro detalhado ao processar vídeo:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao processar o vídeo' },
      { status: 500 }
    );
  }
} 