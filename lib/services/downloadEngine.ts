import { exec } from 'child_process';
import { promisify } from 'util';
import { stat, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';
import { sendProgressEvent } from '../utils/progressEventService';
import { ensureValidCookies } from '@/app/api/utils/common';
import { getYtDlpBin } from '../utils/ytDlpBin';

const execAsync = promisify(exec);

/**
 * Motor de download unificado. Fonte única da lógica de yt-dlp compartilhada entre o
 * download de playlist e o de faixa única: montagem de estratégias, escolha adaptativa
 * (cliente campeão), execução, download acelerado, detecção de bloqueio, renovação de
 * cookies, retomada (skip-if-exists), cancelamento (AbortSignal) e verificação do artefato
 * (anti-thumbnail).
 */

// 'default' = sem forçar player_client (deixa o yt-dlp escolher a estratégia multi-cliente
// que funciona). Os clientes forçados (android/ios/web/tv) servem só de fallback — em 2025/2026
// o YouTube quebrou a maioria deles (PO token/SABR/"só imagens"), então o default vem primeiro.
export type YtClient = 'default' | 'tv' | 'ios' | 'android' | 'web';

export type DownloadFailureReason =
  | 'blocked'
  | 'download-failed'
  | 'file-not-found'
  | 'thumbnail-only'
  | 'aborted';

export interface DownloadSource {
  url: string;
  videoId?: string;
  kind?: 'youtube' | 'youtube-music' | 'soundcloud' | 'beatport';
}

export interface DownloadOptions {
  format: string;
  quality?: string;
  /** Pasta de saída. */
  outputDir: string;
  /**
   * Nome base do arquivo SEM extensão (ex.: "Title [id]"), OU um template yt-dlp se
   * `useTemplate` for true (ex.: "%(title)s"). O motor monta `-o "<dir>/<base>.%(ext)s"`.
   */
  outputBasename: string;
  /** Se true, outputBasename é tratado como template yt-dlp (ex.: %(title)s). */
  useTemplate?: boolean;
  cookiesFlag?: string;
  downloadId?: string;
  signal?: AbortSignal;
  /** Concorrência de faixas em andamento — usada para escalar os fragmentos por arquivo. */
  trackConcurrency?: number;
  /** Pular se já existir um arquivo de áudio válido (retomada). */
  allowResume?: boolean;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  strategyUsed?: string;
  error?: string;
  reason?: DownloadFailureReason;
  hadYouTubeIssues?: boolean;
  /** true quando a retomada encontrou um arquivo válido e pulou o download. */
  skipped?: boolean;
}

// Tamanho mínimo plausível para áudio real. Abaixo disso provavelmente veio só a
// thumbnail (.jpg) ou um arquivo truncado — conta como falha, não sucesso.
export const MIN_AUDIO_BYTES = 50 * 1024; // 50KB

// ===== Estado de processo (compartilhado entre playlist e faixa única) =====
let championClient: YtClient | null = null;
let cookieRenewalPromise: Promise<boolean> | null = null;
let cookieRenewalDone = false;
let aria2cAvailable: boolean | null = null; // null = ainda não detectado

/** Reseta a coordenação de renovação de cookies para uma nova execução. */
export function resetEngineSession(): void {
  cookieRenewalPromise = null;
  cookieRenewalDone = false;
}

/** Detecção centralizada de bloqueio/anti-bot do YouTube. */
export function isBlockingError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('sign in to confirm') ||
    m.includes('not a bot') ||
    m.includes('bot') ||
    m.includes('blocked') ||
    m.includes('403') ||
    m.includes('forbidden') ||
    m.includes('po token')
  );
}

function isAbortError(error: unknown): boolean {
  const e = error as { name?: string; code?: string } | undefined;
  return e?.name === 'AbortError' || e?.code === 'ABORT_ERR';
}

/** Detecta aria2c uma única vez (cacheado). Degrada com elegância se ausente. */
async function detectAria2c(): Promise<boolean> {
  if (aria2cAvailable !== null) return aria2cAvailable;
  try {
    await execAsync('aria2c --version', { timeout: 5000 });
    aria2cAvailable = true;
    logger.info('⚡ [Engine] aria2c detectado — download acelerado disponível.');
  } catch {
    aria2cAvailable = false;
    logger.info('ℹ️ [Engine] aria2c não encontrado — usando --concurrent-fragments do yt-dlp.');
  }
  return aria2cAvailable;
}

/**
 * Número de fragmentos por arquivo, balanceado pela concorrência de faixas: quanto mais
 * faixas em paralelo, menos fragmentos por arquivo (para não multiplicar conexões).
 */
function fragmentsFor(trackConcurrency: number): number {
  const c = Math.max(1, trackConcurrency || 1);
  return Math.max(1, Math.min(5, Math.ceil(8 / c)));
}

