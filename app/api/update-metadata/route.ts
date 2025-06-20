import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { constants } from 'fs';
import { access } from 'fs/promises';
import NodeID3 from 'node-id3';
import { spawn } from 'child_process';
import { mkdtempSync, existsSync, renameSync } from 'fs';
import os from 'os';

function deduplicateLabel(label: string): string {
  if (!label) return '';
  
  // Remove any duplicate words or phrases
  const words = label.split(/\s+/);
  const uniqueWords = [...new Set(words)];
  
  // Join back and clean
  const deduplicated = uniqueWords.join(' ').trim();
  
  // Remove common duplicate patterns
  return deduplicated
    .replace(/(\w+)\s+\1/gi, '$1') // Remove consecutive duplicate words
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

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
    const body = await req.json();
    const { fileName, title, artist, album, year, genre, label, bpm, key, duration, comment, newFileName } = body;
    if (!fileName) {
      return NextResponse.json({ error: 'Nome do arquivo é obrigatório.' }, { status: 400 });
    }
    const downloadsFolder = await getDownloadsPath();
    let filePath = join(downloadsFolder, fileName);
    if (!(await fileExists(filePath))) {
      return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
    }

    // Renomear arquivo se necessário
    if (newFileName && newFileName !== fileName) {
      const newFilePath = join(downloadsFolder, newFileName);
      if (await fileExists(newFilePath)) {
        return NextResponse.json({ error: 'Já existe um arquivo com o novo nome.' }, { status: 400 });
      }
      try {
        renameSync(filePath, newFilePath);
        filePath = newFilePath;
      } catch (err) {
        return NextResponse.json({ error: 'Erro ao renomear o arquivo.' }, { status: 500 });
      }
    }

    // Se vierem campos manuais, use-os para atualizar o arquivo
    if (title || artist || album || year || genre || label || bpm || key || duration || comment) {
      const ext = filePath.split('.').pop()?.toLowerCase();
      // Corrigir o campo year para garantir apenas 4 dígitos
      let safeYear = year;
      if (typeof year === 'string' && year.length > 4) {
        const match = year.match(/\d{4}/);
        safeYear = match ? match[0] : '';
      }
      if (ext === 'mp3') {
        const tags: any = {};
        if (title) tags.title = title;
        if (artist) tags.artist = artist;
        if (album) tags.album = album;
        if (safeYear) tags.year = safeYear;
        if (genre) tags.genre = genre;
        if (label) tags.publisher = deduplicateLabel(label);
        if (bpm) tags.TBPM = bpm.toString();
        if (key) tags.initialKey = key;
        if (duration) tags.length = duration.toString();
        if (comment) tags.comment = { language: 'por', text: comment };

        const success = NodeID3.write(tags, filePath);
        if (!success) {
          return NextResponse.json({ error: 'Falha ao gravar metadados.' }, { status: 500 });
        }
        return NextResponse.json({ status: 'ok', message: 'Metadados MP3 atualizados com sucesso.' });
      } else if (ext === 'flac') {
        // Montar argumentos do ffmpeg
        const args = ['-y', '-i', filePath];
        if (title) args.push('-metadata', `title=${title}`);
        if (artist) args.push('-metadata', `artist=${artist}`);
        if (album) args.push('-metadata', `album=${album}`);
        if (safeYear) args.push('-metadata', `date=${safeYear}`);
        if (genre) args.push('-metadata', `genre=${genre}`);
        if (label) args.push('-metadata', `publisher=${deduplicateLabel(label)}`);
        if (bpm) args.push('-metadata', `bpm=${bpm}`);
        if (key) args.push('-metadata', `key=${key}`);
        if (duration) args.push('-metadata', `duration=${duration}`);
        if (comment) args.push('-metadata', `comment=${comment}`);
        // Arquivo temporário de saída
        const tmpDir = mkdtempSync(os.tmpdir() + '/flacmeta-');
        const outPath = `${tmpDir}/out.flac`;
        args.push('-c', 'copy', outPath);
        // Executar ffmpeg
        await new Promise((resolve, reject) => {
          const ffmpeg = spawn('ffmpeg', args);
          let stderr = '';
          ffmpeg.stderr.on('data', (data) => { stderr += data.toString(); });
          ffmpeg.on('close', (code) => {
            if (code === 0 && existsSync(outPath)) {
              try {
                renameSync(outPath, filePath);
                resolve(true);
              } catch (e) {
                reject(e);
              }
            } else {
              reject(new Error('ffmpeg error: ' + stderr));
            }
          });
        });
        return NextResponse.json({ status: 'ok', message: 'Metadados FLAC atualizados com sucesso.' });
      } else {
        return NextResponse.json({ error: 'Formato de arquivo não suportado para edição de metadados.' }, { status: 400 });
      }
    }

    // Se não vierem campos manuais, seguir fluxo antigo (buscar metadados externos)
    // Ler tags atuais para obter título/artista
    const tags = NodeID3.read(filePath);
    const fallbackTitle = tags.title || fileName.replace(/\.flac$/i, '');
    const fallbackArtist = tags.artist || '';
    // Buscar metadados no MusicBrainz
    let metadata = null;
    try {
      const host = req.headers.get('host');
      const protocol = host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https';
      const mbRes = await fetch(`${protocol}://${host}/api/musicbrainz-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: fallbackTitle, artist: fallbackArtist })
      });
      metadata = await mbRes.json();
    } catch (err) {
      return NextResponse.json({ error: 'Erro ao buscar metadados do MusicBrainz.' }, { status: 500 });
    }
    if (!metadata || metadata.error) {
      return NextResponse.json({ error: 'Metadados não encontrados.' }, { status: 404 });
    }
    const success = NodeID3.write({
      title: metadata.titulo || fallbackTitle,
      artist: metadata.artista || fallbackArtist,
      album: metadata.album || '',
      year: metadata.ano || '',
      genre: metadata.genero || '',
      publisher: deduplicateLabel(metadata.label || ''),
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