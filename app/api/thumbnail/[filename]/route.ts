import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, access } from 'fs/promises';
import { constants } from 'fs';

const execAsync = promisify(exec);
const downloadsFolder = join(process.cwd(), 'downloads');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: { filename: string } }
) {
  try {
    // Aguardar os parâmetros da rota
    const params = await context.params;
    const filename = params.filename;
    
    if (!filename) {
      return new NextResponse('Nome do arquivo é obrigatório', { status: 400 });
    }

    const decodedFilename = decodeURIComponent(filename);
    const filePath = join(downloadsFolder, decodedFilename);

    if (!await fileExists(filePath)) {
      return new NextResponse('Arquivo não encontrado', { status: 404 });
    }

    // Criar nome único para arquivo temporário
    const tempImagePath = join(downloadsFolder, `thumb_${Date.now()}.jpg`);

    try {
      // Extrair a thumbnail para um arquivo temporário
      await execAsync(
        `ffmpeg -y -i "${filePath}" -vf "select=eq(n\\,0)" -vframes 1 "${tempImagePath}"`,
        { maxBuffer: 1024 * 1024 * 10 }
      );

      // Ler o arquivo de imagem
      const imageBuffer = await readFile(tempImagePath);

      // Limpar o arquivo temporário
      await execAsync(`del "${tempImagePath}"`).catch(() => {});

      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000'
        }
      });
    } catch (error) {
      // Limpar arquivo temporário em caso de erro
      await execAsync(`del "${tempImagePath}"`).catch(() => {});
      throw error;
    }

  } catch (error) {
    console.error('Erro ao extrair thumbnail:', error);
    return new NextResponse('Erro ao extrair thumbnail', { status: 500 });
  }
} 