async function renewCookiesOnce(downloadId?: string): Promise<boolean> {
  if (cookieRenewalDone) return await (cookieRenewalPromise ?? Promise.resolve(false));
  if (cookieRenewalPromise) return await cookieRenewalPromise;

  cookieRenewalPromise = (async () => {
    logger.warn('🍪 [Engine] Bloqueio detectado — tentando renovar cookies...');
    if (downloadId) {
      sendProgressEvent(downloadId, {
        type: 'info',
        step: 'Renovando cookies do YouTube...',
        substep: 'Bloqueio detectado, tentando recuperar acesso',
      });
    }
    let ok = false;
    try {
      ok = await ensureValidCookies();
    } catch (e) {
      logger.error(`❌ [Engine] Falha ao renovar cookies: ${e instanceof Error ? e.message : 'erro'}`);
    }
    cookieRenewalDone = true;
    if (ok) {
      logger.info('✅ [Engine] Cookies renovados — re-tentando.');
    } else if (downloadId) {
      sendProgressEvent(downloadId, {
        type: 'warning',
        step: 'YouTube está bloqueando os downloads',
        detail: 'Não foi possível renovar cookies automaticamente. Faça login no YouTube no seu navegador (Chrome) e tente novamente, ou gere cookies.txt manualmente.',
      });
    }
    return ok;
  })();

  return await cookieRenewalPromise;
}

function orderClients(): YtClient[] {
  const base: YtClient[] = ['default', 'tv', 'ios', 'android', 'web'];
  if (!championClient) return base;
  return [championClient, ...base.filter(c => c !== championClient)];
}

/** Argumento --extractor-args para um cliente; vazio para 'default' (sem forçar). */
function clientExtractorArg(client: YtClient): string {
  return client === 'default' ? '' : `--extractor-args "youtube:player_client=${client}" `;
}

/**
 * Localiza o arquivo de áudio realmente gravado. Procura pelo nome esperado e, se não
 * achar, varre arquivos recentes do formato correto por ID/nome. Retorna null se nenhum
 * arquivo de áudio plausível for encontrado (ex.: só veio .jpg).
 */
export async function locateDownloadedFile(
  outputDir: string,
  baseHint: string,
  videoId: string | undefined,
  format: string
): Promise<string | null> {
  const expected = `${outputDir}/${baseHint}.${format}`;
  if (existsSync(expected)) return expected;

  try {
    const files = await readdir(outputDir);
    const now = Date.now();
    const searchBase = baseHint.toLowerCase().substring(0, Math.min(20, baseHint.length));
    // Sem nenhuma pista (sem nome e sem ID): aceitar o arquivo mais recente do formato.
    const matchAnyRecent = !searchBase && !videoId;
    const candidates: { filePath: string; mtime: number; hasId: boolean }[] = [];

    for (const file of files) {
      if (file.split('.').pop()?.toLowerCase() !== format) continue;
      const filePath = join(outputDir, file);
      try {
        const st = await stat(filePath);
        if (now - st.mtimeMs > 120000) continue;
        const base = file.replace(/\.[^/.]+$/, '').toLowerCase();
        const hasId = !!videoId && base.includes(String(videoId).toLowerCase());
        const hasName = !!searchBase && base.includes(searchBase);
        if (hasId || hasName || matchAnyRecent) candidates.push({ filePath, mtime: st.mtimeMs, hasId });
      } catch {}
    }

    candidates.sort((a, b) => {
      if (a.hasId !== b.hasId) return a.hasId ? -1 : 1;
      return b.mtime - a.mtime;
    });
    return candidates[0]?.filePath ?? null;
  } catch {
    return null;
  }
}

/** Verifica que o caminho aponta para um áudio real (anti-thumbnail). */
async function verifyAudioArtifact(filePath: string): Promise<{ ok: boolean; reason?: DownloadFailureReason }> {
  try {
    const st = await stat(filePath);
    if (st.size < MIN_AUDIO_BYTES) return { ok: false, reason: 'thumbnail-only' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'file-not-found' };
  }
}

/**
 * Baixa UMA faixa (download + verificação, sem enriquecimento de metadados).
 * Nunca lança: retorna sempre um DownloadResult estruturado.
 */
