/**
 * Script de teste para o sistema de metadados otimizado
 * 
 * Uso:
 * node scripts/test-metadata.js
 */

const https = require('https');
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

async function testProviderStatus() {
  console.log('🔍 Testando status dos provedores de metadados...\n');
  
  try {
    const response = await makeRequest('/api/enhanced-metadata');
    
    if (response.success) {
      console.log('✅ API de metadados funcionando!');
      console.log(`📊 Provedores configurados: ${response.configured}/${response.total}\n`);
      
      console.log('Status dos provedores:');
      for (const [provider, configured] of Object.entries(response.providers)) {
        const status = configured ? '✅' : '❌';
        const message = configured ? 'Configurado' : 'Não configurado';
        console.log(`${status} ${provider}: ${message}`);
      }
      
      console.log('\n💡 Dicas de configuração:');
      if (!response.providers.Spotify) {
        console.log('  - Configure SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET para BPM/key');
      }
      if (!response.providers['Last.fm']) {
        console.log('  - Configure LASTFM_API_KEY para gêneros');
      }
      if (!response.providers.Discogs) {
        console.log('  - Configure DISCOGS_TOKEN para labels');
      }
      
    } else {
      console.log('❌ Erro na API de metadados:', response.error);
    }
  } catch (error) {
    console.log('❌ Erro ao conectar com a API:', error.message);
    console.log('   Certifique-se de que o servidor está rodando em localhost:3000');
  }
}

async function testMetadataSearch() {
  console.log('\n🎵 Testando busca de metadados...\n');
  
  const testCases = [
    { title: 'Levels', artist: 'Avicii' },
    { title: 'One More Time', artist: 'Daft Punk' },
    { title: 'Strobe', artist: 'Deadmau5' }
  ];
  
  for (const testCase of testCases) {
    console.log(`🔍 Buscando: "${testCase.title}" - ${testCase.artist}`);
    
    try {
      const response = await makeRequest('/api/enhanced-metadata', 'POST', testCase);
      
      if (response.success) {
        const metadata = response.metadata;
        console.log(`  ✅ Encontrado! (${response.providersUsed} fontes: ${metadata.sources?.join(', ') || 'Unknown'})`);
        
        if (metadata.bpm) console.log(`     📊 BPM: ${metadata.bpm}`);
        if (metadata.key) console.log(`     🎵 Key: ${metadata.key}`);
        if (metadata.label) console.log(`     🏷️  Label: ${metadata.label}`);
        if (metadata.genre) console.log(`     🎭 Genre: ${metadata.genre}`);
        if (metadata.year) console.log(`     📅 Year: ${metadata.year}`);
      } else {
        console.log(`  ❌ Erro: ${response.error}`);
      }
    } catch (error) {
      console.log(`  ❌ Erro na busca: ${error.message}`);
    }
    
    console.log(''); // Linha em branco
  }
}

async function main() {
  console.log('🎵 TESTE DO SISTEMA DE METADADOS OTIMIZADO 🎵\n');
  console.log('=' * 50);
  
  await testProviderStatus();
  await testMetadataSearch();
  
  console.log('\n📋 RESUMO:');
  console.log('- Status dos provedores verificado');
  console.log('- Testes de busca executados');
  console.log('- Sistema pronto para downloads otimizados!');
  
  console.log('\n🚀 Para usar o sistema:');
  console.log('1. Downloads individuais: automático via /api/download');
  console.log('2. Downloads de playlist: via /api/playlist');
  console.log('3. Veja METADATA_OPTIMIZATION.md para mais detalhes');
}

main().catch(console.error); 