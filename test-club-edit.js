const { metadataAggregator } = require('./lib/services/metadataService.js');

async function testClubEdit() {
  console.log('🧪 Teste específico: "Strobe (Club Edit)" vs "Strobe"\n');
  
  const tests = [
    { title: 'Strobe (Club Edit)', artist: 'deadmau5', description: 'Título exato do log' },
    { title: 'Strobe', artist: 'deadmau5', description: 'Título que funcionou nos testes' }
  ];
  
  for (const test of tests) {
    console.log(`📡 Testando: "${test.title}" - "${test.artist}"`);
    console.log(`📝 ${test.description}`);
    console.log('═'.repeat(80));
    
    try {
      const startTime = Date.now();
      const result = await metadataAggregator.searchMetadata(test.title, test.artist, { useBeatport: true });
      const duration = Date.now() - startTime;
      
      console.log(`⏱️  Tempo: ${duration}ms`);
      console.log(`📊 Resultado:`);
      console.log(`   ✅ Sources: ${result.sources?.join(', ') || 'Nenhuma'}`);
      console.log(`   🎵 BPM: ${result.bpm || 'N/A'}`);
      console.log(`   🔑 Key: ${result.key || 'N/A'}`);
      console.log(`   🎭 Genre: ${result.genre || 'N/A'}`);
      console.log(`   🏷️  Label: ${result.label || 'N/A'}`);
      
      if (result.sources?.includes('BeatportV2') && result.bpm) {
        console.log(`🎉 SUCESSO com "${test.title}"!`);
      } else {
        console.log(`❌ FALHOU com "${test.title}"`);
      }
      
    } catch (error) {
      console.error(`❌ Erro com "${test.title}":`, error.message);
    }
    
    console.log('\n');
  }
  
  console.log('🏁 Teste comparativo concluído!');
}

testClubEdit().catch(console.error); 