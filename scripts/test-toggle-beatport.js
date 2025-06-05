/**
 * Teste do Toggle Beatport em Downloads
 * 
 * Demonstra como usar o toggle useBeatport=true nos downloads
 * 
 * Uso:
 * node scripts/test-toggle-beatport.js
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

async function testMetadataWithBeatport() {
  console.log('🎯 TESTE DO TOGGLE BEATPORT 🎯\n');
  
  const testTrack = { title: 'Animals', artist: 'Martin Garrix' };
  
  console.log('📊 Comparando resultados COM e SEM Beatport...\n');
  
  // Teste SEM Beatport (padrão)
  console.log('🔸 Teste SEM Beatport (fontes padrão):');
  try {
    const withoutBeatport = await makeRequest('/api/enhanced-metadata', 'POST', {
      ...testTrack,
      useBeatport: false
    });
    
    if (withoutBeatport.success) {
      console.log(`  ✅ Fontes: ${withoutBeatport.metadata.sources?.join(', ') || 'Nenhuma'}`);
      console.log(`  📊 BPM: ${withoutBeatport.metadata.bpm || 'N/A'}`);
      console.log(`  🎵 Key: ${withoutBeatport.metadata.key || 'N/A'}`);
      console.log(`  🏷️  Label: ${withoutBeatport.metadata.label || 'N/A'}`);
    } else {
      console.log(`  ❌ Erro: ${withoutBeatport.error}`);
    }
  } catch (error) {
    console.log(`  ❌ Erro: ${error.message}`);
  }
  
  console.log('\n🔹 Teste COM Beatport (modo Beatport):');
  try {
    const withBeatport = await makeRequest('/api/enhanced-metadata', 'POST', {
      ...testTrack,
      useBeatport: true
    });
    
    if (withBeatport.success) {
      console.log(`  ✅ Fontes: ${withBeatport.metadata.sources?.join(', ') || 'Nenhuma'}`);
      console.log(`  📊 BPM: ${withBeatport.metadata.bpm || 'N/A'}`);
      console.log(`  🎵 Key: ${withBeatport.metadata.key || 'N/A'}`);
      console.log(`  🏷️  Label: ${withBeatport.metadata.label || 'N/A'}`);
      console.log(`  🎯 Modo Beatport: ${withBeatport.beatportMode ? 'ATIVADO' : 'DESATIVADO'}`);
      
      if (withBeatport.metadata.sources?.includes('Beatport')) {
        console.log('  🎉 DADOS DO BEATPORT ENCONTRADOS! ✨');
      } else {
        console.log('  ⚠️  Beatport não encontrou esta track (usando fallback)');
      }
    } else {
      console.log(`  ❌ Erro: ${withBeatport.error}`);
    }
  } catch (error) {
    console.log(`  ❌ Erro: ${error.message}`);
  }
}

async function demonstrateAPIUsage() {
  console.log('\n📖 COMO USAR O TOGGLE BEATPORT:\n');
  
  console.log('🔸 Download Individual SEM Beatport:');
  console.log('  GET /api/download?url=VIDEO_URL&format=mp3');
  console.log('  (Usa fontes padrão: MusicBrainz, etc.)\n');
  
  console.log('🔹 Download Individual COM Beatport:');
  console.log('  GET /api/download?url=VIDEO_URL&format=mp3&useBeatport=true');
  console.log('  (Prioriza Beatport para BPM/key precisos)\n');
  
  console.log('🔸 Playlist SEM Beatport:');
  console.log('  GET /api/playlist?url=PLAYLIST_URL&format=mp3&enhanceMetadata=true');
  console.log('  (Usa fontes padrão para todos os tracks)\n');
  
  console.log('🔹 Playlist COM Beatport:');
  console.log('  GET /api/playlist?url=PLAYLIST_URL&format=mp3&enhanceMetadata=true&useBeatport=true');
  console.log('  (Usa Beatport para cada track da playlist)\n');
  
  console.log('⚡ RECOMENDAÇÃO:');
  console.log('  - Use useBeatport=true para música ELETRÔNICA');
  console.log('  - Use padrão (false) para outros gêneros');
  console.log('  - Beatport é mais lento mas muito mais preciso para EDM');
}

async function main() {
  await testMetadataWithBeatport();
  await demonstrateAPIUsage();
  
  console.log('\n✅ SISTEMA PRONTO!');
  console.log('Agora você pode usar o toggle useBeatport=true nos seus downloads! 🎉');
}

main().catch(console.error); 