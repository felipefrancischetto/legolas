const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function testDownloadSpeed() {
  console.log('🚀 Testando velocidade de download otimizada...\n');
  
  const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rick Roll para teste
  const startTime = Date.now();
  
  try {
    console.log('📥 Iniciando download individual (skipMetadata=true por padrão)...');
    
    const { stdout } = await execAsync(
      `curl -s "http://localhost:3000/api/download?url=${encodeURIComponent(testUrl)}&format=mp3"`
    );
    
    const duration = Date.now() - startTime;
    console.log(`✅ Download concluído em ${duration}ms`);
    console.log(`📊 Tempo médio: ${duration}ms por faixa`);
    
    // Calcular tempo estimado para playlist de 20 faixas
    const estimatedPlaylistTime = duration * 20 / 1000; // em segundos
    console.log(`📈 Tempo estimado para playlist de 20 faixas: ${estimatedPlaylistTime.toFixed(1)}s (${(estimatedPlaylistTime/60).toFixed(1)}min)`);
    
    console.log('\n🎯 Otimizações aplicadas:');
    console.log('   • skipMetadata=true por padrão (downloads rápidos)');
    console.log('   • Timeout Beatport reduzido: 30s → 15s');
    console.log('   • Browser headless: true (mais rápido)');
    console.log('   • Delays reduzidos: 3s → 1s entre faixas');
    console.log('   • Delay individual: 2s → 500ms');
    console.log('   • FFmpeg otimizado para Windows');
    
    console.log('\n💡 Para metadados completos use: skipMetadata=false&useBeatport=true');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

testDownloadSpeed(); 