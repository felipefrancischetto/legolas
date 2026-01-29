const { contextBridge, ipcRenderer } = require('electron');

// Expor APIs seguras para o renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Selecionar pasta de downloads
  selectDownloadsFolder: () => ipcRenderer.invoke('select-downloads-folder'),
  
  // Informações do app
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  // Verificar se está rodando no Electron
  isElectron: true,
});
