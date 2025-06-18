const { metadataAggregator } = require('./lib/services/metadataService.js');

async function testSpecificTracks() {
  console.log('🎵 Testando músicas específicas do motor...\n');
  
  // Tracks específicas que estão sendo testadas no motor
  const testTracks = [
    {
      title: 'Strobe',
      artist: 'deadmau5',
      expectedBeatport: {
        bpm: 128,
        key: 'B Major',
        genre: 'Progressive House',
        label: 'Virgin'
      },
      description: 'Club Edit - deadmau5 classic'
    },
    {
      title: 'Be Wise, Be Warned, O Rulers of the Earth',
      artist: 'Barac',
      expectedBeatport: {
        bpm: 127,
        key: 'F Minor',
        genre: 'Electronica',
        label: 'Cronos'
      },
      description: 'Original Mix - Barac track'
    }
  ];
  
  console.log(`🧪 Testando ${testTracks.length} tracks específicas com BeatportProviderV2\n`);
  
  for (let i = 0; i < testTracks.length; i++) {
    const track = testTracks[i];
    
    console.log(`\n📡 Teste ${i + 1}/${testTracks.length}: "${track.title}" - "${track.artist}"`);
    console.log(`📝 Descrição: ${track.description}`);
    console.log('=' .repeat(80));
    
    console.log(`🎯 Dados esperados do Beatport:`);
    console.log(`   • BPM: ${track.expectedBeatport.bpm}`);
    console.log(`   • Key: ${track.expectedBeatport.key}`);
    console.log(`   • Genre: ${track.expectedBeatport.genre}`);
    console.log(`   • Label: ${track.expectedBeatport.label}`);
    console.log('');
    
    try {
      const startTime = Date.now();
      
      // Testar com Beatport habilitado
      const result = await metadataAggregator.searchMetadata(
        track.title,
        track.artist,
        { useBeatport: true }
      );
      
      const duration = Date.now() - startTime;
      console.log(`⏱️  Tempo total: ${duration}ms\n`);
      
      console.log(`📊 Resultado obtido:`);
      console.log(`   Title: ${result.title}`);
      console.log(`   Artist: ${result.artist}`);
      console.log(`   BPM: ${result.bpm || 'N/A'}`);
      console.log(`   Key: ${result.key || 'N/A'}`);
      console.log(`   Genre: ${result.genre || 'N/A'}`);
      console.log(`   Label: ${result.label || 'N/A'}`);
      console.log(`   Album: ${result.album || 'N/A'}`);
      console.log(`   Year: ${result.year || 'N/A'}`);
      console.log(`   Sources: ${result.sources?.join(', ') || 'Nenhuma'}`);
      
      console.log(`\n✅ Comparação com dados esperados:`);
      
      // Comparar BPM
      const bpmMatch = result.bpm === track.expectedBeatport.bpm;
      console.log(`   🎵 BPM: ${result.bpm || 'N/A'} vs ${track.expectedBeatport.bpm} → ${bpmMatch ? '✅ MATCH' : '❌ DIFF'}`);
      
      // Comparar Key (normalizar para comparação)
      const resultKey = (result.key || '').toLowerCase().trim();
      const expectedKey = track.expectedBeatport.key.toLowerCase().trim();
      const keyMatch = resultKey.includes(expectedKey.split(' ')[0]) || expectedKey.includes(resultKey.split(' ')[0]);
      console.log(`   🔑 Key: "${result.key || 'N/A'}" vs "${track.expectedBeatport.key}" → ${keyMatch ? '✅ MATCH' : '❌ DIFF'}`);
      
      // Comparar Genre
      const genreMatch = (result.genre || '').toLowerCase().includes(track.expectedBeatport.genre.toLowerCase());
      console.log(`   🎭 Genre: "${result.genre || 'N/A'}" vs "${track.expectedBeatport.genre}" → ${genreMatch ? '✅ MATCH' : '❌ DIFF'}`);
      
      // Comparar Label
      const labelMatch = (result.label || '').toLowerCase().includes(track.expectedBeatport.label.toLowerCase());
      console.log(`   🏷️  Label: "${result.label || 'N/A'}" vs "${track.expectedBeatport.label}" → ${labelMatch ? '✅ MATCH' : '❌ DIFF'}`);
      
      // Verificar se Beatport foi usado
      const beatportUsed = result.sources?.includes('BeatportV2') || result.sources?.includes('Beatport');
      console.log(`   🌐 Beatport usado: ${beatportUsed ? '✅ SIM' : '❌ NÃO'}`);
      
      // Resultado geral
      const hasUsefulData = result.bpm || result.key || result.genre || result.label;
      const overallSuccess = hasUsefulData && beatportUsed;
      
      console.log(`\n🎯 RESULTADO GERAL: ${overallSuccess ? '🎉 SUCESSO' : '❌ FALHOU'}`);
      
      if (overallSuccess) {
        let accuracy = 0;
        if (bpmMatch) accuracy += 25;
        if (keyMatch) accuracy += 25;
        if (genreMatch) accuracy += 25;
        if (labelMatch) accuracy += 25;
        
        console.log(`📈 Precisão dos dados: ${accuracy}% (${[bpmMatch, keyMatch, genreMatch, labelMatch].filter(Boolean).length}/4 campos corretos)`);
      }
      
    } catch (error) {
      console.error(`❌ Erro no teste:`, error.message);
    }
    
    if (i < testTracks.length - 1) {
      console.log('\n' + '═'.repeat(80));
    }
  }
  
  console.log(`\n🏁 Teste das músicas específicas concluído!`);
}

// Executar o teste
testSpecificTracks().catch(console.error); 