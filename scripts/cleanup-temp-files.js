/**
 * Script para limpar arquivos temporários deixados por downloads falhos
 * Remove arquivos .webm, .mp4, .temp.*, *-Frag* que podem estar bloqueando novos downloads
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);

// Configurações
const DOWNLOADS_CONFIG_PATH = './downloads.config.json';
const TEMP_PATTERNS = [
  /\.webm$/i,
  /\.mp4$/i,
  /\.temp\./i,
  /-Frag\d+/i,
  /\.part$/i,
  /\.ytdl$/i
];

// Arquivos que devem ser mantidos (arquivos FLAC finais)
const KEEP_PATTERNS = [
  /\.flac$/i,
  /\.mp3$/i,
  /\.m4a$/i
];

function getDownloadsPath() {
  try {
    if (fs.existsSync(DOWNLOADS_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(DOWNLOADS_CONFIG_PATH, 'utf-8'));
      // O arquivo usa 'path' ao invés de 'downloadsPath'
      const configPath = config.path || config.downloadsPath;
      if (configPath) {
        return path.join(process.cwd(), configPath);
      }
    }
  } catch (error) {
    console.warn(`⚠️ Erro ao ler config: ${error.message}`);
  }
  return path.join(process.cwd(), 'downloads');
}

function isTempFile(filename) {
  // Se é um arquivo final (FLAC, MP3, etc), manter
  if (KEEP_PATTERNS.some(pattern => pattern.test(filename))) {
    return false;
  }
  
  // Verificar se corresponde a algum padrão de arquivo temporário
  return TEMP_PATTERNS.some(pattern => pattern.test(filename));
}

async function cleanupTempFiles(downloadsPath) {
  console.log(`\n🧹 Limpando arquivos temporários em: ${downloadsPath}\n`);
  
  try {
    const files = await readdir(downloadsPath);
    let cleaned = 0;
    let errors = 0;
    let totalSize = 0;
    
    for (const file of files) {
      if (isTempFile(file)) {
        const filePath = path.join(downloadsPath, file);
        
        try {
          const stats = await stat(filePath);
          const sizeMB = stats.size / (1024 * 1024);
          totalSize += stats.size;
          
          // Verificar idade do arquivo (manter arquivos muito recentes, < 1 minuto)
          const age = Date.now() - stats.mtimeMs;
          const ageMinutes = Math.floor(age / 60000);
          
          if (age < 60000) {
            console.log(`⏳ Mantendo arquivo recente: ${file} (${ageMinutes} min atrás)`);
            continue;
          }
          
          await unlink(filePath);
          console.log(`✅ Removido: ${file} (${sizeMB.toFixed(2)} MB, ${ageMinutes} min atrás)`);
          cleaned++;
        } catch (error) {
          if (error.code === 'ENOENT') {
            // Arquivo já foi removido, ignorar
            continue;
          } else if (error.code === 'EBUSY' || error.code === 'EPERM') {
            console.log(`⚠️ Arquivo em uso (será tentado novamente): ${file}`);
            errors++;
          } else {
            console.error(`❌ Erro ao remover ${file}: ${error.message}`);
            errors++;
          }
        }
      }
    }
    
    const totalSizeMB = totalSize / (1024 * 1024);
    console.log(`\n📊 Resumo:`);
    console.log(`   ✅ Arquivos removidos: ${cleaned}`);
    console.log(`   ⚠️ Erros: ${errors}`);
    console.log(`   💾 Espaço liberado: ${totalSizeMB.toFixed(2)} MB`);
    
    return { cleaned, errors, totalSizeMB };
  } catch (error) {
    console.error(`❌ Erro ao listar arquivos: ${error.message}`);
    throw error;
  }
}

async function main() {
  const downloadsPath = getDownloadsPath();
  
  if (!fs.existsSync(downloadsPath)) {
    console.error(`❌ Pasta de downloads não encontrada: ${downloadsPath}`);
    process.exit(1);
  }
  
  console.log(`📁 Pasta de downloads: ${path.resolve(downloadsPath)}`);
  
  try {
    await cleanupTempFiles(downloadsPath);
    console.log(`\n✅ Limpeza concluída!`);
  } catch (error) {
    console.error(`\n❌ Erro durante limpeza: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { cleanupTempFiles, isTempFile };

