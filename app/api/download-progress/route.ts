import { NextRequest } from 'next/server';
import { registerProgressStream, unregisterProgressStream, isStreamActive } from '@/lib/utils/progressEventService';

// 🔧 Configurações necessárias para SSE no Next.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Armazenar intervalos de heartbeat para poder limpá-los quando o stream for cancelado
const heartbeatIntervals = new Map<string, NodeJS.Timeout>();

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
      
      // Registrar o controller usando o serviço
      registerProgressStream(downloadId, controller);
      
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
        // Verificar se o controller ainda está registrado antes de tentar enviar
        if (!isStreamActive(downloadId)) {
          console.log(`⚠️  Heartbeat cancelado - stream já foi fechado para ${downloadId}`);
          clearInterval(heartbeatInterval);
          heartbeatIntervals.delete(downloadId);
          return;
        }

        try {
          const heartbeat = `data: ${JSON.stringify({
            type: 'heartbeat',
            timestamp: new Date().toISOString()
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(heartbeat));
        } catch (error) {
          // Controller foi fechado, limpar intervalo e remover registro
          console.error(`❌ Erro no heartbeat para ${downloadId}:`, error);
          clearInterval(heartbeatInterval);
          heartbeatIntervals.delete(downloadId);
          unregisterProgressStream(downloadId);
        }
      }, 30000);

      // Armazenar referência do intervalo
      heartbeatIntervals.set(downloadId, heartbeatInterval);
    },
    cancel() {
      // Limpar o intervalo de heartbeat quando a conexão for fechada
      const heartbeatInterval = heartbeatIntervals.get(downloadId);
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatIntervals.delete(downloadId);
        console.log(`🧹 Heartbeat limpo para downloadId: ${downloadId}`);
      }
      
      // Limpar o controller quando a conexão for fechada
      unregisterProgressStream(downloadId);
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