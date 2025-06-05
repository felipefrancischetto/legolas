const axios = require('axios');

async function testSeventeenValidation() {
  console.log('🧪 [Test Seventeen Validation] Testando música específica mencionada pelo usuário...');
  
  // Dados exatos da música que o usuário mencionou
  const testTrack = {
    title: "Seventeen",
    artist: "Joris Voorn, YOTTO, White Lies",
    expectedUrl: "https://www.beatport.com/pt/track/seventeen/20271202",
    expectedData: {
      bpm: 125,
      key: "Eb Major", 
      genre: "Melodic House & Techno",
      label: "Spectrum (NL)",
      album: "Seventeen" // Provavelmente single
    }
  };
  
  console.log(`🎵 Testando: "${testTrack.title}" - "${testTrack.artist}"`);
  console.log(`🎯 URL Esperada: ${testTrack.expectedUrl}`);
  console.log(`📊 Dados Esperados:`);
  console.log(`   - BPM: ${testTrack.expectedData.bpm}`);
  console.log(`   - Key: ${testTrack.expectedData.key}`);
  console.log(`   - Genre: ${testTrack.expectedData.genre}`);
  console.log(`   - Label: ${testTrack.expectedData.label}\n`);
  
  try {
    const startTime = Date.now();
    
    const response = await axios.post('http://localhost:3000/api/enhanced-metadata', {
      title: testTrack.title,
      artist: testTrack.artist,
      useBeatport: true
    }, {
      timeout: 60000
    });
    
    const duration = Date.now() - startTime;
    
    if (response.data.success) {
      const metadata = response.data.metadata;
      
      console.log(`✅ Resposta recebida em ${duration}ms`);
      console.log(`\n📊 DADOS ENCONTRADOS:`);
      console.log(`   🎤 Artist: ${metadata.artist || 'N/A'}`);
      console.log(`   🎵 BPM: ${metadata.bpm || 'N/A'}`);
      console.log(`   🔑 Key: ${metadata.key || 'N/A'}`);
      console.log(`   🎭 Genre: ${metadata.genre || 'N/A'}`);
      console.log(`   💿 Album: ${metadata.album || 'N/A'}`);
      console.log(`   🏷️ Label: ${metadata.label || 'N/A'}`);
      console.log(`   📍 Sources: ${metadata.sources?.join(', ') || 'None'}`);
      
      // VERIFICAÇÃO DETALHADA
      console.log(`\n🔍 ANÁLISE DE VALIDAÇÃO:`);
      
      const hasBeatportSource = metadata.sources?.includes('BeatportV2') || metadata.sources?.includes('Beatport');
      console.log(`   ✓ Fonte Beatport: ${hasBeatportSource ? '✅ SIM' : '❌ NÃO'}`);
      
      // Comparar dados encontrados vs esperados
      const bpmMatch = metadata.bpm === testTrack.expectedData.bpm;
      const keyMatch = metadata.key === testTrack.expectedData.key;
      const genreMatch = metadata.genre && metadata.genre.includes('Melodic');
      const labelMatch = metadata.label === testTrack.expectedData.label;
      
      console.log(`   ✓ BPM correto (${testTrack.expectedData.bpm}): ${bpmMatch ? '✅ SIM' : '❌ NÃO'} (encontrado: ${metadata.bpm || 'N/A'})`);
      console.log(`   ✓ Key correto (${testTrack.expectedData.key}): ${keyMatch ? '✅ SIM' : '❌ NÃO'} (encontrado: ${metadata.key || 'N/A'})`);
      console.log(`   ✓ Genre correto (Melodic): ${genreMatch ? '✅ SIM' : '❌ NÃO'} (encontrado: ${metadata.genre || 'N/A'})`);
      console.log(`   ✓ Label correto (${testTrack.expectedData.label}): ${labelMatch ? '✅ SIM' : '❌ NÃO'} (encontrado: ${metadata.label || 'N/A'})`);
      
      // Score final
      const correctFields = [bpmMatch, keyMatch, genreMatch, labelMatch].filter(Boolean).length;
      const totalFields = 4;
      const accuracyScore = (correctFields / totalFields * 100).toFixed(1);
      
      console.log(`\n🎯 RESULTADO FINAL:`);
      console.log(`   📊 Precisão: ${accuracyScore}% (${correctFields}/${totalFields} campos corretos)`);
      
      if (hasBeatportSource && correctFields >= 3) {
        console.log(`   🎉 EXCELENTE! Sistema encontrou a música correta no Beatport!`);
      } else if (hasBeatportSource && correctFields >= 2) {
        console.log(`   ✅ BOM! Sistema encontrou no Beatport mas alguns dados diferem`);
      } else if (hasBeatportSource) {
        console.log(`   ⚠️ PROBLEMA! Sistema encontrou Beatport mas dados não conferem`);
        console.log(`   💡 Possível causa: URL errada encontrada ou dados mal extraídos`);
      } else {
        console.log(`   ❌ ERRO! Sistema não encontrou no Beatport`);
      }
      
      // Instruções para validação manual
      console.log(`\n📋 VALIDAÇÃO MANUAL:`);
      console.log(`   1. Verifique os logs do servidor para ver a URL encontrada`);
      console.log(`   2. Compare com a URL esperada: ${testTrack.expectedUrl}`);
      console.log(`   3. Se as URLs forem diferentes, há problema no algoritmo de matching`);
      console.log(`   4. Se as URLs forem iguais mas dados diferentes, há problema na extração`);
      
    } else {
      console.log(`❌ Falha na busca: ${response.data.error || 'Erro desconhecido'}`);
      console.log(`💡 Verifique se o servidor está rodando e se o Beatport está acessível`);
    }
    
  } catch (error) {
    console.error(`💥 Erro no teste: ${error.response?.data?.error || error.message}`);
    
    if (error.code === 'ECONNABORTED') {
      console.log(`⏰ Timeout - servidor pode estar sobrecarregado`);
    } else if (error.response?.status === 500) {
      console.log(`🚨 Erro interno - verificar logs do servidor`);
    }
  }
  
  console.log(`\n🔍 PRÓXIMOS PASSOS:`);
  console.log(`   1. Execute este teste e compare os logs com a URL esperada`);
  console.log(`   2. Se a URL estiver errada, ajuste o algoritmo de matching`);
  console.log(`   3. Se a URL estiver certa mas dados errados, ajuste a extração`);
  console.log(`   4. Use este exemplo como caso de teste para futuras melhorias`);
}

console.log('🚀 Iniciando teste de validação específica...');
testSeventeenValidation(); 