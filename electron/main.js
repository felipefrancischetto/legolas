const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;
let nextServer;

// Função para criar a janela principal
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
    icon: path.join(__dirname, '../public/legolas_thumb.png'),
    titleBarStyle: 'default',
    show: false, // Não mostrar até carregar
  });

  // Carregar a aplicação Next.js
  const startUrl = 'http://localhost:3000';

  // Sempre usar localhost (Next.js sempre roda como servidor)
  mainWindow.loadURL(startUrl);

  // Mostrar janela quando pronta
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Abrir DevTools em desenvolvimento
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevenir navegação para URLs externas
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    if (parsedUrl.origin !== startUrl && !parsedUrl.origin.includes('localhost')) {
      event.preventDefault();
    }
  });
}

// Iniciar servidor Next.js em modo standalone
function startNextServer() {
  return new Promise((resolve, reject) => {
    if (isDev) {
      // Em desenvolvimento, Next.js já está rodando via npm run dev
      console.log('🔧 Modo desenvolvimento - Next.js deve estar rodando separadamente');
      // Verificar se o servidor está rodando
      const http = require('http');
      const checkServer = () => {
        const req = http.get('http://localhost:3000', (res) => {
          console.log('✅ Servidor Next.js detectado');
          resolve();
        });
        req.on('error', () => {
          console.log('⏳ Aguardando servidor Next.js...');
          setTimeout(checkServer, 1000);
        });
      };
      checkServer();
      return;
    }

    // Em produção, iniciar servidor Next.js standalone
    const nextPath = path.join(__dirname, '../.next/standalone');
    const serverPath = path.join(nextPath, 'server.js');
    
    if (!require('fs').existsSync(serverPath)) {
      console.error('❌ Build standalone não encontrado. Execute: npm run build');
      reject(new Error('Standalone build not found'));
      return;
    }
    
    console.log('🚀 Iniciando servidor Next.js...');
    nextServer = spawn('node', [serverPath], {
      cwd: nextPath,
      env: {
        ...process.env,
        PORT: '3000',
        NODE_ENV: 'production',
      },
      stdio: 'inherit',
    });

    nextServer.on('error', (error) => {
      console.error('❌ Erro ao iniciar servidor Next.js:', error);
      reject(error);
    });

    // Aguardar servidor estar pronto
    const http = require('http');
    const checkServer = () => {
      const req = http.get('http://localhost:3000', (res) => {
        console.log('✅ Servidor Next.js iniciado');
        resolve();
      });
      req.on('error', () => {
        setTimeout(checkServer, 500);
      });
    };
    setTimeout(checkServer, 2000);
  });
}

// IPC Handlers
ipcMain.handle('select-downloads-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Selecione a pasta de downloads',
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

// Quando Electron estiver pronto
app.whenReady().then(async () => {
  try {
    await startNextServer();
    createWindow();
  } catch (error) {
    console.error('Erro ao iniciar aplicação:', error);
    app.quit();
  }
});

// Fechar todas as janelas quando todas estiverem fechadas (exceto macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (nextServer) {
      nextServer.kill();
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Encerrar processos ao sair
app.on('before-quit', () => {
  if (nextServer) {
    nextServer.kill();
  }
});

// Segurança: Prevenir novas janelas
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});
