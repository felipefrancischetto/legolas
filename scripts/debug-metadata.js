/**
 * Debug detalhado do processo de metadados
 * 
 * Testa cada provider individualmente e mostra os resultados agregados
 * 
 * Uso:
 * node scripts/debug-metadata.js
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

async function debugMetadata() {
  console.log('🔍 DEBUG DETALHADO DE METADADOS\n');
  
  const testCases = [
    {
      title: 'Animals',
      artist: 'Martin Garrix',
      description: 'Track famosa de EDM'
    },
    {
      title: 'Titanium',
      artist: 'David Guetta',
      description: 'Hit mainstream'
    },
    {
      title: 'Levels',
      artist: 'Avicii',
      description: 'Clássico EDM'
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n🎵 TESTANDO: "${testCase.title}" - ${testCase.artist}`);
    console.log(`📝 Descrição: ${testCase.description}`);
    console.log('═'.repeat(60));

    try {
      // Teste SEM Beatport
      console.log('\n🔸 MODO NORMAL (sem Beatport):');
      const normalResponse = await makeRequest('/api/enhanced-metadata', 'POST', {
        title: testCase.title,
        artist: testCase.artist,
        useBeatport: false
      });

      if (normalResponse.success) {
        console.log('✅ Sucesso!');
        console.log(`📊 Fontes: ${normalResponse.metadata.sources?.join(', ') || 'Nenhuma'}`);
        console.log(`📈 Dados encontrados:`, {
          bpm: normalResponse.metadata.bpm || 'N/A',
          key: normalResponse.metadata.key || 'N/A',
          genre: normalResponse.metadata.genre || 'N/A',
          label: normalResponse.metadata.label || 'N/A',
          year: normalResponse.metadata.year || 'N/A',
          album: normalResponse.metadata.album || 'N/A',
          duration: normalResponse.metadata.duration || 'N/A'
        });
      } else {
        console.log('❌ Falhou:', normalResponse.error);
      }

      // Teste COM Beatport
      console.log('\n🔸 MODO BEATPORT (com Beatport):');
      const beatportResponse = await makeRequest('/api/enhanced-metadata', 'POST', {
        title: testCase.title,
        artist: testCase.artist,
        useBeatport: true
      });

      if (beatportResponse.success) {
        console.log('✅ Sucesso!');
        console.log(`📊 Fontes: ${beatportResponse.metadata.sources?.join(', ') || 'Nenhuma'}`);
        console.log(`📈 Dados encontrados:`, {
          bpm: beatportResponse.metadata.bpm || 'N/A',
          key: beatportResponse.metadata.key || 'N/A',
          genre: beatportResponse.metadata.genre || 'N/A',
          label: beatportResponse.metadata.label || 'N/A',
          year: beatportResponse.metadata.year || 'N/A',
          album: beatportResponse.metadata.album || 'N/A',
          duration: beatportResponse.metadata.duration || 'N/A'
        });

        // Comparação
        console.log('\n📊 COMPARAÇÃO:');
        const fields = ['bpm', 'key', 'genre', 'label', 'year'];
        fields.forEach(field => {
          const normal = normalResponse.metadata?.[field];
          const beatport = beatportResponse.metadata?.[field];
          
          if (normal !== beatport) {
            console.log(`   ${field}: Normal="${normal || 'N/A'}" vs Beatport="${beatport || 'N/A'}"`);
          }
        });

        // Verificar se Beatport trouxe dados novos
        const beatportSources = beatportResponse.metadata.sources || [];
        if (beatportSources.includes('Beatport')) {
          console.log('🎉 BEATPORT FUNCIONOU! Dados obtidos do Beatport!');
        } else {
          console.log('⚠️  Beatport habilitado mas não retornou dados');
        }

      } else {
        console.log('❌ Falhou:', beatportResponse.error);
      }

    } catch (error) {
      console.log('❌ Erro na conexão:', error.message);
    }

    console.log('\n' + '─'.repeat(60));
  }

  console.log('\n📋 RESUMO DO DEBUG:');
  console.log('- Verifique se cada provider está retornando dados');
  console.log('- Compare os resultados entre modo normal e Beatport');
  console.log('- Veja se os metadados estão sendo agregados corretamente');
}

debugMetadata().catch(console.error); 