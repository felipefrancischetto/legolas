const { readdir, readFile, stat, rename, mkdir } = require('fs/promises');
const { join } = require('path');
const { existsSync } = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Verifica se um arquivo foi normalizado pelo Beatport
 */
async function checkBeatportNormalization(filePath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format "${filePath}"`,
      { maxBuffer: 1024 * 1024 * 10 }
    );

    const info = JSON.parse(stdout);
    const tags = info.format?.tags || {};
    
    // Extrair label, BPM e genre
    const label = tags.publisher || tags.Publisher || tags.label || tags.Label || tags.LABEL || null;
    const bpm = tags.BPM || tags.bpm || null;
    const genre = tags.genre || tags.Genre || tags.GENRE || null;
    
    // Verificar se realmente veio do Beatport verificando o campo comment
    const comment = tags.comment || tags.COMMENT || null;
    let hasBeatportSource = false;
    if (comment && comment.includes('Sources:')) {
      hasBeatportSource = comment.includes('Beatport') || comment.includes('BeatportV2');
    }
    
    // Determinar se o arquivo passou pelo Beatport
    // Padrão Beatport completo precisa ter: Label, BPM, Genre E confirmação de fonte Beatport
    // Nota: Catalog number não é obrigatório, mas é um bom indicador quando presente
    const hasRequiredMetadata = !!(label && bpm && genre);
    const isBeatportFormat = hasRequiredMetadata && hasBeatportSource;
    
    return isBeatportFormat;
  } catch (error) {
    console.error(`Erro ao verificar normalização do arquivo ${filePath}:`, error);
    return false;
  }
}

/**
 * Move um arquivo para a pasta nao-normalizadas
 */
async function moveToNonNormalizedFolder(filePath, fileName, downloadsFolder) {
  try {
    // Verificar se o arquivo já está na pasta nao-normalizadas
    if (filePath.includes('nao-normalizadas')) {
      return { success: true, message: 'Arquivo já está na pasta nao-normalizadas' };
    }

    // Criar pasta nao-normalizadas se não existir
    const naoNormalizadasDir = join(downloadsFolder, 'nao-normalizadas');
    if (!existsSync(naoNormalizadasDir)) {
      await mkdir(naoNormalizadasDir, { recursive: true });
      console.log(`✅ Pasta nao-normalizadas criada: ${naoNormalizadasDir}`);
    }

    // Caminho de destino
    let newFilePath = join(naoNormalizadasDir, fileName);

    // Se já existe um arquivo com o mesmo nome, adicionar timestamp
    if (existsSync(newFilePath)) {
      const timestamp = Date.now();
      const fileExt = fileName.substring(fileName.lastIndexOf('.'));
      const fileBase = fileName.substring(0, fileName.lastIndexOf('.'));
      const newFileNameWithTimestamp = `${fileBase}_${timestamp}${fileExt}`;
      newFilePath = join(naoNormalizadasDir, newFileNameWithTimestamp);
      console.log(`⚠️ Arquivo já existe, usando nome com timestamp: ${newFileNameWithTimestamp}`);
    }

    // Mover arquivo
    let attempts = 0;
    const maxAttempts = 5;
    const delayBetweenAttempts = 800;

    while (attempts < maxAttempts) {
      try {
        await rename(filePath, newFilePath);
        return { success: true, message: `Arquivo movido: ${fileName}` };
      } catch (renameErr) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw renameErr;
        }
        await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
      }
    }

    return { success: false, message: 'Erro ao mover arquivo' };
  } catch (error) {
    console.error(`Erro ao mover arquivo ${fileName}:`, error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
}

async function organizeExistingFiles() {
  console.log('🔄 ORGANIZANDO ARQUIVOS EXISTENTES');
  console.log('==================================\n');

  try {
    // Ler configuração de downloads
    const configPath = join(__dirname, '..', 'downloads.config.json');
    let downloadsFolder;
    
    try {
      const configData = JSON.parse(await readFile(configPath, 'utf-8'));
      // Pode ser 'path' ou 'downloadsPath'
      const configPathValue = configData.path || configData.downloadsPath || 'downloads';
      
      // Se for caminho absoluto, usar diretamente
      if (configPathValue.match(/^[A-Z]:/) || configPathValue.startsWith('/')) {
        downloadsFolder = configPathValue;
      } else {
        // Caminho relativo - resolver a partir do diretório do projeto
        downloadsFolder = join(process.cwd(), configPathValue);
      }
    } catch (err) {
      downloadsFolder = join(process.cwd(), 'downloads');
    }

    console.log(`📁 Pasta de downloads: ${downloadsFolder}\n`);

    // Listar arquivos na pasta principal
    let files = [];
    try {
      files = await readdir(downloadsFolder);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.error('❌ Pasta de downloads não encontrada');
        return;
      }
      throw err;
    }

    // Filtrar apenas arquivos de áudio
    const audioFiles = files.filter(file => {
      const fileNameLower = file.toLowerCase();
      // Excluir arquivos que já estão em pastas especiais
      if (fileNameLower.startsWith('[excluir]_')) return false;
      // Excluir pastas
      try {
        const filePath = join(downloadsFolder, file);
        if (!existsSync(filePath)) return false;
        const stats = require('fs').statSync(filePath);
        if (stats.isDirectory()) return false;
      } catch {
        return false;
      }
      return fileNameLower.endsWith('.mp3') || fileNameLower.endsWith('.flac');
    });

    console.log(`📊 Total de arquivos de áudio encontrados: ${audioFiles.length}\n`);

    const results = {
      total: audioFiles.length,
      moved: 0,
      alreadyNormalized: 0,
      errors: 0,
      details: []
    };

    // Processar cada arquivo
    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      const filePath = join(downloadsFolder, file);
      
      console.log(`[${i + 1}/${audioFiles.length}] Processando: ${file}`);
      
      try {
        // Verificar se está normalizado pelo Beatport
        const isNormalized = await checkBeatportNormalization(filePath);
        
        if (isNormalized) {
          results.alreadyNormalized++;
          results.details.push({
            fileName: file,
            status: 'normalized',
            message: 'Arquivo já está normalizado pelo Beatport'
          });
          console.log(`   ✅ Normalizado pelo Beatport\n`);
        } else {
          // Mover para pasta nao-normalizadas
          const moveResult = await moveToNonNormalizedFolder(filePath, file, downloadsFolder);
          
          if (moveResult.success) {
            results.moved++;
            results.details.push({
              fileName: file,
              status: 'moved',
              message: moveResult.message
            });
            console.log(`   📁 ${moveResult.message}\n`);
          } else {
            results.errors++;
            results.details.push({
              fileName: file,
              status: 'error',
              message: moveResult.message
            });
            console.log(`   ❌ Erro: ${moveResult.message}\n`);
          }
        }
      } catch (error) {
        results.errors++;
        results.details.push({
          fileName: file,
          status: 'error',
          message: error instanceof Error ? error.message : 'Erro desconhecido'
        });
        console.log(`   ❌ Erro ao processar: ${error.message}\n`);
      }
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('📊 RESUMO DA ORGANIZAÇÃO');
    console.log('═══════════════════════════════════════════════════');
    console.log(`   Total processado: ${results.total}`);
    console.log(`   ✅ Movidos para nao-normalizadas: ${results.moved}`);
    console.log(`   ✅ Já normalizados: ${results.alreadyNormalized}`);
    console.log(`   ❌ Erros: ${results.errors}`);
    console.log('═══════════════════════════════════════════════════\n');

    if (results.moved > 0) {
      console.log(`✅ ${results.moved} arquivo(s) foram movidos para a pasta 'nao-normalizadas'`);
      console.log('   Os arquivos continuarão aparecendo na lista de músicas.\n');
    }

  } catch (error) {
    console.error('❌ Erro ao organizar arquivos:', error);
    process.exit(1);
  }
}

// Executar
organizeExistingFiles().then(() => {
  console.log('✅ Processo concluído!');
  process.exit(0);
}).catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
