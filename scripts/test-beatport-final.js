/**
 * Teste final do sistema Beatport melhorado
 */

const http = require('http');

async function testBeatportImproved() {
  console.log('🧪 TESTE FINAL DO SISTEMA BEATPORT MELHORADO\n');
  
  const testData = {
    title: 'Strobe',
    artist: 'deadmau5',
    useBeatport: true
  };

  console.log(`🔍 Testando: "${testData.artist} - ${testData.title}"`);
  console.log(`🎧 Beatport: ${testData.useBeatport}`);
  console.log('─'.repeat(60));

  const postData = JSON.stringify(testData);

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/enhanced-metadata',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const duration = Date.now() - startTime;
        
        try {
          const result = JSON.parse(data);
          
          console.log('\n📊 RESULTADO DO TESTE:');
          console.log(`   ⏱️  Duração: ${duration}ms`);
          console.log(`   📈 Status: ${res.statusCode}`);
          console.log(`   🎯 Sucesso: ${result.success || false}`);
          
          if (result.success) {
            console.log('\n🎉 METADADOS ENCONTRADOS:');
            console.log(`   🎵 BPM: ${result.bpm || 'N/A'}`);
            console.log(`   🔑 Key: ${result.key || 'N/A'}`);
            console.log(`   🎭 Genre: ${result.genre || 'N/A'}`);
            console.log(`   🏷️  Label: ${result.label || 'N/A'}`);
            console.log(`   📍 Fontes: ${result.sources?.join(', ') || 'Nenhuma'}`);
            
            if (result.sources?.includes('Beatport')) {
              console.log('\n✅ BEATPORT FUNCIONOU! 🎉');
            } else {
              console.log('\n⚠️  Beatport não retornou dados');
            }
          } else {
            console.log('\n❌ TESTE FALHOU');
            console.log(`   Erro: ${result.error || 'Erro desconhecido'}`);
          }
          
          resolve(result);
        } catch (error) {
          console.error('\n❌ ERRO AO FAZER PARSE:', error.message);
          console.log('📄 Resposta bruta:', data);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ ERRO NA REQUISIÇÃO:', error.message);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Executar teste
testBeatportImproved()
  .then(() => {
    console.log('\n🏁 Teste concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Teste falhou:', error.message);
    process.exit(1);
  }); 