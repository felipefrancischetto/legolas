const fs = require('fs');
const path = require('path');

async function checkStatus() {
  console.log('🔍 VERIFICANDO STATUS DOS ARQUIVOS BAIXADOS');
  console.log('=' .repeat(60));
  
  const musicasDir = path.join(__dirname, 'Musicas');
  
  try {
    // Verificar se a pasta existe
    if (!fs.existsSync(musicasDir)) {
      console.log('❌ Pasta Musicas não encontrada');
      return;
    }
    
    // Listar arquivos FLAC
    const files = fs.readdirSync(musicasDir).filter(file => file.endsWith('.flac'));
    
    console.log(`📁 Pasta: ${musicasDir}`);
    console.log(`🎵 Total de arquivos FLAC: ${files.length}`);
    console.log('');
    
    if (files.length === 0) {
      console.log('⚠️  Nenhum arquivo FLAC encontrado');
      return;
    }
    
    console.log('📋 LISTA DE ARQUIVOS:');
    console.log('-'.repeat(60));
    
    files.forEach((file, index) => {
      const filePath = path.join(musicasDir, file);
      const stats = fs.statSync(filePath);
      
      console.log(`${index + 1}. ${file}`);
      console.log(`   📏 Tamanho: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`   📅 Criado: ${stats.birthtime.toLocaleString()}`);
      console.log('');
    });
    
    // Verificar se há arquivo de metadados
    const metadataFile = path.join(musicasDir, 'metadata.json');
    if (fs.existsSync(metadataFile)) {
      console.log('📊 METADADOS ENCONTRADOS:');
      console.log('-'.repeat(60));
      
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
        console.log(JSON.stringify(metadata, null, 2));
      } catch (error) {
        console.log('❌ Erro ao ler metadados:', error.message);
      }
    } else {
      console.log('⚠️  Arquivo de metadados não encontrado');
    }
    
    console.log('');
    console.log('🌐 ACESSE A INTERFACE EM: http://localhost:3000');
    console.log('📂 PÁGINA DE ARQUIVOS: http://localhost:3000/files');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

checkStatus(); 