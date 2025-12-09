// Store para manter os streams ativos
const activeStreams = new Map<string, ReadableStreamDefaultController>();

// Cache para evitar logs repetitivos de streams não encontrados
const notFoundCache = new Set<string>();

// Função para registrar um stream
export function registerProgressStream(downloadId: string, controller: ReadableStreamDefaultController) {
  activeStreams.set(downloadId, controller);
  console.log(`📡 Stream registrado para downloadId: ${downloadId}`);
}

// Função para remover um stream
export function unregisterProgressStream(downloadId: string) {
  activeStreams.delete(downloadId);
  notFoundCache.delete(downloadId);
  console.log(`🔌 Stream removido para downloadId: ${downloadId}`);
}

// Função para enviar eventos de progresso
export function sendProgressEvent(downloadId: string, data: {
  type: string;
  step: string;
  progress?: number;
  substep?: string;
  detail?: string;
  metadata?: any;
  playlistIndex?: number;
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