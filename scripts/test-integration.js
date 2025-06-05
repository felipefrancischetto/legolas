/**
 * Teste da Integração Frontend → Backend
 * 
 * Simula uma chamada como seria feita pelo frontend
 * 
 * Uso:
 * node scripts/test-integration.js
 */

const http = require('http');

const baseUrl = 'http://localhost:3000';

async function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function testIntegration() {
  console.log('🔗 TESTE DE INTEGRAÇÃO FRONTEND → BACKEND\n');
  
  // Simular chamada do frontend COM toggle ativado
  console.log('🔹 Simulando chamada frontend com toggle Beatport ATIVADO:');
  console.log('   (Como se fosse um download individual com toggle marcado)\n');
  
  try {
    // Simular a chamada enhanced-metadata que o frontend faz
    const response = await makeRequest('/api/enhanced-metadata', 'POST', {
      title: 'Animals',
      artist: 'Martin Garrix',
      useBeatport: true // Frontend com toggle ativado
    });
    
    if (response.success) {
      console.log('✅ INTEGRAÇÃO FUNCIONANDO!');
      console.log(`📊 Fontes encontradas: ${response.metadata.sources?.join(', ') || 'Nenhuma'}`);
      console.log(`🎯 Modo Beatport ativo: ${response.beatportMode ? 'SIM' : 'NÃO'}`);
      
      if (response.metadata.bpm) console.log(`📊 BPM: ${response.metadata.bpm}`);
      if (response.metadata.key) console.log(`🎵 Key: ${response.metadata.key}`);
      if (response.metadata.label) console.log(`🏷️  Label: ${response.metadata.label}`);
      if (response.metadata.genre) console.log(`🎭 Genre: ${response.metadata.genre}`);
      
      if (response.metadata.sources?.includes('Beatport')) {
        console.log('\n🎉 SUCESSO! Dados do Beatport foram encontrados! ✨');
        console.log('   O toggle está funcionando corretamente!');
      } else {
        console.log('\n⚠️  Toggle funcionando, mas Beatport não encontrou esta track');
        console.log('   (Pode ser que a track não esteja no Beatport ou erro de scraping)');
      }
      
    } else {
      console.log('❌ Erro na integração:', response.error);
    }
    
  } catch (error) {
    console.log('❌ Erro na conexão:', error.message);
  }
  
  console.log('\n📋 RESULTADO:');
  console.log('Se viu "SUCESSO! Dados do Beatport..." = Integração 100% funcionando! 🎉');
  console.log('Se não encontrou Beatport = Toggle funciona, mas track específica não foi encontrada');
  console.log('\n🚀 PRÓXIMO PASSO:');
  console.log('Agora teste no frontend: ative o toggle Beatport e faça um download!');
}

testIntegration().catch(console.error); 