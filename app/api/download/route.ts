import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, access, unlink, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { constants } from 'fs';
import NodeID3 from 'node-id3';

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

    // Buscar metadados no MusicBrainz
    let metadata = null;
    try {
      const mbRes = await fetch('/api/musicbrainz-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: videoInfo.title, artist: videoInfo.uploader })
      });
      metadata = await mbRes.json();
    } catch (err) {
      console.error('Erro ao buscar metadados do MusicBrainz:', err);
    }

    // Escrever metadados no arquivo MP3
    try {
      const mp3File = `${downloadsFolder}/${videoInfo.title}.mp3`;
      const exists = await fileExists(mp3File);
      console.log('Arquivo MP3 existe para gravar metadados?', exists, mp3File);
      console.log('Metadados buscados:', metadata);
      if (metadata && exists) {
        const tags = {
          title: metadata.titulo || videoInfo.title,
          artist: metadata.artista || videoInfo.uploader,
          album: metadata.album || '',
          year: metadata.ano || '',
          genre: metadata.genero || '',
          publisher: metadata.label || '',
          comment: { language: 'eng', text: metadata.descricao || '' }
        };
        const success = NodeID3.write({
          ...tags,
          comment: {
            language: 'por', // Portuguese language code
            text: metadata.descricao || ''
          }
        }, mp3File);
        console.log('Resultado da escrita dos metadados:', success);
        if (!success) {
          throw new Error('Falha ao gravar metadados ID3 no arquivo MP3');
        }
      } else {
        console.warn('Metadados ausentes ou arquivo MP3 não encontrado para gravar tags.');
      }
    } catch (err) {
      console.error('Erro ao gravar metadados ID3:', err);
    }

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