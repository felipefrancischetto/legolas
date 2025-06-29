#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configurações
const LOG_PREFIX = '🎵 [Legolas]';
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Cores para logs
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorLog(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Verificar se as dependências estão instaladas
function checkDependencies() {
  colorLog('blue', `${LOG_PREFIX} Verificando dependências...`);
  
  if (!fs.existsSync('node_modules')) {
    colorLog('red', `${LOG_PREFIX} ❌ node_modules não encontrado. Execute: npm install`);
    process.exit(1);
  }
  
  colorLog('green', `${LOG_PREFIX} ✅ Dependências verificadas`);
}

// Verificar/criar pasta de downloads
function ensureDownloadsFolder() {
  let downloadsPath = './downloads';
  
  try {
    if (fs.existsSync('./downloads.config.json')) {
      const config = JSON.parse(fs.readFileSync('./downloads.config.json', 'utf-8'));
      downloadsPath = config.downloadsPath || './downloads';
    }
  } catch (error) {
    colorLog('yellow', `${LOG_PREFIX} ⚠️ Usando pasta padrão: ./downloads`);
  }
  
  if (!fs.existsSync(downloadsPath)) {
    fs.mkdirSync(downloadsPath, { recursive: true });
    colorLog('green', `${LOG_PREFIX} ✅ Pasta criada: ${downloadsPath}`);
  }
  
  return downloadsPath;
}

// Configurar variáveis de ambiente
function setupEnvironment() {
  colorLog('blue', `${LOG_PREFIX} Configurando ambiente...`);
  
  // Configurações específicas para audio streaming
  process.env.NEXT_TELEMETRY_DISABLED = '1';
  process.env.NODE_OPTIONS = '--max-old-space-size=4096';
  
  if (NODE_ENV === 'development') {
    process.env.NEXT_PRIVATE_STANDALONE = 'true';
  }
  
  colorLog('green', `${LOG_PREFIX} ✅ Ambiente configurado (${NODE_ENV})`);
}

// Iniciar aplicação
function startApplication() {
  colorLog('magenta', `${LOG_PREFIX} Iniciando Legolas Audio Player...`);
  colorLog('cyan', `${LOG_PREFIX} Porta: ${PORT}`);
  colorLog('cyan', `${LOG_PREFIX} Ambiente: ${NODE_ENV}`);
  
  const downloadsPath = ensureDownloadsFolder();
  colorLog('cyan', `${LOG_PREFIX} Downloads: ${downloadsPath}`);
  
  // Comando para iniciar o Next.js
  const command = NODE_ENV === 'development' ? 'npm' : 'npm';
  const args = NODE_ENV === 'development' 
    ? ['run', 'dev:audio'] 
    : ['run', 'start:audio'];
  
  colorLog('blue', `${LOG_PREFIX} Executando: ${command} ${args.join(' ')}`);
  
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      PORT: PORT.toString()
    }
  });
  
  child.on('error', (error) => {
    colorLog('red', `${LOG_PREFIX} ❌ Erro ao iniciar: ${error.message}`);
    process.exit(1);
  });
  
  child.on('exit', (code) => {
    if (code !== 0) {
      colorLog('red', `${LOG_PREFIX} ❌ Processo encerrado com código: ${code}`);
    } else {
      colorLog('green', `${LOG_PREFIX} ✅ Aplicação encerrada normalmente`);
    }
    process.exit(code);
  });
  
  // Handlers para encerramento gracioso
  process.on('SIGINT', () => {
    colorLog('yellow', `\n${LOG_PREFIX} Encerrando aplicação...`);
    child.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    colorLog('yellow', `\n${LOG_PREFIX} Encerrando aplicação...`);
    child.kill('SIGTERM');
  });
  
  return child;
}

// Função principal
function main() {
  colorLog('bright', `
╔═══════════════════════════════════════╗
║           🎵 LEGOLAS PLAYER           ║
║      YouTube Audio Downloader        ║
╚═══════════════════════════════════════╝
  `);
  
  try {
    checkDependencies();
    setupEnvironment();
    startApplication();
    
    colorLog('green', `${LOG_PREFIX} 🚀 Aplicação iniciada com sucesso!`);
    colorLog('cyan', `${LOG_PREFIX} 🌐 Acesse: http://localhost:${PORT}`);
    
  } catch (error) {
    colorLog('red', `${LOG_PREFIX} ❌ Erro fatal: ${error.message}`);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = { main, startApplication }; 