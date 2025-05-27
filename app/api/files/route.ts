import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

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
    // Se não houver configuração, use o caminho padrão
    return join(process.cwd(), 'downloads');
  }
}

async function extractAudioMetadata(filePath: string) {
  try {
    // Extrair metadados incluindo a imagem embutida
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
      { maxBuffer: 1024 * 1024 * 10 }
    );

    const info = JSON.parse(stdout);
    const tags = info.format?.tags || {};
    
    // Procurar por stream de imagem
    const pictureStream = info.streams?.find((stream: { codec_type: string; codec_name: string; }) => 
      stream.codec_type === 'video' && stream.codec_name === 'mjpeg'
    );
    const hasCoverArt = pictureStream !== undefined;

    // Se tiver imagem embutida, criar uma URL para ela
    let thumbnailUrl = null;
    if (hasCoverArt) {
      thumbnailUrl = `/api/thumbnail/${encodeURIComponent(filePath.split('/').pop() || '')}`;
    }

    return {
      title: tags.title || null,
      artist: tags.artist || null,
      duration: formatDuration(parseFloat(info.format?.duration || '0')),
      bpm: tags.BPM || tags.bpm || null,
      key: tags.key || tags.initialkey || null,
      genre: tags.genre || tags.Genre || null,
      album: tags.album || tags.Album || null,
      label: tags.publisher || tags.Publisher || tags.label || tags.Label || null,
      thumbnail: thumbnailUrl
    };
  } catch (error) {
    console.error('Erro ao extrair metadados:', error);
    return {};
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    // Obter o caminho de downloads
    const downloadsFolder = await getDownloadsPath();

    let files: string[] = [];
    try {
      // Listar arquivos na pasta de downloads
      files = await readdir(downloadsFolder);
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        // Pasta não existe, retorna lista vazia
        return NextResponse.json({ files: [] });
      }
      throw err;
    }
    // Filtrar apenas arquivos MP3
    const mp3Files = files.filter(file => file.toLowerCase().endsWith('.mp3'));
    
    // Buscar datas de download do playlist-status.json
    let downloadDates: Record<string, string> = {};
    const statusFile = join(downloadsFolder, 'playlist-status.json');
    if (existsSync(statusFile)) {
      try {
        const statusData = JSON.parse(await readFile(statusFile, 'utf-8'));
        if (statusData && statusData.videos) {
          statusData.videos.forEach((v: any) => {
            if (v.title && v.downloadedAt) {
              downloadDates[v.title] = v.downloadedAt;
            }
          });
        }
      } catch {}
    }
    // Obter informações de cada arquivo
    const fileInfos = await Promise.all(
      mp3Files.map(async (file) => {
        const filePath = join(downloadsFolder, file);
        const metadata = await extractAudioMetadata(filePath);
        // Buscar data/hora pelo título
        const downloadedAt = downloadDates[metadata.title || file.replace(/\.mp3$/i, '')] || null;
        return {
          name: file,
          displayName: file.replace(/\.mp3$/i, ''),
          path: filePath,
          size: 0, // TODO: Implementar tamanho do arquivo
          downloadedAt,
          ...metadata
        };
      })
    );
    // Ordenar por data/hora (mais recente primeiro)
    fileInfos.sort((a, b) => {
      if (a.downloadedAt && b.downloadedAt) return b.downloadedAt.localeCompare(a.downloadedAt);
      if (a.downloadedAt) return -1;
      if (b.downloadedAt) return 1;
      return (b.title || b.displayName).localeCompare(a.title || a.displayName);
    });

    return NextResponse.json({ files: fileInfos });

  } catch (error) {
    console.error('Erro ao listar arquivos:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao listar arquivos' },
      { status: 500 }
    );
  }
} 