const { metadataAggregator } = require('./lib/services/metadataService.js');

async function testBeatportProvider() {
  console.log('🚀 Iniciando teste do BeatportProviderV2...\n');
  
  // Track de teste - usar uma que sabemos que existe no Beatport
  const testTracks = [
    {
      title: 'Animals',
      artist: 'Martin Garrix',
      expected: {
        bpm: 128,
        genre: 'Future House'
      }
    },
    {
      title: 'Titanium',
      artist: 'David Guetta',
      expected: {
        bpm: 126,
        genre: 'Progressive House'
      }
    }
  ];
  
  for (const track of testTracks) {
    console.log(`\n📡 Testando: "${track.title}" - "${track.artist}"`);
    console.log('=' .repeat(60));
    
    try {
      const startTime = Date.now();
      
      // Testar com Beatport habilitado
      const result = await metadataAggregator.searchMetadata(
        track.title, 
        track.artist, 
        { useBeatport: true }
      );
      
      const duration = Date.now() - startTime;
      
      console.log(`\n⏱️  Tempo total: ${duration}ms`);
      console.log(`\n📊 Resultado:`);
      console.log(`   Title: ${result.title}`);
      console.log(`   Artist: ${result.artist}`);
      console.log(`   BPM: ${result.bpm || 'N/A'}`);
      console.log(`   Key: ${result.key || 'N/A'}`);
      console.log(`   Genre: ${result.genre || 'N/A'}`);
      console.log(`   Label: ${result.label || 'N/A'}`);
      console.log(`   Album: ${result.album || 'N/A'}`);
      console.log(`   Year: ${result.year || 'N/A'}`);
      console.log(`   Sources: ${result.sources?.join(', ') || 'Nenhuma'}`);
      
      // Validação
      console.log(`\n✅ Validação:`);
      console.log(`   ✓ BPM encontrado: ${result.bpm ? 'SIM' : 'NÃO'}`);
      console.log(`   ✓ Key encontrada: ${result.key ? 'SIM' : 'NÃO'}`);
      console.log(`   ✓ Genre encontrado: ${result.genre ? 'SIM' : 'NÃO'}`);
      console.log(`   ✓ Label encontrada: ${result.label ? 'SIM' : 'NÃO'}`);
      console.log(`   ✓ Beatport usado: ${result.sources?.includes('BeatportV2') ? 'SIM' : 'NÃO'}`);
      
      const success = result.bpm || result.key || result.genre || result.label;
      console.log(`\n${success ? '🎉 SUCESSO' : '❌ FALHOU'}: ${success ? 'Metadados encontrados!' : 'Nenhum metadado útil encontrado'}`);
      
    } catch (error) {
      console.error(`❌ Erro no teste: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(60));
  }
  
  console.log('\n🏁 Teste concluído!');
}

// Executar teste
testBeatportProvider().catch(console.error); 