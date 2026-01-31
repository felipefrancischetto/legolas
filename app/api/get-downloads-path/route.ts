import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join, isAbsolute } from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const configPath = join(process.cwd(), 'downloads.config.json');
    
    try {
      const config = await readFile(configPath, 'utf-8');
      const { path } = JSON.parse(config);
      
      // Normalizar o caminho removendo espaços e barras duplicadas
      const normalizedPath = path.trim().replace(/[\\/]+/g, process.platform === 'win32' ? '\\' : '/');
      
      // Verificar se o caminho é absoluto usando a função do Node.js (mais confiável)
      const isAbsolutePath = isAbsolute(normalizedPath);
      
      // NUNCA fazer join de um caminho absoluto com process.cwd()
      const fullPath = isAbsolutePath ? normalizedPath : join(process.cwd(), normalizedPath);
      
      // Para exibição, mostrar apenas o nome da pasta se for caminho absoluto
      const displayPath = isAbsolutePath 
        ? normalizedPath.split(/[\\/]/).pop() || normalizedPath 
        : normalizedPath;
      
      return NextResponse.json({
        path: normalizedPath, // Caminho completo ou relativo (normalizado)
        fullPath: fullPath, // Caminho completo absoluto
        displayPath: displayPath // Para exibição (nome da pasta)
      });
    } catch (error) {
      // Se não houver configuração, retornar padrão
      const defaultPath = 'downloads';
      const defaultFullPath = join(process.cwd(), defaultPath);
      
      return NextResponse.json({
        path: defaultPath,
        fullPath: defaultFullPath,
        displayPath: defaultPath
      });
    }
  } catch (error) {
    console.error('Erro ao obter caminho de downloads:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao obter caminho de downloads' },
      { status: 500 }
    );
  }
}
