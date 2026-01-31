import { NextRequest, NextResponse } from 'next/server';
import { readdir, access, constants } from 'fs/promises';
import { join, isAbsolute } from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    // Verificar cada caminho
    for (const searchPath of searchPaths) {
      try {
        await access(searchPath, constants.F_OK);
        // Verificar se é realmente uma pasta (tentando listar)
        await readdir(searchPath);
        return NextResponse.json({
          fullPath: searchPath,
          exists: true
        });
      } catch {
        // Continuar procurando
        continue;
      }
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
