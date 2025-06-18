const axios = require('axios');

async function testStatusConsistency() {
  console.log('🧪 [Test Status Consistency] Verificando consistência do status entre processamento e interface...');
  
  try {
    // URL de teste do YouTube (pequena)
    const testUrl = 'https://www.youtube.com/watch?v=SJrPVMT351I&list=PLnLlwmUgI-e0_jlM3sLk-P_qZyYgoeIvS&ab_channel=ArmadaMusicTV';
    
    console.log('📋 URL de teste:', testUrl);
    console.log('🔄 Iniciando download com monitoramento de status...\n');
    
    const startTime = Date.now();
    
    // Fazer o request para o novo fluxo
    const response = await axios.get(`http://localhost:3000/api/playlist`, {
      params: {
        url: testUrl,
        format: 'mp3',
        enhanceMetadata: true,
        useBeatport: true
      },
      timeout: 120000 // 2 minutos para teste
    });
    
    const totalDuration = Date.now() - startTime;
    
    console.log('✅ Download concluído!');
    console.log(`⏱️ Tempo total: ${(totalDuration / 1000).toFixed(1)}s\n`);
    
    // Análise detalhada do status
    console.log('📊 ANÁLISE DE STATUS:');
    console.log('========================');
    
    const data = response.data;
    
    console.log('🎯 Status Principal:');
    console.log(`   - Success: ${data.success}`);
    console.log(`   - Total tracks: ${data.totalTracks || 'N/A'}`);
    console.log(`   - Processed tracks: ${data.processedTracks || 'N/A'}`);
    console.log(`   - Enhanced tracks: ${data.enhancedTracks || 'N/A'}`);
    console.log(`   - Beatport tracks: ${data.beatportTracksFound || 'N/A'}`);
    console.log(`   - Errors: ${(data.errors || []).length}`);
    
    // Cálculos de consistência
    const totalTracks = data.totalTracks || 0;
    const processedTracks = data.processedTracks || 0;
    const enhancedTracks = data.enhancedTracks || 0;
    const beatportTracks = data.beatportTracksFound || 0;
    
    console.log('\n🔍 VERIFICAÇÃO DE CONSISTÊNCIA:');
    
    // Teste 1: Total vs Processed
    if (totalTracks > 0 && processedTracks > 0) {
      const processRate = ((processedTracks / totalTracks) * 100).toFixed(1);
      console.log(`   ✓ Taxa de processamento: ${processRate}% (${processedTracks}/${totalTracks})`);
      
      if (processedTracks === totalTracks) {
        console.log(`   ✅ CONSISTENTE: Todas as tracks foram processadas`);
      } else if (processedTracks < totalTracks) {
        console.log(`   ⚠️ INCONSISTENTE: ${totalTracks - processedTracks} tracks não processadas`);
      } else {
        console.log(`   🚨 ERRO: Processadas mais tracks do que o total!`);
      }
    } else {
      console.log(`   ❌ ERRO: Dados de processamento ausentes ou zero`);
    }
    
    // Teste 2: Enhanced vs Processed
    if (processedTracks > 0 && enhancedTracks >= 0) {
      const enhanceRate = ((enhancedTracks / processedTracks) * 100).toFixed(1);
      console.log(`   ✓ Taxa de enhancement: ${enhanceRate}% (${enhancedTracks}/${processedTracks})`);
      
      if (enhancedTracks <= processedTracks) {
        console.log(`   ✅ CONSISTENTE: Enhanced tracks ≤ Processed tracks`);
      } else {
        console.log(`   🚨 ERRO: Enhanced tracks > Processed tracks!`);
      }
    } else {
      console.log(`   ❌ ERRO: Dados de enhancement inconsistentes`);
    }
    
    // Teste 3: Beatport vs Enhanced
    if (enhancedTracks > 0 && beatportTracks >= 0) {
      const beatportRate = ((beatportTracks / enhancedTracks) * 100).toFixed(1);
      console.log(`   ✓ Taxa de Beatport: ${beatportRate}% (${beatportTracks}/${enhancedTracks})`);
      
      if (beatportTracks <= enhancedTracks) {
        console.log(`   ✅ CONSISTENTE: Beatport tracks ≤ Enhanced tracks`);
      } else {
        console.log(`   🚨 ERRO: Beatport tracks > Enhanced tracks!`);
      }
    } else {
      console.log(`   ⚠️ Sem dados de Beatport ou enhancement`);
    }
    
    // Teste 4: Verificar erros
    if (data.errors && data.errors.length > 0) {
      console.log(`\n🚨 ERROS DETECTADOS (${data.errors.length}):`);
      data.errors.slice(0, 3).forEach((error, idx) => {
        console.log(`   ${idx + 1}. ${error}`);
      });
      if (data.errors.length > 3) {
        console.log(`   ... e mais ${data.errors.length - 3} erros`);
      }
    } else {
      console.log(`   ✅ Nenhum erro reportado`);
    }
    
    // Resumo final
    console.log('\n🎯 RESUMO DA CONSISTÊNCIA:');
    const isFullyConsistent = (
      processedTracks === totalTracks &&
      enhancedTracks <= processedTracks &&
      beatportTracks <= enhancedTracks &&
      data.success
    );
    
    if (isFullyConsistent) {
      console.log(`   🎉 STATUS TOTALMENTE CONSISTENTE!`);
      console.log(`   ✅ Novo fluxo sequencial funcionando corretamente`);
    } else {
      console.log(`   ⚠️ INCONSISTÊNCIAS DETECTADAS:`);
      console.log(`   🔧 Possíveis causas:`);
      if (processedTracks !== totalTracks) {
        console.log(`      - Nem todas as tracks foram processadas`);
      }
      if (enhancedTracks > processedTracks) {
        console.log(`      - Contador de enhanced incorreto`);
      }
      if (beatportTracks > enhancedTracks) {
        console.log(`      - Contador de Beatport incorreto`);
      }
    }
    
    // Sugestões de correção
    if (!isFullyConsistent) {
      console.log('\n💡 SUGESTÕES DE CORREÇÃO:');
      console.log(`   1. Verificar logs do servidor para erros durante processamento`);
      console.log(`   2. Confirmar se contadores estão sendo atualizados corretamente`);
      console.log(`   3. Verificar se o novo fluxo sequencial está sincronizado`);
    }
    
    return isFullyConsistent;
    
  } catch (error) {
    console.error('\n💥 Erro no teste:', error.response?.data || error.message);
    
    if (error.code === 'ECONNABORTED') {
      console.log('⏰ Timeout - teste incompleto');
    } else if (error.response?.status === 500) {
      console.log('🚨 Erro interno do servidor - verificar logs');
    }
    
    return false;
  }
}

console.log('🚀 Iniciando teste de consistência de status...');
testStatusConsistency(); 