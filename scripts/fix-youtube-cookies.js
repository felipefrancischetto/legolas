const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 [Setup Cookies] Configurando cookies do YouTube para o Legolas...\n');

function resolveYtDlpBin() {
  const candidates = [
    process.env.YTDLP_BIN,
    'py -m yt_dlp',
    'python -m yt_dlp',
    'yt-dlp',
  ].filter(Boolean);

  for (const bin of candidates) {
    try {
      const parts = bin.split(' ');
      const out = execFileSync(parts[0], [...parts.slice(1), '--version'], {
        encoding: 'utf8',
        timeout: 8000,
      });
      if (out.trim()) return bin;
    } catch {
      // próximo candidato
    }
  }
  return 'yt-dlp';
}

const ytDlpBin = resolveYtDlpBin();
const globalFlags = '--js-runtimes node --remote-components ejs:github ';
const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const cookiesPath = path.join(process.cwd(), 'cookies.txt');

console.log(`🛠️ Usando: ${ytDlpBin} ${globalFlags}\n`);
console.log('⚠️ IMPORTANTE: Feche o Chrome/Edge completamente antes de continuar!\n');

const browsers = ['chrome', 'edge', 'firefox', 'brave'];

for (const browser of browsers) {
  console.log(`🍪 Tentando extrair cookies do ${browser}...`);
  const tempPath = path.join(process.cwd(), `cookies_${browser}_temp.txt`);
  try {
    execSync(
      `${ytDlpBin} ${globalFlags}--cookies-from-browser ${browser} --cookies "${tempPath}" --skip-download "${testUrl}"`,
      { stdio: 'pipe', timeout: 30000 }
    );
    if (fs.existsSync(tempPath)) {
      const content = fs.readFileSync(tempPath, 'utf8');
      if (content.trim().length > 0 && (content.startsWith('#') || content.includes('\t'))) {
        fs.writeFileSync(cookiesPath, content, 'utf8');
        fs.unlinkSync(tempPath);
        console.log(`✅ Cookies extraídos do ${browser} e salvos em cookies.txt!`);
        process.exit(0);
      }
    }
    console.log(`❌ Cookies do ${browser} inválidos ou vazios`);
  } catch (error) {
    const msg = String(error.stderr || error.message || error);
    if (msg.toLowerCase().includes('could not copy')) {
      console.log(`❌ ${browser}: banco de cookies bloqueado — feche o navegador e tente novamente`);
    } else {
      console.log(`❌ Falha no ${browser}: ${msg.substring(0, 120)}`);
    }
  }
}

console.log('\n📋 Se a extração automática falhou:');
console.log('1. Abra o Chrome e faça login em youtube.com');
console.log('2. Instale a extensão "Get cookies.txt LOCALLY"');
console.log('3. Exporte os cookies e salve como cookies.txt na raiz do projeto');
console.log(`4. Caminho: ${cookiesPath}`);
process.exit(1);
