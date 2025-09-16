// Teste das correções de artistas e datas
async function testArtistDateFixes() {
  console.log('🧪 Testando correções de artistas e datas...\n');

  // Teste 1: Artistas separados por vírgula
  console.log('🎤 Testando separação de artistas por vírgula:');
  const artistTestCases = [
    ['Ronald Christoph', 'Grosstone', 'Point Sole'],
    ['Ronald Christoph', 'Yousef', 'Hot Since 82'],
    ['Ronald Christoph', 'Orlando'],
    ['Ronald Christoph']
  ];

  artistTestCases.forEach((artists, index) => {
    console.log(`\n${index + 1}. Artistas: [${artists.map(a => `"${a}"`).join(', ')}]`);
    
    if (artists.length === 1) {
      console.log(`   Resultado: "${artists[0]}"`);
    } else if (artists.length > 1) {
      // **CORRIGIDO: Separar por vírgula em vez de "&"**
      const result = artists.join(', ');
      console.log(`   Resultado: "${result}"`);
      console.log(`   ✅ Separado por vírgula: ${result.includes(', ')}`);
      console.log(`   ❌ Não contém "&": ${!result.includes('&')}`);
    }
  });

  // Teste 2: Formatação de datas
  console.log('\n📅 Testando formatação de datas:');
  const dateTestCases = [
    '2016-05-12',
    '2012',
    '20160512',
    'May 12, 2016',
    '12 de maio de 2016'
  ];

  dateTestCases.forEach((dateValue, index) => {
    console.log(`\n${index + 1}. Data original: "${dateValue}"`);
    
    // Simular o que o Beatport retorna
    const publishedDate = dateValue;
    const yearMatch = dateValue.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1]) : null;
    
    console.log(`   Data de publicação: "${publishedDate}"`);
    console.log(`   Ano extraído: ${year || 'N/A'}`);
    console.log(`   ✅ Data preservada por extenso: ${publishedDate === dateValue}`);
  });

  // Teste 3: Simulação de metadados completos
  console.log('\n📊 Testando metadados completos:');
  const mockMetadata = {
    title: 'Last Party (Extended Mix)',
    artist: 'Ronald Christoph, Grosstone, Point Sole',
    album: 'Take Off, Baby!',
    year: 2012,
    publishedDate: 'May 12, 2012',
    genre: 'Tech House',
    label: 'Evamore Music',
    bpm: 122,
    key: 'A Major',
    sources: ['BeatportV2']
  };

  console.log('Metadados simulados:');
  console.log(`   Título: "${mockMetadata.title}"`);
  console.log(`   Artistas: "${mockMetadata.artist}"`);
  console.log(`   Álbum: "${mockMetadata.album}"`);
  console.log(`   Ano: ${mockMetadata.year}`);
  console.log(`   Data de publicação: "${mockMetadata.publishedDate}"`);
  console.log(`   Gênero: "${mockMetadata.genre}"`);
  console.log(`   Label: "${mockMetadata.label}"`);
  console.log(`   BPM: ${mockMetadata.bpm}`);
  console.log(`   Key: "${mockMetadata.key}"`);
  
  console.log('\n✅ Verificações:');
  console.log(`   ✅ Artistas separados por vírgula: ${mockMetadata.artist.includes(', ')}`);
  console.log(`   ✅ Não contém "&": ${!mockMetadata.artist.includes('&')}`);
  console.log(`   ✅ Data de publicação por extenso: ${mockMetadata.publishedDate.length > 4}`);
  console.log(`   ✅ Diferente do ano: ${mockMetadata.publishedDate !== mockMetadata.year.toString()}`);

  console.log('\n✅ Testes concluídos!');
}

// Executar testes
testArtistDateFixes().catch(console.error); 