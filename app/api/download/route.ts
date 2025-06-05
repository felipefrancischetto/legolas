import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, access, unlink, readdir, readFile, rename } from 'fs/promises';
import { join } from 'path';
import { constants } from 'fs';
import NodeID3 from 'node-id3';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function getDownloadsPath() {
  try {
    const configPath = join(process.cwd(), 'downloads.config.json');
    const config = await readFile(configPath, 'utf-8');
    const { path } = JSON.parse(config);
    return join(process.cwd(), path);
  } catch (error) {
    // Se não houver configuração, use o caminho padrão
    return join(process.cwd(), 'downloads');
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');
    const format = searchParams.get('format') || 'flac';
    const useBeatport = searchParams.get('useBeatport') === 'true';
    
    if (!url) {
      return NextResponse.json(
        { error: 'URL é obrigatória' },
        { status: 400 }
      );
    }

    console.log('Iniciando download para URL:', url, 'Formato:', format, 'Beatport:', useBeatport);

    // Obter o caminho de downloads
    const downloadsFolder = await getDownloadsPath();

    // Criar pasta de downloads se não existir
    await mkdir(downloadsFolder, { recursive: true });
    console.log('Pasta de downloads criada/verificada:', downloadsFolder);

    // Obter informações do vídeo
    const { stdout: infoJson } = await execAsync(
      `yt-dlp --dump-json ` +
      `--cookies "cookies.txt" ` +
      `"${url}"`,
      {
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      }
    );
    const videoInfo = JSON.parse(infoJson);

    // Baixar o vídeo no formato selecionado com metadados
    console.log('Iniciando download do áudio...');
    const { stdout } = await execAsync(
      `yt-dlp -x --audio-format ${format} --audio-quality 10 ` +
      `--embed-thumbnail --convert-thumbnails jpg ` +
      `--add-metadata ` +
      `--cookies "cookies.txt" ` +
      `-o "${downloadsFolder}/%(title)s.%(ext)s" ` +
      `--no-part --force-overwrites "${url}"`,
      {
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      }
    );
    console.log('Download concluído:', stdout);

    // Aguardar um pouco para evitar conflito de arquivo em uso
    console.log('⏳ Aguardando finalização completa do download...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 segundos de delay

    // Buscar metadados usando o serviço agregador melhorado
    let metadata = null;
    console.log('\n🔍 [Download] Iniciando busca de metadados...');
    console.log(`   📋 Título: "${videoInfo.title}"`);
    console.log(`   🎤 Artista: "${videoInfo.uploader}"`);
    console.log(`   🎧 Beatport: ${useBeatport}`);
    
    try {
      // Usar o novo serviço de metadados melhorado
      const host = request.headers.get('host');
      const protocol = host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https';
      const metadataRes = await fetch(`${protocol}://${host}/api/enhanced-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: videoInfo.title, 
          artist: videoInfo.uploader,
          useBeatport: useBeatport
        })
      });
      
      if (metadataRes.ok) {
        const metadataResponse = await metadataRes.json();
        metadata = metadataResponse.metadata;
        console.log(`\n📊 [Download] Metadados recebidos:`);
        console.log(`   ✅ Sucesso: ${metadataResponse.success}`);
        console.log(`   📍 Fontes: ${metadata.sources?.join(', ') || 'Nenhuma'}`);
        console.log(`   🎯 Modo Beatport: ${metadataResponse.beatportMode}`);
        console.log(`   📈 Dados encontrados:`);
        console.log(`      • BPM: ${metadata.bpm || 'N/A'}`);
        console.log(`      • Key: ${metadata.key || 'N/A'}`);
        console.log(`      • Genre: ${metadata.genre || 'N/A'}`);
        console.log(`      • Label: ${metadata.label || 'N/A'}`);
        console.log(`      • Year: ${metadata.year || 'N/A'}`);
        console.log(`      • Album: ${metadata.album || 'N/A'}`);
        
        if (useBeatport && metadata.sources?.includes('Beatport')) {
          console.log('🎉 [Download] DADOS DO BEATPORT UTILIZADOS! ✨');
        } else if (useBeatport) {
          console.log('⚠️  [Download] Beatport habilitado mas não retornou dados');
        }
      } else {
        console.error('❌ [Download] Erro na resposta do serviço de metadados:', metadataRes.status);
      }
    } catch (err) {
      console.error('❌ [Download] Erro ao buscar metadados melhorados:', err);
      // Fallback para MusicBrainz se o serviço melhorado falhar
      try {
        const host = request.headers.get('host');
        const protocol = host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https';
        const mbRes = await fetch(`${protocol}://${host}/api/musicbrainz-metadata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: videoInfo.title, artist: videoInfo.uploader })
        });
        metadata = await mbRes.json();
        console.log('🔄 [Download] Fallback MusicBrainz usado:', metadata);
      } catch (fallbackErr) {
        console.error('❌ [Download] Erro também no fallback MusicBrainz:', fallbackErr);
      }
    }

    // Escrever metadados no arquivo
    console.log('\n📝 [Download] Iniciando escrita de metadados no arquivo...');
    try {
      const audioFile = `${downloadsFolder}/${videoInfo.title}.${format}`;
      const exists = await fileExists(audioFile);
      console.log(`   📁 Arquivo: ${audioFile}`);
      console.log(`   ✅ Arquivo existe: ${exists}`);
      console.log(`   🎵 Formato: ${format.toUpperCase()}`);
      
      if (metadata && exists) {
        // Preparar metadados
        const tags = {
          title: metadata.title || videoInfo.title,
          artist: metadata.artist || videoInfo.uploader || videoInfo.artist,  // Múltiplas fontes para artista
          album: metadata.album || '',
          year: metadata.year?.toString() || '',
          genre: metadata.genre || '',
          label: metadata.label || '',
          bpm: metadata.bpm?.toString() || '',
          key: metadata.key || '',
          comment: `BPM: ${metadata.bpm || 'N/A'} | Key: ${metadata.key || 'N/A'} | Sources: ${metadata.sources?.join(', ') || 'None'}`
        };
        
        console.log(`   🏷️  Tags que serão escritas no arquivo:`);
        console.log(`      • title: "${tags.title}"`);
        console.log(`      • artist: "${tags.artist}"`);
        console.log(`      • album: "${tags.album}"`);
        console.log(`      • year: "${tags.year}"`);
        console.log(`      • genre: "${tags.genre}"`);
        console.log(`      • label: "${tags.label}"`);
        console.log(`      • BPM: "${tags.bpm}"`);
        console.log(`      • key: "${tags.key}"`);
        
        let success = false;
        
        if (format.toLowerCase() === 'flac') {
          // FLAC: Usar FFmpeg para Vorbis comments
          console.log(`   🎵 [FLAC] Usando FFmpeg para Vorbis comments...`);
          
          try {
            // Verificar se arquivo ainda existe antes de processar
            const audioExists = await fileExists(audioFile);
            if (!audioExists) {
              throw new Error('Arquivo de áudio não encontrado após download');
            }
            
            // Usar nome temporário com extensão .flac válida
            const tempFile = audioFile.replace('.flac', '_temp.flac');
            
            // Helper function to escape metadata values
            const escapeValue = (value: string): string => {
              if (!value) return '';
              return value.replace(/"/g, '\\"').replace(/\|/g, '-').trim();
            };
            
            // Construir comando FFmpeg com Vorbis comments e especificar formato explicitamente
            let ffmpegCmd = `ffmpeg -y -i "${audioFile}" -c copy`;
            
            // Adicionar metadados como Vorbis comments - SEMPRE incluir title e artist
            ffmpegCmd += ` -metadata "title=${escapeValue(tags.title)}"`;
            ffmpegCmd += ` -metadata "artist=${escapeValue(tags.artist)}"`;
            
            // Adicionar metadados opcionais apenas se existirem
            if (tags.album) ffmpegCmd += ` -metadata "album=${escapeValue(tags.album)}"`;
            if (tags.year) ffmpegCmd += ` -metadata "date=${tags.year}"`;
            if (tags.genre) ffmpegCmd += ` -metadata "genre=${escapeValue(tags.genre)}"`;
            if (tags.label) ffmpegCmd += ` -metadata "label=${escapeValue(tags.label)}"`;
            if (tags.bpm) ffmpegCmd += ` -metadata "bpm=${tags.bpm}"`;
            if (tags.key) ffmpegCmd += ` -metadata "initialkey=${escapeValue(tags.key)}"`;
            if (tags.comment) ffmpegCmd += ` -metadata "comment=${escapeValue(tags.comment)}"`;
            
            // Especificar formato FLAC explicitamente
            ffmpegCmd += ` -f flac "${tempFile}"`;
            
            console.log(`   🔧 Comando FFmpeg: ${ffmpegCmd.substring(0, 150)}...`);
            
            await execAsync(ffmpegCmd, { maxBuffer: 1024 * 1024 * 50 });
            
            // Verificar se arquivo temporário foi criado
            const tempExists = await fileExists(tempFile);
            if (!tempExists) {
              throw new Error('Arquivo temporário não foi criado pelo FFmpeg');
            }
            
            // Substituir arquivo original pelo arquivo com metadados
            await rename(tempFile, audioFile);
            
            success = true;
            console.log(`   ✅ [FLAC] Metadados Vorbis escritos com sucesso!`);
            
          } catch (ffmpegError) {
            console.error(`   ❌ [FLAC] Erro no FFmpeg:`, ffmpegError);
            
            // Tentar limpar arquivo temporário se existir
            try {
              const tempFile = audioFile.replace('.flac', '_temp.flac');
              const tempExists = await fileExists(tempFile);
              if (tempExists) {
                await unlink(tempFile);
                console.log(`   🧹 Arquivo temporário removido: ${tempFile}`);
              }
            } catch (cleanupErr) {
              console.error(`   ⚠️  Erro ao limpar arquivo temporário:`, cleanupErr);
            }
          }
          
        } else {
          // MP3: Usar NodeID3 (como antes)
          console.log(`   🎵 [MP3] Usando NodeID3 para tags ID3...`);
          
          const id3Tags = {
            title: tags.title,
            artist: tags.artist,
            album: tags.album,
            year: tags.year,
            genre: tags.genre,
            publisher: tags.label,
            bpm: tags.bpm,
            initialKey: tags.key,
            comment: { 
              language: 'por', 
              text: tags.comment
            }
          };
          
          try {
            const id3Result = NodeID3.write(id3Tags, audioFile);
            success = id3Result === true;
            console.log(`   📊 [MP3] NodeID3 resultado: ${success ? 'SUCESSO' : 'FALHA'}`);
          } catch (id3Error) {
            console.error(`   ❌ [MP3] Erro no NodeID3:`, id3Error);
            success = false;
          }
        }
        
        if (success) {
          console.log('✅ [Download] Metadados escritos com sucesso no arquivo!');
          
          // Verificar se os metadados foram realmente escritos usando FFprobe
          try {
            console.log(`\n🔍 [Download] Verificação com FFprobe...`);
            const { stdout: probeOutput } = await execAsync(`ffprobe -v quiet -print_format json -show_format "${audioFile}"`);
            const probeData = JSON.parse(probeOutput);
            const fileTags = probeData.format?.tags || {};
            
            console.log(`🔍 [Download] Tags verificadas no arquivo:`);
            console.log(`      • title: "${fileTags.title || fileTags.TITLE || 'N/A'}"`);
            console.log(`      • artist: "${fileTags.artist || fileTags.ARTIST || 'N/A'}"`);
            console.log(`      • BPM: "${fileTags.bpm || fileTags.BPM || 'N/A'}"`);
            console.log(`      • key: "${fileTags.initialkey || fileTags.INITIALKEY || 'N/A'}"`);
            console.log(`      • genre: "${fileTags.genre || fileTags.GENRE || 'N/A'}"`);
            console.log(`      • label: "${fileTags.label || fileTags.LABEL || 'N/A'}"`);
            
            // Verificar se metadados do Beatport foram salvos
            const hasBeatportData = fileTags.bpm || fileTags.BPM || fileTags.initialkey || fileTags.INITIALKEY || fileTags.label || fileTags.LABEL;
            console.log(`      🎯 Dados Beatport salvos: ${hasBeatportData ? '✅ SIM' : '❌ NÃO'}`);
            
          } catch (probeErr) {
            console.error('⚠️  [Download] Erro na verificação com FFprobe:', probeErr);
          }
          
        } else {
          throw new Error(`Falha ao gravar metadados ${format.toUpperCase()} no arquivo de áudio`);
        }
      } else {
        console.warn('⚠️  [Download] Metadados ausentes ou arquivo de áudio não encontrado para gravar tags.');
        console.log(`   📊 Metadata disponível: ${!!metadata}`);
        console.log(`   📁 Arquivo existe: ${exists}`);
        if (metadata) {
          console.log(`   📍 Fontes de metadados: ${metadata.sources?.join(', ') || 'Nenhuma'}`);
        }
      }
    } catch (err) {
      console.error('❌ [Download] Erro ao gravar metadados:', err);
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('📋 [Download] Processo concluído!');
    console.log('═══════════════════════════════════════════════════\n');

    return NextResponse.json({
      status: 'concluído',
      message: 'Download concluído com sucesso',
      info: {
        title: videoInfo.title,
        artist: videoInfo.uploader,
        duration: videoInfo.duration,
        thumbnail: videoInfo.thumbnail
      }
    });

  } catch (error) {
    console.error('Erro detalhado ao processar vídeo:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao processar o vídeo' },
      { status: 500 }
    );
  }
} 