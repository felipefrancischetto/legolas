import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { readFile } from 'fs/promises';

export const runtime = 'nodejs';

async function getDownloadsPath() {
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

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
): Promise<NextResponse> {
  try {
    const filename = params.filename;
    if (!filename) {
      return new NextResponse('Nome do arquivo é obrigatório', { status: 400 });
    }

    const downloadsPath = await getDownloadsPath();
    const filePath = join(downloadsPath, decodeURIComponent(filename));
    
    try {
      console.log('Tentando ler arquivo:', filePath);
      const fileBuffer = await readFile(filePath);
      console.log('Arquivo lido com sucesso, tamanho:', fileBuffer.length);
      
      // Determinar o tipo de conteúdo com base na extensão do arquivo
      const fileExt = filename.toLowerCase().split('.').pop();
      const contentType = fileExt === 'flac' ? 'audio/flac' : 'audio/mpeg';
      
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': fileBuffer.length.toString(),
        },
      });
    } catch (error) {
      console.error('Erro ao ler arquivo:', error);
      return new NextResponse('Arquivo não encontrado', { status: 404 });
    }
  } catch (error) {
    console.error('Erro no endpoint de downloads:', error);
    return new NextResponse('Erro interno do servidor', { status: 500 });
  }
} 