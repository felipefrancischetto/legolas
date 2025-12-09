// Teste das melhorias de metadados
async function testMetadataImprovements() {
  console.log('🧪 Testando melhorias de metadados...\n');

  // Teste 1: Títulos com Extended Mix
  const testCases = [
    {
      title: "Ronald Christoph - Last Party (Extended Mix)",
      artist: "Ronald Christoph",
      expected: {
        cleanTitle: "Last Party (Extended Mix)",
        cleanArtist: "Ronald Christoph"
      }
    },
    {
      title: "Take Off Baby feat Orlando (Original Mix)",
      artist: "Ronald Christoph",
      expected: {
        cleanTitle: "Take Off Baby feat Orlando (Original Mix)",
        cleanArtist: "Ronald Christoph"
      }
    },
    {
      title: "Last Party (Ronalds BMX)",
      artist: "Ronald Christoph",
      expected: {
        cleanTitle: "Last Party (Ronalds BMX)",
        cleanArtist: "Ronald Christoph"
      }
    }
  ];

  console.log('📋 Testando limpeza de títulos e extração de artistas:');
  testCases.forEach((testCase, index) => {
    console.log(`\n${index + 1}. Título original: "${testCase.title}"`);
    console.log(`   Artista original: "${testCase.artist}"`);
    
    // Simular o processamento do serviço
    const cleanTitle = testCase.title
      .replace(/\s*\(Official.*?\)/gi, '')
      .replace(/\s*\[Official.*?\]/gi, '')
      .replace(/\s*-\s*Official.*$/gi, '')
      .replace(/\s*\(Audio\)/gi, '')
      .replace(/\s*\[Audio\]/gi, '')
      .replace(/\s*\(Music Video\)/gi, '')
      .replace(/\s*\[Music Video\]/gi, '')
      .replace(/\s*\(HD\)/gi, '')
      .replace(/\s*\[HD\]/gi, '')
      .replace(/\s*\(4K\)/gi, '')
      .replace(/\s*\[4K\]/gi, '')
      .replace(/\s*\(Lyric.*?\)/gi, '')
      .replace(/\s*\[Lyric.*?\]/gi, '')
      .replace(/\s*\(Visualizer\)/gi, '')
      .replace(/\s*\[Visualizer\]/gi, '')
      .replace(/\s*\(Extended Mix\)\s*\(Extended Mix\)/gi, ' (Extended Mix)')
      .replace(/\s*\(Remix\)\s*\(Remix\)/gi, ' (Remix)')
      .replace(/\s*\(Edit\)\s*\(Edit\)/gi, ' (Edit)')
      .replace(/\s*\(Original Mix\)\s*\(Original Mix\)/gi, ' (Original Mix)')
      .replace(/\s*\(Club Mix\)\s*\(Club Mix\)/gi, ' (Club Mix)')
      .replace(/\s*\(Radio Edit\)\s*\(Radio Edit\)/gi, ' (Radio Edit)')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`   Título limpo: "${cleanTitle}"`);
    console.log(`   ✅ Extended Mix preservado: ${cleanTitle.includes('Extended Mix')}`);
    console.log(`   ✅ Original Mix preservado: ${cleanTitle.includes('Original Mix')}`);
  });

  // Teste 2: Extração de artistas
  console.log('\n🎤 Testando extração de artistas:');
  const artistTestCases = [
    "Ronald Christoph - Last Party (Extended Mix)",
    "Take Off Baby feat Orlando (Original Mix)",
    "Last Party (Ronalds BMX)",
    "Artist A & Artist B - Collaboration Track",
    "Track Name (Some Artist)"
  ];

  artistTestCases.forEach((title, index) => {
    console.log(`\n${index + 1}. Título: "${title}"`);
    
    // Simular extração de artista
    let extractedArtist = '';
    
    // Padrão "Artist - Title"
    const dashMatch = title.match(/^([^-]+?)\s*-\s*(.+)$/);
    if (dashMatch) {
      const possibleArtist = dashMatch[1].trim();
      if (possibleArtist.length <= 50 && /[a-zA-Z]/.test(possibleArtist) && 
          !/(remix|edit|mix|version|vocal|dub|bootleg|rework|extended|club|radio)/i.test(possibleArtist)) {
        extractedArtist = possibleArtist;
      }
    }

    // Padrão "Title feat. Artist"
    if (!extractedArtist) {
      const featMatch = title.match(/(.+?)\s+(?:feat\.?|featuring|ft\.?|by)\s+([^-]+?)(?:\s*\(|$)/i);
      if (featMatch) {
        const possibleArtist = featMatch[2].trim();
        if (possibleArtist.length <= 50 && /[a-zA-Z]/.test(possibleArtist)) {
          extractedArtist = possibleArtist;
        }
      }
    }

    // Padrão "Title (Artist)"
    if (!extractedArtist) {
      const parenMatch = title.match(/(.+?)\s*\(([^)]+?)\)$/);
      if (parenMatch) {
        const possibleArtist = parenMatch[2].trim();
        if (possibleArtist.length <= 50 && 
            /[a-zA-Z]/.test(possibleArtist) && 
            !/(remix|edit|mix|version|vocal|dub|bootleg|rework|extended|club|radio|original)/i.test(possibleArtist)) {
          extractedArtist = possibleArtist;
        }
      }
    }

    // Padrão "Artist & Artist"
    if (!extractedArtist) {
      const collabMatch = title.match(/^([^&\-]+?)\s*(?:&|vs|feat\.?|featuring)\s+([^&\-]+?)(?:\s*\(|$)/i);
      if (collabMatch) {
        const artist1 = collabMatch[1].trim();
        const artist2 = collabMatch[2].trim();
        if (artist1.length <= 30 && artist2.length <= 30 && 
            /[a-zA-Z]/.test(artist1) && /[a-zA-Z]/.test(artist2)) {
          extractedArtist = `${artist1} & ${artist2}`;
        }
      }
    }

    console.log(`   Artista extraído: "${extractedArtist}"`);
    console.log(`   ✅ Extração bem-sucedida: ${extractedArtist.length > 0}`);
  });

  // Teste 3: Processamento de datas
  console.log('\n📅 Testando processamento de datas:');
  const dateTestCases = [
    "2016-05-12",
    "2012",
    "20160512",
    "Invalid Date",
    "2025"
  ];

  dateTestCases.forEach((dateValue, index) => {
    console.log(`\n${index + 1}. Data original: "${dateValue}"`);
    
    // Simular processamento de data
    const yearMatch = dateValue.match(/(\d{4})/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      const currentYear = new Date().getFullYear();
      if (year >= 1900 && year <= currentYear + 1) {
        console.log(`   ✅ Ano extraído: ${year}`);
        console.log(`   ✅ Ano válido: ${year >= 1900 && year <= currentYear + 1}`);
      } else {
        console.log(`   ❌ Ano inválido: ${year}`);
      }
    } else {
      console.log(`   ❌ Nenhum ano encontrado`);
    }
  });

  console.log('\n✅ Testes concluídos!');
}

// Executar testes
testMetadataImprovements().catch(console.error); 