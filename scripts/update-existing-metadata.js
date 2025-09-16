const { exec } = require('child_process');
const { promisify } = require('util');
const { readdir, readFile } = require('fs/promises');
const { join } = require('path');
const fetch = require('node-fetch');

const execAsync = promisify(exec);

async function updateExistingMetadata() {
  console.log('🔄 ATUALIZAÇÃO DE METADADOS EXISTENTES');
  console.log('========================================\n');

  try {
    // Ler configuração de downloads
    const configPath = join(__dirname, 'downloads.config.json');
    const configData = JSON.parse(await readFile(configPath, 'utf-8'));
    const downloadsFolder = configData.downloadsPath || './downloads';

    // Listar arquivos de áudio
    const files = await readdir(downloadsFolder);
    const audioFiles = files.filter(file => 
      file.toLowerCase().endsWith('.mp3') || file.toLowerCase().endsWith('.flac')
    );

    console.log(`📁 Pasta de downloads: ${downloadsFolder}`);
    console.log(`🎵 Total de arquivos de áudio: ${audioFiles.length}\n`);

    // Contadores
    let processedFiles = 0;
    let updatedFiles = 0;
    let errors = 0;

    // Processar uma amostra de arquivos (máximo 10 para teste)
    const sampleFiles = audioFiles.slice(0, 10);

    for (const file of sampleFiles) {
      const filePath = join(downloadsFolder, file);
      
      try {
        console.log(`\n📁 Processando: ${file}`);
        console.log('─'.repeat(50));

        // 1. Extrair metadados atuais
        const { stdout: currentMetadata } = await execAsync(
          `ffprobe -v quiet -print_format json -show_format "${filePath}"`,
          { maxBuffer: 1024 * 1024 * 10 }
        );

        const currentInfo = JSON.parse(currentMetadata);
        const currentTags = currentInfo.format?.tags || {};

        // 2. Verificar se já tem label e publishedDate
        const hasLabel = currentTags.publisher || currentTags.Publisher || currentTags.label || currentTags.Label || currentTags.LABEL;
        const hasPublishedDate = currentTags.publisher_date || currentTags.PUBLISHER_DATE || currentTags.publishedDate || currentTags.PUBLISHED_DATE;

        if (hasLabel && hasPublishedDate) {
          console.log('✅ Arquivo já tem label e publishedDate, pulando...');
          processedFiles++;
          continue;
        }

        // 3. Extrair título e artista para busca
        const title = currentTags.title || currentTags.TITLE || file.replace(/\.(mp3|flac)$/i, '');
        const artist = currentTags.artist || currentTags.ARTIST || '';

        console.log(`   📋 Título: "${title}"`);
        console.log(`   🎤 Artista: "${artist}"`);

        // 4. Buscar metadados no Beatport
        console.log('   🔍 Buscando metadados no Beatport...');
        
        const response = await fetch('http://localhost:3000/api/enhanced-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title,
            artist: artist,
            useBeatport: true
          })
        });

        if (!response.ok) {
          console.log(`   ❌ Erro na API: ${response.status}`);
          errors++;
          continue;
        }

        const result = await response.json();
        
        if (!result.success || !result.metadata) {
          console.log('   ❌ Nenhum metadado retornado');
          errors++;
          continue;
        }

        const metadata = result.metadata;
        
        // 5. Verificar se encontrou dados úteis
        const hasUsefulData = metadata.bpm || metadata.key || metadata.genre || metadata.label || metadata.publishedDate;
        
        if (!hasUsefulData) {
          console.log('   ❌ Nenhum dado útil encontrado');
          errors++;
          continue;
        }

        console.log('   ✅ Metadados encontrados:');
        console.log(`      • Label: ${metadata.label || 'N/A'}`);
        console.log(`      • Published Date: ${metadata.publishedDate || 'N/A'}`);
        console.log(`      • BPM: ${metadata.bpm || 'N/A'}`);
        console.log(`      • Key: ${metadata.key || 'N/A'}`);

        // 6. Atualizar metadados no arquivo
        console.log('   ✍️ Atualizando metadados no arquivo...');
        
        const escapeValue = (value) => {
          if (!value) return '';
          return value
            .replace(/"/g, '\\"')
            .replace(/\$/g, '\\$')
            .replace(/`/g, '\\`')
            .replace(/&/g, '\\&')
            .replace(/\|/g, '\\|')
            .replace(/;/g, '\\;')
            .replace(/</g, '\\<')
            .replace(/>/g, '\\>')
            .replace(/:/g, '\\:')
            .replace(/\*/g, '\\*')
            .replace(/\?/g, '\\?')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]')
            .trim();
        };

        // Criar arquivo temporário
        const tempFile = filePath.replace(/\.(mp3|flac)$/i, '_temp.$1');
        
        let ffmpegCmd = `ffmpeg -y -i "${filePath}" -c copy`;
        
        // Manter metadados existentes e adicionar novos
        if (metadata.label) {
          ffmpegCmd += ` -metadata "publisher=${escapeValue(metadata.label)}"`;
          ffmpegCmd += ` -metadata "label=${escapeValue(metadata.label)}"`;
        }
        if (metadata.publishedDate) {
          ffmpegCmd += ` -metadata "publisher_date=${escapeValue(metadata.publishedDate)}"`;
        }
        if (metadata.bpm && !currentTags.bpm) {
          ffmpegCmd += ` -metadata "bpm=${metadata.bpm}"`;
        }
        if (metadata.key && !currentTags.key) {
          ffmpegCmd += ` -metadata "initialkey=${escapeValue(metadata.key)}"`;
        }
        if (metadata.genre && !currentTags.genre) {
          ffmpegCmd += ` -metadata "genre=${escapeValue(metadata.genre)}"`;
        }
        
        ffmpegCmd += ` "${tempFile}"`;

        try {
          await execAsync(ffmpegCmd, { maxBuffer: 1024 * 1024 * 50 });
          
          // Substituir arquivo original
          const { rename } = require('fs/promises');
          await rename(tempFile, filePath);
          
          console.log('   ✅ Metadados atualizados com sucesso!');
          updatedFiles++;
          
        } catch (ffmpegError) {
          console.log(`   ❌ Erro ao atualizar metadados: ${ffmpegError.message}`);
          errors++;
          
          // Limpar arquivo temporário se existir
          try {
            const { unlink } = require('fs/promises');
            await unlink(tempFile);
          } catch (e) {
            // Ignorar erro de limpeza
          }
        }

        processedFiles++;

        // Aguardar um pouco entre as requisições para não sobrecarregar o Beatport
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`   ❌ Erro ao processar arquivo: ${error.message}`);
        errors++;
      }
    }

    // Resumo final
    console.log('\n📊 RESUMO FINAL:');
    console.log('─'.repeat(50));
    console.log(`📁 Arquivos processados: ${processedFiles}`);
    console.log(`✅ Arquivos atualizados: ${updatedFiles}`);
    console.log(`❌ Erros: ${errors}`);
    console.log(`📈 Taxa de sucesso: ${Math.round((updatedFiles/processedFiles)*100)}%`);

    if (updatedFiles > 0) {
      console.log('\n🎉 SUCESSO: Metadados atualizados em alguns arquivos!');
      console.log('   → Os arquivos agora têm label e publishedDate');
      console.log('   → Execute o teste novamente para verificar');
    } else {
      console.log('\n⚠️ Nenhum arquivo foi atualizado');
      console.log('   → Verificar se os arquivos já têm os metadados');
      console.log('   → Verificar se há problemas na busca do Beatport');
    }

  } catch (error) {
    console.error('❌ Erro no script:', error.message);
  }
}

// Executar o script
updateExistingMetadata(); 