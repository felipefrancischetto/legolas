import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, readFile } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getDownloadsPath() {
  try {
    const configPath = join(process.cwd(), 'downloads.config.json');
    const config = await readFile(configPath, 'utf-8');
    const { path } = JSON.parse(config);
    return join(process.cwd(), path);
  } catch (error) {
    return join(process.cwd(), 'downloads');
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');
    const format = searchParams.get('format') || 'mp3';
    
    if (!url) {
      return NextResponse.json(
        { error: 'URL é obrigatória' },
        { status: 400 }
      );
    }

    console.log('Iniciando download da playlist:', url, 'Formato:', format);

    // Obter o caminho de downloads
    const downloadsFolder = await getDownloadsPath();

    // Criar pasta de downloads se não existir
    await mkdir(downloadsFolder, { recursive: true });
    console.log('Pasta de downloads criada/verificada:', downloadsFolder);

    // Baixar a playlist no formato selecionado
    console.log('Iniciando download da playlist...');
    const { stdout } = await execAsync(
      `yt-dlp -x --audio-format ${format} --audio-quality 0 ` +
      `--embed-thumbnail --convert-thumbnails jpg ` +
      `--add-metadata ` +
      `--cookies "cookies.txt" ` +
      `-o "${downloadsFolder}/%(title)s.%(ext)s" ` +
      `--no-part --force-overwrites "${url}"`,
      {
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      }
    );
    console.log('Download da playlist concluído:', stdout);

    return NextResponse.json({
      status: 'concluído',
      message: 'Download da playlist concluído com sucesso'
    });

  } catch (error) {
    console.error('Erro detalhado ao processar playlist:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao processar a playlist' },
      { status: 500 }
    );
  }
} 