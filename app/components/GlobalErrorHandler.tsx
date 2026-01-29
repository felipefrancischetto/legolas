'use client';

import { useEffect } from 'react';

/**
 * Componente para tratar erros globais, especialmente erros de extensões do navegador
 * que podem causar problemas com runtime.sendMessage
 */
export default function GlobalErrorHandler() {
  useEffect(() => {
    // Função auxiliar para verificar se é erro de extensão relacionado a tamanho
    const isExtensionSizeError = (error: any): boolean => {
      if (!error) return false;
      const errorString = error?.toString() || String(error) || '';
      const message = error?.message || '';
      
      return (
        errorString.includes('maximum allowed size') ||
        errorString.includes('runtime.sendMessage') ||
        errorString.includes('Message exceeded') ||
        errorString.includes('64MiB') ||
        message.includes('maximum allowed size') ||
        message.includes('runtime.sendMessage') ||
        message.includes('Message exceeded') ||
        message.includes('64MiB')
      );
    };

    // Interceptar console.error para filtrar erros de extensão
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      const errorString = args.map(arg => 
        arg?.toString?.() || String(arg)
      ).join(' ');
      
      // Se for erro de extensão relacionado a tamanho, ignorar
      if (isExtensionSizeError(errorString)) {
        // Não logar nada ou logar apenas um aviso discreto
        return;
      }
      
      // Caso contrário, chamar o console.error original
      originalConsoleError.apply(console, args);
    };

    // Handler para erros não capturados
    const handleError = (event: ErrorEvent) => {
      const error = event.error || event.message;
      
      // Ignorar erros de extensões do navegador relacionados a tamanho de mensagem
      if (isExtensionSizeError(error)) {
        // Silenciar esses erros no console para não poluir
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };

    // Handler para promessas rejeitadas não tratadas
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      
      // Ignorar rejeições relacionadas a tamanho de mensagem
      if (isExtensionSizeError(reason)) {
        event.preventDefault();
        event.stopPropagation();
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
