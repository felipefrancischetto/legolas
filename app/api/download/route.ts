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
    const format = searchParams.get('format') || 'flac';
    
    if (!url) {
      return NextResponse.json(
        { error: 'URL é obrigatória' },
        { status: 400 }
      );
    }

    console.log('Iniciando download para URL:', url, 'Formato:', format);

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

    // Baixar o vídeo no formato selecionado com metadados
    console.log('Iniciando download do áudio...');
    const { stdout } = await execAsync(
      `yt-dlp -x --audio-format ${format} --audio-quality 10` +
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
      // Montar URL absoluta usando o host do request
      const host = request.headers.get('host');
      const protocol = host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https';
      const mbRes = await fetch(`${protocol}://${host}/api/musicbrainz-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: videoInfo.title, artist: videoInfo.uploader })
      });
      metadata = await mbRes.json();
      console.log('Metadados do MusicBrainz:', metadata);
      console.log('videoInfo:', videoInfo);
    } catch (err) {
      console.error('Erro ao buscar metadados do MusicBrainz:', err);
    }

    // Escrever metadados no arquivo
    try {
      const audioFile = `${downloadsFolder}/${videoInfo.title}.${format}`;
      const exists = await fileExists(audioFile);
      console.log('Arquivo de áudio existe para gravar metadados?', exists, audioFile);
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
        }, audioFile);
        console.log('Resultado da escrita dos metadados:', success);
        if (!success) {
          throw new Error('Falha ao gravar metadados ID3 no arquivo de áudio');
        }
      } else {
        console.warn('Metadados ausentes ou arquivo de áudio não encontrado para gravar tags.');
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