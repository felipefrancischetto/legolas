/**
 * Script para testar a API de análise de música
 * 
 * Uso:
 *   node scripts/test-music-analysis.js [filename]
 * 
 * Se não fornecer filename, tentará usar o primeiro arquivo MP3 encontrado
 */

const http = require('http');
const fs = require('fs').promises;
const path = require('path');

// Detectar porta do servidor (padrão 3000, mas pode ser configurada via PORT)
const PORT = process.env.PORT || process.env.NEXT_PORT || 3000;
const API_URL = `http://localhost:${PORT}`;
const API_ENDPOINT = '/api/analyze-music';

async function getDownloadsPath() {
  try {
    const configPath = path.join(process.cwd(), 'downloads.config.json');
    const config = await fs.readFile(configPath, 'utf-8');
    const { path: downloadsPath } = JSON.parse(config);
    return path.join(process.cwd(), downloadsPath);
  } catch (error) {
    return path.join(process.cwd(), 'downloads');
  }
}

async function findAudioFile(filename) {
  const downloadsPath = await getDownloadsPath();
  
  if (filename) {
    const filePath = path.join(downloadsPath, filename);
    try {
      await fs.access(filePath);
      return filename;
    } catch {
      console.error(`❌ Arquivo não encontrado: ${filename}`);
      return null;
    }
  }

  // Se não forneceu filename, procurar primeiro arquivo MP3 ou FLAC
  try {
    const files = await fs.readdir(downloadsPath);
    const audioFile = files.find(f => 
      f.toLowerCase().endsWith('.mp3') || 
      f.toLowerCase().endsWith('.flac')
    );
    
    if (audioFile) {
      console.log(`📁 Usando arquivo encontrado: ${audioFile}`);
      return audioFile;
    }
    
    console.error('❌ Nenhum arquivo de áudio encontrado na pasta de downloads');
    return null;
  } catch (error) {
    console.error('❌ Erro ao listar arquivos:', error.message);
    return null;
  }
}

