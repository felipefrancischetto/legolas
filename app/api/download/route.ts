import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, access, unlink, readdir, readFile, rename } from 'fs/promises';
import { join } from 'path';
import { constants } from 'fs';
import NodeID3 from 'node-id3';
import { sendProgressEvent } from '@/lib/utils/progressEventService';
import { hasValidCookiesFile } from '@/app/api/utils/common';

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

function deduplicateLabel(label: string): string {
  if (!label) return '';
  
  // Primeiro, limpar e normalizar o label
  let cleaned = label.trim();
  
  // Casos específicos conhecidos de duplicação
  const specificCases = [
    { pattern: /BMG Rights Management \(UK\) LimitedBMG Limited/gi, replacement: 'BMG Rights Management (UK) Limited' },
    { pattern: /Sony Music EntertainmentSony Music/gi, replacement: 'Sony Music Entertainment' },
    { pattern: /Warner Music GroupWarner Music/gi, replacement: 'Warner Music Group' }
  ];
  
  // Aplicar correções específicas
  for (const case_ of specificCases) {
    cleaned = cleaned.replace(case_.pattern, case_.replacement);
  }
  
  // Detectar e remover duplicação específica como "LimitedBMG Limited"
  // Padrão: palavra seguida imediatamente pela mesma palavra (sem espaço)
  cleaned = cleaned.replace(/([A-Z][a-z]+)\\1/g, '$1');
  
  // Detectar e remover duplicação no final (como "LimitedBMG Limited")
  // Padrão: palavra seguida imediatamente pela mesma palavra
  const match = cleaned.match(/^(.+?)([A-Z][a-z]+)\\2$/);
  if (match) {
    cleaned = match[1] + match[2];
  }
  
  // Remover duplicação de palavras consecutivas
  cleaned = cleaned
    .replace(/(\w+)\s+\1/gi, '$1') // Remove palavras consecutivas duplicadas
    .replace(/\s+/g, ' ') // Normalize espaços
    .trim();
  
  // Se ainda houver duplicação óbvia, tentar uma abordagem mais agressiva
  const words = cleaned.split(/\s+/);
  const uniqueWords: string[] = [];
  
  for (const word of words) {
    // Verificar se a palavra já existe (case-insensitive)
    const exists = uniqueWords.some(existing => 
      existing.toLowerCase() === word.toLowerCase()
    );
    if (!exists) {
      uniqueWords.push(word);
    }
  }
  
  return uniqueWords.join(' ').trim();
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
  // 🔧 Declarar downloadId fora do try para estar disponível no catch
  let downloadId: string | null = null;
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');
    const format = searchParams.get('format') || 'flac';
    const useBeatport = searchParams.get('useBeatport') === 'true';
    const showBeatportPage = searchParams.get('showBeatportPage') === 'true';
    const skipMetadata = searchParams.get('skipMetadata') !== 'false';
    downloadId = searchParams.get('downloadId');
    
    if (!url) {
      return NextResponse.json(
        { error: 'URL é obrigatória' },
        { status: 400 }
      );
    }

    console.log('Iniciando download para URL:', url, 'Formato:', format, 'Beatport:', useBeatport, 'ShowBeatportPage:', showBeatportPage, 'SkipMetadata:', skipMetadata, 'DownloadID:', downloadId);

    // Enviar evento inicial
    if (downloadId) {
      console.log(`🎯 Enviando evento inicial para downloadId: ${downloadId}`);
      sendProgressEvent(downloadId, {
        type: 'init',
        step: 'Preparando download...',
        progress: 5,
        detail: `Formato: ${format.toUpperCase()}, Beatport: ${useBeatport ? 'Ativado' : 'Desativado'}`
      });
    } else {
      console.warn('⚠️  Download iniciado sem downloadId - eventos de progresso não serão enviados');
    }

    // Obter o caminho de downloads
    const downloadsFolder = await getDownloadsPath();

    // Criar pasta de downloads se não existir
    await mkdir(downloadsFolder, { recursive: true });
    console.log('Pasta de downloads criada/verificada:', downloadsFolder);

    // Evento: Verificando pasta
    if (downloadId) {
      sendProgressEvent(downloadId, {
        type: 'setup',
        step: 'Verificando pasta de downloads...',
        progress: 10,
        detail: downloadsFolder
      });
    }

    // Evento: Extraindo informações
    if (downloadId) {
      sendProgressEvent(downloadId, {
        type: 'info',
        step: 'Extraindo informações do vídeo...',
        progress: 15,
        substep: 'Conectando com YouTube'
      });
    }

    // Obter informações do vídeo
    const hasValidCookies = await hasValidCookiesFile();
    let infoJson: string;
    
    try {
      const cookiesFlag = hasValidCookies ? '--cookies "cookies.txt" ' : '';
      const { stdout } = await execAsync(
        `yt-dlp --dump-json ` +
        `${cookiesFlag}` +
        `--default-search "ytsearch" ` +
        `"${url}"`,
        {
          maxBuffer: 1024 * 1024 * 10 // 10MB buffer
        }
      );
      infoJson = stdout;
    } catch (error) {
      // Se falhar com cookies, tentar sem cookies
      if (hasValidCookies && error instanceof Error && error.message.includes('does not look like a Netscape format')) {
        console.log('Cookies inválidos, tentando sem cookies...');
        const { stdout } = await execAsync(
          `yt-dlp --dump-json ` +
          `--default-search "ytsearch" ` +
          `"${url}"`,
          {
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
          }
        );
        infoJson = stdout;
      } else {
        throw error;
      }
    }
    
    const videoInfo = JSON.parse(infoJson);

    // Evento: Informações extraídas
    if (downloadId) {
      sendProgressEvent(downloadId, {
        type: 'info',
        step: 'Informações extraídas com sucesso',
        progress: 20,
        detail: `Título: ${videoInfo.title}`,
        metadata: {
          title: videoInfo.title,
          duration: videoInfo.duration,
          uploader: videoInfo.uploader
        }
      });
    }

    // Evento: Iniciando download do áudio
    if (downloadId) {
      sendProgressEvent(downloadId, {
        type: 'download',
        step: 'Iniciando download do áudio...',
        progress: 25,
        substep: 'Preparando extração de áudio'
      });
    }

    // Baixar o vídeo no formato selecionado com metadados
    console.log('Iniciando download do áudio...');
    
    // Evento: Download em progresso
    if (downloadId) {
      sendProgressEvent(downloadId, {
        type: 'download',
        step: 'Baixando áudio...',
        progress: 30,
        substep: 'Conectando com servidor de mídia'
      });
    }

    const cookiesFlag = hasValidCookies ? '--cookies "cookies.txt" ' : '';
    let stdout: string;
    
    try {
      const result = await execAsync(
        `yt-dlp -x --audio-format ${format} --audio-quality 10 ` +
        `--embed-thumbnail --convert-thumbnails jpg ` +
        `--add-metadata ` +
        `${cookiesFlag}` +
        `--default-search "ytsearch" ` +
        `-o "${downloadsFolder}/%(title)s.%(ext)s" ` +
        `--no-part --force-overwrites "${url}"`,
        {
          maxBuffer: 1024 * 1024 * 10 // 10MB buffer
        }
      );
      stdout = result.stdout;
    } catch (error) {
      // Se falhar com cookies, tentar sem cookies
      if (hasValidCookies && error instanceof Error && error.message.includes('does not look like a Netscape format')) {
        console.log('Cookies inválidos no download, tentando sem cookies...');
        const result = await execAsync(
          `yt-dlp -x --audio-format ${format} --audio-quality 10 ` +
          `--embed-thumbnail --convert-thumbnails jpg ` +
          `--add-metadata ` +
          `--default-search "ytsearch" ` +
          `-o "${downloadsFolder}/%(title)s.%(ext)s" ` +
          `--no-part --force-overwrites "${url}"`,
          {
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
          }
        );
        stdout = result.stdout;
      } else {
        throw error;
      }
    }
    
    console.log('Download concluído:', stdout);

    // Evento: Download do áudio concluído
    if (downloadId) {
      sendProgressEvent(downloadId, {
        type: 'download',
        step: 'Download do áudio concluído',
        progress: 50,
        substep: 'Processando arquivo de áudio'
      });
    }

    // Aguardar um pouco para evitar conflito de arquivo em uso
    console.log('⏳ Aguardando finalização completa do download...');
    
    // Evento: Finalizando processo
    if (downloadId) {
      sendProgressEvent(downloadId, {
        type: 'processing',
        step: 'Finalizando processo de download...',
        progress: 55,
        substep: 'Aguardando liberação do arquivo'
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 500)); // Reduzido de 2s para 500ms

    // Evento: Iniciando busca de metadados
    if (downloadId) {
      sendProgressEvent(downloadId, {
        type: 'metadata',
        step: 'Iniciando busca de metadados...',
        progress: 60,
        substep: useBeatport ? 'Consultando Beatport' : 'Consultando base de dados',
        detail: `Título: ${videoInfo.title} | Artista: ${videoInfo.uploader}`
      });
    }

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
          useBeatport: useBeatport,
          showBeatportPage: showBeatportPage,
          skipMetadata: skipMetadata
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
        console.log(`      • Published Date: ${metadata.publishedDate || 'N/A'}`);
        console.log(`      • Album: ${metadata.album || 'N/A'}`);
        
        // Evento: Metadados encontrados
        if (downloadId) {
          const beatportUsed = useBeatport && metadata.sources?.includes('Beatport');
          sendProgressEvent(downloadId, {
            type: 'metadata',
            step: 'Metadados encontrados com sucesso!',
            progress: 70,
            substep: beatportUsed ? 'Dados do Beatport obtidos' : 'Dados da base geral obtidos',
            detail: `BPM: ${metadata.bpm || 'N/A'} | Key: ${metadata.key || 'N/A'} | Genre: ${metadata.genre || 'N/A'}`,
            metadata: {
              bpm: metadata.bpm,
              key: metadata.key,
              genre: metadata.genre,
              label: metadata.label,
              sources: metadata.sources
            }
          });
        }
        
        if (useBeatport && metadata.sources?.includes('Beatport')) {
          console.log('🎉 [Download] DADOS DO BEATPORT UTILIZADOS! ✨');
        } else if (useBeatport) {
          console.log('⚠️  [Download] Beatport habilitado mas não retornou dados');
        }
      } else {
        console.error('❌ [Download] Erro na resposta do serviço de metadados:', metadataRes.status);
        
        // Evento: Erro na busca de metadados
        if (downloadId) {
          sendProgressEvent(downloadId, {
            type: 'metadata',
            step: 'Erro na busca de metadados',
            progress: 65,
            substep: 'Tentando fonte alternativa...',
            detail: `Status: ${metadataRes.status}`
          });
        }
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

    // Evento: Iniciando escrita de metadados
    if (downloadId) {
      sendProgressEvent(downloadId, {
        type: 'tagging',
        step: 'Escrevendo metadados no arquivo...',
        progress: 75,
        substep: `Preparando tags ${format.toUpperCase()}`,
        detail: `Arquivo: ${videoInfo.title}.${format}`
      });
    }

    // Escrever metadados no arquivo
    console.log('\n📝 [Download] Iniciando escrita de metadados no arquivo...');
    try {
      let audioFile = `${downloadsFolder}/${videoInfo.title}.${format}`;
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
          label: deduplicateLabel(metadata.label || ''),
          bpm: metadata.bpm?.toString() || '',
          key: metadata.key || '',
          comment: `BPM: ${metadata.bpm || 'N/A'} | Key: ${metadata.key || 'N/A'} | Published: ${metadata.publishedDate || 'N/A'} | Sources: ${metadata.sources?.join(', ') || 'None'}`
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
              // PowerShell-safe escaping - melhorado para Windows
              return value
                .replace(/"/g, '\\"')        // Escapar aspas duplas
                .replace(/\$/g, '\\$')       // Escapar $ (PowerShell variables)
                .replace(/`/g, '\\`')        // Escapar backticks (PowerShell escape char)
                .replace(/&/g, '\\&')        // Escapar & (PowerShell command separator)
                .replace(/\|/g, '\\|')       // Escapar | (PowerShell pipe)
                .replace(/;/g, '\\;')        // Escapar ; (PowerShell command separator)
                .replace(/</g, '\\<')        // Escapar < (PowerShell redirect)
                .replace(/>/g, '\\>')        // Escapar > (PowerShell redirect)
                .replace(/:/g, '\\:')        // Escapar : (PowerShell drive separator)
                .replace(/\*/g, '\\*')       // Escapar * (PowerShell wildcard)
                .replace(/\?/g, '\\?')       // Escapar ? (PowerShell wildcard)
                .replace(/\[/g, '\\[')       // Escapar [ (PowerShell wildcard)
                .replace(/\]/g, '\\]')       // Escapar ] (PowerShell wildcard)
                .trim();
            };
            
            // Construir comando FFmpeg com Vorbis comments e especificar formato explicitamente
            let ffmpegCmd = `ffmpeg -y -i "${audioFile}" -c copy`;
            
            // Adicionar metadados como Vorbis comments - SEMPRE incluir title e artist
            ffmpegCmd += ` -metadata "title=${escapeValue(tags.title)}"`;
            ffmpegCmd += ` -metadata "artist=${escapeValue(tags.artist)}"`;
            
            // Adicionar metadados opcionais apenas se existirem
            if (tags.album) ffmpegCmd += ` -metadata "album=${escapeValue(tags.album)}"`;
            if (tags.year) ffmpegCmd += ` -metadata "date=${tags.year}"`;
            if (metadata.publishedDate) ffmpegCmd += ` -metadata "publisher_date=${escapeValue(metadata.publishedDate)}"`;
            if (tags.genre) ffmpegCmd += ` -metadata "genre=${escapeValue(tags.genre)}"`;
            if (tags.label) {
              ffmpegCmd += ` -metadata "publisher=${escapeValue(tags.label)}"`;
              ffmpegCmd += ` -metadata "label=${escapeValue(tags.label)}"`;
            }
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
          
          // Evento: Tags escritas com sucesso
          if (downloadId) {
            sendProgressEvent(downloadId, {
              type: 'tagging',
              step: 'Metadados escritos com sucesso!',
              progress: 85,
              substep: 'Verificando integridade das tags',
              detail: `Tags ${format.toUpperCase()} aplicadas no arquivo`
            });
          }
          
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
            // Verificar se realmente veio do Beatport (verificando sources no comment)
            const comment = fileTags.comment || fileTags.COMMENT || '';
            const fromBeatport = useBeatport && metadata?.sources?.includes('Beatport') && comment.includes('Sources:') && comment.includes('Beatport');
            console.log(`      🎯 Dados Beatport salvos: ${hasBeatportData ? '✅ SIM' : '❌ NÃO'}`);
            console.log(`      🎯 Normalizado pelo Beatport: ${fromBeatport ? '✅ SIM' : '❌ NÃO'}`);
            
            // Mover arquivo para pasta nao-normalizadas se não foi normalizado pelo Beatport
            if (useBeatport && !fromBeatport && audioFile) {
              try {
                const { rename, mkdir } = require('fs/promises');
                const { join } = require('path');
                const { existsSync } = require('fs');
                
                // Verificar se o arquivo já está na pasta nao-normalizadas
                if (!audioFile.includes('nao-normalizadas')) {
                  const naoNormalizadasDir = join(downloadsFolder, 'nao-normalizadas');
                  if (!existsSync(naoNormalizadasDir)) {
                    await mkdir(naoNormalizadasDir, { recursive: true });
                    console.log(`   ✅ Pasta nao-normalizadas criada: ${naoNormalizadasDir}`);
                  }
                  
                  const fileName = audioFile.split(/[/\\]/).pop() || '';
                  if (fileName) {
                    let newFilePath = join(naoNormalizadasDir, fileName);
                    
                    // Se já existe, adicionar timestamp
                    if (existsSync(newFilePath)) {
                      const timestamp = Date.now();
                      const fileExt = fileName.substring(fileName.lastIndexOf('.'));
                      const fileBase = fileName.substring(0, fileName.lastIndexOf('.'));
                      newFilePath = join(naoNormalizadasDir, `${fileBase}_${timestamp}${fileExt}`);
                    }
                    
                    await rename(audioFile, newFilePath);
                    audioFile = newFilePath; // Atualizar caminho do arquivo
                    console.log(`   📁 Arquivo movido para pasta nao-normalizadas: ${fileName}`);
                  }
                }
              } catch (moveError) {
                console.warn(`   ⚠️ Erro ao mover arquivo para pasta nao-normalizadas: ${moveError instanceof Error ? moveError.message : 'Unknown error'}`);
                // Não falhar o download por causa disso
              }
            }
            
            // Evento: Verificação concluída
            if (downloadId) {
              sendProgressEvent(downloadId, {
                type: 'verification',
                step: 'Verificação de integridade concluída',
                progress: 90,
                substep: 'Tags verificadas no arquivo',
                detail: `BPM: ${fileTags.bpm || fileTags.BPM || 'N/A'} | Key: ${fileTags.initialkey || fileTags.INITIALKEY || 'N/A'}`,
                metadata: {
                  title: fileTags.title || fileTags.TITLE,
                  artist: fileTags.artist || fileTags.ARTIST,
                  bpm: fileTags.bpm || fileTags.BPM,
                  key: fileTags.initialkey || fileTags.INITIALKEY,
                  genre: fileTags.genre || fileTags.GENRE,
                  hasBeatportData,
                  fromBeatport
                }
              });
            }
            
          } catch (probeErr) {
            console.error('⚠️  [Download] Erro na verificação com FFprobe:', probeErr);
            
            // Evento: Erro na verificação
            if (downloadId) {
              sendProgressEvent(downloadId, {
                type: 'verification',
                step: 'Erro na verificação de integridade',
                progress: 88,
                substep: 'Problema ao verificar tags',
                detail: `Erro: ${probeErr instanceof Error ? probeErr.message : 'Desconhecido'}`
              });
            }
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

    // Evento final: Processo concluído - SEMPRE enviar
    if (downloadId) {
      const finalMetadata = {
        title: videoInfo.title,
        artist: videoInfo.uploader,
        duration: videoInfo.duration,
        format: format,
        hasBeatportData: useBeatport && metadata?.sources?.includes('Beatport'),
        finalMetadata: metadata
      };

      console.log(`🎯 Enviando evento COMPLETE final para downloadId: ${downloadId}`);
      sendProgressEvent(downloadId, {
        type: 'complete',
        step: 'Download concluído com sucesso! 🎉',
        progress: 100,
        substep: 'Processo finalizado',
        detail: `Arquivo: ${videoInfo.title}.${format}`,
        metadata: finalMetadata
      });

      // 🔧 Aguardar um pouco para garantir que o evento seja processado
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log(`✅ Evento COMPLETE enviado com sucesso para: ${downloadId}`);
    }

    return NextResponse.json({
      status: 'concluído',
      message: 'Download concluído com sucesso',
      info: {
        title: videoInfo.title,
        artist: videoInfo.uploader,
        duration: videoInfo.duration,
        thumbnail: videoInfo.thumbnail,
        format: format,
        metadata: metadata
      }
    });

  } catch (error) {
    console.error('Erro detalhado ao processar vídeo:', error);
    
    // 🔧 Enviar evento de erro via SSE se downloadId estiver disponível
    const errorMessage = error instanceof Error ? error.message : 'Erro ao processar o vídeo';
    
    if (downloadId) {
      console.log(`❌ Enviando evento ERROR para downloadId: ${downloadId}`);
      sendProgressEvent(downloadId, {
        type: 'error',
        step: 'Erro no download',
        progress: 0,
        detail: errorMessage
      });
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 

export async function POST(request: NextRequest) {
  let downloadId: string | null = null;
  
  try {
    const body = await request.json();
    const { url, downloadId: bodyDownloadId, format = 'flac', useBeatport = false, showBeatportPage = false, isPlaylist = false } = body;
    
    downloadId = bodyDownloadId;
    
    if (!url) {
      return NextResponse.json(
        { error: 'URL é obrigatória' },
        { status: 400 }
      );
    }

    console.log('Iniciando download via POST para URL:', url, 'Formato:', format, 'Beatport:', useBeatport, 'ShowBeatportPage:', showBeatportPage, 'Playlist:', isPlaylist, 'DownloadID:', downloadId);

    // Enviar evento inicial
    if (downloadId) {
      console.log(`🎯 Enviando evento inicial para downloadId: ${downloadId}`);
      sendProgressEvent(downloadId, {
        type: 'init',
        step: 'Preparando download...',
        progress: 5,
        detail: `Formato: ${format.toUpperCase()}, Beatport: ${useBeatport ? 'Ativado' : 'Desativado'}, Página Beatport: ${showBeatportPage ? 'Visível' : 'Oculta'}, Playlist: ${isPlaylist ? 'Sim' : 'Não'}`
      });
    }

    // Se for playlist, usar o serviço de playlist
    if (isPlaylist) {
      const { playlistDownloadService } = await import('@/lib/services/playlistDownloadService');
      
      console.log('🎵 Iniciando download de playlist com serviço dedicado...');
      
      const result = await playlistDownloadService.downloadPlaylist(url, {
        format: format as 'mp3' | 'flac' | 'wav',
        enhanceMetadata: true,
        maxConcurrent: 3,
        useBeatport,
        showBeatportPage,
        downloadId: downloadId || undefined
      });

      if (result.success) {
        return NextResponse.json({
          status: 'concluído',
          message: 'Download da playlist concluído com sucesso',
          details: {
            totalTracks: result.totalTracks,
            processedTracks: result.processedTracks,
            enhancedTracks: result.enhancedTracks,
            enhancementRate: result.totalTracks > 0 ? 
              Math.round((result.enhancedTracks / result.totalTracks) * 100) : 0,
            downloadPath: result.downloadPath,
            errors: result.errors,
            beatportMode: useBeatport
          }
        });
      } else {
        return NextResponse.json({
          status: 'erro',
          message: 'Erro no download da playlist',
          details: {
            totalTracks: result.totalTracks,
            processedTracks: result.processedTracks,
            enhancedTracks: result.enhancedTracks,
            errors: result.errors,
            beatportMode: useBeatport
          }
        }, { status: 500 });
      }
    } else {
      // Para downloads individuais, usar o fluxo existente do GET
      const searchParams = new URLSearchParams();
      searchParams.set('url', url);
      searchParams.set('format', format);
      searchParams.set('useBeatport', useBeatport.toString());
      searchParams.set('showBeatportPage', showBeatportPage.toString());
      if (downloadId) {
        searchParams.set('downloadId', downloadId);
      }
      
      // Criar uma nova requisição GET com os parâmetros
      const getRequest = new NextRequest(
        new URL(`/api/download?${searchParams.toString()}`, request.url),
        { method: 'GET' }
      );
      
      // Chamar o método GET existente
      return await GET(getRequest);
    }

  } catch (error) {
    console.error('Erro detalhado ao processar download via POST:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Erro ao processar o download';
    
    if (downloadId) {
      console.log(`❌ Enviando evento ERROR para downloadId: ${downloadId}`);
      sendProgressEvent(downloadId, {
        type: 'error',
        step: 'Erro no download',
        progress: 0,
        detail: errorMessage
      });
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 