import { exec } from 'child_process';
import { promisify } from 'util';
import {
  buildYtDlpDownloadInput,
  extractYouTubeVideoId,
  resolveYtDlpTarget,
  youtubeWatchUrl,
  type YtDlpTarget,
} from '@/lib/utils/youtubeUrl';
import { getCookiesFlag } from './common';
import { getYtDlpBin } from '@/lib/utils/ytDlpBin';

const execAsync = promisify(exec);

export {
  buildYtDlpDownloadInput,
  extractYouTubeVideoId,
  resolveYtDlpTarget,
  youtubeWatchUrl,
  type YtDlpTarget,
};

function shellQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function buildDumpJsonCommands(bin: string, target: YtDlpTarget, cookiesFlag: string): string[] {
  if (target.type === 'url') {
    const url = shellQuote(target.url);
    // Default (sem forçar player_client) primeiro: é a estratégia que funciona com o
    // YouTube atual; os clientes forçados ficam só como fallback.
    return [
      `${bin} --dump-json ${cookiesFlag}${url}`,
      `${bin} --dump-json ${cookiesFlag}--extractor-args "youtube:player_client=tv" ${url}`,
      `${bin} --dump-json ${cookiesFlag}--extractor-args "youtube:player_client=ios" ${url}`,
      `${bin} --dump-json ${cookiesFlag}--extractor-args "youtube:player_client=android" ${url}`,
    ];
  }

  const query = shellQuote(target.query);
  return [
    `${bin} --dump-json ${cookiesFlag}--default-search ${shellQuote(`ytsearch1:${target.query}`)} --no-playlist`,
    `${bin} --dump-json ${cookiesFlag}--default-search ${shellQuote(`ytsearch1:${target.query}`)} --no-playlist --extractor-args "youtube:player_client=ios"`,
    `${bin} --dump-json ${cookiesFlag}--default-search ${shellQuote(`ytsearch1:${target.query}`)} --no-playlist --extractor-args "youtube:player_client=android"`,
    `${bin} --dump-json ${cookiesFlag}--default-search "ytsearch" ${query}`,
  ];
}

export function getYtDlpUserFacingError(error: unknown, fallback = 'Erro ao acessar o YouTube'): string {
  if (!(error instanceof Error)) return fallback;

  const execErr = error as Error & { stderr?: string; stdout?: string };
  const blob = `${error.message}\n${execErr.stderr ?? ''}\n${execErr.stdout ?? ''}`.toLowerCase();

  if (blob.includes('sign in to confirm') || blob.includes("you're not a bot")) {
    return (
      'O YouTube bloqueou a requisição (detecção de bot). ' +
      'Atualize o yt-dlp, exporte cookies do navegador para cookies.txt na raiz do projeto, ou tente novamente em alguns minutos.'
    );
  }
  if (blob.includes('video unavailable') || blob.includes('nenhum resultado')) {
    return 'Vídeo indisponível ou não encontrado.';
  }
  if (blob.includes('does not look like a netscape format')) {
    return 'Arquivo cookies.txt inválido. Remova ou regenere o arquivo.';
  }

  return fallback;
}

export async function runYtDlpDumpJson(
  input: string,
  options: { timeoutMs?: number; cookiesFlag?: string } = {}
): Promise<Record<string, unknown>> {
  const target = resolveYtDlpTarget(input);
  const cookiesFlag = options.cookiesFlag ?? (await getCookiesFlag());
  const bin = await getYtDlpBin();
  const commands = buildDumpJsonCommands(bin, target, cookiesFlag);
  const timeout = options.timeoutMs ?? 20000;
  let lastError: unknown;

  for (const command of commands) {
    try {
      const { stdout } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 10,
        timeout,
      });

      const lines = stdout.trim().split('\n').filter((line) => line.trim());
      if (lines.length === 0) continue;

      return JSON.parse(lines[0]) as Record<string, unknown>;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('yt-dlp não retornou resultados');
}
