/**
 * Script para testar o endpoint SSE download-progress
 * Executa: node test-sse-endpoint.js
 */

const http = require('http');
const url = require('url');

async function testSSEEndpoint() {
  console.log('🧪 Testando endpoint SSE download-progress...\n');
  
  const testDownloadId = `test-${Date.now()}`;
  const testUrl = `http://localhost:3000/api/download-progress?downloadId=${testDownloadId}`;
  
  console.log(`📡 Testando: ${testUrl}`);
  
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(testUrl);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 3000,
      path: parsedUrl.path,
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    };
    
    console.log('🔌 Conectando ao endpoint...');
    
    const req = http.request(options, (res) => {
      console.log(`📊 Status Code: ${res.statusCode}`);
      console.log(`📋 Headers:`, res.headers);
      
      if (res.statusCode === 302) {
        console.log('❌ PROBLEMA: Endpoint retornando 302 (redirecionamento)');
        console.log(`🔄 Location: ${res.headers.location || 'Não especificado'}`);
        reject(new Error('Endpoint retornando 302 em vez de stream SSE'));
        return;
      }
      
      if (res.statusCode !== 200) {
        console.log(`❌ PROBLEMA: Status code inesperado: ${res.statusCode}`);
        reject(new Error(`Status code inesperado: ${res.statusCode}`));
        return;
      }
      
      if (res.headers['content-type'] !== 'text/event-stream; charset=utf-8') {
        console.log(`⚠️  Content-Type inesperado: ${res.headers['content-type']}`);
      }
      
      console.log('✅ Conexão SSE estabelecida com sucesso!');
      
      let eventCount = 0;
      let dataBuffer = '';
      
      const timeout = setTimeout(() => {
        console.log('⏰ Timeout atingido - fechando conexão');
        req.destroy();
        resolve(`Teste concluído. ${eventCount} eventos recebidos.`);
      }, 10000); // 10 segundos
      
      res.on('data', (chunk) => {
        dataBuffer += chunk.toString();
        
        // Processar eventos completos (terminam com \n\n)
        const events = dataBuffer.split('\n\n');
        dataBuffer = events.pop() || ''; // Manter último evento incompleto
        
        events.forEach(eventData => {
          if (eventData.trim().startsWith('data: ')) {
            try {
              const jsonData = eventData.replace('data: ', '');
              const event = JSON.parse(jsonData);
              eventCount++;
              
              console.log(`📡 Evento ${eventCount}: [${event.type}] ${event.step}`);
              
              if (event.type === 'init') {
                console.log('🎯 Evento inicial recebido - SSE funcionando!');
              }
              
            } catch (err) {
              console.log(`⚠️  Erro ao parsear evento:`, err.message);
            }
          }
        });
      });
      
      res.on('end', () => {
        clearTimeout(timeout);
        console.log('🔚 Conexão encerrada pelo servidor');
        resolve(`Teste concluído. ${eventCount} eventos recebidos.`);
      });
      
      res.on('error', (err) => {
        clearTimeout(timeout);
        console.error('❌ Erro na resposta:', err.message);
        reject(err);
      });
    });
    
    req.on('error', (err) => {
      console.error('❌ Erro na requisição:', err.message);
      
      if (err.code === 'ECONNREFUSED') {
        reject(new Error('Servidor não está rodando. Execute: npm run dev'));
      } else {
        reject(err);
      }
    });
    
    req.end();
  });
}

// Executar teste
if (require.main === module) {
  testSSEEndpoint()
    .then(result => {
      console.log('\n✅', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Teste falhou:', error.message);
      process.exit(1);
    });
}

module.exports = { testSSEEndpoint }; 