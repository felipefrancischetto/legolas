const { metadataAggregator } = require('./lib/services/metadataService.js');

async function testMotorIntegration() {
  console.log('🧪 Teste do motor integrado com BeatportProviderV2...\n');
  
  // Testar exatamente como o motor fez
  console.log('📡 Testando: "Strobe" - "deadmau5" (mesmo que funcionou no teste manual)');
  
  try {
    const result = await metadataAggregator.searchMetadata('Strobe', 'deadmau5', { useBeatport: true });
    
    console.log('\n📊 Resultado do motor integrado:');
    console.log(`   ✅ Sources: ${result.sources?.join(', ') || 'Nenhuma'}`);
    console.log(`   🎵 BPM: ${result.bpm || 'N/A'}`);
    console.log(`   🔑 Key: ${result.key || 'N/A'}`);
    console.log(`   🎭 Genre: ${result.genre || 'N/A'}`);
    console.log(`   🏷️  Label: ${result.label || 'N/A'}`);
    
    if (result.sources?.includes('BeatportV2') && result.bpm) {
      console.log('\n🎉 SUCESSO! Motor integrado funcionando com BeatportV2!');
    } else {
      console.log('\n❌ FALHOU! Motor integrado não está usando BeatportV2 ou não encontrou dados.');
      console.log('🔍 Análise:');
      console.log(`   - Fontes encontradas: ${result.sources?.length || 0}`);
      console.log(`   - BeatportV2 nas fontes: ${result.sources?.includes('BeatportV2') ? 'SIM' : 'NÃO'}`);
      console.log(`   - Dados encontrados: ${!!(result.bpm || result.key || result.genre || result.label) ? 'SIM' : 'NÃO'}`);
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

testMotorIntegration().catch(console.error); 