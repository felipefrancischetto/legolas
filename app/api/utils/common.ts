import { readFile, writeFile, access, constants, stat, unlink, readdir, rename, copyFile, mkdir } from 'fs/promises';
import { join, isAbsolute, dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Utilitários comuns para as APIs
 */

// ── Cache para getDownloadsPath (evita leitura de disco e logging excessivo) ──
let _cachedDownloadsPath: string | null = null;
let _cachedDownloadsPathTime = 0;
const DOWNLOADS_PATH_CACHE_TTL = 30000; // 30 segundos

/**
 * Tenta resolver um caminho relativo de pasta procurando em locais comuns
 */
async function resolveFolderPath(folderName: string): Promise<string | null> {
  // Se já é absoluto, retornar diretamente
  if (isAbsolute(folderName)) {
    try {
      await access(folderName, constants.F_OK);
      await readdir(folderName);
      return folderName;
    } catch {
      return null;
    }
  }

  // Tentar encontrar a pasta em locais comuns
  const searchPaths = [
    join(process.cwd(), folderName),
    join(process.cwd(), 'downloads', folderName),
    join(process.cwd(), 'public', 'downloads', folderName),
  ];

  // Também tentar em drives comuns do Windows (se estiver no Windows)
  if (process.platform === 'win32') {
    const drives = ['C:', 'D:', 'E:', 'F:'];
    for (const drive of drives) {
      searchPaths.push(join(drive, folderName));
      // Tentar em subpastas comuns
      searchPaths.push(join(drive, 'musicas', folderName));
      
      // Buscar em subpastas de anos dentro de musicas (2020-2026)
      for (let year = 2020; year <= 2026; year++) {
        searchPaths.push(join(drive, 'musicas', String(year), folderName));
      }
      
      // Também tentar buscar recursivamente em musicas se existir
      try {
        const musicasPath = join(drive, 'musicas');
        await access(musicasPath, constants.F_OK);
        // Tentar listar subpastas e buscar a pasta dentro delas
        const subdirs = await readdir(musicasPath);
        for (const subdir of subdirs) {
          const subdirPath = join(musicasPath, subdir);
          try {
            // Verificar se é uma pasta
            const stats = await stat(subdirPath);
            if (stats.isDirectory()) {
              searchPaths.push(join(subdirPath, folderName));
            }
          } catch {
            // Ignorar erros ao verificar subdiretórios
          }
        }
      } catch {
        // Se não conseguir acessar musicas, continuar normalmente
      }
      
      searchPaths.push(join(drive, 'Music', folderName));
      searchPaths.push(join(drive, 'Downloads', folderName));
    }
  }

  // Verificar cada caminho
  for (const searchPath of searchPaths) {
    try {
      await access(searchPath, constants.F_OK);
      // Verificar se é realmente uma pasta (tentando listar)
      await readdir(searchPath);
      return searchPath;
    } catch {
      // Continuar procurando
      continue;
    }
  }

  return null;
}

export async function getDownloadsPath(): Promise<string> {
  // Retornar do cache se ainda for válido (evita leitura de disco e logging repetitivo)
  if (_cachedDownloadsPath && (Date.now() - _cachedDownloadsPathTime) < DOWNLOADS_PATH_CACHE_TTL) {
    return _cachedDownloadsPath;
  }

  try {
    const configPath = join(process.cwd(), 'downloads.config.json');
    const config = await readFile(configPath, 'utf-8');
    const { path } = JSON.parse(config);
    
    // Normalizar apenas barras duplicadas e espaços nas extremidades
    const normalizedPath = path.trim().replace(/[\\/]+/g, process.platform === 'win32' ? '\\' : '/');
    const isAbsolutePath = isAbsolute(normalizedPath);
    
    let finalPath: string;
    
    if (isAbsolutePath) {
      finalPath = normalizedPath;
      
      try {
        await access(finalPath, constants.F_OK);
        await readdir(finalPath);
        _cachedDownloadsPath = finalPath;
        _cachedDownloadsPathTime = Date.now();
        return finalPath;
      } catch (accessError) {
        console.warn(`⚠️ [getDownloadsPath] Caminho não encontrado: ${finalPath} - tentando criar...`);
        
        try {
          await mkdir(finalPath, { recursive: true });
          await access(finalPath, constants.F_OK);
          await readdir(finalPath);
          console.log(`✅ [getDownloadsPath] Caminho criado: ${finalPath}`);
          _cachedDownloadsPath = finalPath;
          _cachedDownloadsPathTime = Date.now();
          return finalPath;
        } catch (mkdirError) {
          console.error(`❌ [getDownloadsPath] Erro ao criar caminho: ${finalPath}`, mkdirError instanceof Error ? mkdirError.message : mkdirError);
          return finalPath;
        }
      }
    } else {
      const resolved = await resolveFolderPath(normalizedPath);
      if (resolved) {
        _cachedDownloadsPath = resolved;
        _cachedDownloadsPathTime = Date.now();
        return resolved;
      }
      
      finalPath = join(process.cwd(), normalizedPath);
      console.warn(`⚠️ [getDownloadsPath] Caminho relativo não resolvido: ${normalizedPath}, fallback: ${finalPath}`);
      
      try {
        await mkdir(finalPath, { recursive: true });
        await access(finalPath, constants.F_OK);
        await readdir(finalPath);
        _cachedDownloadsPath = finalPath;
        _cachedDownloadsPathTime = Date.now();
        return finalPath;
      } catch (mkdirError) {
        console.error(`❌ [getDownloadsPath] Erro ao criar fallback: ${finalPath}`, mkdirError instanceof Error ? mkdirError.message : mkdirError);
        return finalPath;
      }
    }
  } catch (error) {
    const defaultPath = join(process.cwd(), 'downloads');
    console.warn(`⚠️ [getDownloadsPath] Erro ao ler configuração, usando padrão: ${defaultPath}`);
    
    try {
      await mkdir(defaultPath, { recursive: true });
      await access(defaultPath, constants.F_OK);
    } catch (mkdirError) {
      console.error(`❌ [getDownloadsPath] Erro ao criar padrão: ${defaultPath}`, mkdirError instanceof Error ? mkdirError.message : mkdirError);
    }
    
    _cachedDownloadsPath = defaultPath;
    _cachedDownloadsPathTime = Date.now();
    return defaultPath;
  }
}

/**
 * Invalida o cache de getDownloadsPath (chamar quando o caminho for alterado)
 */
export function invalidateDownloadsPathCache(): void {
  _cachedDownloadsPath = null;
  _cachedDownloadsPathTime = 0;
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

/**
 * Move/rename a file from source to destination
 * Handles cross-device moves (EXDEV) by using copy+delete
 */
export async function moveFile(sourcePath: string, destPath: string): Promise<void> {
  try {
    // Tentar rename primeiro (mais rápido para mesmo dispositivo)
    await rename(sourcePath, destPath);
  } catch (error: any) {
    // Se for erro EXDEV (cross-device link), usar copy+delete
    if (error.code === 'EXDEV' || error.code === 'EPERM') {
      console.log(`⚠️ [moveFile] Cross-device move detectado, usando copy+delete: ${sourcePath} -> ${destPath}`);
      try {
        // Garantir que o diretório de destino existe
        const destDir = dirname(destPath);
        try {
          await access(destDir, constants.F_OK);
        } catch {
          // Diretório não existe, criar
          await mkdir(destDir, { recursive: true });
          console.log(`📁 [moveFile] Diretório de destino criado: ${destDir}`);
        }
        
        // Copiar arquivo
        await copyFile(sourcePath, destPath);
        // Deletar arquivo original
        await unlink(sourcePath);
        console.log(`✅ [moveFile] Arquivo movido com sucesso (copy+delete)`);
      } catch (copyError: any) {
        console.error(`❌ [moveFile] Erro ao mover arquivo (copy+delete):`, copyError);
        throw new Error(`Failed to move file: ${copyError.message || String(copyError)}`);
      }
    } else {
      // Outros erros, propagar
      throw error;
    }
  }
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

export function extractArtistTitle(
  title: string,
  artist?: string
): {
  title: string;
  artist: string;
} {
  const genericArtists = ['various artists', 'va', 'v/a', 'various', 'unknown artist', 'various artist'];
  const suspiciousSuffixes = ['music', 'tv', 'records', 'recordings', 'channel', 'official', 'topic'];

  let cleanArtist = artist?.toLowerCase()?.trim() || '';
  let cleanTitle = title.trim();

  const isGenericArtist = genericArtists.some(ga => cleanArtist.includes(ga));
  const isSuspiciousArtist = suspiciousSuffixes.some(suffix => cleanArtist.endsWith(suffix));

  if ((!cleanArtist || isGenericArtist || isSuspiciousArtist) && (cleanTitle.includes('-') || cleanTitle.includes('–'))) {
    const patterns = [
      /(.+?)\s*-\s*(.+)/,
      /(.+?)\s*–\s*(.+)/,
      /(.+?)\s*—\s*(.+)/,
      /(.+?)\s*:\s*(.+)/,
    ];

    for (const pattern of patterns) {
        const match = cleanTitle.match(pattern);
        if (match && match[1] && match[2]) {
            if (match[1].length < 80) { // Evitar falsos positivos
              const newArtist = match[1].trim();
              const newTitle = match[2].trim();
              console.log(`[extractArtistTitle] Artista suspeito. Extraído do título: Artista='${newArtist}', Título='${newTitle}'`);
              return { artist: newArtist, title: newTitle };
            }
        }
    }
  }

  return { artist: artist || '', title: title };
}

/**
 * Verifica se o arquivo de cookies existe e é válido (formato Netscape)
 */
export async function hasValidCookiesFile(): Promise<boolean> {
  try {
    const cookiesPath = join(process.cwd(), 'cookies.txt');
    await access(cookiesPath, constants.F_OK);
    const content = await readFile(cookiesPath, 'utf-8');
    // Verificar se tem conteúdo e parece ser formato Netscape (começa com # ou tem linhas com tabs)
    return content.trim().length > 0 && (content.startsWith('#') || content.includes('\t'));
  } catch {
    return false;
  }
}

/**
 * Retorna a string de cookies para usar no comando yt-dlp, ou string vazia se não houver cookies válidos
 */
export async function getCookiesFlag(): Promise<string> {
  const hasValidCookies = await hasValidCookiesFile();
  return hasValidCookies ? '--cookies "cookies.txt" ' : '';
}

/**
 * Extrai cookies do browser automaticamente e salva em cookies.txt
 * Tenta Chrome, Edge e Firefox nesta ordem
 */
export async function extractCookiesFromBrowser(): Promise<boolean> {
  const cookiesPath = join(process.cwd(), 'cookies.txt');
  const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  
  // Lista de browsers para tentar (em ordem de prioridade)
  const browsers = ['chrome', 'edge', 'firefox', 'brave', 'opera'];
  
  for (const browser of browsers) {
    try {
      console.log(`🍪 Tentando extrair cookies do ${browser}...`);
      
      // Extrair cookies e salvar em arquivo temporário primeiro
      const tempCookiesPath = join(process.cwd(), `cookies_${browser}_temp.txt`);
      
      // Usar yt-dlp para extrair cookies do browser
      // Não vamos falhar se o comando der erro, vamos verificar se o arquivo foi criado
      try {
        // Usar caminho absoluto para garantir que funciona em Linux
        const absoluteTempPath = join(process.cwd(), `cookies_${browser}_temp.txt`);
        await execAsync(
          `yt-dlp --cookies-from-browser ${browser} --cookies "${absoluteTempPath}" --skip-download "${testUrl}"`,
          { 
            maxBuffer: 1024 * 1024 * 10,
            timeout: 30000,
            cwd: process.cwd() // Garantir que estamos no diretório correto
          }
        );
      } catch (execError) {
        // Ignorar erros de execução, vamos verificar se o arquivo foi criado mesmo assim
        const errorMsg = execError instanceof Error ? execError.message : String(execError);
        if (!errorMsg.includes('could not find') && !errorMsg.includes('not found')) {
          console.log(`   ⚠️ Erro ao executar yt-dlp para ${browser}: ${errorMsg.substring(0, 150)}`);
        }
      }
      
      // Verificar se o arquivo foi criado e tem conteúdo
      try {
        await access(tempCookiesPath, constants.F_OK);
        const content = await readFile(tempCookiesPath, 'utf-8');
        
        // Verificar se tem conteúdo válido (formato Netscape)
        if (content.trim().length > 0 && (content.startsWith('#') || content.includes('\t'))) {
          // Copiar para cookies.txt
          await writeFile(cookiesPath, content, 'utf-8');
          console.log(`✅ Cookies extraídos do ${browser} e salvos em cookies.txt!`);
          
          // Limpar arquivo temporário
          try {
            await unlink(tempCookiesPath);
          } catch {}
          
          return true;
        }
      } catch (fileError) {
        // Arquivo não foi criado ou é inválido, continuar para próximo browser
        console.log(`⚠️ Cookies do ${browser} não foram salvos corretamente`);
      }
    } catch (error: any) {
      // Browser não disponível ou erro na extração, tentar próximo
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (!errorMsg.includes('could not find') && !errorMsg.includes('not found')) {
        console.log(`⚠️ Erro ao extrair cookies do ${browser}: ${errorMsg.substring(0, 100)}`);
      }
      continue;
    }
  }
  
  console.log('❌ Não foi possível extrair cookies de nenhum browser');
  return false;
}

/**
 * Garante que temos cookies válidos, extraindo do browser se necessário
 */
export async function ensureValidCookies(): Promise<boolean> {
  // Verificar se já temos cookies válidos
  const hasValid = await hasValidCookiesFile();
  
  if (hasValid) {
    // Verificar idade dos cookies (se muito antigos, atualizar)
    try {
      const cookiesPath = join(process.cwd(), 'cookies.txt');
      const stats = await stat(cookiesPath);
      const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
      
      // Se cookies têm mais de 7 dias, tentar atualizar
      if (ageHours > 168) {
        console.log(`⚠️ Cookies têm ${ageHours.toFixed(1)} horas - tentando atualizar...`);
        return await extractCookiesFromBrowser();
      }
      
      return true;
    } catch {
      return true; // Se não conseguir verificar idade, assumir que está OK
    }
  }
  
  // Não temos cookies válidos, tentar extrair do browser
  console.log('🍪 Cookies não encontrados ou inválidos - extraindo do browser...');
  return await extractCookiesFromBrowser();
} 