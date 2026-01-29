/**
 * Utilitário para salvar dados no localStorage com verificação de tamanho
 * e tratamento de erros adequado para evitar exceder limites
 */

const MAX_STORAGE_SIZE = 4 * 1024 * 1024; // 4MB (limite seguro, localStorage geralmente tem 5-10MB)

/**
 * Calcula o tamanho aproximado de uma string em bytes
 */
function getStringSize(str: string): number {
  return new Blob([str]).size;
}

/**
 * Salva dados no localStorage com verificação de tamanho
 * @param key Chave do localStorage
 * @param data Dados para salvar (serão serializados como JSON)
 * @param options Opções de salvamento
 * @returns true se salvou com sucesso, false caso contrário
 */
export function safeSetItem<T>(
  key: string,
  data: T,
  options?: {
    maxSize?: number;
    onError?: (error: Error) => void;
    compress?: boolean; // Remover campos desnecessários antes de salvar
  }
): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const jsonString = JSON.stringify(data);
    const size = getStringSize(jsonString);
    const maxSize = options?.maxSize || MAX_STORAGE_SIZE;

    // Verificar se excede o tamanho máximo
    if (size > maxSize) {
      const error = new Error(
        `Dados muito grandes para salvar no localStorage (${(size / 1024 / 1024).toFixed(2)}MB > ${(maxSize / 1024 / 1024).toFixed(2)}MB)`
      );
      
      if (options?.onError) {
        options.onError(error);
      } else {
        console.warn(`⚠️ [localStorage] ${error.message}`, { key, size });
      }
      
      return false;
    }

    // Tentar salvar
    localStorage.setItem(key, jsonString);
    return true;
  } catch (error: any) {
    // Tratar erro de quota excedida
    if (error.name === 'QuotaExceededError' || error.code === 22) {
      const quotaError = new Error(
        `Quota do localStorage excedida ao salvar "${key}". Limpando dados antigos...`
      );
      
      if (options?.onError) {
        options.onError(quotaError);
      } else {
        console.warn(`⚠️ [localStorage] ${quotaError.message}`);
      }

      // Tentar limpar dados antigos e salvar novamente
      try {
        // Limpar chaves antigas (exceto a atual)
        const keysToKeep = [key, 'legolas-settings', 'audioPlayerVolume'];
        const allKeys = Object.keys(localStorage);
        
        for (const oldKey of allKeys) {
          if (!keysToKeep.includes(oldKey)) {
            try {
              localStorage.removeItem(oldKey);
            } catch (e) {
              // Ignorar erros ao limpar
            }
          }
        }

        // Tentar salvar novamente
        const jsonString = JSON.stringify(data);
        localStorage.setItem(key, jsonString);
        return true;
      } catch (retryError) {
        console.error(`❌ [localStorage] Falha ao salvar após limpeza:`, retryError);
        return false;
      }
    }

    // Outros erros
    if (options?.onError) {
      options.onError(error);
    } else {
      console.error(`❌ [localStorage] Erro ao salvar "${key}":`, error);
    }
    
    return false;
  }
}

/**
 * Obtém dados do localStorage de forma segura
 */
export function safeGetItem<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;

  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    return JSON.parse(item) as T;
  } catch (error) {
    console.error(`❌ [localStorage] Erro ao ler "${key}":`, error);
    // Limpar item corrompido
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // Ignorar erro ao limpar
    }
    return null;
  }
}

/**
 * Remove item do localStorage de forma segura
 */
export function safeRemoveItem(key: string): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`❌ [localStorage] Erro ao remover "${key}":`, error);
  }
}

/**
 * Limita o tamanho de um array antes de salvar
 */
export function limitArraySize<T>(array: T[], maxItems: number): T[] {
  if (array.length <= maxItems) return array;
  return array.slice(-maxItems); // Manter apenas os últimos N itens
}