export async function downloadTrack(source: DownloadSource, options: DownloadOptions): Promise<DownloadResult> {
  const {
    format,
    quality = '10',
    outputDir,
    outputBasename,
    useTemplate = false,
    cookiesFlag = '',
    downloadId,
    signal,
    trackConcurrency = 1,
    allowResume = false,
  } = options;

  // Retomada: se já existe arquivo de áudio válido, pular o download.
  if (allowResume && !useTemplate) {
    const existing = await locateDownloadedFile(outputDir, outputBasename, source.videoId, format);
    if (existing) {
      const v = await verifyAudioArtifact(existing);
      if (v.ok) {
        logger.info(`   ⏭️ [Engine] Retomada: "${outputBasename}" já existe — pulando download.`);
        return { success: true, filePath: existing, skipped: true, strategyUsed: 'resume' };
      }
    }
  }

  if (signal?.aborted) return { success: false, reason: 'aborted', error: 'Cancelado' };

  const outputPath = `${outputDir.replace(/\\/g, '/')}/${outputBasename}.%(ext)s`;
  const escapedOutputPath = outputPath.replace(/"/g, '\\"');

  const useAria2c = await detectAria2c();
  const ytDlpBin = await getYtDlpBin();
  const fragments = fragmentsFor(trackConcurrency);
  const accelFlag = useAria2c
    ? `--downloader aria2c --downloader-args "aria2c:-x${fragments} -s${fragments} -k1M" `
    : `--concurrent-fragments ${fragments} `;

  const buildCommand = (client: YtClient, flag: string) =>
    `${ytDlpBin} -x --audio-format ${format} --audio-quality ${quality} ` +
    `${flag}` +
    `${accelFlag}` +
    `--embed-thumbnail --convert-thumbnails jpg ` +
    `--add-metadata ` +
    `${clientExtractorArg(client)}` +
    `--sleep-interval 1 --max-sleep-interval 2 ` +
    `--no-playlist ` +
    `-o "${escapedOutputPath}" ` +
    `--no-part --force-overwrites "${source.url}"`;

  // Localiza+valida o artefato de áudio realmente gravado (independe do código de saída).
  const findValidArtifact = async (): Promise<string | null> => {
    const fp = useTemplate
      ? await locateDownloadedFile(outputDir, '', undefined, format)
      : await locateDownloadedFile(outputDir, outputBasename, source.videoId, format);
    if (!fp) return null;
    const v = await verifyAudioArtifact(fp);
    return v.ok ? fp : null;
  };

  // Uma passada pelas estratégias (campeã primeiro). Memoriza a campeã em sucesso.
  const attempt = async (flag: string): Promise<{ success: boolean; strategyUsed?: string; hadYouTubeIssues: boolean; lastError: string; aborted: boolean }> => {
    const clients = orderClients();
    let hadYouTubeIssues = false;
    let lastError = '';

    for (let s = 0; s < clients.length; s++) {
      const client = clients[s];
      if (signal?.aborted) return { success: false, hadYouTubeIssues, lastError, aborted: true };
      try {
        if (s > 0) await new Promise(r => setTimeout(r, 500));
        logger.info(`   🔄 [Engine] ${client}${championClient === client ? ' (campeã)' : ''} | frags=${fragments}${useAria2c ? ' aria2c' : ''}...`);
        const { stderr } = await execAsync(buildCommand(client, flag), {
          maxBuffer: 1024 * 1024 * 20,
          timeout: 120000,
          signal,
        });
        if (stderr) logger.info(`   📋 [Engine] yt-dlp stderr: ${stderr.substring(0, 300)}`);
        championClient = client;
        return { success: true, strategyUsed: client, hadYouTubeIssues, lastError, aborted: false };
      } catch (error) {
        if (isAbortError(error)) return { success: false, hadYouTubeIssues, lastError, aborted: true };
        lastError = error instanceof Error ? error.message : String(error);
        logger.warn(`   ⚠️ [Engine] ${client} falhou: ${lastError.substring(0, 160)}`);
        if (isBlockingError(lastError)) hadYouTubeIssues = true;
        // Resiliência: o yt-dlp pode sair com erro só no pós-processamento (ex.: embed de
        // thumbnail/metadata) mesmo tendo gravado um áudio válido. Se o artefato existe,
        // tratamos como sucesso em vez de descartar o download por um detalhe cosmético.
        await new Promise(r => setTimeout(r, 300));
        const recovered = await findValidArtifact();
        if (recovered) {
          logger.info(`   ♻️ [Engine] ${client}: erro no pós-processamento, mas áudio válido encontrado — aproveitando.`);
          championClient = client;
          return { success: true, strategyUsed: client, hadYouTubeIssues, lastError, aborted: false };
        }
      }
    }
    return { success: false, hadYouTubeIssues, lastError, aborted: false };
  };

  let res = await attempt(cookiesFlag);

  if (res.aborted) return { success: false, reason: 'aborted', error: 'Cancelado' };

  // Resiliência: bloqueado → renovar cookies (uma vez, coordenado) e re-tentar.
  if (!res.success && res.hadYouTubeIssues) {
    const renewed = await renewCookiesOnce(downloadId);
    if (renewed && !signal?.aborted) {
      res = await attempt('--cookies "cookies.txt" ');
      if (res.aborted) return { success: false, reason: 'aborted', error: 'Cancelado' };
    }
  }

  if (!res.success) {
    return {
      success: false,
      reason: res.hadYouTubeIssues ? 'blocked' : 'download-failed',
      hadYouTubeIssues: res.hadYouTubeIssues,
      error: res.lastError.substring(0, 200),
    };
  }

  // Aguardar gravação no disco e localizar/validar o artefato.
  // Com template (ex.: %(title)s) o nome final é desconhecido E não contém o videoId,
  // então localizamos pelo arquivo mais recente do formato (sem pista de nome/ID).
  // Sem template, o nome contém "[<id>]" → localizamos por ID/nome.
  await new Promise(r => setTimeout(r, 500));
  const filePath = await findValidArtifact();

  if (!filePath) {
    return { success: false, reason: 'file-not-found', hadYouTubeIssues: res.hadYouTubeIssues, error: 'Arquivo de áudio não encontrado (possível thumbnail-only)' };
  }

  return { success: true, filePath, strategyUsed: res.strategyUsed, hadYouTubeIssues: res.hadYouTubeIssues };
}
