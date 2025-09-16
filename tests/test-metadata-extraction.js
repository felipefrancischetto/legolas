const { exec } = require('child_process');
const { promisify } = require('util');
const { readdir, readFile } = require('fs/promises');
const { join } = require('path');

const execAsync = promisify(exec);

async function testMetadataExtraction() {
  console.log('🔍 TESTE DE EXTRAÇÃO DE METADADOS');
  console.log('=====================================\n');

  try {
    // Ler configuração de downloads
    const configPath = join(__dirname, 'downloads.config.json');
    const configData = JSON.parse(await readFile(configPath, 'utf-8'));
    const downloadsFolder = configData.downloadsPath || './downloads';

    console.log(`📁 Pasta de downloads: ${downloadsFolder}\n`);

    // Listar arquivos de áudio
    const files = await readdir(downloadsFolder);
    const audioFiles = files.filter(file => 
      file.toLowerCase().endsWith('.mp3') || file.toLowerCase().endsWith('.flac')
    );

    console.log(`🎵 Encontrados ${audioFiles.length} arquivos de áudio\n`);

    // Testar extração de metadados para cada arquivo
    for (let i = 0; i < Math.min(5, audioFiles.length); i++) {
      const file = audioFiles[i];
      const filePath = join(downloadsFolder, file);
      
      console.log(`\n📊 TESTANDO: ${file}`);
      console.log('─'.repeat(50));

      try {
        // Extrair metadados com ffprobe
        const { stdout } = await execAsync(
          `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
          { maxBuffer: 1024 * 1024 * 10 }
        );

        const info = JSON.parse(stdout);
        const tags = info.format?.tags || {};

        console.log('📋 METADADOS ENCONTRADOS:');
        console.log(`   🎤 Artist: ${tags.artist || tags.ARTIST || '❌ NÃO ENCONTRADO'}`);
        console.log(`   🎵 Title: ${tags.title || tags.TITLE || '❌ NÃO ENCONTRADO'}`);
        console.log(`   💓 BPM: ${tags.bpm || tags.BPM || tags.TEMPO || tags.tempo || '❌ NÃO ENCONTRADO'}`);
        console.log(`   🔑 Key: ${tags.key || tags.KEY || tags.initialKey || tags.INITIALKEY || tags.initialkey || tags.INITIAL_KEY || '❌ NÃO ENCONTRADO'}`);
        console.log(`   🎭 Genre: ${tags.genre || tags.Genre || tags.GENRE || '❌ NÃO ENCONTRADO'}`);
        console.log(`   🏷️ Label: ${tags.publisher || tags.Publisher || tags.label || tags.Label || tags.LABEL || '❌ NÃO ENCONTRADO'}`);
        console.log(`   📅 Year: ${tags.year || tags.date || tags.YEAR || tags.DATE || '❌ NÃO ENCONTRADO'}`);
        console.log(`   💽 Album: ${tags.album || tags.Album || tags.ALBUM || '❌ NÃO ENCONTRADO'}`);
        console.log(`   📅 Published Date: ${tags.publisher_date || tags.PUBLISHER_DATE || tags.publishedDate || tags.PUBLISHED_DATE || '❌ NÃO ENCONTRADO'}`);
        
        // Verificar se há dados do Beatport
        const hasBeatportData = tags.bpm || tags.BPM || tags.initialKey || tags.initialkey || tags.label || tags.LABEL;
        console.log(`   🎯 Dados Beatport: ${hasBeatportData ? '✅ SIM' : '❌ NÃO'}`);
        
        // Mostrar todas as tags disponíveis
        console.log(`   📋 Total de tags: ${Object.keys(tags).length}`);
        if (Object.keys(tags).length > 0) {
          console.log(`   🔑 Tags disponíveis: ${Object.keys(tags).join(', ')}`);
        }

        // Verificar informações técnicas
        console.log('\n🔧 INFORMAÇÕES TÉCNICAS:');
        console.log(`   ⏱️ Duração: ${info.format?.duration ? formatDuration(parseFloat(info.format.duration)) : '❌ NÃO ENCONTRADO'}`);
        console.log(`   📊 Bitrate: ${info.format?.bit_rate ? `${Math.round(parseInt(info.format.bit_rate) / 1000)} kbps` : '❌ NÃO ENCONTRADO'}`);
        
        // Verificar streams de áudio
        const audioStream = info.streams?.find(s => s.codec_type === 'audio');
        if (audioStream) {
          console.log(`   🎵 Codec: ${audioStream.codec_name || '❌ NÃO ENCONTRADO'}`);
          console.log(`   🔊 Sample Rate: ${audioStream.sample_rate ? `${audioStream.sample_rate} Hz` : '❌ NÃO ENCONTRADO'}`);
          console.log(`   🎧 Canais: ${audioStream.channels ? (audioStream.channels === 2 ? 'Estéreo' : audioStream.channels === 1 ? 'Mono' : `${audioStream.channels} canais`) : '❌ NÃO ENCONTRADO'}`);
        }

        // Verificar se há imagem embutida
        const pictureStream = info.streams?.find(s => s.codec_type === 'video' && s.codec_name === 'mjpeg');
        console.log(`   🖼️ Thumbnail: ${pictureStream ? '✅ SIM' : '❌ NÃO'}`);

      } catch (error) {
        console.log(`❌ Erro ao extrair metadados: ${error.message}`);
      }
    }

    console.log('\n\n📈 RESUMO:');
    console.log('─'.repeat(50));
    console.log('Para melhorar a extração de metadados, verifique:');
    console.log('1. Se o Beatport está sendo consultado corretamente');
    console.log('2. Se os metadados estão sendo escritos nos arquivos');
    console.log('3. Se há problemas na limpeza/normalização dos títulos');
    console.log('4. Se o ffmpeg está funcionando corretamente');

  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Executar o teste
testMetadataExtraction(); 