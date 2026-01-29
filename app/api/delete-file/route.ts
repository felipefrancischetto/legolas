import { NextRequest, NextResponse } from 'next/server';
import { rename, access, readdir, stat, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { getDownloadsPath } from '../utils/common';

export async function DELETE(request: NextRequest) {
  let fileName = request.nextUrl.searchParams.get('fileName');
  if (!fileName) {
    return NextResponse.json({ error: 'Nome do arquivo não informado' }, { status: 400 });
  }

  try {
    // Decodifica o nome do arquivo para tratar espaços e caracteres especiais
    fileName = decodeURIComponent(fileName);
    const downloadsDir = await getDownloadsPath();
    let filePath = join(downloadsDir, fileName);
    const dir = dirname(filePath);
    let actualFileName = fileName;
    
    // Criar pasta arquivadas se não existir
    const arquivadasDir = join(downloadsDir, 'arquivadas');
    if (!existsSync(arquivadasDir)) {
      await mkdir(arquivadasDir, { recursive: true });
      console.log('✅ [delete-file] Pasta arquivadas criada:', arquivadasDir);
    }
    
    // Caminho de destino na pasta arquivadas
    let newFilePath = join(arquivadasDir, actualFileName);

    // Verifica se o arquivo existe - se não existir, tentar busca case-insensitive
    if (!existsSync(filePath)) {
      console.warn('Arquivo não encontrado com nome exato, tentando busca case-insensitive:', filePath);
      
      try {
        const files = await readdir(downloadsDir);
        const matchingFile = files.find(file => {
          // Comparação case-insensitive
          if (file.toLowerCase() === fileName.toLowerCase()) {
            return true;
          }
          // Comparação sem extensão
          const fileBase = file.replace(/\.[^/.]+$/, '');
          const fileNameBase = fileName.replace(/\.[^/.]+$/, '');
          if (fileBase.toLowerCase() === fileNameBase.toLowerCase()) {
            return true;
          }
          return false;
        });
        
        if (matchingFile) {
          console.log(`✅ Arquivo encontrado com nome diferente: "${matchingFile}" (procurado: "${fileName}")`);
          actualFileName = matchingFile;
          filePath = join(downloadsDir, matchingFile);
          newFilePath = join(arquivadasDir, matchingFile);
        } else {
          // Arquivo não encontrado - pode já ter sido removido, tratar como sucesso
          console.warn('⚠️ Arquivo não encontrado (pode já ter sido removido):', fileName);
          return NextResponse.json({ 
            success: true, 
            message: 'Arquivo não encontrado - pode já ter sido removido',
            alreadyRemoved: true
          });
        }
      } catch (dirError) {
        console.error('Erro ao listar arquivos:', dirError);
        // Se não conseguir listar, tratar como arquivo já removido
        return NextResponse.json({ 
          success: true, 
          message: 'Arquivo não encontrado - pode já ter sido removido',
          alreadyRemoved: true
        });
      }
    }

    // Verifica se já existe um arquivo com o mesmo nome na pasta arquivadas
    if (existsSync(newFilePath)) {
      console.warn('Arquivo já existe na pasta arquivadas, adicionando timestamp:', newFilePath);
      const timestamp = Date.now();
      const fileExt = actualFileName.substring(actualFileName.lastIndexOf('.'));
      const fileBase = actualFileName.substring(0, actualFileName.lastIndexOf('.'));
      const newFileNameWithTimestamp = `${fileBase}_${timestamp}${fileExt}`;
      const newFilePathWithTimestamp = join(arquivadasDir, newFileNameWithTimestamp);
      
      try {
        await rename(filePath, newFilePathWithTimestamp);
        console.log('✅ [delete-file] Arquivo movido para arquivadas (com timestamp):', actualFileName, '->', newFileNameWithTimestamp);
        return NextResponse.json({ 
          success: true,
          originalName: actualFileName,
          newName: newFileNameWithTimestamp,
          message: 'Arquivo arquivado com sucesso'
        });
      } catch (renameErr) {
        console.error('Erro ao mover arquivo com timestamp:', renameErr);
        return NextResponse.json({ 
          error: 'Erro ao arquivar arquivo', 
          details: String(renameErr) 
        }, { status: 500 });
      }
    }

    // Tentar renomear o arquivo
    // Se falhar por estar em uso, tentar novamente após um pequeno delay
    let attempts = 0;
    const maxAttempts = 5; // Aumentado para 5 tentativas
    const delayBetweenAttempts = 800; // Aumentado para 800ms
    
    while (attempts < maxAttempts) {
      try {
        // Verificar se o arquivo ainda existe antes de tentar renomear
        if (!existsSync(filePath)) {
          console.warn('Arquivo não existe mais (pode ter sido removido):', filePath);
          return NextResponse.json({ 
            success: true, 
            message: 'Arquivo já foi removido',
            alreadyRemoved: true
          });
        }
        
        await rename(filePath, newFilePath);
        console.log('✅ [delete-file] Arquivo movido para arquivadas com sucesso:', actualFileName, '->', newFilePath);
        
        // Verificar se o arquivo foi realmente movido
        if (existsSync(newFilePath) && !existsSync(filePath)) {
          console.log('✅ [delete-file] Confirmação: arquivo movido e verificado no sistema de arquivos');
        } else {
          console.warn('⚠️ [delete-file] Aviso: arquivo pode não ter sido movido corretamente');
        }
        
        return NextResponse.json({ 
          success: true,
          originalName: actualFileName,
          newPath: newFilePath,
          message: 'Arquivo arquivado com sucesso'
        });
      } catch (renameErr: any) {
        attempts++;
        
        // Se for erro de arquivo em uso e ainda temos tentativas, aguardar e tentar novamente
        const isFileInUse = renameErr.code === 'EBUSY' || 
                           renameErr.code === 'EPERM' || 
                           renameErr.code === 'EACCES' ||
                           renameErr.code === 'ENOENT' ||
                           renameErr.message?.includes('being used') ||
                           renameErr.message?.includes('in use');
        
        if (attempts < maxAttempts && isFileInUse) {
          console.warn(`Tentativa ${attempts}/${maxAttempts} falhou (arquivo pode estar em uso), tentando novamente em ${delayBetweenAttempts}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
          continue;
        }
        
        // Se não for erro de arquivo em uso ou esgotamos as tentativas, retornar erro
        console.error(`Erro ao renomear arquivo (tentativa ${attempts}/${maxAttempts}):`, renameErr);
        
        // Se esgotamos as tentativas, retornar erro específico
        if (attempts >= maxAttempts) {
          return NextResponse.json({ 
            error: 'Erro ao arquivar arquivo após múltiplas tentativas', 
            details: 'O arquivo pode estar em uso por outro processo. Tente novamente em alguns segundos.',
            code: renameErr.code || 'UNKNOWN',
            attempts: attempts
          }, { status: 500 });
        }
        
        // Para outros erros, retornar imediatamente
        return NextResponse.json({ 
          error: 'Erro ao arquivar arquivo', 
          details: renameErr.message || String(renameErr),
          code: renameErr.code || 'UNKNOWN'
        }, { status: 500 });
      }
    }
    
    // Se chegou aqui, esgotamos todas as tentativas
    return NextResponse.json({ 
      error: 'Erro ao arquivar arquivo após múltiplas tentativas', 
      details: 'O arquivo pode estar em uso por outro processo' 
    }, { status: 500 });
    
  } catch (err: any) {
    console.error('Erro geral ao processar arquivamento:', err);
    return NextResponse.json({ 
      error: 'Erro ao arquivar arquivo', 
      details: err.message || String(err),
      code: err.code || 'UNKNOWN'
    }, { status: 500 });
  }
} 