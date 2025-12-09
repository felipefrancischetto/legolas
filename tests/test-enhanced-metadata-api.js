const fetch = require('node-fetch');

async function testEnhancedMetadataAPI() {
  console.log('🔍 TESTE DA API ENHANCED-METADATA');
  console.log('==================================\n');

  try {
    // Testar com uma música que sabemos que tem metadados no Beatport
    const testData = {
      title: '2mysoul feat. Biishop',
      artist: '16BL',
      useBeatport: true
    };

    console.log('📤 Dados enviados para a API:');
    console.log(`   Title: "${testData.title}"`);
    console.log(`   Artist: "${testData.artist}"`);
    console.log(`   UseBeatport: ${testData.useBeatport}\n`);

    // Chamar a API
    const response = await fetch('http://localhost:3000/api/enhanced-metadata', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });

    if (!response.ok) {
      console.log(`❌ Erro na resposta: ${response.status} ${response.statusText}`);
      return;
    }

    const result = await response.json();
    
    console.log('📥 Resposta da API:');
    console.log('─'.repeat(50));
    console.log(`✅ Success: ${result.success}`);
    console.log(`🎧 Beatport Mode: ${result.beatportMode}`);
    console.log(`⏱️ Search Duration: ${result.searchDuration}ms`);
    
    if (result.metadata) {
      console.log('\n📊 METADADOS RETORNADOS:');
      console.log('─'.repeat(50));
      const metadata = result.metadata;
      
      const fields = [
        { name: 'Title', value: metadata.title },
        { name: 'Artist', value: metadata.artist },
        { name: 'BPM', value: metadata.bpm },
        { name: 'Key', value: metadata.key },
        { name: 'Genre', value: metadata.genre },
        { name: 'Label', value: metadata.label },
        { name: 'Year', value: metadata.year },
        { name: 'Published Date', value: metadata.publishedDate },
        { name: 'Album', value: metadata.album },
        { name: 'Duration', value: metadata.duration },
        { name: 'Sources', value: metadata.sources?.join(', ') }
      ];

      fields.forEach(field => {
        const status = field.value ? '✅' : '❌';
        console.log(`   ${status} ${field.name}: ${field.value || 'NÃO ENCONTRADO'}`);
      });

      // Verificar se os campos problemáticos estão presentes
      console.log('\n🔍 ANÁLISE DE PROBLEMAS:');
      console.log('─'.repeat(50));
      
      if (!metadata.label) {
        console.log('❌ PROBLEMA: Label não encontrado');
        console.log('   → Verificar se o Beatport está retornando label');
        console.log('   → Verificar se o serviço está processando label corretamente');
      } else {
        console.log('✅ Label encontrado:', metadata.label);
      }
      
      if (!metadata.publishedDate) {
        console.log('❌ PROBLEMA: Published Date não encontrado');
        console.log('   → Verificar se o Beatport está retornando publishedDate');
        console.log('   → Verificar se o serviço está processando publishedDate corretamente');
      } else {
        console.log('✅ Published Date encontrado:', metadata.publishedDate);
      }

      // Verificar se tem dados do Beatport
      const hasBeatportData = metadata.bpm || metadata.key || metadata.genre || metadata.label;
      const isFromBeatport = metadata.sources?.includes('BeatportV2');
      
      console.log(`\n🎯 DADOS DO BEATPORT:`);
      console.log(`   Tem dados úteis: ${hasBeatportData ? '✅ SIM' : '❌ NÃO'}`);
      console.log(`   Fonte é Beatport: ${isFromBeatport ? '✅ SIM' : '❌ NÃO'}`);
      
      if (hasBeatportData && isFromBeatport) {
        console.log('🎉 SUCESSO: Dados do Beatport obtidos corretamente!');
      } else if (hasBeatportData && !isFromBeatport) {
        console.log('⚠️ Dados úteis encontrados, mas não do Beatport');
      } else if (!hasBeatportData && isFromBeatport) {
        console.log('⚠️ Beatport retornou dados, mas não são úteis');
      } else {
        console.log('❌ Nenhum dado útil encontrado');
      }

    } else {
      console.log('❌ Nenhum metadado retornado');
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

// Executar o teste
testEnhancedMetadataAPI(); 