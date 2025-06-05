const axios = require('axios');

async function testSequentialFlow() {
  console.log('🧪 [Test Sequential Flow] Testando novo fluxo música por música...');
  
  try {
    // Testar com uma playlist pequena do YouTube para validar o fluxo
    const testUrl = 'https://www.youtube.com/watch?v=SJrPVMT351I&list=PLnLlwmUgI-e0_jlM3sLk-P_qZyYgoeIvS&ab_channel=ArmadaMusicTV';
    
    console.log('📋 URL de teste:', testUrl);
    console.log('🔄 Iniciando download com novo fluxo sequencial...\n');
    
    const startTime = Date.now();
    
    const response = await axios.get(`http://localhost:3000/api/playlist`, {
      params: {
        url: testUrl,
        format: 'mp3',
        enhanceMetadata: true,
        useBeatport: true
      },
      timeout: 300000 // 5 minutos para teste
    });
    
    const duration = Date.now() - startTime;
    
    console.log('✅ Resposta recebida!');
    console.log(`⏱️ Tempo total: ${(duration / 1000).toFixed(1)}s`);
    console.log('\n📊 Resultados:');
    console.log('   - Success:', response.data.success);
    console.log('   - Total tracks:', response.data.totalTracks || 'N/A');
    console.log('   - Processed tracks:', response.data.processedTracks || 'N/A');
    console.log('   - Enhanced tracks:', response.data.enhancedTracks || 'N/A');
    console.log('   - Beatport tracks:', response.data.beatportTracksFound || 'N/A');
    console.log('   - Errors:', (response.data.errors || []).length);
    
    if (response.data.errors && response.data.errors.length > 0) {
      console.log('\n❌ Erros encontrados:');
      response.data.errors.slice(0, 3).forEach((error, idx) => {
        console.log(`   ${idx + 1}. ${error}`);
      });
      if (response.data.errors.length > 3) {
        console.log(`   ... e mais ${response.data.errors.length - 3} erros`);
      }
    }
    
    // Análise do novo fluxo
    console.log('\n🔍 ANÁLISE DO NOVO FLUXO:');
    
    const successRate = response.data.totalTracks > 0 ? 
      ((response.data.enhancedTracks || 0) / response.data.totalTracks * 100).toFixed(1) : '0';
    
    console.log(`   📈 Taxa de sucesso metadados: ${successRate}%`);
    
    const avgTimePerTrack = response.data.totalTracks > 0 ? 
      (duration / response.data.totalTracks / 1000).toFixed(1) : '0';
    
    console.log(`   ⏱️ Tempo médio por música: ${avgTimePerTrack}s`);
    
    if (response.data.success) {
      console.log('   ✅ NOVO FLUXO FUNCIONANDO!');
      
      if (response.data.enhancedTracks > 0) {
        console.log('   🎯 Metadados sendo aplicados em tempo real!');
      }
      
      if (!response.data.error?.includes('Invalid 1001tracklists.com URL format')) {
        console.log('   🔧 Correção do YouTube funcionando!');
      }
      
    } else {
      console.log('   ❌ Problemas detectados no novo fluxo');
    }
    
    return response.data.success;
    
  } catch (error) {
    console.error('\n💥 Erro no teste:', error.response?.data || error.message);
    
    if (error.code === 'ECONNABORTED') {
      console.log('⏰ Timeout - pode ser normal para playlists grandes');
    }
    
    return false;
  }
}

console.log('🚀 Iniciando teste do novo fluxo sequencial...');
testSequentialFlow(); 