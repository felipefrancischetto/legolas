#!/usr/bin/env node

/**
 * Script para verificar se o ambiente está configurado corretamente
 * para rodar o Legolas
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkCommand(command, name) {
  try {
    execSync(command, { stdio: 'ignore' });
    log('green', `✅ ${name} encontrado`);
    return true;
  } catch (error) {
    log('red', `❌ ${name} não encontrado`);
    return false;
  }
}

function checkFile(filePath, name) {
  if (fs.existsSync(filePath)) {
    log('green', `✅ ${name} encontrado`);
    return true;
  } else {
    log('red', `❌ ${name} não encontrado`);
    return false;
  }
}

function getVersion(command, name) {
  try {
    const version = execSync(command, { encoding: 'utf-8' }).trim();
    log('blue', `   Versão: ${version}`);
    return true;
  } catch (error) {
    return false;
  }
}

console.log('\n🔍 Verificando ambiente do Legolas...\n');

let allOk = true;

// Verificar Node.js
log('blue', '📦 Node.js:');
if (checkCommand('node --version', 'Node.js')) {
  getVersion('node --version', 'Node.js');
  const nodeVersion = parseInt(process.version.slice(1).split('.')[0]);
  if (nodeVersion < 18) {
    log('yellow', '   ⚠️  Recomendado Node.js 18+');
    allOk = false;
  }
} else {
  allOk = false;
}

// Verificar npm
log('blue', '\n📦 npm:');
if (checkCommand('npm --version', 'npm')) {
  getVersion('npm --version', 'npm');
} else {
  allOk = false;
}

// Verificar FFmpeg
log('blue', '\n🎬 FFmpeg:');
if (checkCommand('ffmpeg -version', 'FFmpeg')) {
  getVersion('ffmpeg -version 2>&1 | head -n 1', 'FFmpeg');
} else {
  log('yellow', '   ⚠️  FFmpeg necessário para processamento de áudio');
  allOk = false;
}

// Verificar Chrome/Chromium (para Puppeteer)
log('blue', '\n🌐 Chrome/Chromium (Puppeteer):');
const chromePaths = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

let chromeFound = false;
for (const chromePath of chromePaths) {
  if (chromePath && fs.existsSync(chromePath)) {
    log('green', `✅ Chrome encontrado em: ${chromePath}`);
    chromeFound = true;
    break;
  }
}

if (!chromeFound) {
  log('yellow', '   ⚠️  Chrome necessário para scraping (Puppeteer)');
  // Não marca como erro porque pode ser instalado depois
}

// Verificar dependências do projeto
log('blue', '\n📚 Dependências do projeto:');
if (checkFile('package.json', 'package.json')) {
  if (checkFile('node_modules', 'node_modules')) {
    log('green', '✅ node_modules instalado');
  } else {
    log('yellow', '⚠️  Execute: npm install');
    allOk = false;
  }
} else {
  allOk = false;
}

// Verificar arquivo de configuração
log('blue', '\n⚙️  Configurações:');
if (checkFile('downloads.config.json', 'downloads.config.json')) {
  try {
    const config = JSON.parse(fs.readFileSync('downloads.config.json', 'utf-8'));
    if (config.path) {
      log('green', `✅ Caminho de downloads: ${config.path}`);
      if (!fs.existsSync(config.path)) {
        log('yellow', `   ⚠️  Diretório não existe, será criado automaticamente`);
      }
    } else {
      log('yellow', '   ⚠️  Caminho de downloads não configurado');
    }
  } catch (error) {
    log('red', '   ❌ Erro ao ler downloads.config.json');
  }
} else {
  log('yellow', '   ⚠️  downloads.config.json não encontrado');
}

// Verificar variáveis de ambiente
log('blue', '\n🔐 Variáveis de ambiente:');
const envFile = '.env.local';
if (checkFile(envFile, '.env.local')) {
  log('green', '✅ Arquivo .env.local encontrado');
} else {
  log('yellow', `   ⚠️  Arquivo .env.local não encontrado (opcional)`);
  log('yellow', `   💡 Copie .env.example para .env.local e configure`);
}

// Verificar build
log('blue', '\n🏗️  Build:');
if (checkFile('.next', '.next')) {
  log('green', '✅ Build encontrado');
} else {
  log('yellow', '   ⚠️  Execute: npm run build');
}

// Resumo
console.log('\n' + '='.repeat(50));
if (allOk) {
  log('green', '\n✅ Ambiente configurado corretamente!');
  log('green', '🚀 Você pode executar: npm run dev');
} else {
  log('yellow', '\n⚠️  Algumas verificações falharam');
  log('yellow', '📖 Consulte INFRASTRUCTURE.md para mais informações');
}
console.log('='.repeat(50) + '\n');
