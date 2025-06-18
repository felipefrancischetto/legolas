const { metadataAggregator } = require('./lib/services/metadataService.js');

async function testBaracTrack() {
  console.log('🎵 Teste específico para track do Barac...\n');
  
  // Teste com diferentes variações do título
  const variations = [
    {
      title: 'Be Wise, Be Warned, O Rulers of the Earth',
      artist: 'Barac',
      description: 'Título completo'
    },
    {
      title: 'Be Wise Be Warned O Rulers of the Earth',
      artist: 'Barac', 
      description: 'Sem vírgulas'
    },
    {
      title: 'Be Wise Be Warned',
      artist: 'Barac',
      description: 'Título simplificado'
    },
    {
      title: 'Rulers of the Earth',
      artist: 'Barac',
      description: 'Parte do título'
    }
  ];

  const expectedBeatport = {
    bpm: 127,
    key: 'F Minor',
    genre: 'Electronica',
    label: 'Cronos'
  };

  console.log(`🎯 Dados esperados do Beatport:`);
  console.log(`   • BPM: ${expectedBeatport.bpm}`);
  console.log(`   • Key: ${expectedBeatport.key}`);
  console.log(`   • Genre: ${expectedBeatport.genre}`);
  console.log(`   • Label: ${expectedBeatport.label}`);
  console.log('');

  for (let i = 0; i < variations.length; i++) {
    const track = variations[i];
    
    console.log(`\n📡 Teste ${i + 1}/${variations.length}: "${track.title}" - "${track.artist}"`);
    console.log(`📝 ${track.description}`);
    console.log('=' .repeat(70));
    
    try {
      const startTime = Date.now();
      
      const result = await metadataAggregator.searchMetadata(
        track.title,
        track.artist,
        { useBeatport: true }
      );
      
      const duration = Date.now() - startTime;
      console.log(`⏱️  Tempo: ${duration}ms`);
      
      console.log(`📊 Resultado:`);
      console.log(`   BPM: ${result.bpm || 'N/A'}`);
      console.log(`   Key: ${result.key || 'N/A'}`);
      console.log(`   Genre: ${result.genre || 'N/A'}`);
      console.log(`   Label: ${result.label || 'N/A'}`);
      console.log(`   Sources: ${result.sources?.join(', ') || 'Nenhuma'}`);
      
      const beatportUsed = result.sources?.includes('BeatportV2') || result.sources?.includes('Beatport');
      const hasData = result.bpm || result.key || result.genre || result.label;
      
      console.log(`   Status: ${beatportUsed && hasData ? '🎉 SUCESSO' : '❌ FALHOU'}`);
      
      if (beatportUsed && hasData) {
        console.log(`   🏆 Esta variação funcionou! Interrompendo teste.`);
        break;
      }
      
    } catch (error) {
      console.error(`❌ Erro: ${error.message}`);
    }
  }
  
  console.log(`\n🏁 Teste do Barac concluído!`);
}

testBaracTrack().catch(console.error); 