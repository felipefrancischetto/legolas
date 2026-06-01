import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { createReadStream, existsSync, statSync } from 'fs';
import { mkdir, readdir, stat, unlink } from 'fs/promises';
import { getCookiesFlag, getDownloadsPath } from '@/app/api/utils/common';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PRÉVIA de faixas do YouTube ainda não baixadas, tocando no NOSSO player.
 *
 * O `yt-dlp -g` (URL direta) está bloqueado pelo YouTube (PO Token/SSAP), então
 * — igual ao download do projeto — BAIXAMOS o áudio (tentando vários player_clients)
 * para um cache temporário e servimos o arquivo com suporte a Range (seek).
 */

const ID_RE = /^[A-Za-z0-9_-]{6,20}$/;
// android_vr costuma ser o client com formatos de áudio disponíveis sem PO Token;
// demais ficam como fallback caso o YouTube mude o comportamento.
const CLIENTS = ['android_vr', 'web_music', 'ios', 'web', 'mweb', 'tv', 'android'];
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

// Deduplica downloads concorrentes do mesmo vídeo (audio element + wavesurfer).
const inflight = new Map<string, Promise<string>>();

function contentTypeFor(file: string): string {
  const ext = file.toLowerCase().split('.').pop();
  if (ext === 'webm') return 'audio/webm';
  if (ext === 'opus' || ext === 'ogg') return 'audio/ogg';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'flac') return 'audio/flac';
  return 'audio/mp4'; // m4a/mp4/aac
}

async function findCachedFile(dir: string, videoId: string): Promise<string | null> {
  if (!existsSync(dir)) return null;
  try {
    const files = await readdir(dir);
    // Aceitar apenas o MP3 extraído (ignora .m4a/.part antigos de versões anteriores).
    const hit = files.find((f) => f === `${videoId}.mp3`);
    return hit ? join(dir, hit) : null;
  } catch {
    return null;
  }
}

/** Limpeza best-effort de prévias antigas. */
async function cleanupOld(dir: string): Promise<void> {
  try {
    const files = await readdir(dir);
    const now = Date.now();
    await Promise.all(
      files.map(async (f) => {
        try {
          const s = await stat(join(dir, f));
          if (now - s.mtimeMs > CACHE_MAX_AGE_MS) await unlink(join(dir, f));
        } catch { /* ignore */ }
      })
    );
  } catch { /* ignore */ }
}

async function ensurePreviewFile(videoId: string): Promise<string> {
  const downloads = await getDownloadsPath();
  const cacheDir = join(downloads, '.preview-cache');

  const cached = await findCachedFile(cacheDir, videoId);
  if (cached) return cached;

  const existing = inflight.get(videoId);
  if (existing) return existing;

  const promise = (async () => {
    await mkdir(cacheDir, { recursive: true });
    cleanupOld(cacheDir); // fire-and-forget
    const cookiesFlag = await getCookiesFlag();
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const outTemplate = `${cacheDir.replace(/\\/g, '/')}/${videoId}.%(ext)s`;
    let lastError: unknown;

    for (const client of CLIENTS) {
      try {
        // Extrair para MP3: o m4a adaptativo do YouTube é MP4 fragmentado (DASH),
        // que o WebAudio (waveform) não decodifica. O MP3 toca E gera o wave.
        // Por ser PRÉVIA, priorizamos um stream de áudio menor (abr<=128) e MP3
        // mais leve (qualidade 7): menos bytes para baixar/transcodificar/transmitir,
        // logo o play e a waveform aparecem bem mais rápido.
        const command =
          `yt-dlp -x --audio-format mp3 --audio-quality 7 ` +
          `-f "bestaudio[abr<=128]/bestaudio/best" ` +
          `--extractor-args "youtube:player_client=${client}" ` +
          `--no-playlist --no-part --force-overwrites ` +
          `${cookiesFlag}-o "${outTemplate}" "${watchUrl}"`;
        await execAsync(command, { maxBuffer: 1024 * 1024 * 10, timeout: 120000 });
        const file = await findCachedFile(cacheDir, videoId);
        if (file && statSync(file).size > 0) return file;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError ?? new Error('Não foi possível baixar a prévia');
  })();

  inflight.set(videoId, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(videoId);
  }
}

function streamFile(filePath: string, range: string | null): NextResponse {
  const fileSize = statSync(filePath).size;
  const contentType = contentTypeFor(filePath);

  const buildStream = (start: number, end: number) => {
    const fileStream = createReadStream(filePath, { start, end });
    return new ReadableStream({
      start(controller) {
        let closed = false;
        fileStream.on('data', (chunk) => {
          if (closed) return;
          try {
            controller.enqueue(new Uint8Array(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          } catch { closed = true; }
        });
        fileStream.on('end', () => { if (!closed) { try { controller.close(); } catch {} closed = true; } });
        fileStream.on('error', (e) => { if (!closed) { try { controller.error(e); } catch {} closed = true; } });
      },
      cancel() { if (fileStream.readable) fileStream.destroy(); },
    });
  };

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10) || 0;
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    return new NextResponse(buildStream(start, end), {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Length': chunkSize.toString(),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }

  return new NextResponse(buildStream(0, fileSize - 1), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': fileSize.toString(),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get('videoId') || '';
  if (!ID_RE.test(videoId)) {
    return new NextResponse('videoId inválido', { status: 400 });
  }

  let filePath: string;
  try {
    filePath = await ensurePreviewFile(videoId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao preparar prévia';
    console.error('❌ [preview-stream]:', message.substring(0, 200));
    return new NextResponse('Não foi possível carregar a prévia', { status: 502 });
  }

  try {
    return streamFile(filePath, request.headers.get('range'));
  } catch (error) {
    console.error('❌ [preview-stream] stream:', error);
    return new NextResponse('Erro ao transmitir a prévia', { status: 500 });
  }
}
