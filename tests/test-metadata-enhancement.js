const axios = require('axios');

async function testMetadataEnhancement() {
  console.log('🧪 [Test Metadata Enhancement] Testando extração de Genre e Album...');
  
  // Tracks específicas que devem ter genre e album claros no Beatport
  const testTracks = [
    { title: "Adagio for Strings", artist: "Tiësto", expected: { genre: "Trance", hasAlbum: true } },
    { title: "Animals", artist: "Martin Garrix", expected: { genre: "Progressive House", hasAlbum: true } },
    { title: "Strobe", artist: "deadmau5", expected: { genre: "Progressive House", hasAlbum: true } }
  ];
  
  console.log(`📋 Testando ${testTracks.length} tracks para verificar Genre e Album...\n`);
  
  for (let i = 0; i < testTracks.length; i++) {
    const track = testTracks[i];
    const trackNumber = i + 1;
    
    console.log(`🎵 [${trackNumber}/${testTracks.length}] Testando: "${track.title}" - "${track.artist}"`);
    console.log(`   📊 Esperado: Genre="${track.expected.genre}", Album=${track.expected.hasAlbum ? 'SIM' : 'NÃO'}`);
    
    try {
      const startTime = Date.now();
      
      const response = await axios.post('http://localhost:3000/api/enhanced-metadata', {
        title: track.title,
        artist: track.artist,
        useBeatport: true
      }, {
        timeout: 60000
      });
      
      const duration = Date.now() - startTime;
      
      if (response.data.success) {
        const metadata = response.data.metadata;
        
        console.log(`   ✅ Sucesso em ${duration}ms`);
        console.log(`   📊 Metadados extraídos:`);
        console.log(`      🎤 Artist: ${metadata.artist || 'N/A'}`);
        console.log(`      🎵 BPM: ${metadata.bpm || 'N/A'}`);
        console.log(`      🔑 Key: ${metadata.key || 'N/A'}`);
        console.log(`      🎭 Genre: ${metadata.genre || 'N/A'}`);
        console.log(`      💿 Album: ${metadata.album || 'N/A'}`);
        console.log(`      🏷️ Label: ${metadata.label || 'N/A'}`);
        console.log(`      📍 Sources: ${metadata.sources?.join(', ') || 'None'}`);
        
        // Análise detalhada
        console.log(`\n   🔍 Análise:`);
        
        const hasGenre = !!metadata.genre;
        const hasAlbum = !!metadata.album;
        const hasBeatportSource = metadata.sources?.includes('BeatportV2') || metadata.sources?.includes('Beatport');
        
        console.log(`      ✓ Genre encontrado: ${hasGenre ? '✅ SIM' : '❌ NÃO'} (${metadata.genre || 'vazio'})`);
        console.log(`      ✓ Album encontrado: ${hasAlbum ? '✅ SIM' : '❌ NÃO'} (${metadata.album || 'vazio'})`);
        console.log(`      ✓ Fonte Beatport: ${hasBeatportSource ? '✅ SIM' : '❌ NÃO'}`);
        
        // Verificar se matches expectativas
        if (hasGenre && hasAlbum && hasBeatportSource) {
          console.log(`      🎉 TUDO FUNCIONANDO! Genre e Album extraídos do Beatport!`);
        } else {
          console.log(`      ⚠️ PROBLEMAS DETECTADOS:`);
          if (!hasGenre) console.log(`         - Genre não extraído`);
          if (!hasAlbum) console.log(`         - Album não extraído`);
          if (!hasBeatportSource) console.log(`         - Não veio do Beatport`);
        }
        
      } else {
        console.log(`   ❌ Falha: ${response.data.error || 'Erro desconhecido'}`);
      }
      
    } catch (error) {
      console.error(`   💥 Erro: ${error.response?.data?.error || error.message}`);
    }
    
    console.log(''); // Linha em branco
    
    // Delay entre tracks
    if (i < testTracks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log('📊 RESUMO DO TESTE:');
  console.log('   🎯 Objetivo: Verificar se Genre e Album estão sendo extraídos');
  console.log('   🔧 Correções implementadas:');
  console.log('      - ✅ Adicionada extração de Album no BeatportProviderV2');
  console.log('      - ✅ Melhorados padrões de extração de Genre');
  console.log('      - ✅ Limpeza aprimorada de texto indesejado');
  console.log('   📋 Se ainda houver problemas, verificar logs do servidor');
}

testMetadataEnhancement(); 