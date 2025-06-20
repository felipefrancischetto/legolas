import { readFile } from 'fs/promises';
import { join } from 'path';
import { access, constants } from 'fs/promises';

/**
 * Utilitários comuns para as APIs
 */

export async function getDownloadsPath(): Promise<string> {
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

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

export function formatDurationShort(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function sanitizeYear(year: string | number): string {
  if (typeof year === 'string' && year.length > 4) {
    const match = year.match(/\d{4}/);
    return match ? match[0] : '';
  }
  return String(year);
}

export function generateDownloadId(): string {
  return `dl_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /(?:soundcloud\.com\/[^\/]+\/[^\/]+)/,
    /(?:1001tracklists\.com\/tracklist\/[^\/]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1] || url;
  }
  
  return null;
} 