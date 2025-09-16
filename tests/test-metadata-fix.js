const { exec } = require('child_process');
const { promisify } = require('util');
const { readdir, readFile } = require('fs/promises');
const { join } = require('path');

const execAsync = promisify(exec);

async function testMetadataFix() {
  console.log('🔧 TESTE DE CORREÇÃO DE METADADOS');
  console.log('==================================\n');

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

    // Contadores para estatísticas
    let totalFiles = 0;
    let filesWithBPM = 0;
    let filesWithKey = 0;
    let filesWithGenre = 0;
    let filesWithLabel = 0;
    let filesWithPublishedDate = 0;
    let filesWithAllMetadata = 0;

    // Testar uma amostra de arquivos
    const sampleSize = Math.min(10, audioFiles.length);
    const sampleFiles = audioFiles.slice(0, sampleSize);

    for (const file of sampleFiles) {
      const filePath = join(downloadsFolder, file);
      
      try {
        const { stdout } = await execAsync(
          `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
          { maxBuffer: 1024 * 1024 * 10 }
        );

        const info = JSON.parse(stdout);
        const tags = info.format?.tags || {};

        totalFiles++;

        // Verificar cada tipo de metadado
        const hasBPM = tags.bpm || tags.BPM || tags.TEMPO || tags.tempo;
        const hasKey = tags.key || tags.KEY || tags.initialKey || tags.INITIALKEY || tags.initialkey || tags.INITIAL_KEY;
        const hasGenre = tags.genre || tags.Genre || tags.GENRE;
        const hasLabel = tags.publisher || tags.Publisher || tags.label || tags.Label || tags.LABEL;
        const hasPublishedDate = tags.publisher_date || tags.PUBLISHER_DATE || tags.publishedDate || tags.PUBLISHED_DATE;

        if (hasBPM) filesWithBPM++;
        if (hasKey) filesWithKey++;
        if (hasGenre) filesWithGenre++;
        if (hasLabel) filesWithLabel++;
        if (hasPublishedDate) filesWithPublishedDate++;

        // Verificar se tem todos os metadados principais
        if (hasBPM && hasKey && hasGenre && hasLabel) {
          filesWithAllMetadata++;
        }

        // Mostrar detalhes para arquivos com problemas
        if (!hasLabel || !hasPublishedDate) {
          console.log(`\n⚠️ ARQUIVO COM PROBLEMAS: ${file}`);
          console.log(`   🏷️ Label: ${hasLabel ? '✅' : '❌'} ${hasLabel || 'NÃO ENCONTRADO'}`);
          console.log(`   📅 Published Date: ${hasPublishedDate ? '✅' : '❌'} ${hasPublishedDate || 'NÃO ENCONTRADO'}`);
          
          // Mostrar todas as tags disponíveis para debug
          console.log(`   📋 Tags disponíveis: ${Object.keys(tags).join(', ')}`);
        }

      } catch (error) {
        console.log(`❌ Erro ao processar ${file}: ${error.message}`);
      }
    }

    // Mostrar estatísticas
    console.log('\n📊 ESTATÍSTICAS DE METADADOS:');
    console.log('─'.repeat(50));
    console.log(`📁 Total de arquivos analisados: ${totalFiles}`);
    console.log(`💓 Arquivos com BPM: ${filesWithBPM} (${Math.round(filesWithBPM/totalFiles*100)}%)`);
    console.log(`🔑 Arquivos com Key: ${filesWithKey} (${Math.round(filesWithKey/totalFiles*100)}%)`);
    console.log(`🎭 Arquivos com Genre: ${filesWithGenre} (${Math.round(filesWithGenre/totalFiles*100)}%)`);
    console.log(`🏷️ Arquivos com Label: ${filesWithLabel} (${Math.round(filesWithLabel/totalFiles*100)}%)`);
    console.log(`📅 Arquivos com Published Date: ${filesWithPublishedDate} (${Math.round(filesWithPublishedDate/totalFiles*100)}%)`);
    console.log(`✨ Arquivos com todos os metadados: ${filesWithAllMetadata} (${Math.round(filesWithAllMetadata/totalFiles*100)}%)`);

    // Recomendações
    console.log('\n💡 RECOMENDAÇÕES:');
    console.log('─'.repeat(50));
    
    if (filesWithLabel < totalFiles * 0.8) {
      console.log('❌ Problema: Muitos arquivos sem Label');
      console.log('   → Verificar se o Beatport está retornando labels');
      console.log('   → Verificar se os labels estão sendo escritos corretamente');
    }
    
    if (filesWithPublishedDate < totalFiles * 0.5) {
      console.log('❌ Problema: Muitos arquivos sem Published Date');
      console.log('   → Verificar se o Beatport está retornando publishedDate');
      console.log('   → Verificar se o publishedDate está sendo escrito corretamente');
    }

    if (filesWithAllMetadata > totalFiles * 0.7) {
      console.log('✅ Bom: A maioria dos arquivos tem metadados completos');
    } else {
      console.log('⚠️ Melhorável: Poucos arquivos têm metadados completos');
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

// Executar o teste
testMetadataFix(); 