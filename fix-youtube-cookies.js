const { execSync } = require('child_process');
const fs = require('fs');

console.log('🔧 [Fix YouTube Cookies] Resolvendo problema de bloqueio do YouTube...\n');

// Método 1: Extrair cookies do browser automaticamente
console.log('🍪 MÉTODO 1: Extraindo cookies do Chrome automaticamente...');
try {
  execSync('yt-dlp --cookies-from-browser chrome --write-info-json --skip-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ"', {
    stdio: 'inherit',
    timeout: 30000
  });
  console.log('✅ Cookies extraídos do Chrome com sucesso!');
} catch (error) {
  console.log('❌ Falha ao extrair do Chrome, tentando Firefox...');
  
  try {
    execSync('yt-dlp --cookies-from-browser firefox --write-info-json --skip-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ"', {
      stdio: 'inherit',
      timeout: 30000
    });
    console.log('✅ Cookies extraídos do Firefox com sucesso!');
  } catch (firefoxError) {
    console.log('❌ Falha em ambos os browsers.');
  }
}

// Método 2: Verificar se arquivo cookies.txt existe
console.log('\n🔍 MÉTODO 2: Verificando arquivo cookies.txt...');
if (fs.existsSync('cookies.txt')) {
  const stats = fs.statSync('cookies.txt');
  const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
  
  console.log(`📄 Arquivo cookies.txt encontrado`);
  console.log(`   📅 Idade: ${ageHours.toFixed(1)} horas`);
  
  if (ageHours > 24) {
    console.log('⚠️ Cookies muito antigos (>24h) - recomendam-se novos');
  } else {
    console.log('✅ Cookies relativamente recentes');
  }
} else {
  console.log('❌ Arquivo cookies.txt NÃO encontrado');
}

// Método 3: Testar com diferentes User-Agents
console.log('\n🎭 MÉTODO 3: Testando com User-Agent diferente...');
try {
  execSync('yt-dlp --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" --cookies "cookies.txt" --write-info-json --skip-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ"', {
    stdio: 'inherit',
    timeout: 30000
  });
  console.log('✅ User-Agent alternativo funcionou!');
} catch (error) {
  console.log('❌ User-Agent alternativo também falhou');
}

console.log('\n📋 INSTRUÇÕES MANUAIS PARA RESOLVER:');
console.log('=====================================');
console.log('1. 🌐 Abra o Chrome e acesse: https://www.youtube.com');
console.log('2. 🔐 Faça login na sua conta YouTube (se não estiver logado)');
console.log('3. 🎵 Reproduza algumas músicas para "aquecer" a sessão');
console.log('4. 💾 Execute: yt-dlp --cookies-from-browser chrome --cookies cookies.txt "https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
console.log('5. ✅ Verifique se o arquivo cookies.txt foi atualizado');
console.log('');
console.log('📌 ALTERNATIVA RÁPIDA:');
console.log('- Use um VPN para mudar IP temporariamente');
console.log('- Aguarde 30-60 minutos antes de tentar novamente');
console.log('- Reduza a frequência de downloads (maior delay entre tracks)');

console.log('\n🔧 COMANDO PARA TESTAR:');
console.log('node test-connection.js && node test-seventeen-validation.js'); 