import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, readdir, writeFile } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);
const downloadsFolder = join(process.cwd(), 'downloads');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    console.log('Iniciando download da playlist:', url);

    // Criar pasta de downloads se não existir
    await mkdir(downloadsFolder, { recursive: true });
    console.log('Pasta de downloads criada/verificada');

    // Obter lista de arquivos existentes
    const existingFiles = await readdir(downloadsFolder);
    console.log('Arquivos existentes:', existingFiles.length);

    // Obter informações da playlist
    const { stdout: playlistInfo } = await execAsync(
      `yt-dlp --dump-json --flat-playlist ` +
      `--cookies "cookies.txt" ` +
      `"${url}"`,
      { maxBuffer: 1024 * 1024 * 100 }
    );

    // Processar a saída linha por linha
    const videos = playlistInfo.trim().split('\n').map(line => JSON.parse(line));
    console.log('Total de vídeos na playlist:', videos.length);

    // Array para armazenar resultados
    const results = [];
    // Array para status detalhado
    const statusList = [];
    // Caminho do arquivo de status
    const statusFile = join(downloadsFolder, 'playlist-status.json');

    // Baixar cada vídeo da playlist
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const expectedFileName = `${video.title}.mp3`;
      let status = { title: video.title, index: i + 1, total: videos.length, status: 'pending', message: '', downloadedAt: '' };
      try {
        // Verificar se o arquivo já existe
        if (existingFiles.some(file => file.toLowerCase() === expectedFileName.toLowerCase())) {
          status.status = 'existing';
          status.message = 'Arquivo já existe';
          status.downloadedAt = new Date().toISOString();
          results.push({ title: video.title, status: 'existing', message: 'Arquivo já existe', downloadedAt: status.downloadedAt });
        } else {
          status.status = 'downloading';
          status.message = 'Baixando...';
          await writeFile(statusFile, JSON.stringify({ status: 'downloading', videos: [...statusList, status] }, null, 2));
          // Baixar o vídeo como MP3
          await execAsync(
            `yt-dlp -x --audio-format mp3 --audio-quality 0 ` +
            `--embed-thumbnail --convert-thumbnails jpg ` +
            `--add-metadata ` +
            `--cookies "cookies.txt" ` +
            `-o "${downloadsFolder}/%(title)s.%(ext)s" ` +
            `--no-part --force-overwrites "https://www.youtube.com/watch?v=${video.id}"`,
            { maxBuffer: 1024 * 1024 * 100 }
          );
          status.status = 'success';
          status.message = 'Download concluído';
          status.downloadedAt = new Date().toISOString();
          results.push({ title: video.title, status: 'success', message: 'Download concluído', downloadedAt: status.downloadedAt });
        }
      } catch (error) {
        status.status = 'error';
        status.message = error instanceof Error ? error.message : 'Erro ao baixar';
        status.downloadedAt = new Date().toISOString();
        results.push({ title: video.title, status: 'error', message: status.message, downloadedAt: status.downloadedAt });
      }
      statusList.push(status);
      // Atualizar status a cada música
      await writeFile(statusFile, JSON.stringify({ status: 'downloading', videos: statusList }, null, 2));
    }
    // Status final
    await writeFile(statusFile, JSON.stringify({ status: 'done', videos: statusList }, null, 2));

    return NextResponse.json({
      status: 'concluído',
      message: 'Download da playlist concluído',
      results
    });

  } catch (error) {
    console.error('Erro ao processar playlist:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao processar a playlist' },
      { status: 500 }
    );
  }
} 