import React from 'react';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export default function BaseModal({ 
  isOpen, 
  onClose, 
  title, 
  children,
  maxWidth = "max-w-md"
}: BaseModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 sm:p-2">
      <div className={`bg-zinc-900 rounded-lg p-6 w-full ${maxWidth} shadow-lg relative animate-fade-in sm:p-4 sm:max-w-full sm:mx-2 sm:max-h-[90vh] sm:overflow-y-auto`}>
        <div className="flex justify-between items-center mb-4 sm:mb-3">
          <h2 className="text-xl font-semibold text-white sm:text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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