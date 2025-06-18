const axios = require('axios');

async function testEnhancedAPI() {
  console.log('🎯 [Enhanced API Test] Testando API com BeatportProviderV2...');
  
  try {
    const response = await axios.post('http://localhost:3000/api/enhanced-metadata', {
      title: "Individual Life in Human Society",
      artist: "Barac",
      useBeatport: true
    });
    
    console.log('\n✅ [SUCCESS] Resposta da API:');
    console.log('📊 Status:', response.data.success);
    console.log('🎵 Dados:', JSON.stringify(response.data.metadata, null, 2));
    
    const metadata = response.data.metadata;
    console.log('\n📋 [SUMMARY] Metadados extraídos:');
    console.log(`   🎤 Artist: ${metadata.artist || 'N/A'}`);
    console.log(`   🎵 BPM: ${metadata.bpm || 'N/A'}`);
    console.log(`   🔑 Key: ${metadata.key || 'N/A'}`);
    console.log(`   🎭 Genre: ${metadata.genre || 'N/A'}`);
    console.log(`   🏷️  Label: ${metadata.label || 'N/A'}`);
    console.log(`   📅 Year: ${metadata.year || 'N/A'}`);
    console.log(`   💿 Album: ${metadata.album || 'N/A'}`);
    console.log(`   📚 Sources: ${metadata.sources ? metadata.sources.join(', ') : 'N/A'}`);
    
    const fieldsFound = [
      metadata.artist,
      metadata.bpm,
      metadata.key,
      metadata.genre,
      metadata.label
    ].filter(field => field !== undefined && field !== null).length;
    
    const totalFields = 5;
    const successRate = (fieldsFound / totalFields * 100).toFixed(1);
    
    console.log(`\n🎯 [RESULT] Taxa de sucesso: ${fieldsFound}/${totalFields} = ${successRate}%`);
    
    if (fieldsFound >= 3) {
      console.log('🎉 [VERDICT] BEATPORT FUNCIONANDO! ✨');
    } else {
      console.log('⚠️  [VERDICT] Precisa melhorar...');
    }
    
  } catch (error) {
    console.error('❌ [ERROR] Erro ao testar API:', error.message);
    if (error.response) {
      console.error('📋 Response data:', error.response.data);
    }
  }
}

testEnhancedAPI(); 