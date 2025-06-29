import React from 'react';

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

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 sm:p-2">
      <div 
        className={`rounded-2xl backdrop-blur-xl border p-6 w-full ${maxWidth} shadow-lg relative animate-fade-in sm:p-4 sm:max-w-full sm:mx-2 sm:max-h-[90vh] sm:overflow-y-auto`}
        style={{
          background: 'linear-gradient(135deg, rgba(39, 39, 42, 0.7) 0%, rgba(24, 24, 27, 0.8) 100%)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
        }}
      >
        <div className="flex justify-between items-center mb-4 sm:mb-3">
          <div className="flex items-center gap-3">
            <div 
              className="w-3 h-3 rounded-full"
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
            className="text-gray-400 hover:text-white transition-all duration-200 p-2 rounded-full hover:scale-105"
            style={{
              backgroundColor: 'rgba(63, 63, 70, 0.5)',
              border: '1px solid rgba(82, 82, 91, 0.5)'
            }}
          >
            <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="responsive-modal-content">
          {children}
        </div>
      </div>
    </div>
  );
} 