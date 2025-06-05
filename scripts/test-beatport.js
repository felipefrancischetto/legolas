/**
 * Teste específico para o Beatport Provider
 * 
 * Uso:
 * node scripts/test-beatport.js
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

async function testBeatportTracks() {
  console.log('🎵 TESTE ESPECÍFICO DO BEATPORT PROVIDER 🎵\n');
  
  // Tracks que provavelmente estão no Beatport (música eletrônica recente)
  const beatportTracks = [
    { title: 'Titanium', artist: 'David Guetta' },
    { title: 'Animals', artist: 'Martin Garrix' },
    { title: 'Clarity', artist: 'Zedd' },
    { title: 'Wake Me Up', artist: 'Avicii' },
    { title: 'Tremor', artist: 'Dimitri Vegas' }
  ];
  
  console.log('🔍 Testando tracks de música eletrônica...\n');
  
  for (const track of beatportTracks) {
    console.log(`🎧 Buscando: "${track.title}" - ${track.artist}`);
    
    try {
      const response = await makeRequest('/api/enhanced-metadata', 'POST', track);
      
      if (response.success) {
        const metadata = response.metadata;
        console.log(`  ✅ Encontrado! (${response.providersUsed} fontes: ${metadata.sources?.join(', ') || 'Unknown'})`);
        
        // Mostrar todos os dados encontrados
        if (metadata.bpm) console.log(`     📊 BPM: ${metadata.bpm}`);
        if (metadata.key) console.log(`     🎵 Key: ${metadata.key}`);
        if (metadata.label) console.log(`     🏷️  Label: ${metadata.label}`);
        if (metadata.genre) console.log(`     🎭 Genre: ${metadata.genre}`);
        if (metadata.year) console.log(`     📅 Year: ${metadata.year}`);
        if (metadata.album) console.log(`     💿 Album: ${metadata.album}`);
        
        // Verificar se temos dados do Beatport
        const hasBeatportData = metadata.sources?.includes('Beatport');
        if (hasBeatportData) {
          console.log('     🎯 DADOS DO BEATPORT ENCONTRADOS! ✨');
        } else {
          console.log('     ⚠️  Apenas dados de outras fontes');
        }
        
      } else {
        console.log(`  ❌ Erro: ${response.error}`);
      }
    } catch (error) {
      console.log(`  ❌ Erro na busca: ${error.message}`);
    }
    
    console.log(''); // Linha em branco
    
    // Delay entre requests para não sobrecarregar
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log('\n📊 RESUMO DO TESTE:');
  console.log('- Se viu "DADOS DO BEATPORT ENCONTRADOS!" = Sucesso! 🎉');
  console.log('- Se apenas outras fontes = Beatport pode não ter a track ou houve erro');
  console.log('- Beatport é especializado em música eletrônica');
}

testBeatportTracks().catch(console.error); 