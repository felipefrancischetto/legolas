import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { invalidateDownloadsPathCache } from '../utils/common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { path } = await request.json();
    
    if (!path) {
      return NextResponse.json(
        { error: 'Caminho é obrigatório' },
        { status: 400 }
      );
    }

    // Salvar o caminho EXATAMENTE como foi fornecido pelo usuário
    const configPath = join(process.cwd(), 'downloads.config.json');
    await writeFile(configPath, JSON.stringify({ path }, null, 2), 'utf-8');

    // Invalidar cache para que próximas chamadas leiam o novo valor
    invalidateDownloadsPathCache();

    console.log(`✅ [set-downloads-path] Caminho salvo: ${path}`);

    return NextResponse.json({
      status: 'success',
      message: 'Caminho de downloads atualizado com sucesso',
      path
    });

  } catch (error) {
    console.error('Erro ao atualizar caminho de downloads:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao atualizar caminho de downloads' },
      { status: 500 }
    );
  }
} 