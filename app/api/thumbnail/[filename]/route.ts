import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, access, unlink } from 'fs/promises';
import { constants } from 'fs';

const execAsync = promisify(exec);

// Função para obter o caminho correto da pasta de downloads
async function getDownloadsPath() {
  try {
    const configPath = join(process.cwd(), 'downloads.config.json');
    const config = await readFile(configPath, 'utf-8');
    const { path } = JSON.parse(config);
    const fullPath = join(process.cwd(), path);
    console.log('Downloads path:', fullPath);
    return fullPath;
  } catch (error) {
    console.error('Erro ao ler configuração:', error);
    // Se não houver configuração, use o caminho padrão
    const defaultPath = join(process.cwd(), 'downloads');
    console.log('Usando caminho padrão:', defaultPath);
    return defaultPath;
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    console.error('Arquivo não encontrado:', path, error);
    return false;
  }
}

type RouteContext = {
  params: {
    filename: string;
  };
};

export async function GET(
  _: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  let tempImagePath = '';
  try {
    const filename = context?.params?.filename;
    if (!filename) {
      return new NextResponse('Nome do arquivo é obrigatório', { status: 400 });
    }
    const decodedFilename = decodeURIComponent(filename);
    console.log('Arquivo solicitado:', decodedFilename);
    
    // Usar o caminho correto da pasta de downloads
    const downloadsFolder = await getDownloadsPath();
    const filePath = join(downloadsFolder, decodedFilename);
    console.log('Caminho completo do arquivo:', filePath);

    if (!await fileExists(filePath)) {
      console.error('Arquivo não encontrado:', filePath);
      return new NextResponse('Arquivo não encontrado', { status: 404 });
    }

    // Criar nome único para arquivo temporário
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    tempImagePath = join(downloadsFolder, `thumb_${timestamp}_${randomSuffix}.jpg`);
    console.log('Caminho da thumbnail temporária:', tempImagePath);

    // Extrair a thumbnail para um arquivo temporário
    const ffmpegCommand = `ffmpeg -y -i "${filePath}" -vf "select=eq(n\\,0)" -vframes 1 "${tempImagePath}"`;
    console.log('Comando ffmpeg:', ffmpegCommand);
    
    await execAsync(ffmpegCommand, { maxBuffer: 1024 * 1024 * 10 });
    
    // Verificar se a thumbnail foi gerada
    if (!await fileExists(tempImagePath)) {
      throw new Error('Falha ao gerar thumbnail');
    }

    // Ler o arquivo de imagem
    const imageBuffer = await readFile(tempImagePath);
    
    // Limpar o arquivo temporário
    try {
      if (tempImagePath && await fileExists(tempImagePath)) {
        await unlink(tempImagePath);
      }
    } catch (error) {
      console.warn('Erro ao remover arquivo temporário:', error);
    }

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000'
      }
    });
  } catch (error) {
    console.error('Erro ao extrair thumbnail:', error);
    
    // Tentar limpar o arquivo temporário em caso de erro
    if (tempImagePath) {
      try {
        await unlink(tempImagePath);
      } catch (cleanupError) {
        console.warn('Erro ao limpar arquivo temporário:', cleanupError);
      }
    }
    
    return new NextResponse('Erro ao extrair thumbnail', { status: 500 });
  }
} 