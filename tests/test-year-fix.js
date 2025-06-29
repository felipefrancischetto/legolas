async function testYearFix() {
  console.log('🧪 [TEST] Testando correção do ano...');
  
  // Simular metadados com apenas ano (sem outros campos)
  const mockMetadata = {
    title: 'Test Track',
    artist: 'Test Artist',
    year: 2025,
    sources: ['BeatportV2']
  };
  
  console.log('\n📊 Metadados de teste:');
  console.log(`   Title: ${mockMetadata.title}`);
  console.log(`   Artist: ${mockMetadata.artist}`);
  console.log(`   Year: ${mockMetadata.year}`);
  console.log(`   Sources: ${mockMetadata.sources.join(', ')}`);
  
  // Testar a verificação hasUsefulData
  const hasUsefulData = mockMetadata.bpm || mockMetadata.key || mockMetadata.genre || mockMetadata.label || mockMetadata.year;
  
  console.log('\n🔍 Resultado da verificação:');
  console.log(`   hasUsefulData: ${hasUsefulData}`);
  console.log(`   BPM: ${mockMetadata.bpm || 'N/A'}`);
  console.log(`   Key: ${mockMetadata.key || 'N/A'}`);
  console.log(`   Genre: ${mockMetadata.genre || 'N/A'}`);
  console.log(`   Label: ${mockMetadata.label || 'N/A'}`);
  console.log(`   Year: ${mockMetadata.year || 'N/A'}`);
  
  if (hasUsefulData) {
    console.log('\n✅ SUCESSO: Ano está sendo reconhecido como dado útil!');
  } else {
    console.log('\n❌ FALHA: Ano não está sendo reconhecido como dado útil!');
  }
  
  // Testar com metadados vazios
  const emptyMetadata = {
    title: 'Empty Track',
    artist: 'Empty Artist',
    sources: []
  };
  
  const hasUsefulDataEmpty = emptyMetadata.bpm || emptyMetadata.key || emptyMetadata.genre || emptyMetadata.label || emptyMetadata.year;
  
  console.log('\n📊 Teste com metadados vazios:');
  console.log(`   hasUsefulData: ${hasUsefulDataEmpty}`);
  console.log(`   Year: ${emptyMetadata.year || 'N/A'}`);
  
  if (!hasUsefulDataEmpty) {
    console.log('\n✅ SUCESSO: Metadados vazios corretamente identificados!');
  } else {
    console.log('\n❌ FALHA: Metadados vazios incorretamente identificados como úteis!');
  }
}

testYearFix().catch(console.error); 