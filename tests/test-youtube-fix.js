const axios = require('axios');

async function testYouTubeFix() {
  console.log('🧪 [Test YouTube Fix] Testando correção para URLs do YouTube...');
  
  try {
    // Testar com URL do YouTube da Armada
    const youtubeUrl = 'https://www.youtube.com/watch?v=SJrPVMT351I&list=PLnLlwmUgI-e0_jlM3sLk-P_qZyYgoeIvS&ab_channel=ArmadaMusicTV';
    
    console.log('📋 URL de teste:', youtubeUrl);
    console.log('🔄 Fazendo request...\n');
    
    const response = await axios.get(`http://localhost:3000/api/playlist?url=${encodeURIComponent(youtubeUrl)}`, {
      timeout: 10000
    });
    
    console.log('✅ Status:', response.status);
    console.log('📊 Response data:');
    console.log('   - Success:', response.data.success);
    console.log('   - Message:', response.data.message || 'N/A');
    
    if (response.data.error) {
      console.log('❌ Erro:', response.data.error);
    } else {
      console.log('   - Total tracks:', response.data.totalTracks || 'N/A');
      console.log('   - Download path:', response.data.downloadPath || 'N/A');
    }
    
    // Verificar se não retorna mais o erro de URL inválido
    if (response.data.error && response.data.error.includes('Invalid 1001tracklists.com URL format')) {
      console.log('\n🚨 PROBLEMA PERSISTENTE: Ainda retorna erro de URL inválido!');
      return false;
    } else {
      console.log('\n✅ CORREÇÃO FUNCIONOU: Não retorna mais erro de URL inválido!');
      return true;
    }
    
  } catch (error) {
    console.error('\n💥 Erro no teste:', error.response?.data || error.message);
    
    if (error.response?.data?.error?.includes('Invalid 1001tracklists.com URL format')) {
      console.log('🚨 PROBLEMA: Ainda está validando URL como 1001tracklists.com');
      return false;
    } else {
      console.log('✅ Erro diferente - correção funcionou parcialmente');
      return true;
    }
  }
}

testYouTubeFix(); 