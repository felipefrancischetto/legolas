const axios = require('axios');

async function debugCacique() {
  console.log('🔍 [Debug Cacique] Testando busca problemática: Cacique - Barac...');
  
  try {
    const response = await axios.post('http://localhost:3000/api/enhanced-metadata', {
      title: "Cacique",
      artist: "Barac",
      useBeatport: true
    });
    
    console.log('\n📊 [CACIQUE] Resposta da API:');
    console.log('✅ Status:', response.data.success);
    console.log('🎵 Metadados completos:', JSON.stringify(response.data.metadata, null, 2));
    
    const metadata = response.data.metadata;
    console.log('\n📋 [CACIQUE] Análise detalhada:');
    console.log(`   🎤 Artist: "${metadata.artist || 'N/A'}"`);
    console.log(`   🎵 BPM: ${metadata.bpm || 'N/A'}`);
    console.log(`   🔑 Key: "${metadata.key || 'N/A'}"`);
    console.log(`   🎭 Genre: "${metadata.genre || 'N/A'}"`);
    console.log(`   🏷️  Label: "${metadata.label || 'N/A'}"`);
    console.log(`   📚 Sources: ${metadata.sources ? metadata.sources.join(', ') : 'N/A'}`);
    
    console.log('\n🎯 [CACIQUE] Análise do PROBLEMA:');
    
    if (metadata.artist && metadata.artist.toLowerCase().includes('barac')) {
      console.log('   ✅ Artist CORRETO: Barac detectado');
    } else if (metadata.artist && metadata.artist.toLowerCase().includes('oliver')) {
      console.log('   ❌ Artist INCORRETO: Oliver Schories detectado (erro grave!)');
      console.log('   🚨 PROBLEMA: Algoritmo de matching escolheu track errada!');
    } else {
      console.log(`   ⚠️  Artist inesperado: "${metadata.artist}"`);
    }
    
    if (metadata.title && metadata.title.toLowerCase().includes('cacique')) {
      console.log('   ✅ Title correto: Cacique');
    } else {
      console.log(`   ❌ Title incorreto: "${metadata.title}" (deveria ser Cacique)`);
    }
    
    // Verificar se é provável que seja a track correta
    console.log('\n🔍 [CACIQUE] Verificação de probabilidade:');
    const isCorrectTrack = (
      metadata.artist && metadata.artist.toLowerCase().includes('barac') &&
      metadata.title && metadata.title.toLowerCase().includes('cacique')
    );
    
    if (isCorrectTrack) {
      console.log('   ✅ TRACK CORRETA encontrada!');
    } else {
      console.log('   ❌ TRACK INCORRETA! Algoritmo de matching falhou!');
      console.log('   🎯 Ação necessária: Verificar scoring e melhorar matching');
    }
    
  } catch (error) {
    console.error('❌ [CACIQUE] Erro:', error.message);
    if (error.response) {
      console.error('📋 Response data:', error.response.data);
    }
  }
}

debugCacique(); 