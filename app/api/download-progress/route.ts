import { NextRequest } from 'next/server';

// 🔧 Configurações necessárias para SSE no Next.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Store para manter os streams ativos
const activeStreams = new Map<string, ReadableStreamDefaultController>();

// 🔧 Tratar OPTIONS para CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cache-Control',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const downloadId = searchParams.get('downloadId');

  console.log(`🔌 [SSE] Requisição recebida para downloadId: ${downloadId}`);

  if (!downloadId) {
    console.error(`❌ [SSE] downloadId não fornecido`);
    return new Response('Download ID is required', { status: 400 });
  }

  console.log(`🔌 Criando stream SSE para downloadId: ${downloadId}`);

  // Criar stream de eventos usando ReadableStream
  const stream = new ReadableStream({
    start(controller) {
      console.log(`📡 Stream iniciado para downloadId: ${downloadId}`);
      
      // Registrar o controller para este download
      activeStreams.set(downloadId, controller);
      
      // Enviar evento inicial
      const initialData = `data: ${JSON.stringify({
        type: 'init',
        step: 'Conectado ao servidor...',
        progress: 0,
        timestamp: new Date().toISOString()
      })}\n\n`;
      
      try {
        controller.enqueue(new TextEncoder().encode(initialData));
        console.log(`✅ Evento inicial enviado para downloadId: ${downloadId}`);
      } catch (error) {
        console.error(`❌ Erro ao enviar evento inicial para ${downloadId}:`, error);
      }

      // Enviar heartbeat a cada 30 segundos para manter a conexão viva
      const heartbeatInterval = setInterval(() => {
        if (activeStreams.has(downloadId)) {
          try {
            const heartbeat = `data: ${JSON.stringify({
              type: 'heartbeat',
              timestamp: new Date().toISOString()
            })}\n\n`;
            controller.enqueue(new TextEncoder().encode(heartbeat));
          } catch (error) {
            console.error(`❌ Erro no heartbeat para ${downloadId}:`, error);
            clearInterval(heartbeatInterval);
            activeStreams.delete(downloadId);
          }
        } else {
          clearInterval(heartbeatInterval);
        }
      }, 30000);
    },
    cancel() {
      // Limpar o controller quando a conexão for fechada
      activeStreams.delete(downloadId);
      console.log(`🔌 Stream fechado para downloadId: ${downloadId}`);
    }
  });

  console.log(`✅ [SSE] Retornando stream para downloadId: ${downloadId}`);

  return new Response(stream, {
    status: 200,
    headers: {
      // Headers obrigatórios para SSE
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate, no-transform',
      'Connection': 'keep-alive',
      
      // Headers CORS
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Cache-Control',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Expose-Headers': 'Content-Type',
      
      // Headers para evitar buffering e compressão
      'X-Accel-Buffering': 'no', // Nginx: disable buffering
      'X-Content-Type-Options': 'nosniff',
      'Content-Encoding': 'identity', // Disable compression
      'Transfer-Encoding': 'chunked',
      
      // Headers para evitar redirecionamentos
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}

// Cache para evitar logs repetitivos de streams não encontrados
const notFoundCache = new Set<string>();

// Função para enviar eventos de progresso
export function sendProgressEvent(downloadId: string, data: {
  type: string;
  step: string;
  progress?: number;
  substep?: string;
  detail?: string;
  metadata?: any;
}) {
  // Garantir que downloadId seja uma string limpa
  const cleanDownloadId = downloadId?.toString().trim();
  
  if (!cleanDownloadId) {
    console.warn(`⚠️  downloadId inválido ou vazio: "${downloadId}"`);
    return;
  }
  
  const controller = activeStreams.get(cleanDownloadId);
  if (controller) {
    // Remover do cache de não encontrados se estava lá
    notFoundCache.delete(cleanDownloadId);
    
    const eventData = `data: ${JSON.stringify({
      ...data,
      timestamp: new Date().toISOString()
    })}\n\n`;
    
    try {
      controller.enqueue(new TextEncoder().encode(eventData));
      
      // Log apenas para eventos importantes (não heartbeat)
      if (data.type !== 'heartbeat') {
        console.log(`📡 Evento enviado para ${cleanDownloadId}: ${data.type} - ${data.step} (${data.progress || 0}%)`);
      }
    } catch (error) {
      // Stream foi fechado, remover da lista
      console.error(`❌ Erro ao enviar evento para ${cleanDownloadId}:`, error);
      activeStreams.delete(cleanDownloadId);
      notFoundCache.add(cleanDownloadId);
    }
  } else {
    // Só tentar busca por ID similar e logar se não estiver no cache
    if (!notFoundCache.has(cleanDownloadId)) {
      const allKeys = Array.from(activeStreams.keys());
      const similarKey = allKeys.find(key => key.includes(cleanDownloadId) || cleanDownloadId.includes(key));
      
      if (similarKey) {
        console.warn(`🔄 Encontrado downloadId similar: "${similarKey}" para "${cleanDownloadId}"`);
        const similarController = activeStreams.get(similarKey);
        if (similarController) {
          const eventData = `data: ${JSON.stringify({
            ...data,
            timestamp: new Date().toISOString()
          })}\n\n`;
          
          try {
            similarController.enqueue(new TextEncoder().encode(eventData));
            console.log(`📡 Evento enviado para ID similar ${similarKey}: ${data.type} - ${data.step}`);
            return;
          } catch (error) {
            console.error(`❌ Erro ao enviar evento para ID similar ${similarKey}:`, error);
            activeStreams.delete(similarKey);
          }
        }
      }
      
      // Log apenas uma vez por downloadId não encontrado
      console.warn(`⚠️  Stream não encontrado para downloadId: "${cleanDownloadId}"`);
      if (allKeys.length > 0) {
        console.warn(`📋 Streams ativos: [${allKeys.join(', ')}]`);
      }
      
      // Adicionar ao cache para evitar logs futuros
      notFoundCache.add(cleanDownloadId);
    }
  }
}

// Função para finalizar o stream
export function closeProgressStream(downloadId: string) {
  const controller = activeStreams.get(downloadId);
  if (controller) {
    try {
      const finalData = `data: ${JSON.stringify({
        type: 'complete',
        step: 'Download concluído!',
        progress: 100,
        timestamp: new Date().toISOString()
      })}\n\n`;
      
      controller.enqueue(new TextEncoder().encode(finalData));
      console.log(`🎉 Stream finalizado para downloadId: ${downloadId}`);
      
      // Aguardar um pouco antes de fechar para garantir que o evento seja recebido
      setTimeout(() => {
        try {
          controller.close();
        } catch (error) {
          // Ignorar erros de stream já fechado
        }
      }, 1000);
    } catch (error) {
      console.error(`❌ Erro ao finalizar stream para ${downloadId}:`, error);
    }
    activeStreams.delete(downloadId);
  } else {
    console.warn(`⚠️  Tentativa de fechar stream inexistente: ${downloadId}`);
  }
} 