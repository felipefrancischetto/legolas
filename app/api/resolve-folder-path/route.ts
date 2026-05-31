import { NextRequest, NextResponse } from 'next/server';
import { readdir, access, constants } from 'fs/promises';
import { join, isAbsolute } from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * O picker do navegador só devolve o nome da pasta (ex.: ABRIL), não o caminho completo.
 * Vários .../musicas/2025/ABRIL e .../musicas/2026/ABRIL podem existir; escolhemos o de ano mais recente.
 */
function pickPreferredFolderPath(candidates: string[], folderName: string): string {
  if (candidates.length <= 1) {
    return candidates[0];
  }
  const escaped = folderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const musicasYearPattern = new RegExp(
    `[\\\\/]musicas[\\\\/](\\d{4})[\\\\/]${escaped}$`,
    'i'
  );
  const musicasMatches = candidates.filter((p) => musicasYearPattern.test(p));
  if (musicasMatches.length > 0) {
    return musicasMatches.sort((a, b) => {
      const ya = parseInt(a.match(musicasYearPattern)![1], 10);
      const yb = parseInt(b.match(musicasYearPattern)![1], 10);
      return yb - ya;
    })[0];
  }
  return candidates[0];
}

async function collectExistingFolderPaths(searchPaths: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const searchPath of searchPaths) {
    try {
      await access(searchPath, constants.F_OK);
      await readdir(searchPath);
      found.push(searchPath);
    } catch {
      continue;
    }
  }
  return found;
}

export async function POST(request: NextRequest) {
  try {
    const { folderName } = await request.json();
    
    if (!folderName) {
      return NextResponse.json(
        { error: 'Nome da pasta é obrigatório' },
        { status: 400 }
      );
    }

    // Se o folderName já é um caminho absoluto, verificar se existe
    if (isAbsolute(folderName)) {
      try {
        await access(folderName, constants.F_OK);
        return NextResponse.json({
          fullPath: folderName,
          exists: true
        });
      } catch {
        return NextResponse.json({
          fullPath: folderName,
          exists: false
        });
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
        
        // Anos do mais recente ao mais antigo (evita escolher 2025 quando 2026 também existe)
        for (let year = 2026; year >= 2020; year--) {
          searchPaths.push(join(drive, 'musicas', String(year), folderName));
        }
        
        // Também tentar buscar recursivamente em musicas se existir
        try {
          const musicasPath = join(drive, 'musicas');
          await access(musicasPath, constants.F_OK);
          // Tentar listar subpastas e buscar a pasta dentro delas
          const subdirs = await readdir(musicasPath);
          const sortedSubdirs = [...subdirs].sort((a, b) => {
            const na = /^\d{4}$/.test(a) ? parseInt(a, 10) : -1;
            const nb = /^\d{4}$/.test(b) ? parseInt(b, 10) : -1;
            if (na >= 0 && nb >= 0) return nb - na;
            if (na >= 0) return -1;
            if (nb >= 0) return 1;
            return a.localeCompare(b);
          });
          for (const subdir of sortedSubdirs) {
            const subdirPath = join(musicasPath, subdir);
            try {
              // Verificar se é uma pasta
              const stats = await import('fs/promises').then(m => m.stat(subdirPath));
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

    const existing = await collectExistingFolderPaths(searchPaths);
    if (existing.length > 0) {
      const fullPath = pickPreferredFolderPath(existing, folderName);
      return NextResponse.json({
        fullPath,
        exists: true,
      });
    }

    // Se não encontrou, retornar o caminho relativo ao projeto
    return NextResponse.json({
      fullPath: join(process.cwd(), folderName),
      exists: false
    });

  } catch (error) {
    console.error('Erro ao resolver caminho da pasta:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao resolver caminho da pasta' },
      { status: 500 }
    );
  }
}
