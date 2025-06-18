const axios = require('axios');

async function testConnection() {
  console.log('🔍 Testando conexão com o servidor...');
  
  try {
    // Teste básico de conexão
    const response = await axios.get('http://localhost:3000/api/health', {
      timeout: 5000
    });
    
    console.log('✅ Servidor está rodando!');
    console.log('   Status:', response.status);
    console.log('   Data:', response.data);
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Servidor não está rodando');
      console.log('   💡 Inicie o servidor com: npm start ou npm run dev');
    } else if (error.code === 'ECONNABORTED') {
      console.log('⏰ Timeout na conexão');
      console.log('   💡 Servidor pode estar sobrecarregado');
    } else if (error.response?.status === 404) {
      console.log('✅ Servidor está rodando mas endpoint /api/health não existe');
      console.log('   💡 Isso é normal se não tiver endpoint de health');
    } else {
      console.log('❌ Erro de conexão:', error.message);
    }
  }
  
  // Teste do endpoint de metadados
  try {
    console.log('\n🎵 Testando endpoint de metadados...');
    
    const response = await axios.post('http://localhost:3000/api/enhanced-metadata', {
      title: "Test",
      artist: "Test Artist",
      useBeatport: false
    }, {
      timeout: 10000
    });
    
    console.log('✅ Endpoint de metadados acessível!');
    console.log('   Success:', response.data.success);
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Servidor não está rodando');
    } else if (error.code === 'ECONNABORTED') {
      console.log('⏰ Timeout no endpoint de metadados');
    } else {
      console.log('⚠️ Endpoint com problema:', error.response?.data?.error || error.message);
    }
  }
}

testConnection(); 