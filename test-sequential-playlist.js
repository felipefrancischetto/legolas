const axios = require('axios');

async function testSequentialPlaylist() {
  console.log('🔍 [Test Sequential] Simulando processamento de playlist sequencial...');
  
  // Simular tracks de uma playlist da Armada (mais realistas)
  const playlistTracks = [
    { title: "Adagio for Strings", artist: "Tiësto" },
    { title: "Children", artist: "Robert Miles" },
    { title: "Sandstorm", artist: "Darude" }
    // Só 3 tracks para teste rápido
  ];
  
  console.log(`📋 Processando ${playlistTracks.length} tracks sequencialmente...\n`);
  
  let results = [];
  let totalTime = 0;
  
  for (let i = 0; i < playlistTracks.length; i++) {
    const track = playlistTracks[i];
    const trackStartTime = Date.now();
    
    console.log(`🎵 [${i + 1}/${playlistTracks.length}] Processando: "${track.title}" - "${track.artist}"`);
    
    try {
      const response = await axios.post('http://localhost:3000/api/enhanced-metadata', {
        title: track.title,
        artist: track.artist,
        useBeatport: true
      }, {
        timeout: 45000 // 45 segundos por track
      });
      
      const trackDuration = Date.now() - trackStartTime;
      totalTime += trackDuration;
      
      const metadata = response.data.metadata;
      const hasBeatport = metadata.sources && metadata.sources.includes('BeatportV2');
      
      results.push({
        index: i + 1,
        title: track.title,
        artist: track.artist,
        duration: trackDuration,
        success: response.data.success,
        hasBeatport: hasBeatport,
        bpm: metadata.bpm,
        key: metadata.key,
        genre: metadata.genre,
        label: metadata.label
      });
      
      if (hasBeatport) {
        console.log(`   ✅ SUCESSO em ${trackDuration}ms (BeatportV2)`);
        console.log(`      🎵 BPM: ${metadata.bpm || 'N/A'} | 🔑 Key: ${metadata.key || 'N/A'}`);
      } else {
        console.log(`   ⚠️ SEM BEATPORT em ${trackDuration}ms (sources: ${metadata.sources || 'nenhuma'})`);
      }
      
    } catch (error) {
      const trackDuration = Date.now() - trackStartTime;
      totalTime += trackDuration;
      
      results.push({
        index: i + 1,
        title: track.title,
        artist: track.artist,
        duration: trackDuration,
        success: false,
        error: error.message,
        isTimeout: error.code === 'ECONNABORTED'
      });
      
      console.log(`   ❌ ERRO em ${trackDuration}ms: ${error.message}`);
      
      if (error.code === 'ECONNABORTED') {
        console.log(`   ⏰ TIMEOUT detectado - parando processamento para evitar cascata de erros`);
        break; // Para evitar mais timeouts
      }
    }
    
    console.log(`   ⏱️ Tempo acumulado: ${(totalTime / 1000).toFixed(1)}s\n`);
    
    // Delay entre tracks (como na playlist real)
    if (i < playlistTracks.length - 1) {
      console.log('   💤 Aguardando 2s antes da próxima track...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Análise final
  console.log('📊 RESUMO FINAL:');
  console.log(`   ⏱️ Tempo total: ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`   ⏱️ Tempo médio por track: ${(totalTime / results.length / 1000).toFixed(1)}s`);
  
  const successfulTracks = results.filter(r => r.success);
  const beatportTracks = results.filter(r => r.hasBeatport);
  const timeoutTracks = results.filter(r => r.isTimeout);
  
  console.log(`   ✅ Tracks processadas com sucesso: ${successfulTracks.length}/${results.length}`);
  console.log(`   🎯 Tracks com dados do Beatport: ${beatportTracks.length}/${results.length}`);
  console.log(`   ⏰ Tracks com timeout: ${timeoutTracks.length}/${results.length}`);
  
  // Identificar problemas
  console.log('\n🔍 ANÁLISE DE PROBLEMAS:');
  
  if (timeoutTracks.length > 0) {
    console.log('   🚨 TIMEOUT DETECTADO!');
    console.log('   💡 Causa provável: BeatportProviderV2 está travando ou muito lento');
    console.log('   🛠️ Solução: Implementar timeout mais agressivo ou otimizar navegação');
  }
  
  if (beatportTracks.length === 0 && successfulTracks.length > 0) {
    console.log('   🚨 NENHUM DADO DO BEATPORT!');
    console.log('   💡 Causa provável: useBeatport=true não está sendo respeitado');
    console.log('   🛠️ Solução: Verificar configuração da API');
  }
  
  if (successfulTracks.length < results.length) {
    const failureRate = ((results.length - successfulTracks.length) / results.length * 100).toFixed(1);
    console.log(`   ⚠️ ALTA TAXA DE FALHA: ${failureRate}%`);
    console.log('   💡 Causa provável: Sistema instável ou rate limiting');
  }
  
  console.log('\n📋 DETALHES POR TRACK:');
  results.forEach(result => {
    const status = result.success ? (result.hasBeatport ? '✅ Beatport' : '⚠️ Sem Beatport') : '❌ Erro';
    console.log(`   ${result.index}. "${result.title}" - ${status} (${(result.duration / 1000).toFixed(1)}s)`);
    if (result.error) {
      console.log(`      Erro: ${result.error}`);
    }
  });
}

testSequentialPlaylist(); 