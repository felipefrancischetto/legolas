// 🎯 TESTE DIRETO - SÓ TESTAR SE PEGA OS LINKS!
const { scrapeMusicLinks } = require('./lib/simpleScraper.js');

const url = 'https://www.1001tracklists.com/tracklist/p0wm1xt/joris-voorn-spectrum-radio-422-silo-brooklyn-united-states-2024-03-30-2025-05-23.html';

async function testeSimples() {
  console.log('🎯 TESTE DIRETO - EXTRAIR LINKS DAS MÚSICAS\n');
  console.log(`🔗 URL: ${url}\n`);
  
  const resultado = await scrapeMusicLinks(url);
  
  if (resultado.success) {
    console.log('🎉 SUCESSO!\n');
    console.log(`📀 Playlist: ${resultado.playlist.title}`);
    console.log(`🎧 Artista: ${resultado.playlist.artist}`);
    console.log(`📊 Total de faixas: ${resultado.totalTracks}`);
    console.log(`🔗 Faixas com links: ${resultado.tracksWithLinks}\n`);
    
    if (resultado.tracks.length > 0) {
      console.log('🎵 FAIXAS ENCONTRADAS:');
      console.log('='.repeat(50));
      
      resultado.tracks.forEach((track, i) => {
        console.log(`${i + 1}. ${track.title}`);
        if (track.links.length > 0) {
          track.links.forEach(link => {
            console.log(`   ${link.platform}: ${link.url}`);
          });
        } else {
          console.log('   (sem links encontrados)');
        }
        console.log('');
      });
    } else {
      console.log('❌ NENHUMA FAIXA ENCONTRADA');
    }
    
  } else {
    console.log('❌ FALHOU:', resultado.error);
  }
}

testeSimples(); 