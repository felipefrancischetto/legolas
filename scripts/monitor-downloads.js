const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Configurações
const DOWNLOADS_CONFIG_PATH = './downloads.config.json';
const CHECK_INTERVAL = 5000; // 5 segundos
const LOG_PREFIX = '🎵 [Monitor]';

let lastDownloadsPath = '';
let isMonitoring = false;

// Função para obter o caminho de downloads
function getDownloadsPath() {
  try {
    if (fs.existsSync(DOWNLOADS_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(DOWNLOADS_CONFIG_PATH, 'utf-8'));
      return config.downloadsPath || './downloads';
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Erro ao ler config:`, error.message);
  }
  return './downloads';
}

// Função para verificar se a pasta existe e criar se necessário
async function ensureDownloadsFolder(downloadsPath) {
  try {
    if (!fs.existsSync(downloadsPath)) {
      fs.mkdirSync(downloadsPath, { recursive: true });
      console.log(`${LOG_PREFIX} Pasta de downloads criada: ${downloadsPath}`);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Erro ao criar pasta:`, error.message);
  }
}

// Função para monitorar mudanças na pasta de downloads
function monitorDownloads() {
  const downloadsPath = getDownloadsPath();
  
  if (downloadsPath !== lastDownloadsPath) {
    console.log(`${LOG_PREFIX} Caminho de downloads: ${downloadsPath}`);
    lastDownloadsPath = downloadsPath;
  }

  ensureDownloadsFolder(downloadsPath);

  if (!isMonitoring) {
    isMonitoring = true;
    
    // Monitorar mudanças na pasta
    try {
      const watcher = fs.watch(downloadsPath, { recursive: false }, (eventType, filename) => {
        if (filename && (filename.endsWith('.mp3') || filename.endsWith('.flac'))) {
          console.log(`${LOG_PREFIX} ${eventType === 'rename' ? 'Arquivo adicionado' : 'Arquivo modificado'}: ${filename}`);
        }
      });

      console.log(`${LOG_PREFIX} Monitoramento ativo em: ${downloadsPath}`);
      
      // Cleanup quando o processo terminar
      process.on('SIGINT', () => {
        console.log(`\n${LOG_PREFIX} Encerrando monitoramento...`);
        watcher.close();
        process.exit(0);
      });
      
    } catch (error) {
      console.error(`${LOG_PREFIX} Erro ao iniciar monitoramento:`, error.message);
    }
  }
}

// Função para verificar se o servidor está rodando
function checkServerHealth() {
  exec('curl -s http://localhost:3000/api/health', (error, stdout, stderr) => {
    if (error) {
      console.log(`${LOG_PREFIX} Servidor não está respondendo - aguardando...`);
    } else {
      console.log(`${LOG_PREFIX} ✅ Servidor ativo e saudável`);
    }
  });
}

// Iniciar monitoramento
console.log(`${LOG_PREFIX} Iniciando monitor de downloads...`);

// Verificar servidor a cada 30 segundos
setInterval(checkServerHealth, 30000);

// Monitorar downloads a cada 5 segundos
setInterval(monitorDownloads, CHECK_INTERVAL);

// Primeira verificação imediata
monitorDownloads();
checkServerHealth();

console.log(`${LOG_PREFIX} Monitor ativo - Ctrl+C para parar`); 