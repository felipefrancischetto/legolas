const axios = require('axios');

async function testSimpleArmada() {
  console.log('🔍 [Test Simple Armada] Teste rápido com track da Armada...');
  
  try {
    console.log('🎵 Testando: "Adagio for Strings" - "Tiësto"');
    const startTime = Date.now();
    
    const response = await axios.post('http://localhost:3000/api/enhanced-metadata', {
      title: "Adagio for Strings",
      artist: "Tiësto",
      useBeatport: true
    }, {
      timeout: 30000 // 30 segundos
    });
    
    const duration = Date.now() - startTime;
    console.log(`⏱️ Tempo de resposta: ${duration}ms`);
    
    console.log('\n📊 Resposta da API:');
    console.log('✅ Status:', response.data.success);
    console.log('🎵 Metadados:', JSON.stringify(response.data.metadata, null, 2));
    
    const metadata = response.data.metadata;
    console.log('\n🔍 Análise detalhada:');
    console.log(`   📚 Sources: ${metadata.sources ? metadata.sources.join(', ') : 'NENHUMA'}`);
    console.log(`   🎤 Artist: ${metadata.artist || 'N/A'}`);
    console.log(`   🎵 BPM: ${metadata.bpm || 'N/A'}`);
    console.log(`   🔑 Key: ${metadata.key || 'N/A'}`);
    console.log(`   🎭 Genre: ${metadata.genre || 'N/A'}`);
    console.log(`   🏷️ Label: ${metadata.label || 'N/A'}`);
    
    // Diagnóstico
    console.log('\n🎯 Diagnóstico:');
    if (metadata.sources && metadata.sources.includes('BeatportV2')) {
      console.log('   ✅ BeatportV2 funcionando corretamente!');
    } else if (metadata.sources && metadata.sources.length > 0) {
      console.log(`   ⚠️ Outras sources funcionando: ${metadata.sources.join(', ')}`);
      console.log('   🚨 MAS BeatportV2 NÃO foi chamado!');
    } else {
      console.log('   ❌ NENHUMA source funcionou - problema crítico!');
    }
    
  } catch (error) {
    console.error('\n💥 ERRO:', error.message);
    console.error('📋 Código do erro:', error.code);
    
    if (error.code === 'ECONNABORTED') {
      console.error('⏰ TIMEOUT: Sistema muito lento ou travado');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🔌 CONEXÃO RECUSADA: Servidor não está rodando');
    } else if (error.response) {
      console.error('📋 Status HTTP:', error.response.status);
      console.error('📋 Response data:', error.response.data);
    }
  }
}

testSimpleArmada(); 