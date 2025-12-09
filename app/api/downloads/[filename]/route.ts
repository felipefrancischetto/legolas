import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { createReadStream, statSync } from 'fs';
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
    const filePath = join(downloadsPath, decodeURIComponent(filename));
    
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
      console.error('❌ Erro ao acessar arquivo:', error);
      return new NextResponse('Arquivo não encontrado', { status: 404 });
    }
  } catch (error) {
    console.error('❌ Erro no endpoint de downloads:', error);
    return new NextResponse('Erro interno do servidor', { status: 500 });
  }
} 