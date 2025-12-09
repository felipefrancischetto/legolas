const { exec } = require('child_process');
const { promisify } = require('util');
const { readdir, readFile } = require('fs/promises');
const { join } = require('path');

const execAsync = promisify(exec);

async function testMetadataWriting() {
  console.log('✍️ TESTE DE ESCRITA DE METADADOS');
  console.log('==================================\n');

  try {
    // Ler configuração de downloads
    const configPath = join(__dirname, 'downloads.config.json');
    const configData = JSON.parse(await readFile(configPath, 'utf-8'));
    const downloadsFolder = configData.downloadsPath || './downloads';

    // Encontrar um arquivo para testar
    const files = await readdir(downloadsFolder);
    const testFile = files.find(file => file.includes('16BL') && file.endsWith('.mp3'));
    
    if (!testFile) {
      console.log('❌ Arquivo de teste não encontrado');
      return;
    }

    const filePath = join(downloadsFolder, testFile);
    console.log(`📁 Testando arquivo: ${testFile}\n`);

    // 1. Verificar metadados atuais
    console.log('1️⃣ METADADOS ATUAIS:');
    console.log('─'.repeat(50));
    
    const { stdout: currentMetadata } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format "${filePath}"`,
      { maxBuffer: 1024 * 1024 * 10 }
    );

    const currentInfo = JSON.parse(currentMetadata);
    const currentTags = currentInfo.format?.tags || {};

    console.log('📋 TAGS ATUAIS:');
    Object.keys(currentTags).forEach(key => {
      console.log(`   ${key}: "${currentTags[key]}"`);
    });

    // 2. Simular escrita de metadados
    console.log('\n2️⃣ SIMULANDO ESCRITA DE METADADOS:');
    console.log('─'.repeat(50));

    const testMetadata = {
      title: 'Test Title',
      artist: 'Test Artist',
      album: 'Test Album',
      year: '2024',
      genre: 'Test Genre',
      label: 'Test Label',
      bpm: '128',
      key: 'C Major',
      publishedDate: '2024-01-15'
    };

    console.log('📝 Metadados que serão escritos:');
    Object.keys(testMetadata).forEach(key => {
      console.log(`   ${key}: "${testMetadata[key]}"`);
    });

    // 3. Criar arquivo de teste
    const testFilePath = filePath.replace('.mp3', '_test.mp3');
    console.log(`\n📁 Criando arquivo de teste: ${testFilePath}`);

    // Copiar arquivo original
    await execAsync(`copy "${filePath}" "${testFilePath}"`);

    // 4. Escrever metadados usando FFmpeg
    console.log('\n3️⃣ ESCREVENDO METADADOS COM FFMPEG:');
    console.log('─'.repeat(50));

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

    let ffmpegCmd = `ffmpeg -y -i "${testFilePath}" -c copy`; 
    ffmpegCmd += ` -metadata "title=${escapeValue(testMetadata.title)}"`;
    ffmpegCmd += ` -metadata "artist=${escapeValue(testMetadata.artist)}"`;
    ffmpegCmd += ` -metadata "album=${escapeValue(testMetadata.album)}"`;
    ffmpegCmd += ` -metadata "date=${testMetadata.year}"`;
    ffmpegCmd += ` -metadata "publisher_date=${escapeValue(testMetadata.publishedDate)}"`;
    ffmpegCmd += ` -metadata "genre=${escapeValue(testMetadata.genre)}"`;
    ffmpegCmd += ` -metadata "publisher=${escapeValue(testMetadata.label)}"`;
    ffmpegCmd += ` -metadata "label=${escapeValue(testMetadata.label)}"`;
    ffmpegCmd += ` -metadata "bpm=${testMetadata.bpm}"`;
    ffmpegCmd += ` -metadata "initialkey=${escapeValue(testMetadata.key)}"`;
    ffmpegCmd += ` -metadata "comment=Test metadata writing"`;
    ffmpegCmd += ` "${testFilePath.replace('.mp3', '_updated.mp3')}"`;

    console.log(`🔧 Comando FFmpeg: ${ffmpegCmd.substring(0, 200)}...`);

    try {
      await execAsync(ffmpegCmd, { maxBuffer: 1024 * 1024 * 50 });
      console.log('✅ Metadados escritos com sucesso!');
    } catch (error) {
      console.log(`❌ Erro ao escrever metadados: ${error.message}`);
      return;
    }

    // 5. Verificar metadados escritos
    console.log('\n4️⃣ VERIFICANDO METADADOS ESCRITOS:');
    console.log('─'.repeat(50));

    const updatedFilePath = testFilePath.replace('.mp3', '_updated.mp3');
    const { stdout: updatedMetadata } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format "${updatedFilePath}"`,
      { maxBuffer: 1024 * 1024 * 10 }
    );

    const updatedInfo = JSON.parse(updatedMetadata);
    const updatedTags = updatedInfo.format?.tags || {};

    console.log('📋 TAGS APÓS ESCRITA:');
    Object.keys(updatedTags).forEach(key => {
      console.log(`   ${key}: "${updatedTags[key]}"`);
    });

    // 6. Verificar se os campos específicos foram escritos
    console.log('\n5️⃣ VERIFICAÇÃO DE CAMPOS ESPECÍFICOS:');
    console.log('─'.repeat(50));

    const checks = [
      { name: 'Label (publisher)', value: updatedTags.publisher, expected: testMetadata.label },
      { name: 'Label (label)', value: updatedTags.label, expected: testMetadata.label },
      { name: 'Published Date', value: updatedTags.publisher_date, expected: testMetadata.publishedDate },
      { name: 'BPM', value: updatedTags.bpm, expected: testMetadata.bpm },
      { name: 'Key', value: updatedTags.initialkey, expected: testMetadata.key }
    ];

    checks.forEach(check => {
      const status = check.value === check.expected ? '✅' : '❌';
      console.log(`   ${status} ${check.name}: "${check.value || 'NÃO ENCONTRADO'}" (esperado: "${check.expected}")`);
    });

    // 7. Limpeza
    console.log('\n6️⃣ LIMPEZA:');
    console.log('─'.repeat(50));

    try {
      await execAsync(`del "${testFilePath}"`);
      await execAsync(`del "${updatedFilePath}"`);
      console.log('✅ Arquivos de teste removidos');
    } catch (error) {
      console.log(`⚠️ Erro ao remover arquivos de teste: ${error.message}`);
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

// Executar o teste
testMetadataWriting(); 