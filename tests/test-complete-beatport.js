const axios = require('axios');

async function testIndividualDownload() {
  console.log('🎵 TESTE 1: DOWNLOAD INDIVIDUAL COM BEATPORT');
  console.log('=' .repeat(60));
  
  // URL de teste - Strobe do deadmau5 (clássico do Beatport)
  const testUrl = 'https://www.youtube.com/watch?v=tKi9Z-f6qX4';
  
  console.log(`🎵 URL: ${testUrl}`);
  console.log(`🎧 Beatport: ATIVADO`);
  console.log(`💾 Formato: FLAC`);
  console.log('');
  
  try {
    console.log('⏳ Iniciando download individual...');
    const startTime = Date.now();
    
    const response = await axios.get('http://localhost:3000/api/download', {
      params: {
        url: testUrl,
        format: 'flac',
        useBeatport: 'true'
      },
      timeout: 300000  // 5 minutos
    });
    
    const duration = Date.now() - startTime;
    
    console.log('✅ DOWNLOAD INDIVIDUAL CONCLUÍDO!');
    console.log(`⏱️  Tempo: ${Math.round(duration / 1000)}s`);
    console.log(`📊 Status: ${response.status}`);
    
    return { success: true, duration };
    
  } catch (error) {
    console.error('❌ ERRO NO DOWNLOAD INDIVIDUAL:', error.message);
    return { success: false, error: error.message };
  }
}

async function testPlaylistDownload() {
  console.log('\\n🎼 TESTE 2: DOWNLOAD DE PLAYLIST COM BEATPORT');
  console.log('=' .repeat(60));
  
  // Playlist sugerida pelo usuário - Álbum do Barac
  const playlistUrl = 'https://www.youtube.com/watch?v=5DwqhlUEgk0&list=OLAK5uy_njcYTX3W7SkoikBvhs9R7HkVFuCaRJdww&ab_channel=Barac-Topic';
  
  console.log(`🎼 Playlist: Barac - How Long Will You Love Delusions?`);
  console.log(`🌐 URL: ${playlistUrl}`);
  console.log(`🎧 Beatport: ATIVADO`);
  console.log(`💾 Formato: FLAC`);
  console.log('');
  
  try {
    console.log('⏳ Iniciando download de playlist...');
    const startTime = Date.now();
    
    const response = await axios.get('http://localhost:3000/api/playlist', {
      params: {
        url: playlistUrl,
        format: 'flac',
        useBeatport: 'true',
        enhanceMetadata: 'true',
        maxConcurrent: '2'  // Mais conservador para Beatport
      },
      timeout: 900000  // 15 minutos para playlist
    });
    
    const duration = Date.now() - startTime;
    
    console.log('✅ DOWNLOAD DE PLAYLIST CONCLUÍDO!');
    console.log(`⏱️  Tempo total: ${Math.round(duration / 1000)}s`);
    console.log(`📊 Status: ${response.status}`);
    
    if (response.data) {
      console.log('\\n📋 RESULTADO DA PLAYLIST:');
      console.log(`   📁 Total de tracks: ${response.data.totalTracks || 'N/A'}`);
      console.log(`   ✅ Sucessos: ${response.data.successful || 'N/A'}`);
      console.log(`   ❌ Falhas: ${response.data.failed || 'N/A'}`);
      console.log(`   🎯 Beatport hits: ${response.data.beatportEnhanced || 'N/A'}`);
    }
    
    return { success: true, duration, data: response.data };
    
  } catch (error) {
    console.error('❌ ERRO NO DOWNLOAD DE PLAYLIST:', error.message);
    return { success: false, error: error.message };
  }
}

async function checkMetadataResults() {
  console.log('\\n🔍 TESTE 3: VERIFICAÇÃO DE METADADOS');
  console.log('=' .repeat(60));
  
  const { exec } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  
  const musicasDir = path.join(__dirname, 'Musicas');
  
  if (!fs.existsSync(musicasDir)) {
    console.log('❌ Pasta Musicas não encontrada');
    return;
  }
  
  const files = fs.readdirSync(musicasDir).filter(file => file.endsWith('.flac'));
  console.log(`📁 Arquivos FLAC encontrados: ${files.length}`);
  
  let beatportSuccesses = 0;
  
  for (const file of files.slice(0, 3)) { // Verificar apenas os primeiros 3
    console.log(`\\n🎵 Verificando: ${file}`);
    
    try {
      await new Promise((resolve) => {
        exec(`ffprobe -v quiet -print_format json -show_format "${path.join(musicasDir, file)}"`, (error, stdout) => {
          if (!error) {
            const metadata = JSON.parse(stdout);
            const tags = metadata.format?.tags || {};
            
            const hasBeatportData = tags.bpm || tags.BPM || tags.initialkey || tags.INITIALKEY || tags.label || tags.LABEL;
            
            console.log(`   💓 BPM: ${tags.bpm || tags.BPM || 'N/A'}`);
            console.log(`   🔑 Key: ${tags.initialkey || tags.INITIALKEY || 'N/A'}`);
            console.log(`   🏷️  Label: ${tags.label || tags.LABEL || 'N/A'}`);
            console.log(`   🎯 Beatport: ${hasBeatportData ? '✅ SIM' : '❌ NÃO'}`);
            
            if (hasBeatportData) beatportSuccesses++;
          }
          resolve();
        });
      });
    } catch (err) {
      console.log(`   ❌ Erro: ${err.message}`);
    }
  }
  
  console.log(`\\n📊 RESUMO: ${beatportSuccesses}/${Math.min(files.length, 3)} arquivos com dados Beatport`);
  
  return { totalFiles: files.length, beatportSuccesses };
}

async function checkServer() {
  try {
    await axios.get('http://localhost:3000/api/files', { timeout: 5000 });
    console.log('✅ Servidor rodando em http://localhost:3000\\n');
    return true;
  } catch (error) {
    console.log('❌ Servidor não está rodando!');
    console.log('💡 Execute: npm run dev\\n');
    return false;
  }
}

async function main() {
  console.log('🚀 TESTE COMPLETO DO BEATPORT INTEGRATION');
  console.log('🎯 Testando download individual + playlist + verificação');
  console.log('═'.repeat(70));
  
  const serverRunning = await checkServer();
  if (!serverRunning) return;
  
  // Executar testes
  console.log('⏰ Início:', new Date().toLocaleTimeString());
  console.log('');
  
  const results = {};
  
  // Teste 1: Download Individual
  results.individual = await testIndividualDownload();
  
  // Teste 2: Download de Playlist  
  results.playlist = await testPlaylistDownload();
  
  // Teste 3: Verificação de Metadados
  results.metadata = await checkMetadataResults();
  
  // Relatório Final
  console.log('\\n📊 RELATÓRIO FINAL');
  console.log('═'.repeat(50));
  console.log(`⏰ Fim: ${new Date().toLocaleTimeString()}`);
  console.log(`🎵 Download Individual: ${results.individual.success ? '✅ SUCESSO' : '❌ FALHA'}`);
  console.log(`🎼 Download Playlist: ${results.playlist.success ? '✅ SUCESSO' : '❌ FALHA'}`);
  console.log(`🎯 Metadados Beatport: ${results.metadata?.beatportSuccesses || 0} sucessos`);
  
  console.log('\\n🌐 Interface: http://localhost:3000');
  console.log('📂 Arquivos: http://localhost:3000/files');
}

main(); 