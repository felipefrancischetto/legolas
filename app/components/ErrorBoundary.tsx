"use client";

import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    // Converter erro para Error se necessário
    const errorObj = error instanceof Error 
      ? error 
      : new Error(String(error || 'Erro desconhecido'));
    
    return { hasError: true, error: errorObj };
  }

  componentDidCatch(error: Error | unknown, errorInfo: React.ErrorInfo) {
    // Log do erro sem causar problemas no console
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary capturou um erro:', error, errorInfo);
    }
    
    // Tratar erros específicos relacionados a tamanho de mensagem
    const errorMessage = error instanceof Error ? error.message : String(error || '');
    if (errorMessage && errorMessage.includes('maximum allowed size')) {
      console.warn('⚠️ Erro relacionado a tamanho de mensagem detectado. Isso pode ser causado por uma extensão do navegador.');
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-zinc-900 rounded-lg p-6 border border-red-500/30">
            <h2 className="text-xl font-bold text-red-400 mb-4">
              Algo deu errado
            </h2>
            <p className="text-zinc-300 mb-4">
              Ocorreu um erro inesperado. Por favor, recarregue a página.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-zinc-400 mb-2">
                  Detalhes do erro (desenvolvimento)
                </summary>
                <pre className="text-xs bg-zinc-800 p-3 rounded overflow-auto max-h-40 text-red-300">
                  {this.state.error?.message || this.state.error?.toString() || 'Erro desconhecido'}
                  {this.state.error?.stack && (
                    <>
                      {'\n\n'}
                      {this.state.error.stack}
                    </>
                  )}
                </pre>
              </details>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="mt-4 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors"
            >
              Recarregar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
