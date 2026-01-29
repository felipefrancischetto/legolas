import React, { useEffect } from 'react';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  themeColors?: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    background: string;
    border: string;
  };
}

export default function BaseModal({ 
  isOpen, 
  onClose, 
  title, 
  children,
  maxWidth = "max-w-md",
  themeColors
}: BaseModalProps) {
  // Prevenir scroll do body quando o modal está aberto (mas permitir scroll no modal)
  useEffect(() => {
    if (isOpen) {
      // Salvar o valor atual do overflow
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Fechar modal com ESC
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Cores padrão caso não sejam fornecidas
  const defaultColors = {
    primary: 'rgb(16, 185, 129)',
    primaryLight: 'rgba(16, 185, 129, 0.9)',
    primaryDark: 'rgba(16, 185, 129, 0.7)',
    background: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)'
  };
  
  const colors = themeColors || defaultColors;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Fechar apenas se clicar diretamente no backdrop, não no conteúdo do modal
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/60 z-[100] flex items-start justify-center p-4 sm:p-2 overflow-y-auto"
      onClick={handleBackdropClick}
      style={{ 
        minHeight: '100vh',
        paddingTop: '2rem',
        paddingBottom: '2rem'
      }}
    >
      <div 
        className={`rounded-xl backdrop-blur-xl border p-6 w-full ${maxWidth} shadow-lg relative animate-fade-in sm:p-5 sm:max-w-full sm:mx-2 max-h-[calc(90vh-4rem)] flex flex-col my-auto`}
        style={{
          background: 'linear-gradient(135deg, rgba(39, 39, 42, 0.7) 0%, rgba(24, 24, 27, 0.8) 100%)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          maxWidth: 'calc(100vw - 2rem)',
          minHeight: 'fit-content'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6 sm:mb-5 flex-shrink-0">
          <div className="flex items-center gap-3 sm:gap-2">
            <div 
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: colors.primary }}
            />
            <h2 
              className="text-xl font-semibold sm:text-lg"
              style={{ color: colors.primary }}
            >
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-all duration-200 p-2 rounded-full hover:scale-105 flex-shrink-0"
            style={{
              backgroundColor: 'rgba(63, 63, 70, 0.5)',
              border: '1px solid rgba(82, 82, 91, 0.5)'
            }}
            aria-label="Fechar modal"
          >
            <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="responsive-modal-content overflow-y-auto flex-1 min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
} 