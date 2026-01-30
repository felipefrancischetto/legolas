import { NextRequest, NextResponse } from 'next/server';
import { rename, access, readdir, stat, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { getDownloadsPath } from '../utils/common';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let fileName = body.fileName;
    
    if (!fileName) {
      return NextResponse.json({ error: 'Nome do arquivo não informado' }, { status: 400 });
    }

    const downloadsDir = await getDownloadsPath();
    
    // Verificar se o arquivo está na pasta principal ou na pasta nao-normalizadas
    let filePath = join(downloadsDir, fileName);
    let sourceFolder = 'principal';
    
    // Se não existe na pasta principal, verificar se já está na pasta nao-normalizadas
    if (!existsSync(filePath)) {
      const naoNormalizadasDir = join(downloadsDir, 'nao-normalizadas');
      const naoNormalizadasPath = join(naoNormalizadasDir, fileName);
      
      if (existsSync(naoNormalizadasPath)) {
        // Arquivo já está na pasta nao-normalizadas
        return NextResponse.json({ 
          success: true,
          message: 'Arquivo já está na pasta nao-normalizadas',
          fileName,
          folder: 'nao-normalizadas'
        });
      }
      
      // Tentar busca case-insensitive na pasta principal
      try {
        const files = await readdir(downloadsDir);
        const matchingFile = files.find(f => f.toLowerCase() === fileName.toLowerCase());
        if (matchingFile) {
          filePath = join(downloadsDir, matchingFile);
          fileName = matchingFile;
        } else {
          return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
        }
      } catch (err) {
        return NextResponse.json({ error: 'Erquivo não encontrado' }, { status: 404 });
      }
    }
    
    // Criar pasta nao-normalizadas se não existir
    const naoNormalizadasDir = join(downloadsDir, 'nao-normalizadas');
    if (!existsSync(naoNormalizadasDir)) {
      await mkdir(naoNormalizadasDir, { recursive: true });
      console.log('✅ [move-to-non-normalized] Pasta nao-normalizadas criada:', naoNormalizadasDir);
    }
    
    // Caminho de destino na pasta nao-normalizadas
    let newFilePath = join(naoNormalizadasDir, fileName);
    
    // Verifica se já existe um arquivo com o mesmo nome na pasta nao-normalizadas
    if (existsSync(newFilePath)) {
      console.warn('Arquivo já existe na pasta nao-normalizadas, adicionando timestamp:', newFilePath);
      const timestamp = Date.now();
      const fileExt = fileName.substring(fileName.lastIndexOf('.'));
      const fileBase = fileName.substring(0, fileName.lastIndexOf('.'));
      const newFileNameWithTimestamp = `${fileBase}_${timestamp}${fileExt}`;
      const newFilePathWithTimestamp = join(naoNormalizadasDir, newFileNameWithTimestamp);
      
      try {
        await rename(filePath, newFilePathWithTimestamp);
        console.log('✅ [move-to-non-normalized] Arquivo movido para nao-normalizadas (com timestamp):', fileName, '->', newFileNameWithTimestamp);
        return NextResponse.json({ 
          success: true,
          originalName: fileName,
          newName: newFileNameWithTimestamp,
          message: 'Arquivo movido para pasta nao-normalizadas com sucesso'
        });
      } catch (renameErr) {
        console.error('Erro ao mover arquivo com timestamp:', renameErr);
        return NextResponse.json({ 
          error: 'Erro ao mover arquivo', 
          details: String(renameErr) 
        }, { status: 500 });
      }
    }
    
    // Tentar renomear o arquivo
    let attempts = 0;
    const maxAttempts = 5;
    const delayBetweenAttempts = 800;
    
    while (attempts < maxAttempts) {
      try {
        await rename(filePath, newFilePath);
        console.log('✅ [move-to-non-normalized] Arquivo movido para nao-normalizadas com sucesso:', fileName, '->', newFilePath);
        return NextResponse.json({ 
          success: true,
          fileName,
          message: 'Arquivo movido para pasta nao-normalizadas com sucesso'
        });
      } catch (renameErr: any) {
        attempts++;
        console.warn(`⚠️ [move-to-non-normalized] Tentativa ${attempts}/${maxAttempts} falhou:`, renameErr.message);
        
        if (attempts >= maxAttempts) {
          console.error('❌ [move-to-non-normalized] Falha ao mover arquivo após múltiplas tentativas:', renameErr);
          return NextResponse.json({ 
            error: 'Erro ao mover arquivo', 
            details: String(renameErr) 
          }, { status: 500 });
        }
        
        // Aguardar antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
      }
    }
    
    return NextResponse.json({ error: 'Erro desconhecido ao mover arquivo' }, { status: 500 });
    
  } catch (error) {
    console.error('❌ [move-to-non-normalized] Erro:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao mover arquivo' },
      { status: 500 }
    );
  }
}
