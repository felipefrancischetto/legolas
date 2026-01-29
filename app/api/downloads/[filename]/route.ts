import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { createReadStream, statSync, existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { getDownloadsPath } from '../../utils/common';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
): Promise<NextResponse> {
  try {
    const { filename } = await params;
    if (!filename) {
      return new NextResponse('Nome do arquivo é obrigatório', { status: 400 });
    }

    const downloadsPath = await getDownloadsPath();
    
    // Decodificar o nome do arquivo de forma segura
    let decodedFilename: string;
    try {
      decodedFilename = decodeURIComponent(filename);
    } catch (error) {
      console.error('❌ Erro ao decodificar nome do arquivo:', filename, error);
      return new NextResponse('Nome do arquivo inválido', { status: 400 });
    }
    
    let filePath = join(downloadsPath, decodedFilename);
    
    // Verificar se o arquivo existe antes de tentar acessá-lo
    if (!existsSync(filePath)) {
      // Tentar encontrar o arquivo com busca case-insensitive ou variações de encoding
      try {
        const files = await readdir(downloadsPath);
        const matchingFile = files.find(file => {
          // Comparação case-insensitive
          if (file.toLowerCase() === decodedFilename.toLowerCase()) {
            return true;
          }
          // Comparação sem extensão
          const fileBase = file.replace(/\.[^/.]+$/, '');
          const decodedBase = decodedFilename.replace(/\.[^/.]+$/, '');
          if (fileBase.toLowerCase() === decodedBase.toLowerCase()) {
            return true;
          }
          return false;
        });
        
        if (matchingFile) {
          console.warn(`⚠️ Arquivo encontrado com nome diferente: "${matchingFile}" (procurado: "${decodedFilename}")`);
          filePath = join(downloadsPath, matchingFile);
        } else {
          console.error('❌ Arquivo não encontrado:', filePath);
          console.error('   Downloads path:', downloadsPath);
          console.error('   Filename recebido:', filename);
          console.error('   Filename decodificado:', decodedFilename);
          console.error('   Arquivos disponíveis:', files.slice(0, 10).join(', '), files.length > 10 ? `... (${files.length} total)` : '');
          return new NextResponse('Arquivo não encontrado', { status: 404 });
        }
      } catch (dirError) {
        console.error('❌ Erro ao listar arquivos:', dirError);
        return new NextResponse('Arquivo não encontrado', { status: 404 });
      }
    }
    
    try {
      // Obter informações do arquivo
      const stat = statSync(filePath);
      const fileSize = stat.size;
      
      // Determinar o tipo de conteúdo
      const fileExt = filename.toLowerCase().split('.').pop();
      const contentType = fileExt === 'flac' ? 'audio/flac' : 'audio/mpeg';
      
      // Verificar se é uma requisição de range (para streaming)
      const range = request.headers.get('range');
      
      if (range) {
        // Parse do header Range: bytes=start-end
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = (end - start) + 1;
        
        // Criar stream para a parte solicitada
        const fileStream = createReadStream(filePath, { start, end });
        
        // Converter stream para Response
        const readableStream = new ReadableStream({
          start(controller) {
            let isClosed = false;
            
            fileStream.on('data', (chunk) => {
              if (isClosed) return;
              try {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                controller.enqueue(new Uint8Array(buffer));
              } catch (error) {
                if (!isClosed) {
                  console.error('❌ Erro ao enviar chunk:', error);
                  isClosed = true;
                }
              }
            });
            
            fileStream.on('end', () => {
              if (!isClosed) {
                try {
                  controller.close();
                  isClosed = true;
                } catch (error) {
                  // Stream já fechado
                }
              }
            });
            
            fileStream.on('error', (error) => {
              if (!isClosed) {
                console.error('❌ Erro no stream:', error);
                try {
                  controller.error(error);
                  isClosed = true;
                } catch (e) {
                  // Stream já fechado
                }
              }
            });
          },
          cancel() {
            // Stream foi cancelado pelo cliente
            if (fileStream.readable) {
              fileStream.destroy();
            }
          }
        });
        
        return new NextResponse(readableStream, {
          status: 206, // Partial Content
          headers: {
            'Content-Type': contentType,
            'Content-Length': chunkSize.toString(),
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=31536000', // Cache por 1 ano
          },
        });
      } else {
        
        // Requisição normal - ainda assim usar stream para arquivos grandes
        const fileStream = createReadStream(filePath);
        
        const readableStream = new ReadableStream({
          start(controller) {
            let isClosed = false;
            
            fileStream.on('data', (chunk) => {
              if (isClosed) return;
              try {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                controller.enqueue(new Uint8Array(buffer));
              } catch (error) {
                if (!isClosed) {
                  console.error('❌ Erro ao enviar chunk:', error);
                  isClosed = true;
                }
              }
            });
            
            fileStream.on('end', () => {
              if (!isClosed) {
                try {
                  controller.close();
                  isClosed = true;
                } catch (error) {
                  // Stream já fechado
                }
              }
            });
            
            fileStream.on('error', (error) => {
              if (!isClosed) {
                console.error('❌ Erro no stream:', error);
                try {
                  controller.error(error);
                  isClosed = true;
                } catch (e) {
                  // Stream já fechado
                }
              }
            });
          },
          cancel() {
            // Stream foi cancelado pelo cliente
            if (fileStream.readable) {
              fileStream.destroy();
            }
          }
        });
        
        return new NextResponse(readableStream, {
          headers: {
            'Content-Type': contentType,
            'Content-Length': fileSize.toString(),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=31536000',
          },
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Erro ao acessar arquivo:', {
        error: errorMessage,
        filePath,
        downloadsPath,
        filename,
        decodedFilename
      });
      
      // Verificar se é erro de arquivo não encontrado
      if (error instanceof Error && (error.message.includes('ENOENT') || error.message.includes('no such file'))) {
        return new NextResponse('Arquivo não encontrado', { status: 404 });
      }
      
      return new NextResponse(`Erro ao acessar arquivo: ${errorMessage}`, { status: 500 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Erro no endpoint de downloads:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    return new NextResponse(`Erro interno do servidor: ${errorMessage}`, { status: 500 });
  }
} 