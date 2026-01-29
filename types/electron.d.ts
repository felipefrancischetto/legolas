// Tipos TypeScript para Electron API exposta via preload

export interface ElectronAPI {
  selectDownloadsFolder: () => Promise<string | null>;
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  isElectron: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
