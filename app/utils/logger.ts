/**
 * Utilitário de logging condicional
 * Logs apenas em desenvolvimento para evitar poluição do console em produção
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  
  error: (...args: any[]) => {
    // Erros sempre são logados
    console.error(...args);
  },
  
  warn: (...args: any[]) => {
    // Warnings sempre são logados
    console.warn(...args);
  },
  
  info: (...args: any[]) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },
  
  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  }
};




