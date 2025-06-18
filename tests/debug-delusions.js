const axios = require('axios');

async function debugDelusions() {
  console.log('🔍 [Debug Delusions] Testando How Long Will You Love Delusions...');
  
  try {
    const response = await axios.post('http://localhost:3000/api/enhanced-metadata', {
      title: "How Long Will You Love Delusions",
      artist: "Barac",
      useBeatport: true
    });
    
    console.log('\n📊 [DELUSIONS] Resposta da API:');
    console.log('✅ Status:', response.data.success);
    console.log('🎵 Metadados completos:', JSON.stringify(response.data.metadata, null, 2));
    
    const metadata = response.data.metadata;
    console.log('\n📋 [DELUSIONS] Análise detalhada:');
    console.log(`   🎤 Artist: "${metadata.artist || 'N/A'}"`);
    console.log(`   🎵 BPM: ${metadata.bpm || 'N/A'}`);
    console.log(`   🔑 Key: "${metadata.key || 'N/A'}"`);
    console.log(`   🎭 Genre: "${metadata.genre || 'N/A'}"`);
    console.log(`   🏷️  Label: "${metadata.label || 'N/A'}"`);
    console.log(`   📚 Sources: ${metadata.sources ? metadata.sources.join(', ') : 'N/A'}`);
    
    // Verificar especificamente o problema da label
    console.log('\n🎯 [DELUSIONS] Análise da Label:');
    
    if (metadata.label) {
      console.log(`   📝 Label raw: "${metadata.label}"`);
      console.log(`   📏 Tamanho: ${metadata.label.length} caracteres`);
      console.log(`   🔤 Primeira letra: "${metadata.label[0]}"`);
      console.log(`   🔚 Últimas 3 letras: "${metadata.label.slice(-3)}"`);
      
      // Verificar se é "Cronos" correto
      if (metadata.label.toLowerCase().includes('cronos')) {
        if (metadata.label.toLowerCase() === 'cronos') {
          console.log('   ✅ Label PERFEITA: "Cronos"');
        } else {
          console.log(`   ⚠️  Label com texto extra: "${metadata.label}" (contém Cronos mas tem lixo)`);
        }
      } else {
        console.log(`   ❌ Label incorreta: "${metadata.label}" (deveria ser Cronos)`);
      }
      
      // Detectar caracteres estranhos
      const hasSpecialChars = /[^\w\s&.,-]/.test(metadata.label);
      if (hasSpecialChars) {
        console.log('   ⚠️  DETECTADO: Label contém caracteres especiais!');
        
        // Mostrar códigos dos caracteres
        console.log('   🔍 Códigos dos caracteres:');
        for (let i = 0; i < metadata.label.length; i++) {
          const char = metadata.label[i];
          const code = char.charCodeAt(0);
          console.log(`      [${i}] "${char}" -> código ${code}`);
        }
      }
      
    } else {
      console.log('   ❌ Label não encontrada');
    }
    
    // Verificar outros dados
    console.log('\n🎯 [DELUSIONS] Verificação geral:');
    
    if (metadata.artist && metadata.artist.toLowerCase().includes('barac')) {
      console.log('   ✅ Artist correto (Barac)');
    } else {
      console.log(`   ❌ Artist incorreto: "${metadata.artist}"`);
    }
    
    if (metadata.genre && metadata.genre.toLowerCase().includes('minimal')) {
      console.log(`   ✅ Genre correto (${metadata.genre})`);
    } else {
      console.log(`   ⚠️  Genre: "${metadata.genre}"`);
    }
    
  } catch (error) {
    console.error('❌ [DELUSIONS] Erro:', error.message);
    if (error.response) {
      console.error('📋 Response data:', error.response.data);
    }
  }
}

debugDelusions(); 