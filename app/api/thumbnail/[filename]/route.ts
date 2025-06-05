import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, access, unlink } from 'fs/promises';
import { constants } from 'fs';

const execAsync = promisify(exec);

// Cache em memória para thumbnails
interface ThumbnailCache {
  buffer: Buffer;
  timestamp: number;
  contentType: string;
}

const thumbnailCache = new Map<string, ThumbnailCache>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos
const MAX_CACHE_SIZE = 200; // Aumentado para 200 thumbnails

// Cache global em memória para evitar reprocessamento
const processingCache = new Set<string>();

// Função para limpar cache antigo
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of thumbnailCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      thumbnailCache.delete(key);
    }
  }
  
  // Se ainda estiver muito grande, remover as mais antigas
  if (thumbnailCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(thumbnailCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = entries.slice(0, thumbnailCache.size - MAX_CACHE_SIZE);
    toRemove.forEach(([key]) => thumbnailCache.delete(key));
  }
}

// Função para obter o caminho correto da pasta de downloads
async function getDownloadsPath() {
  try {
    const configPath = join(process.cwd(), 'downloads.config.json');
    const config = await readFile(configPath, 'utf-8');
    const { path } = JSON.parse(config);
    const fullPath = join(process.cwd(), path);
    return fullPath;
  } catch (error) {
    console.error('Erro ao ler configuração:', error);
    // Se não houver configuração, use o caminho padrão
    const defaultPath = join(process.cwd(), 'downloads');
    return defaultPath;
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
): Promise<NextResponse> {
  let tempImagePath = '';
  try {
    const { filename } = await params;
    if (!filename) {
      return new NextResponse('Nome do arquivo é obrigatório', { status: 400 });
    }
    const decodedFilename = decodeURIComponent(filename);
    
    // Verificar cache primeiro
    const cacheKey = decodedFilename;
    const cachedThumbnail = thumbnailCache.get(cacheKey);
    
    if (cachedThumbnail && (Date.now() - cachedThumbnail.timestamp) < CACHE_DURATION) {
      return new NextResponse(cachedThumbnail.buffer, {
        headers: {
          'Content-Type': cachedThumbnail.contentType,
          'Cache-Control': 'public, max-age=31536000',
          'X-Cache': 'HIT'
        }
      });
    }
    
    // Verificar se já está sendo processado
    if (processingCache.has(cacheKey)) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const retryCache = thumbnailCache.get(cacheKey);
      if (retryCache) {
        return new NextResponse(retryCache.buffer, {
          headers: {
            'Content-Type': retryCache.contentType,
            'Cache-Control': 'public, max-age=31536000',
            'X-Cache': 'RETRY-HIT'
          }
        });
      }
      return new NextResponse('', { status: 404 });
    }
    
    processingCache.add(cacheKey);
    
    try {
      const downloadsFolder = await getDownloadsPath();
      const filePath = join(downloadsFolder, decodedFilename);

      if (!await fileExists(filePath)) {
        return new NextResponse('Arquivo não encontrado', { status: 404 });
      }

      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);
      tempImagePath = join(downloadsFolder, `thumb_${timestamp}_${randomSuffix}.jpg`);

      try {
        const { stdout: probeOutput } = await execAsync(
          `ffprobe -v quiet -print_format json -show_streams "${filePath}"`,
          { maxBuffer: 1024 * 1024 * 10 }
        );
        
        const probeInfo = JSON.parse(probeOutput);
        const hasVideoStream = probeInfo.streams?.some((stream: any) => stream.codec_type === 'video');
        
        if (!hasVideoStream) {
          try {
            const artworkCommand = `ffmpeg -y -i "${filePath}" -an -c:v copy -f image2 "${tempImagePath}"`;
            await execAsync(artworkCommand, { maxBuffer: 1024 * 1024 * 10 });
            
            if (await fileExists(tempImagePath)) {
              const imageBuffer = await readFile(tempImagePath);
              
              try {
                await unlink(tempImagePath);
              } catch (error) {
                console.warn('Erro ao remover arquivo temporário:', error);
              }
              
              const cacheEntry: ThumbnailCache = {
                buffer: imageBuffer,
                timestamp: Date.now(),
                contentType: 'image/jpeg'
              };
              thumbnailCache.set(cacheKey, cacheEntry);
              cleanupCache();
              
              return new NextResponse(imageBuffer, {
                headers: {
                  'Content-Type': 'image/jpeg',
                  'Cache-Control': 'public, max-age=31536000',
                  'X-Cache': 'MISS'
                }
              });
            }
          } catch (error) {
            try {
              const flacArtworkCommand = `ffmpeg -y -i "${filePath}" -map 0:v -c copy "${tempImagePath}"`;
              await execAsync(flacArtworkCommand, { maxBuffer: 1024 * 1024 * 10 });
              
              if (await fileExists(tempImagePath)) {
                const imageBuffer = await readFile(tempImagePath);
                
                try {
                  await unlink(tempImagePath);
                } catch (error) {
                  console.warn('Erro ao remover arquivo temporário:', error);
                }
                
                const cacheEntry: ThumbnailCache = {
                  buffer: imageBuffer,
                  timestamp: Date.now(),
                  contentType: 'image/jpeg'
                };
                thumbnailCache.set(cacheKey, cacheEntry);
                cleanupCache();
                
                return new NextResponse(imageBuffer, {
                  headers: {
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'public, max-age=31536000',
                    'X-Cache': 'MISS'
                  }
                });
              }
            } catch (flacError) {
              console.log('⚠️ Nenhum artwork embutido encontrado no arquivo');
            }
          }
          
          try {
            const { stdout: metadataOutput } = await execAsync(
              `ffprobe -v quiet -print_format json -show_format "${filePath}"`,
              { maxBuffer: 1024 * 1024 * 10 }
            );
            
            const metadata = JSON.parse(metadataOutput);
            const youtubeUrl = metadata.format?.tags?.purl || metadata.format?.tags?.comment;
            
            if (youtubeUrl && youtubeUrl.includes('youtube.com/watch?v=')) {
              const videoId = youtubeUrl.split('v=')[1].split('&')[0];
              const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
              
              const response = await fetch(thumbnailUrl);
              if (response.ok) {
                const imageBuffer = Buffer.from(await response.arrayBuffer());
                
                const cacheEntry: ThumbnailCache = {
                  buffer: imageBuffer,
                  timestamp: Date.now(),
                  contentType: 'image/jpeg'
                };
                thumbnailCache.set(cacheKey, cacheEntry);
                cleanupCache();
                
                return new NextResponse(imageBuffer, {
                  headers: {
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'public, max-age=31536000',
                    'X-Cache': 'MISS'
                  }
                });
              }
            }
          } catch (metadataError) {
            console.log('Não foi possível extrair URL do YouTube dos metadados');
          }
          
          return new NextResponse('', { status: 404 });
        } else {
          const ffmpegCommand = `ffmpeg -y -i "${filePath}" -vf "select=eq(n\\,0)" -vframes 1 "${tempImagePath}"`;
          await execAsync(ffmpegCommand, { maxBuffer: 1024 * 1024 * 10 });
        }
      } catch (error) {
        console.error('Erro ao executar comando ffmpeg:', error);
        return new NextResponse('', { status: 404 });
      }
      
      const imageBuffer = await readFile(tempImagePath);
      
      if (tempImagePath) {
        try {
          await unlink(tempImagePath);
        } catch (cleanupError) {
          console.warn('Erro ao limpar arquivo temporário:', cleanupError);
        }
      }

      const cacheEntry: ThumbnailCache = {
        buffer: imageBuffer,
        timestamp: Date.now(),
        contentType: 'image/jpeg'
      };
      thumbnailCache.set(cacheKey, cacheEntry);
      cleanupCache();

      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000',
          'X-Cache': 'MISS'
        }
      });
    } catch (error) {
      console.error('Erro ao extrair thumbnail:', error);
      
      if (tempImagePath) {
        try {
          await unlink(tempImagePath);
        } catch (cleanupError) {
          console.warn('Erro ao limpar arquivo temporário:', cleanupError);
        }
      }
      
      return new NextResponse('Erro ao extrair thumbnail', { status: 500 });
    } finally {
      processingCache.delete(cacheKey);
    }
  } catch (error) {
    console.error('Erro ao extrair thumbnail:', error);
    
    if (tempImagePath) {
      try {
        await unlink(tempImagePath);
      } catch (cleanupError) {
        console.warn('Erro ao limpar arquivo temporário:', cleanupError);
      }
    }
    
    return new NextResponse('Erro ao extrair thumbnail', { status: 500 });
  }
} 