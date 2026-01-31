import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, stat, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getDownloadsPath, moveFile } from '../utils/common';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Verifica se um arquivo foi normalizado pelo Beatport
 */
async function checkBeatportNormalization(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format "${filePath}"`,
      { maxBuffer: 1024 * 1024 * 10 }
    );

    const info = JSON.parse(stdout);
    const tags = info.format?.tags || {};
    
    // Extrair label, BPM, genre e número de catálogo
    const label = tags.publisher || tags.Publisher || tags.label || tags.Label || tags.LABEL || null;
    const bpm = tags.BPM || tags.bpm || null;
    const genre = tags.genre || tags.Genre || tags.GENRE || null;
    const catalogNumber = tags.catalog || tags.CATALOG || tags.catalogNumber || tags.CATALOGNUMBER || 
                         tags.catalognumber || tags.catalog_number || null;
    
    // Verificar se realmente veio do Beatport verificando o campo comment
    const comment = tags.comment || tags.COMMENT || null;
    let hasBeatportSource = false;
    if (comment && comment.includes('Sources:')) {
      hasBeatportSource = comment.includes('Beatport') || comment.includes('BeatportV2');
    }
    
    // Determinar se o arquivo passou pelo Beatport
    // Padrão Beatport completo precisa ter: Label, BPM, Genre E confirmação de fonte Beatport
    // Nota: Catalog number não é obrigatório, mas é um bom indicador quando presente
    const hasRequiredMetadata = !!(label && bpm && genre);
    const isBeatportFormat = hasRequiredMetadata && hasBeatportSource;
    
    return isBeatportFormat;
  } catch (error) {
    console.error(`Erro ao verificar normalização do arquivo ${filePath}:`, error);
    return false;
  }
}

/**
 * Move um arquivo para a pasta nao-normalizadas
 */
async function moveToNonNormalizedFolder(
  filePath: string, 
  fileName: string, 
  downloadsFolder: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Verificar se o arquivo já está na pasta nao-normalizadas
    if (filePath.includes('nao-normalizadas')) {
      return { success: true, message: 'Arquivo já está na pasta nao-normalizadas' };
    }

    // Criar pasta nao-normalizadas se não existir
    const naoNormalizadasDir = join(downloadsFolder, 'nao-normalizadas');
    if (!existsSync(naoNormalizadasDir)) {
      await mkdir(naoNormalizadasDir, { recursive: true });
      console.log(`✅ Pasta nao-normalizadas criada: ${naoNormalizadasDir}`);
    }

    // Caminho de destino
    let newFilePath = join(naoNormalizadasDir, fileName);

    // Se já existe um arquivo com o mesmo nome, adicionar timestamp
    if (existsSync(newFilePath)) {
      const timestamp = Date.now();
      const fileExt = fileName.substring(fileName.lastIndexOf('.'));
      const fileBase = fileName.substring(0, fileName.lastIndexOf('.'));
      const newFileNameWithTimestamp = `${fileBase}_${timestamp}${fileExt}`;
      newFilePath = join(naoNormalizadasDir, newFileNameWithTimestamp);
    }

    // Mover arquivo
    let attempts = 0;
    const maxAttempts = 5;
    const delayBetweenAttempts = 800;

    while (attempts < maxAttempts) {
      try {
        await moveFile(filePath, newFilePath);
        return { success: true, message: `Arquivo movido: ${fileName}` };
      } catch (renameErr: any) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw renameErr;
        }
        await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
      }
    }

    return { success: false, message: 'Erro ao mover arquivo' };
  } catch (error) {
    console.error(`Erro ao mover arquivo ${fileName}:`, error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const downloadsFolder = await getDownloadsPath();
    
    // Listar arquivos na pasta principal
    let files: string[] = [];
    try {
      files = await readdir(downloadsFolder);
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        return NextResponse.json({ 
          error: 'Pasta de downloads não encontrada',
          moved: 0,
          total: 0
        }, { status: 404 });
      }
      throw err;
    }

    // Filtrar apenas arquivos de áudio
    const audioFiles = files.filter(file => {
      const fileNameLower = file.toLowerCase();
      // Excluir arquivos que já estão em pastas especiais
      if (fileNameLower.startsWith('[excluir]_')) return false;
      return fileNameLower.endsWith('.mp3') || fileNameLower.endsWith('.flac');
    });

    console.log(`📊 [organize-non-normalized] Total de arquivos de áudio: ${audioFiles.length}`);

    const results = {
      total: audioFiles.length,
      moved: 0,
      alreadyNormalized: 0,
      errors: 0,
      details: [] as Array<{ fileName: string; status: string; message: string }>
    };

    // Processar arquivos em paralelo com controle de concorrência (10 por vez)
    const CONCURRENT_LIMIT = 10;
    
    const processFile = async (file: string) => {
      const filePath = join(downloadsFolder, file);
      
      try {
        // Verificar se está normalizado pelo Beatport
        const isNormalized = await checkBeatportNormalization(filePath);
        
        if (isNormalized) {
          results.alreadyNormalized++;
          results.details.push({
            fileName: file,
            status: 'normalized',
            message: 'Arquivo já está normalizado pelo Beatport'
          });
        } else {
          // Mover para pasta nao-normalizadas
          const moveResult = await moveToNonNormalizedFolder(filePath, file, downloadsFolder);
          
          if (moveResult.success) {
            results.moved++;
            results.details.push({
              fileName: file,
              status: 'moved',
              message: moveResult.message
            });
            console.log(`✅ Movido: ${file}`);
          } else {
            results.errors++;
            results.details.push({
              fileName: file,
              status: 'error',
              message: moveResult.message
            });
            console.error(`❌ Erro ao mover: ${file} - ${moveResult.message}`);
          }
        }
      } catch (error) {
        results.errors++;
        results.details.push({
          fileName: file,
          status: 'error',
          message: error instanceof Error ? error.message : 'Erro desconhecido'
        });
        console.error(`❌ Erro ao processar: ${file}`, error);
      }
    };

    // Processar em chunks paralelos
    for (let i = 0; i < audioFiles.length; i += CONCURRENT_LIMIT) {
      const chunk = audioFiles.slice(i, i + CONCURRENT_LIMIT);
      await Promise.all(chunk.map(processFile));
    }

    console.log(`\n📊 [organize-non-normalized] Resumo:`);
    console.log(`   Total processado: ${results.total}`);
    console.log(`   Movidos: ${results.moved}`);
    console.log(`   Já normalizados: ${results.alreadyNormalized}`);
    console.log(`   Erros: ${results.errors}`);

    return NextResponse.json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('❌ [organize-non-normalized] Erro:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Erro ao organizar arquivos',
        success: false
      },
      { status: 500 }
    );
  }
}
