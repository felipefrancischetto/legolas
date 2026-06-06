import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger';

const execAsync = promisify(exec);

/**
 * Resolução central do binário do yt-dlp.
 *
 * Motivação: o YouTube quebra versões antigas do yt-dlp (extração de assinatura/PO token),
 * fazendo o download retornar "só thumbnail". A máquina pode ter várias instalações
 * (ex.: um yt-dlp.exe antigo no PATH e um `python -m yt_dlp` atualizado via pip). Aqui
 * escolhemos automaticamente a invocação com a VERSÃO MAIS NOVA, evitando depender de
 * privilégios de administrador para atualizar o binário do PATH.
 *
 * Retorna um PREFIXO de comando (ex.: "yt-dlp" ou "py -m yt_dlp") pronto para concatenar.
 */

// Candidatos em ordem de preferência quando empatam em versão (não há atualização).
const CANDIDATES: string[] = [
  process.env.YTDLP_BIN || '',
  'yt-dlp',
  'py -m yt_dlp',
  'python -m yt_dlp',
  'python3 -m yt_dlp',
].filter(Boolean);

let resolved: string | null = null;
let resolving: Promise<string> | null = null;
let globalFlagsResolved: string | null = null;
let globalFlagsResolving: Promise<string> | null = null;

/** Converte "2026.03.17" → [2026, 3, 17] para comparação numérica. Ignora sufixos. */
function parseVersion(out: string): number[] {
  const m = out.trim().match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isNewer(a: number[], b: number[]): boolean {
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

/**
 * Resolve (uma única vez, cacheado) a melhor invocação do yt-dlp disponível.
 * Degrada com elegância para "yt-dlp" se nenhuma checagem de versão funcionar.
 */
export async function getYtDlpBin(): Promise<string> {
  if (resolved) return resolved;
  if (resolving) return resolving;

  resolving = (async () => {
    let best: { bin: string; version: number[] } | null = null;

    for (const bin of CANDIDATES) {
      try {
        const { stdout } = await execAsync(`${bin} --version`, { timeout: 8000 });
        const version = parseVersion(stdout);
        if (version[0] === 0) continue; // não parseou → ignora
        if (!best || isNewer(version, best.version)) {
          best = { bin, version };
        }
      } catch {
        // candidato ausente/quebrado → próximo
      }
    }

    resolved = best?.bin ?? 'yt-dlp';
    const v = best ? best.version.join('.') : 'desconhecida';
    logger.info(`🛠️ [yt-dlp] Binário selecionado: "${resolved}" (versão ${v}).`);
    return resolved;
  })();

  return resolving;
}

/**
 * Flags globais recomendadas para todas as invocações do yt-dlp.
 * A partir de 2026 o YouTube exige runtime JS para resolver assinaturas; Node já
 * está instalado na maioria dos ambientes de dev, então usamos `--js-runtimes node`.
 */
export async function getYtDlpGlobalFlags(): Promise<string> {
  if (globalFlagsResolved !== null) return globalFlagsResolved;
  if (globalFlagsResolving) return globalFlagsResolving;

  globalFlagsResolving = (async () => {
    try {
      await execAsync('node --version', { timeout: 5000 });
      globalFlagsResolved = '--js-runtimes node --remote-components ejs:github ';
      logger.info('🛠️ [yt-dlp] Runtime JS: node + ejs:github (habilitado).');
    } catch {
      globalFlagsResolved = '';
      logger.warn('⚠️ [yt-dlp] Node não encontrado — downloads podem falhar sem runtime JS.');
    }
    return globalFlagsResolved;
  })();

  return globalFlagsResolving;
}

/** Prefixo completo: binário + flags globais (ex.: "py -m yt_dlp --js-runtimes node "). */
export async function getYtDlpPrefix(): Promise<string> {
  const [bin, flags] = await Promise.all([getYtDlpBin(), getYtDlpGlobalFlags()]);
  return `${bin} ${flags}`;
}

/** Reseta o cache (ex.: após instalar/atualizar o yt-dlp em runtime). */
export function resetYtDlpBinCache(): void {
  resolved = null;
  resolving = null;
  globalFlagsResolved = null;
  globalFlagsResolving = null;
}
