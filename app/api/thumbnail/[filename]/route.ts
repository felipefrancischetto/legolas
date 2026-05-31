import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink } from 'fs/promises';
import {
  getDownloadsPath,
  fileExists,
  resolveAudioFileUnderDownloads,
  pickEmbeddedCoverStreamIndex,
} from '@/app/api/utils/common';
import {
  readThumbnailFromDisk,
  writeThumbnailToDisk,
} from '@/app/api/utils/thumbnailDiskCache';

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

// Evita reprocessamento paralelo do mesmo arquivo
const processingCache = new Set<string>();
const processingWaiters = new Map<string, Array<(buffer: Buffer | null) => void>>();

function notifyProcessingWaiters(cacheKey: string, buffer: Buffer | null) {
  const waiters = processingWaiters.get(cacheKey);
  if (!waiters) return;
  waiters.forEach((resolve) => resolve(buffer));
  processingWaiters.delete(cacheKey);
}

function waitForProcessing(cacheKey: string, timeoutMs: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const waiters = processingWaiters.get(cacheKey) ?? [];
    waiters.push(resolve);
    processingWaiters.set(cacheKey, waiters);
    setTimeout(() => resolve(null), timeoutMs);
  });
}

async function tryFastArtworkExtract(filePath: string, tempImagePath: string): Promise<Buffer | null> {
  try {
    const fastCmd = `ffmpeg -hide_banner -loglevel error -y -i "${filePath}" -an -map 0:v? -frames:v 1 -q:v 6 "${tempImagePath}"`;
    await execAsync(fastCmd, { maxBuffer: 1024 * 1024 * 10 });
    if (await fileExists(tempImagePath)) {
      return await readFile(tempImagePath);
    }
  } catch {
    // fallback para fluxo detalhado
  }
  return null;
}

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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Função para gerar thumbnail padrão baseado no nome do arquivo
async function generateDefaultThumbnail(filename: string): Promise<Buffer> {
  // Criar uma imagem SVG simples como fallback
  const svg = `
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#10b981;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#059669;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="url(#grad)" rx="20"/>
      <text x="100" y="80" font-family="Arial, sans-serif" font-size="16" fill="white" text-anchor="middle" opacity="0.8">🎵</text>
      <text x="100" y="120" font-family="Arial, sans-serif" font-size="12" fill="white" text-anchor="middle" opacity="0.6">${filename.substring(0, 20)}${filename.length > 20 ? '...' : ''}</text>
      <text x="100" y="140" font-family="Arial, sans-serif" font-size="10" fill="white" text-anchor="middle" opacity="0.4">Audio File</text>
    </svg>
  `;
  
  return Buffer.from(svg);
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
    
    if (processingCache.has(cacheKey)) {
      const waitedBuffer = await waitForProcessing(cacheKey, 15000);
      if (waitedBuffer) {
        return new NextResponse(waitedBuffer, {
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000',
            'X-Cache': 'WAIT-HIT',
          },
        });
      }
      const retryCache = thumbnailCache.get(cacheKey);
      if (retryCache) {
        return new NextResponse(retryCache.buffer, {
          headers: {
            'Content-Type': retryCache.contentType,
            'Cache-Control': 'public, max-age=31536000',
            'X-Cache': 'RETRY-HIT',
          },
        });
      }
    }

    processingCache.add(cacheKey);

    try {
      const downloadsFolder = await getDownloadsPath();
      const filePath = resolveAudioFileUnderDownloads(downloadsFolder, decodedFilename);

      if (!filePath) {
        const defaultBuffer = await generateDefaultThumbnail(decodedFilename);
        return new NextResponse(defaultBuffer, {
          headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'public, max-age=3600',
            'X-Cache': 'DEFAULT'
          }
        });
      }

      const diskCached = await readThumbnailFromDisk(
        downloadsFolder,
        cacheKey,
        filePath
      );
      if (diskCached) {
        const cacheEntry: ThumbnailCache = {
          buffer: diskCached,
          timestamp: Date.now(),
          contentType: 'image/jpeg',
        };
        thumbnailCache.set(cacheKey, cacheEntry);
        notifyProcessingWaiters(cacheKey, diskCached);
        return new NextResponse(diskCached, {
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000',
            'X-Cache': 'DISK-HIT',
          },
        });
      }

      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);
      tempImagePath = join(downloadsFolder, `thumb_${timestamp}_${randomSuffix}.jpg`);

      let imageBuffer: Buffer | null = await tryFastArtworkExtract(filePath, tempImagePath);

      try {
        if (imageBuffer) {
          // extração rápida já obteve a capa
        } else {
        const { stdout: probeOutput } = await execAsync(
          `ffprobe -v quiet -print_format json -show_streams "${filePath}"`,
          { maxBuffer: 1024 * 1024 * 10 }
        );

        const probeInfo = JSON.parse(probeOutput);
        const streams = probeInfo.streams || [];
        const coverStreamIndex = pickEmbeddedCoverStreamIndex(streams);
        const hasVideoStream = streams.some((stream: { codec_type?: string }) => stream.codec_type === 'video');

        // Re-encode para JPEG: funciona com capa MJPEG, PNG, WebP embutida (evita -c:v copy + extensão errada)
        if (coverStreamIndex >= 0) {
          try {
            const artworkCommand = `ffmpeg -y -i "${filePath}" -map 0:${coverStreamIndex} -frames:v 1 -q:v 2 "${tempImagePath}"`;
            await execAsync(artworkCommand, { maxBuffer: 1024 * 1024 * 10 });
            if (await fileExists(tempImagePath)) {
              imageBuffer = await readFile(tempImagePath);
              console.log('✅ Artwork embutido extraído (stream index', coverStreamIndex, ')');
            }
          } catch {
            console.log('⚠️ Falha ao extrair artwork pelo stream de capa; tentando 0:v:0');
          }
        }

        if (!imageBuffer && hasVideoStream) {
          try {
            const fallbackCmd = `ffmpeg -y -i "${filePath}" -map 0:v:0 -frames:v 1 -q:v 2 "${tempImagePath}"`;
            await execAsync(fallbackCmd, { maxBuffer: 1024 * 1024 * 10 });
            if (await fileExists(tempImagePath)) {
              imageBuffer = await readFile(tempImagePath);
              console.log('✅ Artwork extraído do primeiro stream de vídeo');
            }
          } catch {
            console.log('⚠️ Falha ao extrair primeiro stream de vídeo como imagem');
          }
        }

        // Se não conseguiu extrair artwork embutido, tentar buscar URL do YouTube nos metadados
        if (!imageBuffer) {
          try {
            const { stdout: metadataOutput } = await execAsync(
              `ffprobe -v quiet -print_format json -show_format "${filePath}"`,
              { maxBuffer: 1024 * 1024 * 10 }
            );
            
            const metadata = JSON.parse(metadataOutput);
            const youtubeUrl = metadata.format?.tags?.purl || 
                             metadata.format?.tags?.comment ||
                             metadata.format?.tags?.description;
            
            if (youtubeUrl && youtubeUrl.includes('youtube.com/watch?v=')) {
              const videoId = youtubeUrl.split('v=')[1].split('&')[0];
              const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
              
              console.log('🔍 Tentando baixar thumbnail do YouTube:', thumbnailUrl);
              const response = await fetch(thumbnailUrl);
              if (response.ok) {
                imageBuffer = Buffer.from(await response.arrayBuffer());
                console.log('✅ Thumbnail do YouTube baixado com sucesso');
              } else {
                // Tentar thumbnail de qualidade menor
                const fallbackUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                const fallbackResponse = await fetch(fallbackUrl);
                if (fallbackResponse.ok) {
                  imageBuffer = Buffer.from(await fallbackResponse.arrayBuffer());
                  console.log('✅ Thumbnail do YouTube (qualidade menor) baixado');
                }
              }
            }
          } catch (metadataError) {
            console.log('⚠️ Não foi possível extrair URL do YouTube dos metadados');
          }
        }

        // Se ainda não tem imagem, tentar extrair frame do vídeo (se for arquivo de vídeo)
        if (!imageBuffer && hasVideoStream) {
          try {
            const ffmpegCommand = `ffmpeg -y -i "${filePath}" -vf "select=eq(n\\,0)" -vframes 1 "${tempImagePath}"`;
            await execAsync(ffmpegCommand, { maxBuffer: 1024 * 1024 * 10 });
            
            if (await fileExists(tempImagePath)) {
              imageBuffer = await readFile(tempImagePath);
              console.log('✅ Frame de vídeo extraído como thumbnail');
            }
          } catch (frameError) {
            console.log('⚠️ Erro ao extrair frame de vídeo');
          }
        }

        }
      } catch (error) {
        console.error('❌ Erro ao processar arquivo para thumbnail:', error);
      }

      // Limpar arquivo temporário se existir
      if (tempImagePath && await fileExists(tempImagePath)) {
        try {
          await unlink(tempImagePath);
        } catch (cleanupError) {
          console.warn('⚠️ Erro ao limpar arquivo temporário:', cleanupError);
        }
      }

      if (imageBuffer) {
        try {
          await writeThumbnailToDisk(downloadsFolder, cacheKey, imageBuffer);
        } catch (diskError) {
          console.warn('⚠️ Falha ao gravar thumbnail em disco:', diskError);
        }

        const cacheEntry: ThumbnailCache = {
          buffer: imageBuffer,
          timestamp: Date.now(),
          contentType: 'image/jpeg'
        };
        thumbnailCache.set(cacheKey, cacheEntry);
        cleanupCache();
        notifyProcessingWaiters(cacheKey, imageBuffer);

        return new NextResponse(imageBuffer, {
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000',
            'X-Cache': 'MISS'
          }
        });
      }

      // Se não conseguiu extrair nenhuma imagem, retornar thumbnail padrão
      console.log('⚠️ Nenhum artwork encontrado, usando thumbnail padrão');
      const defaultBuffer = await generateDefaultThumbnail(decodedFilename);
      
      // Cache o thumbnail padrão também para evitar reprocessamento
      const cacheEntry: ThumbnailCache = {
        buffer: defaultBuffer,
        timestamp: Date.now(),
        contentType: 'image/svg+xml'
      };
      thumbnailCache.set(cacheKey, cacheEntry);
      cleanupCache();
      notifyProcessingWaiters(cacheKey, null);

      return new NextResponse(defaultBuffer, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=3600',
          'X-Cache': 'DEFAULT'
        }
      });

    } catch (error) {
      console.error('❌ Erro ao extrair thumbnail:', error);
      
      // Retornar thumbnail padrão em caso de erro
      const defaultBuffer = await generateDefaultThumbnail(decodedFilename);
      return new NextResponse(defaultBuffer, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=3600',
          'X-Cache': 'ERROR-DEFAULT'
        }
      });
    } finally {
      processingCache.delete(cacheKey);
      notifyProcessingWaiters(cacheKey, thumbnailCache.get(cacheKey)?.buffer ?? null);
      
      // Limpar arquivo temporário se ainda existir
      if (tempImagePath) {
        try {
          if (await fileExists(tempImagePath)) {
            await unlink(tempImagePath);
          }
        } catch (cleanupError) {
          console.warn('⚠️ Erro ao limpar arquivo temporário final:', cleanupError);
        }
      }
    }
  } catch (error) {
    console.error('❌ Erro geral ao extrair thumbnail:', error);
    
    // Limpar processamento
    const { filename } = await params;
    if (filename && processingCache.has(decodeURIComponent(filename))) {
      processingCache.delete(decodeURIComponent(filename));
    }
    
    // Retornar thumbnail padrão
    try {
      const defaultBuffer = await generateDefaultThumbnail(decodeURIComponent(filename || 'unknown'));
      return new NextResponse(defaultBuffer, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=3600',
          'X-Cache': 'FINAL-DEFAULT'
        }
      });
    } catch (defaultError) {
      console.error('❌ Erro ao gerar thumbnail padrão:', defaultError);
      // Retornar uma imagem SVG mínima em caso de erro total
      const minimalSvg = Buffer.from(`
        <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="200" fill="#1f2937" rx="20"/>
          <text x="100" y="100" font-family="Arial, sans-serif" font-size="16" fill="#9ca3af" text-anchor="middle">🎵</text>
        </svg>
      `);
      return new NextResponse(minimalSvg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=3600',
          'X-Cache': 'ERROR-FALLBACK'
        }
      });
    }
  }
} 