function makeRequest(method, url, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 3000,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (error) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function testAnalysis(filename) {
  console.log('\n🎵 Testando API de Análise de Música');
  console.log('=====================================\n');

  // Teste 1: POST request
  console.log('📤 Teste 1: POST /api/analyze-music');
  console.log(`   Arquivo: ${filename}\n`);

  try {
    const startTime = Date.now();
    const response = await makeRequest('POST', `${API_URL}${API_ENDPOINT}`, {
      filename: filename
    });
    const duration = Date.now() - startTime;

    if (response.status === 200 && response.data.success) {
      console.log('✅ POST request bem-sucedido!');
      console.log(`   Tempo de análise: ${response.data.analysisTime}ms`);
      console.log(`   Tempo total (incluindo rede): ${duration}ms\n`);
      
      const analysis = response.data.analysis;
      console.log('📊 Resultados da Análise:');
      console.log('─────────────────────────');
      console.log(`   Arquivo: ${analysis.filename}`);
      console.log(`   Duração: ${analysis.duration.toFixed(2)}s`);
      console.log(`   Sample Rate: ${analysis.sampleRate} Hz`);
      console.log(`   Bitrate: ${analysis.bitrate} bps`);
      console.log(`   Canais: ${analysis.channels}`);
      console.log(`   Codec: ${analysis.codec}`);
      console.log(`   Formato: ${analysis.format}\n`);

      console.log('🎚️ Análise de Frequências:');
      console.log(`   Sub Bass (20-60 Hz): ${analysis.frequencyAnalysis.subBass.toFixed(2)}`);
      console.log(`   Bass (60-250 Hz): ${analysis.frequencyAnalysis.bass.toFixed(2)}`);
      console.log(`   Low Mid (250-500 Hz): ${analysis.frequencyAnalysis.lowMid.toFixed(2)}`);
      console.log(`   Mid (500-2000 Hz): ${analysis.frequencyAnalysis.mid.toFixed(2)}`);
      console.log(`   High Mid (2000-4000 Hz): ${analysis.frequencyAnalysis.highMid.toFixed(2)}`);
      console.log(`   High (4000-20000 Hz): ${analysis.frequencyAnalysis.high.toFixed(2)}\n`);

      console.log('🔊 Loudness:');
      console.log(`   Peak: ${analysis.loudness.peak.toFixed(2)} dB`);
      console.log(`   RMS: ${analysis.loudness.rms.toFixed(2)} dB\n`);

      console.log('🎹 Elementos Detectados:');
      console.log(`   Synths: ${analysis.detectedElements.synths.join(', ')}`);
      console.log(`   Instrumentos: ${analysis.detectedElements.instruments.join(', ')}`);
      console.log(`   Bateria:`);
      console.log(`     - Kick: ${analysis.detectedElements.drumElements.kick ? '✓' : '✗'}`);
      console.log(`     - Snare: ${analysis.detectedElements.drumElements.snare ? '✓' : '✗'}`);
      console.log(`     - Hi-Hat: ${analysis.detectedElements.drumElements.hihat ? '✓' : '✗'}`);
      console.log(`     - Cymbals: ${analysis.detectedElements.drumElements.cymbals ? '✓' : '✗'}`);
      console.log(`     - Percussion: ${analysis.detectedElements.drumElements.percussion ? '✓' : '✗'}`);
      console.log(`   Bass:`);
      console.log(`     - Sub Bass: ${analysis.detectedElements.bassElements.subBass ? '✓' : '✗'}`);
      console.log(`     - Mid Bass: ${analysis.detectedElements.bassElements.midBass ? '✓' : '✗'}`);
      console.log(`     - Bassline: ${analysis.detectedElements.bassElements.bassline ? '✓' : '✗'}\n`);

      console.log('📐 Estrutura da Música:');
      console.log(`   Intro: ${analysis.structure.intro}s`);
      console.log(`   Breakdown: ${analysis.structure.breakdown}s`);
      console.log(`   Drop: ${analysis.structure.drop}s`);
      console.log(`   Outro: ${analysis.structure.outro}s\n`);

    } else {
      console.error('❌ POST request falhou!');
      console.error(`   Status: ${response.status}`);
      console.error(`   Erro: ${JSON.stringify(response.data, null, 2)}\n`);
    }
  } catch (error) {
    console.error('❌ Erro ao fazer POST request:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   ⚠️ Servidor não está rodando. Execute: npm run dev\n');
    }
  }

  // Teste 2: GET request
  console.log('📤 Teste 2: GET /api/analyze-music?filename=...');
  console.log(`   Arquivo: ${filename}\n`);

  try {
    const startTime = Date.now();
    const response = await makeRequest('GET', `${API_URL}${API_ENDPOINT}?filename=${encodeURIComponent(filename)}`);
    const duration = Date.now() - startTime;

    if (response.status === 200 && response.data.success) {
      console.log('✅ GET request bem-sucedido!');
      console.log(`   Tempo de análise: ${response.data.analysisTime}ms`);
      console.log(`   Tempo total (incluindo rede): ${duration}ms\n`);
    } else {
      console.error('❌ GET request falhou!');
      console.error(`   Status: ${response.status}`);
      console.error(`   Erro: ${JSON.stringify(response.data, null, 2)}\n`);
    }
  } catch (error) {
    console.error('❌ Erro ao fazer GET request:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   ⚠️ Servidor não está rodando. Execute: npm run dev\n');
    }
  }

  console.log('=====================================');
  console.log('✅ Testes concluídos!\n');
}

async function main() {
  console.log(`🌐 Usando API URL: ${API_URL}\n`);
  
  const filename = process.argv[2];
  const audioFile = await findAudioFile(filename);

  if (!audioFile) {
    console.error('\n❌ Não foi possível encontrar um arquivo para testar.\n');
    console.log('Uso: node scripts/test-music-analysis.js [filename]');
    console.log('Exemplo: node scripts/test-music-analysis.js "minha-musica.mp3"');
    console.log('\nPara usar uma porta diferente:');
    console.log('  PORT=3001 node scripts/test-music-analysis.js [filename]\n');
    process.exit(1);
  }

  await testAnalysis(audioFile);
}

main().catch(console.error);
