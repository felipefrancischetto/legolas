'use client';

import { useEffect } from 'react';

/**
 * Componente para tratar erros globais, especialmente erros de extensões do navegador
 * que podem causar problemas com runtime.sendMessage durante Fast Refresh
 */
export default function GlobalErrorHandler() {
  useEffect(() => {
    // Função auxiliar para verificar se é erro de extensão relacionado a tamanho ou Fast Refresh
    const isExtensionSizeError = (error: any): boolean => {
      if (!error) return false;
      const errorString = error?.toString() || String(error) || '';
      const message = error?.message || '';
      const stack = error?.stack || '';
      
      // Verificar múltiplas condições relacionadas ao erro
      const errorText = `${errorString} ${message} ${stack}`.toLowerCase();
      
      return (
        // Erros de tamanho de mensagem
        errorText.includes('maximum allowed size') ||
        errorText.includes('runtime.sendmessage') ||
        errorText.includes('message exceeded') ||
        errorText.includes('64mib') ||
        // Erros de canal fechado durante Fast Refresh
        (errorText.includes('message channel closed') && 
         (errorText.includes('fast refresh') || errorText.includes('hot-reloader'))) ||
        // Erros relacionados a content script durante Fast Refresh
        (errorText.includes('content script') && 
         (errorText.includes('fast refresh') || errorText.includes('hot-reloader'))) ||
        // Erros de hot-reloader relacionados a mensagens
        (errorText.includes('hot-reloader') && errorText.includes('sendmessage'))
      );
    };

    // Interceptar console.error para filtrar erros de extensão
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      // Verificar se algum dos argumentos contém o erro que queremos filtrar
      const errorString = args.map(arg => {
        if (arg instanceof Error) {
          return `${arg.toString()} ${arg.message} ${arg.stack || ''}`;
        }
        return arg?.toString?.() || String(arg);
      }).join(' ');
      
      // Se for erro de extensão relacionado a tamanho ou Fast Refresh, ignorar
      if (isExtensionSizeError(errorString)) {
        // Não logar nada - esses erros são causados por extensões do navegador
        // durante o Fast Refresh e não afetam a funcionalidade da aplicação
        return;
      }
      
      // Caso contrário, chamar o console.error original
      originalConsoleError.apply(console, args);
    };

    // Handler para erros não capturados
    const handleError = (event: ErrorEvent) => {
      const error = event.error || event.message;
      const filename = event.filename || '';
      
      // Ignorar erros de extensões do navegador relacionados a tamanho de mensagem ou Fast Refresh
      if (isExtensionSizeError(error) || 
          (filename.includes('content script') && filename.includes('hot-reloader'))) {
        // Silenciar esses erros no console para não poluir
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
      }
    };

    // Handler para promessas rejeitadas não tratadas
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      
      // Ignorar rejeições relacionadas a tamanho de mensagem ou Fast Refresh
      if (isExtensionSizeError(reason)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
      }
    };

    // Adicionar listeners com capture para pegar erros mais cedo
    window.addEventListener('error', handleError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection, true);

    // Limpar listeners ao desmontar
    return () => {
      console.error = originalConsoleError;
      window.removeEventListener('error', handleError, true);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection, true);
    };
  }, []);

  return null;
}
