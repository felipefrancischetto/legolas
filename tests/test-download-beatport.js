const axios = require('axios');

async function testDownloadWithBeatport() {
  console.log('🧪 TESTE DE DOWNLOAD INDIVIDUAL COM BEATPORT');
  console.log('=' .repeat(60));
  
  // URL de teste - Strobe do deadmau5 (está no Beatport)
  const testUrl = 'https://www.youtube.com/watch?v=tKi9Z-f6qX4';
  
  console.log(`🎵 URL de teste: ${testUrl}`);
  console.log(`🎧 Beatport: ATIVADO`);
  console.log(`💾 Formato: FLAC`);
  console.log('');
  
  try {
    console.log('⏳ Iniciando download...');
    const startTime = Date.now();
    
    // Fazer requisição para a API de download individual
    const response = await axios.get('http://localhost:3000/api/download', {
      params: {
        url: testUrl,
        format: 'flac',
        useBeatport: 'true',  // IMPORTANTE: Beatport ativado
        enhanceMetadata: 'true'
      },
      timeout: 300000  // 5 minutos timeout
    });
    
    const duration = Date.now() - startTime;
    
    console.log('');
    console.log('✅ DOWNLOAD CONCLUÍDO!');
    console.log(`⏱️  Tempo total: ${Math.round(duration / 1000)}s`);
    console.log(`📊 Status: ${response.status}`);
    
    if (response.data) {
      console.log('');
      console.log('📋 DADOS RETORNADOS:');
      console.log('-'.repeat(40));
      console.log(JSON.stringify(response.data, null, 2));
    }
    
  } catch (error) {
    console.error('');
    console.error('❌ ERRO NO DOWNLOAD:');
    console.error('-'.repeat(40));
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Dados: ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.request) {
      console.error('Erro de rede - sem resposta do servidor');
    } else {
      console.error(`Erro: ${error.message}`);
    }
  }
  
  console.log('');
  console.log('🌐 Acesse http://localhost:3000 para ver os arquivos baixados');
  console.log('📂 Ou http://localhost:3000/files para lista detalhada');
}

// Verificar se o servidor está rodando
async function checkServer() {
  try {
    await axios.get('http://localhost:3000/api/files', { timeout: 5000 });
    console.log('✅ Servidor rodando em http://localhost:3000');
    console.log('');
    return true;
  } catch (error) {
    console.log('❌ Servidor não está rodando!');
    console.log('💡 Execute: npm run dev');
    console.log('');
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  
  if (serverRunning) {
    await testDownloadWithBeatport();
  }
}

main(); 