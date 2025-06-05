const axios = require('axios');

async function testBeatportOnly() {
  console.log('🎯 [Test Beatport Only] Testando APENAS extração do Beatport (sem YouTube)...');
  
  // Música do exemplo do usuário
  const testTrack = {
    title: "Seventeen",
    artist: "Joris Voorn, YOTTO, White Lies",
    expectedUrl: "https://www.beatport.com/pt/track/seventeen/20271202"
  };
  
  console.log(`🎵 Testando: "${testTrack.title}" - "${testTrack.artist}"`);
  console.log(`🎯 URL Esperada: ${testTrack.expectedUrl}\n`);
  
  try {
    // Teste apenas com Beatport, sem YouTube
    const response = await axios.post('http://localhost:3000/api/enhanced-metadata', {
      title: testTrack.title,
      artist: testTrack.artist,
      useBeatport: true
    }, {
      timeout: 60000
    });
    
    if (response.data.success) {
      const metadata = response.data.metadata;
      
      console.log('✅ SUCESSO! Metadados extraídos:');
      console.log(`   🎤 Artist: ${metadata.artist || 'N/A'}`);
      console.log(`   🎵 BPM: ${metadata.bpm || 'N/A'}`);
      console.log(`   🔑 Key: ${metadata.key || 'N/A'}`);
      console.log(`   🎭 Genre: ${metadata.genre || 'N/A'}`);
      console.log(`   💿 Album: ${metadata.album || 'N/A'}`);
      console.log(`   🏷️ Label: ${metadata.label || 'N/A'}`);
      console.log(`   📍 Sources: ${metadata.sources?.join(', ') || 'None'}`);
      
      // O importante: verificar os logs do servidor para ver a URL encontrada
      console.log('\n🔍 IMPORTANTE:');
      console.log('   📋 Verifique os LOGS DO SERVIDOR para ver:');
      console.log('   1. 🌐 URL encontrada pelo algoritmo');
      console.log('   2. 📊 Score de matching');
      console.log('   3. 🎯 Se a URL confere com a esperada');
      console.log(`   4. 📄 Se os dados extraídos estão corretos`);
      
      const hasBeatport = metadata.sources?.includes('BeatportV2') || metadata.sources?.includes('Beatport');
      if (hasBeatport) {
        console.log('\n🎉 BEATPORT FUNCIONANDO!');
        console.log('   ✅ Sistema encontrou dados no Beatport');
        console.log('   🔗 Confira os logs para validar a URL');
      } else {
        console.log('\n❌ PROBLEMA: Não encontrou no Beatport');
        console.log('   🔧 Verifique algoritmo de matching');
      }
      
    } else {
      console.log('❌ Falha:', response.data.error);
    }
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ ERRO: Servidor não está rodando');
      console.log('   💡 Execute: npm start ou npm run dev');
    } else {
      console.log('❌ ERRO:', error.response?.data?.error || error.message);
    }
  }
}

console.log('🚀 Iniciando teste apenas do Beatport...');
testBeatportOnly(); 