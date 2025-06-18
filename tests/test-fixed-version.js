const { BeatportProviderV2Fixed } = require('./beatport-fixed.js');

async function testFixedVersion() {
  console.log('🧪 Testando BeatportProviderV2Fixed com JavaScript puro...\n');
  
  const provider = new BeatportProviderV2Fixed();
  
  // Teste 1: Be Wise, Be Warned - Barac (sabemos que tem dados corretos)
  console.log('📡 Teste 1: "Be Wise, Be Warned, O Rulers of the Earth" - "Barac"');
  console.log('🎯 Esperado: BPM=127, Key=F Minor, Genre=Electronica, Label=Cronos');
  console.log('═'.repeat(80));
  
  try {
    const startTime = Date.now();
    const result1 = await provider.search('Be Wise, Be Warned, O Rulers of the Earth', 'Barac');
    const duration1 = Date.now() - startTime;
    
    if (result1) {
      console.log(`✅ Sucesso em ${duration1}ms!`);
      console.log(`   🎤 Artist: ${result1.artist || 'N/A'}`);
      console.log(`   🎵 BPM: ${result1.bpm || 'N/A'}`);
      console.log(`   🔑 Key: ${result1.key || 'N/A'}`);
      console.log(`   🎭 Genre: ${result1.genre || 'N/A'}`);
      console.log(`   🏷️  Label: ${result1.label || 'N/A'}`);
      
      // Validar dados
      console.log(`\n📊 Validação:`);
      console.log(`   BPM: ${result1.bpm === 127 ? '✅' : '❌'} (${result1.bpm} vs 127)`);
      console.log(`   Key: ${result1.key === 'F Minor' ? '✅' : '❌'} (${result1.key} vs F Minor)`);
      console.log(`   Genre: ${result1.genre === 'Electronica' ? '✅' : '❌'} (${result1.genre} vs Electronica)`);
      console.log(`   Label: ${result1.label === 'Cronos' ? '✅' : '❌'} (${result1.label} vs Cronos)`);
    } else {
      console.log(`❌ Falhou em ${duration1}ms - nenhum resultado`);
    }
  } catch (error) {
    console.error(`❌ Erro: ${error.message}`);
  }
  
  console.log('\n' + '═'.repeat(80));
  
  // Teste 2: Strobe - deadmau5 (sabemos que tem dados diferentes)
  console.log('\n📡 Teste 2: "Strobe" - "deadmau5"');
  console.log('🎯 Esperado na página: BPM=88, Key=Ab Minor, Genre=Progressive House, Label=Virgin');
  console.log('═'.repeat(80));
  
  try {
    const startTime = Date.now();
    const result2 = await provider.search('Strobe', 'deadmau5');
    const duration2 = Date.now() - startTime;
    
    if (result2) {
      console.log(`✅ Sucesso em ${duration2}ms!`);
      console.log(`   🎤 Artist: ${result2.artist || 'N/A'}`);
      console.log(`   🎵 BPM: ${result2.bpm || 'N/A'}`);
      console.log(`   🔑 Key: ${result2.key || 'N/A'}`);
      console.log(`   🎭 Genre: ${result2.genre || 'N/A'}`);
      console.log(`   🏷️  Label: ${result2.label || 'N/A'}`);
      
      // Validar dados da página
      console.log(`\n📊 Validação (dados da página):`);
      console.log(`   BPM: ${result2.bpm === 88 ? '✅' : '❌'} (${result2.bpm} vs 88)`);
      console.log(`   Key: ${result2.key === 'Ab Minor' ? '✅' : '❌'} (${result2.key} vs Ab Minor)`);
      console.log(`   Genre: ${result2.genre === 'Progressive House' ? '✅' : '❌'} (${result2.genre} vs Progressive House)`);
      console.log(`   Label: ${result2.label === 'Virgin' ? '✅' : '❌'} (${result2.label} vs Virgin)`);
    } else {
      console.log(`❌ Falhou em ${duration2}ms - nenhum resultado`);
    }
  } catch (error) {
    console.error(`❌ Erro: ${error.message}`);
  }
  
  console.log('\n🏁 Teste da versão corrigida concluído!');
}

testFixedVersion().catch(console.error); 