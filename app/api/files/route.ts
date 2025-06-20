import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { getDownloadsPath, formatDurationShort } from '../utils/common';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    // Extrair artista de múltiplas fontes e fallbacks
    const artist = tags.artist || tags.ARTIST || 
                   tags.albumartist || tags.ALBUMARTIST || 
                   tags.performer || tags.PERFORMER || 
                   null;

    // Extrair BPM de múltiplas fontes
    const bpm = tags.BPM || tags.bpm || tags.TEMPO || tags.tempo || null;

    // Extrair Key de múltiplas fontes  
    const key = tags.key || tags.KEY || 
                tags.initialKey || tags.INITIALKEY || 
                tags.initialkey || tags.INITIAL_KEY || null;

    // Extrair gênero (limpar se contiver BPM misturado)
    let genre = tags.genre || tags.Genre || tags.GENRE || null;
    if (genre) {
      // Se o gênero contém números no início (como "140 / Deep Dubstep"), limpar
      const genreClean = genre.replace(/^\d+\s*\/?\s*/, '').trim();
      if (genreClean && genreClean !== genre) {
        genre = genreClean;
      }
    }

    return {
      title: tags.title || tags.TITLE || null,
      artist: artist,
      duration: formatDurationShort(parseFloat(info.format?.duration || '0')),
      bpm: bpm,
      key: key,
      genre: genre,
      album: tags.album || tags.Album || tags.ALBUM || null,
      label: tags.publisher || tags.Publisher || tags.label || tags.Label || tags.LABEL || null,
      thumbnail: thumbnailUrl,
      ano: tags.year || tags.date || tags.YEAR || tags.DATE || null
    };
  } catch (error) {
    console.error('Erro ao extrair metadados:', error);
    return {};
  }
}

export async function GET(request: NextRequest) {
  try {
    // Obter o caminho de downloads usando utilitário compartilhado
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
    // Filtrar apenas arquivos de áudio (MP3 e FLAC)
    const audioFiles = files.filter(file => {
      const ext = file.toLowerCase();
      return ext.endsWith('.mp3') || ext.endsWith('.flac');
    });
    
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
      audioFiles.map(async (file) => {
        const filePath = join(downloadsFolder, file);
        const metadata = await extractAudioMetadata(filePath);
        const fileStats = await stat(filePath);
        
        // Buscar data/hora pelo título
        const downloadedAt = downloadDates[metadata.title || file.replace(/\.(mp3|flac)$/i, '')] || null;
        
        // Usar data de criação do arquivo como fallback
        const fileCreatedAt = fileStats.birthtime.toISOString();
        
        return {
          name: file,
          displayName: file.replace(/\.(mp3|flac)$/i, ''),
          path: filePath,
          size: fileStats.size,
          downloadedAt,
          fileCreatedAt,
          ...metadata
        };
      })
    );
    
    // Ordenar por data/hora de forma mais estável
    // Prioridade: downloadedAt > fileCreatedAt > ordem alfabética por título
    fileInfos.sort((a, b) => {
      // Se ambos têm downloadedAt, usar essa data (mais antigo primeiro para manter ordem de playlist)
      if (a.downloadedAt && b.downloadedAt) {
        return new Date(a.downloadedAt).getTime() - new Date(b.downloadedAt).getTime();
      }
      
      // Se apenas um tem downloadedAt, ele vem primeiro
      if (a.downloadedAt && !b.downloadedAt) return -1;
      if (!a.downloadedAt && b.downloadedAt) return 1;
      
      // Se nenhum tem downloadedAt, usar fileCreatedAt (mais antigo primeiro)
      if (a.fileCreatedAt && b.fileCreatedAt) {
        return new Date(a.fileCreatedAt).getTime() - new Date(b.fileCreatedAt).getTime();
      }
      
      // Fallback para ordem alfabética por título
      const titleA = a.title || a.displayName || '';
      const titleB = b.title || b.displayName || '';
      return titleA.localeCompare(titleB);
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