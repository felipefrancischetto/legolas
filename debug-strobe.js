const axios = require('axios');

async function debugStrobe() {
  console.log('🔍 [Debug Strobe] Testando Strobe Club Edit...');
  
  try {
    const response = await axios.post('http://localhost:3000/api/enhanced-metadata', {
      title: "Strobe (Club Edit)",
      artist: "deadmau5",
      useBeatport: true
    });
    
    console.log('\n📊 [STROBE] Resposta da API:');
    console.log('✅ Status:', response.data.success);
    console.log('🎵 Metadados completos:', JSON.stringify(response.data.metadata, null, 2));
    
    const metadata = response.data.metadata;
    console.log('\n📋 [STROBE] Análise detalhada:');
    console.log(`   🎤 Artist: "${metadata.artist || 'N/A'}"`);
    console.log(`   🎵 BPM: ${metadata.bpm || 'N/A'}`);
    console.log(`   🔑 Key: "${metadata.key || 'N/A'}"`);
    console.log(`   🎭 Genre: "${metadata.genre || 'N/A'}"`);
    console.log(`   🏷️  Label: "${metadata.label || 'N/A'}"`);
    console.log(`   📚 Sources: ${metadata.sources ? metadata.sources.join(', ') : 'N/A'}`);
    
    // Verificar se os dados estão corretos para Strobe
    console.log('\n🎯 [STROBE] Verificação de dados:');
    
    if (metadata.artist && metadata.artist.toLowerCase().includes('deadmau5')) {
      console.log('   ✅ Artist correto (deadmau5 detectado)');
    } else if (metadata.artist && metadata.artist.toLowerCase().includes('wordlife')) {
      console.log('   ⚠️  Artist alternativo (Wordlife detectado)');
    } else {
      console.log('   ❌ Artist incorreto ou ausente');
    }
    
    if (metadata.bpm && metadata.bpm >= 120 && metadata.bpm <= 140) {
      console.log(`   ✅ BPM realista (${metadata.bpm})`);
    } else {
      console.log(`   ⚠️  BPM fora do esperado (${metadata.bpm})`);
    }
    
    if (metadata.key) {
      console.log(`   ✅ Key encontrada (${metadata.key})`);
    } else {
      console.log('   ❌ Key não encontrada');
    }
    
    if (metadata.genre) {
      console.log(`   ✅ Genre encontrado (${metadata.genre})`);
    } else {
      console.log('   ❌ Genre não encontrado');
    }
    
    if (metadata.label) {
      console.log(`   ✅ Label encontrada (${metadata.label})`);
    } else {
      console.log('   ❌ Label não encontrada');
    }
    
  } catch (error) {
    console.error('❌ [STROBE] Erro:', error.message);
    if (error.response) {
      console.error('📋 Response data:', error.response.data);
    }
  }
}

debugStrobe(); 