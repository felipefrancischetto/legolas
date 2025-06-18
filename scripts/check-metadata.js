const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function checkFileMetadata() {
  console.log('🔍 VERIFICANDO METADADOS DOS ARQUIVOS BAIXADOS');
  console.log('=' .repeat(60));
  
  const musicasDir = path.join(__dirname, 'Musicas');
  
  if (!fs.existsSync(musicasDir)) {
    console.log('❌ Pasta Musicas não encontrada');
    return;
  }
  
  const files = fs.readdirSync(musicasDir).filter(file => file.endsWith('.flac'));
  
  if (files.length === 0) {
    console.log('❌ Nenhum arquivo FLAC encontrado');
    return;
  }
  
  console.log(`📁 Encontrados ${files.length} arquivos FLAC:`);
  console.log('');
  
  for (const file of files) {
    const filePath = path.join(musicasDir, file);
    
    console.log(`🎵 ARQUIVO: ${file}`);
    console.log('-'.repeat(50));
    
    try {
      await new Promise((resolve, reject) => {
        exec(`ffprobe -v quiet -print_format json -show_format "${filePath}"`, (error, stdout, stderr) => {
          if (error) {
            console.log(`❌ Erro ao ler metadados: ${error.message}`);
            reject(error);
            return;
          }
          
          try {
            const metadata = JSON.parse(stdout);
            const tags = metadata.format?.tags || {};
            
            console.log(`📊 METADADOS ENCONTRADOS:`);
            console.log(`   🎤 Artist: ${tags.artist || tags.ARTIST || 'N/A'}`);
            console.log(`   🎵 Title: ${tags.title || tags.TITLE || 'N/A'}`);
            console.log(`   💓 BPM: ${tags.bpm || tags.BPM || 'N/A'}`);
            console.log(`   🔑 Key: ${tags.initialKey || tags.initialkey || tags.KEY || 'N/A'}`);
            console.log(`   🎭 Genre: ${tags.genre || tags.GENRE || 'N/A'}`);
            console.log(`   🏷️  Label: ${tags.label || tags.LABEL || 'N/A'}`);
            console.log(`   📅 Year: ${tags.date || tags.DATE || tags.year || tags.YEAR || 'N/A'}`);
            console.log(`   💽 Album: ${tags.album || tags.ALBUM || 'N/A'}`);
            
            // Verificar se há dados do Beatport
            const hasBeatportData = tags.bpm || tags.BPM || tags.initialKey || tags.initialkey || tags.label || tags.LABEL;
            console.log(`   🎯 Dados Beatport: ${hasBeatportData ? '✅ SIM' : '❌ NÃO'}`);
            
            // Mostrar todas as tags disponíveis
            console.log(`   📋 Total de tags: ${Object.keys(tags).length}`);
            if (Object.keys(tags).length > 0) {
              console.log(`   🔑 Tags disponíveis: ${Object.keys(tags).join(', ')}`);
            }
            
          } catch (parseError) {
            console.log(`❌ Erro ao analisar metadados: ${parseError.message}`);
          }
          
          resolve();
        });
      });
      
    } catch (error) {
      console.log(`❌ Erro: ${error.message}`);
    }
    
    console.log('');
  }
}

checkFileMetadata(); 