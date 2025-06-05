const axios = require('axios');

async function debugArmadaPlaylist() {
  console.log('🔍 [Debug Armada] Simulando problema da playlist Armada Music...');
  
  // URLs de exemplo que provavelmente estão na playlist da Armada
  const testTracks = [
    { title: "Around The World (La La La La La)", artist: "ATC" },
    { title: "Children", artist: "Robert Miles" },
    { title: "Sandstorm", artist: "Darude" },
    { title: "Adagio for Strings", artist: "Tiësto" },
    { title: "Concrete Angel", artist: "Gareth Emery" }
  ];
  
  console.log(`📋 [Armada] Testando ${testTracks.length} tracks simuladas da playlist...\n`);
  
  let successCount = 0;
  let failureCount = 0;
  let errors = [];
  
  for (let i = 0; i < testTracks.length; i++) {
    const track = testTracks[i];
    const startTime = Date.now();
    
    console.log(`🎵 [${i + 1}/${testTracks.length}] Testando: "${track.title}" - "${track.artist}"`);
    
    try {
      const response = await axios.post('http://localhost:3000/api/enhanced-metadata', {
        title: track.title,
        artist: track.artist,
        useBeatport: true
      }, {
        timeout: 60000 // 60 segundos timeout
      });
      
      const duration = Date.now() - startTime;
      const metadata = response.data.metadata;
      
      if (response.data.success && metadata.sources && metadata.sources.includes('BeatportV2')) {
        successCount++;
        console.log(`   ✅ SUCESSO em ${duration}ms:`);
        console.log(`      🎤 Artist: ${metadata.artist}`);
        console.log(`      🎵 BPM: ${metadata.bpm || 'N/A'}`);
        console.log(`      🔑 Key: ${metadata.key || 'N/A'}`);
        console.log(`      🎭 Genre: ${metadata.genre || 'N/A'}`);
        console.log(`      🏷️ Label: ${metadata.label || 'N/A'}`);
      } else if (response.data.success && (!metadata.sources || metadata.sources.length === 0)) {
        failureCount++;
        console.log(`   ⚠️ SEM DADOS DO BEATPORT em ${duration}ms (sources: ${metadata.sources || 'undefined'})`);
        errors.push({
          track: `${track.title} - ${track.artist}`,
          error: 'No BeatportV2 source',
          duration: duration
        });
      } else {
        failureCount++;
        console.log(`   ❌ FALHA em ${duration}ms`);
        errors.push({
          track: `${track.title} - ${track.artist}`,
          error: 'API returned failure',
          duration: duration
        });
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      failureCount++;
      console.log(`   💥 ERRO em ${duration}ms: ${error.message}`);
      errors.push({
        track: `${track.title} - ${track.artist}`,
        error: error.message,
        duration: duration,
        isTimeout: error.code === 'ECONNABORTED',
        isConnection: error.code === 'ECONNREFUSED'
      });
    }
    
    console.log(''); // Linha em branco para separar
    
    // Delay entre requests para não sobrecarregar
    if (i < testTracks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('📊 [Armada] RESUMO DOS TESTES:');
  console.log(`   ✅ Sucessos: ${successCount}/${testTracks.length}`);
  console.log(`   ❌ Falhas: ${failureCount}/${testTracks.length}`);
  console.log(`   📈 Taxa de sucesso: ${((successCount / testTracks.length) * 100).toFixed(1)}%`);
  
  if (errors.length > 0) {
    console.log(`\n🚨 [Armada] ANÁLISE DOS ERROS:`);
    
    const timeouts = errors.filter(e => e.isTimeout);
    const connections = errors.filter(e => e.isConnection);
    const noBeatport = errors.filter(e => e.error === 'No BeatportV2 source');
    const other = errors.filter(e => !e.isTimeout && !e.isConnection && e.error !== 'No BeatportV2 source');
    
    if (timeouts.length > 0) {
      console.log(`   ⏰ Timeouts: ${timeouts.length} (${((timeouts.length / errors.length) * 100).toFixed(1)}%)`);
    }
    
    if (connections.length > 0) {
      console.log(`   🔌 Problemas de conexão: ${connections.length} (${((connections.length / errors.length) * 100).toFixed(1)}%)`);
    }
    
    if (noBeatport.length > 0) {
      console.log(`   🎯 Sem dados do Beatport: ${noBeatport.length} (${((noBeatport.length / errors.length) * 100).toFixed(1)}%)`);
      console.log(`      📋 Tracks afetadas:`);
      noBeatport.forEach(e => console.log(`         - ${e.track} (${e.duration}ms)`));
    }
    
    if (other.length > 0) {
      console.log(`   ❓ Outros erros: ${other.length}`);
      other.forEach(e => console.log(`      - ${e.track}: ${e.error}`));
    }
  }
  
  // Diagnóstico
  console.log(`\n🔍 [Armada] DIAGNÓSTICO:`);
  
  if (successCount === 0) {
    console.log('   🚨 PROBLEMA CRÍTICO: Nenhuma track funcionou!');
    if (connections.length > 0) {
      console.log('   💡 Possível causa: Servidor não está rodando ou problema de conexão');
    } else if (timeouts.length > 0) {
      console.log('   💡 Possível causa: BeatportProviderV2 está travando ou muito lento');
    } else if (noBeatport.length === errors.length) {
      console.log('   💡 Possível causa: BeatportProviderV2 não está sendo chamado corretamente');
    }
  } else if (successCount < testTracks.length / 2) {
    console.log('   ⚠️ PROBLEMA MODERADO: Muitas falhas');
    console.log('   💡 Possível causa: Instabilidade no BeatportProviderV2 ou detecção pelo Beatport');
  } else {
    console.log('   ✅ Sistema funcionando bem, problema pode ser específico da playlist');
  }
}

debugArmadaPlaylist(); 