/**
 * Teste simples para ver logs detalhados
 */

const http = require('http');

async function testMetadata() {
  console.log('🔍 Testando API de metadados...\n');
  
  const postData = JSON.stringify({
    title: 'Animals',
    artist: 'Martin Garrix',
    useBeatport: true
  });

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
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('📊 Resultado da API:', JSON.stringify(result, null, 2));
          resolve(result);
        } catch (e) {
          console.log('📊 Resposta bruta:', data);
          resolve(data);
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Erro na requisição:', err);
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

testMetadata().catch(console.error); 