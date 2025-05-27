import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { constants } from 'fs';
import { access } from 'fs/promises';
import NodeID3 from 'node-id3';

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
    return join(process.cwd(), 'downloads');
  }
}

export async function POST(req: NextRequest) {
  try {
    const { fileName } = await req.json();
    if (!fileName) {
      return NextResponse.json({ error: 'Nome do arquivo é obrigatório.' }, { status: 400 });
    }
    const downloadsFolder = await getDownloadsPath();
    const filePath = join(downloadsFolder, fileName);
    if (!(await fileExists(filePath))) {
      return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
    }
    // Ler tags atuais para obter título/artista
    const tags = NodeID3.read(filePath);
    const title = tags.title || fileName.replace(/\.mp3$/i, '');
    const artist = tags.artist || '';
    // Buscar metadados no MusicBrainz
    let metadata = null;
    try {
      // Montar URL absoluta usando o host do request
      const host = req.headers.get('host');
      const protocol = host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https';
      const mbRes = await fetch(`${protocol}://${host}/api/musicbrainz-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, artist })
      });
      metadata = await mbRes.json();
    } catch (err) {
      return NextResponse.json({ error: 'Erro ao buscar metadados do MusicBrainz.' }, { status: 500 });
    }
    if (!metadata || metadata.error) {
      return NextResponse.json({ error: 'Metadados não encontrados.' }, { status: 404 });
    }
    // Gravar metadados no arquivo MP3
    const success = NodeID3.write({
      title: metadata.titulo || title,
      artist: metadata.artista || artist,
      album: metadata.album || '',
      year: metadata.ano || '',
      genre: metadata.genero || '',
      publisher: metadata.label || '',
      comment: { language: 'por', text: metadata.descricao || '' }
    }, filePath);
    if (!success) {
      return NextResponse.json({ error: 'Falha ao gravar metadados.' }, { status: 500 });
    }
    return NextResponse.json({ status: 'ok', message: 'Metadados atualizados com sucesso.' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro ao atualizar metadados.' }, { status: 500 });
  }
} 