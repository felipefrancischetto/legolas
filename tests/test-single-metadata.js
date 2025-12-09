const { exec } = require('child_process');
const { promisify } = require('util');
const { readdir, readFile } = require('fs/promises');
const { join } = require('path');

const execAsync = promisify(exec);

async function testSingleFileMetadata() {
  console.log('🔍 TESTE DE METADADOS - ARQUIVO ESPECÍFICO');
  console.log('============================================\n');

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

    // Pegar um arquivo que tem dados do Beatport
    const testFile = audioFiles.find(file => file.includes('16BL') || file.includes('ANOTR') || file.includes('Truncate'));
    
    if (!testFile) {
      console.log('❌ Nenhum arquivo de teste encontrado');
      return;
    }

    const filePath = join(downloadsFolder, testFile);
    console.log(`📁 Testando arquivo: ${testFile}\n`);

    // 1. Extrair metadados brutos com ffprobe
    console.log('1️⃣ METADADOS BRUTOS (ffprobe):');
    console.log('─'.repeat(50));
    
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
      { maxBuffer: 1024 * 1024 * 10 }
    );

    const info = JSON.parse(stdout);
    const tags = info.format?.tags || {};

    console.log('📋 TODAS AS TAGS DISPONÍVEIS:');
    Object.keys(tags).forEach(key => {
      console.log(`   ${key}: "${tags[key]}"`);
    });

    console.log('\n2️⃣ METADADOS PROCESSADOS (API):');
    console.log('─'.repeat(50));

    // 2. Simular o processamento da API
    const artist = tags.artist || tags.ARTIST || 
                   tags.albumartist || tags.ALBUMARTIST || 
                   tags.performer || tags.PERFORMER || 
                   null;

    const bpm = tags.BPM || tags.bpm || tags.TEMPO || tags.tempo || null;
    const key = tags.key || tags.KEY || 
                tags.initialKey || tags.INITIALKEY || 
                tags.initialkey || tags.INITIAL_KEY || null;

    let genre = tags.genre || tags.Genre || tags.GENRE || null;
    if (genre) {
      const genreClean = genre.replace(/^\d+\s*\/?\s*/, '').trim();
      if (genreClean && genreClean !== genre) {
        genre = genreClean;
      }
    }

    const processedMetadata = {
      title: tags.title || tags.TITLE || null,
      artist: artist,
      bpm: bpm,
      key: key,
      genre: genre,
      album: tags.album || tags.Album || tags.ALBUM || null,
      label: tags.publisher || tags.Publisher || tags.label || tags.Label || tags.LABEL || null,
      ano: tags.year || tags.date || tags.YEAR || tags.DATE || null,
      publishedDate: tags.publisher_date || tags.PUBLISHER_DATE || tags.publishedDate || tags.PUBLISHED_DATE || null
    };

    console.log('📋 METADADOS PROCESSADOS:');
    Object.keys(processedMetadata).forEach(key => {
      const value = processedMetadata[key];
      const status = value ? '✅' : '❌';
      console.log(`   ${status} ${key}: ${value || 'NÃO ENCONTRADO'}`);
    });

    // 3. Verificar se há problemas específicos
    console.log('\n3️⃣ ANÁLISE DE PROBLEMAS:');
    console.log('─'.repeat(50));

    // Verificar se o label está sendo extraído corretamente
    const hasLabel = tags.publisher || tags.Publisher || tags.label || tags.Label || tags.LABEL;
    console.log(`🏷️ Label encontrado: ${hasLabel ? '✅ SIM' : '❌ NÃO'}`);
    if (hasLabel) {
      console.log(`   Label value: "${hasLabel}"`);
    }

    // Verificar se o publishedDate está sendo extraído
    const hasPublishedDate = tags.publisher_date || tags.PUBLISHER_DATE || tags.publishedDate || tags.PUBLISHED_DATE;
    console.log(`📅 Published Date encontrado: ${hasPublishedDate ? '✅ SIM' : '❌ NÃO'}`);
    if (hasPublishedDate) {
      console.log(`   Published Date value: "${hasPublishedDate}"`);
    }

    // Verificar se há tags adicionais que podem conter informações úteis
    const additionalTags = Object.keys(tags).filter(key => 
      !['title', 'artist', 'album', 'genre', 'bpm', 'key', 'date', 'year', 'publisher', 'label', 'publisher_date', 'publishedDate'].includes(key.toLowerCase())
    );
    
    if (additionalTags.length > 0) {
      console.log(`\n🔍 TAGS ADICIONAIS QUE PODEM CONTER INFORMAÇÕES:`);
      additionalTags.forEach(tag => {
        console.log(`   ${tag}: "${tags[tag]}"`);
      });
    }

    // 4. Verificar se há problemas na escrita de metadados
    console.log('\n4️⃣ VERIFICAÇÃO DE ESCRITA DE METADADOS:');
    console.log('─'.repeat(50));

    // Verificar se o arquivo tem metadados do Beatport
    const hasBeatportData = tags.bpm || tags.BPM || tags.initialKey || tags.initialkey || tags.key || tags.KEY;
    console.log(`🎯 Dados Beatport: ${hasBeatportData ? '✅ SIM' : '❌ NÃO'}`);

    if (hasBeatportData) {
      console.log('   ✅ O arquivo tem metadados do Beatport');
      console.log('   ✅ A extração está funcionando');
    } else {
      console.log('   ❌ O arquivo não tem metadados do Beatport');
      console.log('   ❌ Pode haver problema na busca ou escrita de metadados');
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

// Executar o teste
testSingleFileMetadata(); 