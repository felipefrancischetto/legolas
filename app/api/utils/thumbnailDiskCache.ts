import { createHash } from 'crypto';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { join } from 'path';

function cacheFileName(cacheKey: string): string {
  return createHash('sha256').update(cacheKey).digest('hex') + '.jpg';
}

export function getThumbnailDiskCachePath(
  downloadsFolder: string,
  cacheKey: string
): string {
  return join(downloadsFolder, '.legolas-cache', 'thumbnails', cacheFileName(cacheKey));
}

export async function ensureThumbnailCacheDir(downloadsFolder: string): Promise<string> {
  const dir = join(downloadsFolder, '.legolas-cache', 'thumbnails');
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function readThumbnailFromDisk(
  downloadsFolder: string,
  cacheKey: string,
  sourceFilePath: string
): Promise<Buffer | null> {
  const cachePath = getThumbnailDiskCachePath(downloadsFolder, cacheKey);
  try {
    const [cacheStat, fileStat] = await Promise.all([
      stat(cachePath),
      stat(sourceFilePath),
    ]);
    if (cacheStat.mtimeMs >= fileStat.mtimeMs) {
      return await readFile(cachePath);
    }
  } catch {
    // cache miss
  }
  return null;
}

export async function writeThumbnailToDisk(
  downloadsFolder: string,
  cacheKey: string,
  buffer: Buffer
): Promise<void> {
  await ensureThumbnailCacheDir(downloadsFolder);
  const cachePath = getThumbnailDiskCachePath(downloadsFolder, cacheKey);
  await writeFile(cachePath, buffer);
}
