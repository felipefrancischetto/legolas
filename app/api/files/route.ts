import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { getDownloadsPath, formatDurationShort } from '../utils/common';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function extractAudioMetadata(filePath: string) {
  try {
    // Extrair metadados incluindo a imagem embutida
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
      { maxBuffer: 1024 * 1024 * 10 }
    );

    const info = JSON.parse(stdout);
    const tags = info.format?.tags || {};
    
    // Procurar por stream de imagem
    const pictureStream = info.streams?.find((stream: { codec_type: string; codec_name: string; }) => 
      stream.codec_type === 'video' && stream.codec_name === 'mjpeg'
    );
    const hasCoverArt = pictureStream !== undefined;

    // Se tiver imagem embutida, criar uma URL para ela
    let thumbnailUrl = null;
    if (hasCoverArt) {
      thumbnailUrl = `/api/thumbnail/${encodeURIComponent(filePath.split('/').pop() || '')}`;
    }

    // Extrair artista de múltiplas fontes e fallbacks
    const artist = tags.artist || tags.ARTIST || 
                   tags.albumartist || tags.ALBUMARTIST || 
                   tags.performer || tags.PERFORMER || 
                   null;

    // Extrair BPM de múltiplas fontes
    const bpm = tags.BPM || tags.bpm || tags.TEMPO || tags.tempo || null;

    // Extrair Key de múltiplas fontes  
    const key = tags.key || tags.KEY || 
                tags.initialKey || tags.INITIALKEY || 
                tags.initialkey || tags.INITIAL_KEY || null;

    // Extrair gênero (limpar se contiver BPM misturado)
    let genre = tags.genre || tags.Genre || tags.GENRE || null;
    if (genre) {
      // Se o gênero contém números no início (como "140 / Deep Dubstep"), limpar
      const genreClean = genre.replace(/^\d+\s*\/?\s*/, '').trim();
      if (genreClean && genreClean !== genre) {
        genre = genreClean;
      }
    }

    // Extrair label de múltiplas fontes
    const label = tags.publisher || tags.Publisher || tags.label || tags.Label || tags.LABEL || null;

    // Extrair número de catálogo de múltiplas fontes
    const catalogNumber = tags.catalog || tags.CATALOG || tags.catalogNumber || tags.CATALOGNUMBER || 
                         tags.catalognumber || tags.catalog_number || null;

    // Extrair remixer de múltiplas fontes
    const remixer = tags.remixer || tags.REMIXER || tags.remix || tags.REMIX || null;

    // Extrair comentário que contém informações sobre as fontes dos metadados
    const comment = tags.comment || tags.COMMENT || null;
    
    // Verificar se realmente veio do Beatport verificando o campo comment que contém as fontes
    // O formato do comment é: "BPM: X | Key: Y | Published: Z | Sources: Beatport, ..."
    // REGRA RESTRITIVA: Só marca como Beatport se realmente vier do Beatport (confirmado nas sources)
    let hasBeatportSource = false;
    if (comment && comment.includes('Sources:')) {
      // Se menciona Sources, verificar se inclui Beatport
      hasBeatportSource = comment.includes('Beatport') || comment.includes('BeatportV2');
    }
    // Se não tem comment ou não menciona Sources, NÃO marca como Beatport
    // Isso garante que só arquivos que realmente vieram do Beatport sejam marcados

    // Determinar se o arquivo passou pelo Beatport baseado em:
    // 1. Presença de metadados específicos (Label, BPM e Genre)
    // 2. E confirmação explícita de que veio do Beatport (verificando sources no comment)
    // REGRA RESTRITIVA: Só marca como Beatport se realmente veio do Beatport
    // Isso evita marcar arquivos que têm metadados similares mas vieram de outras fontes (ex: YouTube)
    const hasRequiredMetadata = !!(label && bpm && genre);
    const isBeatportFormat = hasRequiredMetadata && hasBeatportSource;

    return {
      title: tags.title || tags.TITLE || null,
      artist: artist,
      duration: formatDurationShort(parseFloat(info.format?.duration || '0')),
      bpm: bpm,
      key: key,
      genre: genre,
      album: tags.album || tags.Album || tags.ALBUM || null,
      label: label,
      catalogNumber: catalogNumber,
      catalog: catalogNumber, // Alias para compatibilidade
      thumbnail: thumbnailUrl,
      ano: tags.year || tags.date || tags.YEAR || tags.DATE || null,
      publishedDate: tags.publisher_date || tags.PUBLISHER_DATE || tags.publishedDate || tags.PUBLISHED_DATE || null,
      isBeatportFormat: isBeatportFormat,
      remixer: remixer
    };
  } catch (error) {
    console.error('Erro ao extrair metadados:', error);
    return {};
  }
}

export async function GET(request: NextRequest) {
  try {
    // Obter o caminho de downloads usando utilitário compartilhado
    const downloadsFolder = await getDownloadsPath();
    
    console.log(`📂 [files API] Procurando arquivos em: ${downloadsFolder}`);

    let files: string[] = [];
    try {
      // Listar arquivos na pasta de downloads
      files = await readdir(downloadsFolder);
      console.log(`✅ [files API] Encontrados ${files.length} arquivos na pasta`);
    } catch (err: any) {
      console.error(`❌ [files API] Erro ao listar arquivos em ${downloadsFolder}:`, err);
      if (err?.code === 'ENOENT') {
        // Pasta não existe, retorna lista vazia
        console.warn(`⚠️ [files API] Pasta não existe: ${downloadsFolder}`);
        return NextResponse.json({ files: [] });
      }
      throw err;
    }
    // Filtrar apenas arquivos de áudio (MP3 e FLAC) e excluir arquivos da pasta arquivadas
    const excludedFiles: string[] = [];
    const arquivadasDir = join(downloadsFolder, 'arquivadas');
    const naoNormalizadasDir = join(downloadsFolder, 'nao-normalizadas');
    
    // Listar arquivos na pasta arquivadas para excluir da lista
    let arquivadasFiles: string[] = [];
    try {
      if (existsSync(arquivadasDir)) {
        arquivadasFiles = await readdir(arquivadasDir);
      }
    } catch (err) {
      // Se não conseguir ler a pasta arquivadas, continuar normalmente
      console.warn('⚠️ [files API] Não foi possível ler pasta arquivadas:', err);
    }
    
    // Listar arquivos na pasta nao-normalizadas para INCLUIR na lista
    let naoNormalizadasFiles: string[] = [];
    try {
      if (existsSync(naoNormalizadasDir)) {
        naoNormalizadasFiles = await readdir(naoNormalizadasDir);
      }
    } catch (err) {
      // Se não conseguir ler a pasta nao-normalizadas, continuar normalmente
      console.warn('⚠️ [files API] Não foi possível ler pasta nao-normalizadas:', err);
    }
    
    const arquivadasSet = new Set(arquivadasFiles.map(f => f.toLowerCase()));
    const naoNormalizadasSet = new Set(naoNormalizadasFiles.map(f => f.toLowerCase()));
    
    const audioFiles = files.filter(file => {
      // Excluir arquivos que estão na pasta arquivadas
      const fileNameLower = file.toLowerCase();
      if (arquivadasSet.has(fileNameLower)) {
        excludedFiles.push(file);
        console.log(`🚫 [files API] Filtrando arquivo arquivado: ${file}`);
        return false;
      }
      // Excluir arquivos que começam com [excluir]_ (arquivos removidos antigos) - case insensitive
      if (fileNameLower.startsWith('[excluir]_')) {
        excludedFiles.push(file);
        console.log(`🚫 [files API] Filtrando arquivo excluído: ${file}`);
        return false;
      }
      const ext = fileNameLower;
      const isAudio = ext.endsWith('.mp3') || ext.endsWith('.flac');
      return isAudio;
    });
    
    // Adicionar arquivos da pasta nao-normalizadas à lista (eles devem aparecer)
    const naoNormalizadasAudioFiles = naoNormalizadasFiles.filter(file => {
      const fileNameLower = file.toLowerCase();
      return fileNameLower.endsWith('.mp3') || fileNameLower.endsWith('.flac');
    });
    
    console.log(`📊 [files API] Arquivos na pasta nao-normalizadas: ${naoNormalizadasAudioFiles.length}`);
    
    console.log(`📊 [files API] Total de arquivos no diretório: ${files.length}`);
    console.log(`📊 [files API] Arquivos excluídos (arquivados ou [excluir]_): ${excludedFiles.length}`, excludedFiles.slice(0, 5));
    console.log(`📊 [files API] Arquivos de áudio válidos: ${audioFiles.length}`);
    
    // Buscar datas de download do playlist-status.json
    let downloadDates: Record<string, string> = {};
    const statusFile = join(downloadsFolder, 'playlist-status.json');
    if (existsSync(statusFile)) {
      try {
        const statusData = JSON.parse(await readFile(statusFile, 'utf-8'));
        if (statusData && statusData.videos) {
          statusData.videos.forEach((v: any) => {
            if (v.title && v.downloadedAt) {
              downloadDates[v.title] = v.downloadedAt;
            }
          });
        }
      } catch {}
    }
    // Obter informações de cada arquivo da pasta principal
    const fileInfos = await Promise.all(
      audioFiles.map(async (file) => {
        const filePath = join(downloadsFolder, file);
        const metadata = await extractAudioMetadata(filePath);
        const fileStats = await stat(filePath);
        
        // Buscar data/hora pelo título
        const downloadedAt = downloadDates[metadata.title || file.replace(/\.(mp3|flac)$/i, '')] || null;
        
        // Usar data de criação do arquivo como fallback
        const fileCreatedAt = fileStats.birthtime.toISOString();
        
        return {
          name: file,
          displayName: file.replace(/\.(mp3|flac)$/i, ''),
          path: filePath,
          size: fileStats.size,
          downloadedAt,
          fileCreatedAt,
          folder: 'principal', // Marcar como arquivo da pasta principal
          ...metadata
        };
      })
    );
    
    // Obter informações de cada arquivo da pasta nao-normalizadas
    const naoNormalizadasFileInfos = await Promise.all(
      naoNormalizadasAudioFiles.map(async (file) => {
        const filePath = join(naoNormalizadasDir, file);
        const metadata = await extractAudioMetadata(filePath);
        const fileStats = await stat(filePath);
        
        // Buscar data/hora pelo título
        const downloadedAt = downloadDates[metadata.title || file.replace(/\.(mp3|flac)$/i, '')] || null;
        
        // Usar data de criação do arquivo como fallback
        const fileCreatedAt = fileStats.birthtime.toISOString();
        
        return {
          name: file,
          displayName: file.replace(/\.(mp3|flac)$/i, ''),
          path: filePath,
          size: fileStats.size,
          downloadedAt,
          fileCreatedAt,
          folder: 'nao-normalizadas', // Marcar como arquivo da pasta nao-normalizadas
          ...metadata
        };
      })
    );
    
    // Combinar ambas as listas
    const allFileInfos = [...fileInfos, ...naoNormalizadasFileInfos];
    
    // Ordenar por data/hora de forma mais estável
    // Prioridade: downloadedAt > fileCreatedAt > ordem alfabética por título
    allFileInfos.sort((a, b) => {
      // Se ambos têm downloadedAt, usar essa data (mais antigo primeiro para manter ordem de playlist)
      if (a.downloadedAt && b.downloadedAt) {
        return new Date(a.downloadedAt).getTime() - new Date(b.downloadedAt).getTime();
      }
      
      // Se apenas um tem downloadedAt, ele vem primeiro
      if (a.downloadedAt && !b.downloadedAt) return -1;
      if (!a.downloadedAt && b.downloadedAt) return 1;
      
      // Se nenhum tem downloadedAt, usar fileCreatedAt (mais antigo primeiro)
      if (a.fileCreatedAt && b.fileCreatedAt) {
        return new Date(a.fileCreatedAt).getTime() - new Date(b.fileCreatedAt).getTime();
      }
      
      // Fallback para ordem alfabética por título
      const titleA = a.title || a.displayName || '';
      const titleB = b.title || b.displayName || '';
      return titleA.localeCompare(titleB);
    });

    // Otimizar resposta: remover campos null/undefined e limitar tamanho
    const optimizedFiles = allFileInfos.map(file => {
      const optimized: any = {
        name: file.name,
        displayName: file.displayName,
        size: file.size,
      };
      
      // Adicionar apenas campos que têm valores (não incluir null/undefined)
      if (file.title) optimized.title = file.title;
      if (file.artist) optimized.artist = file.artist;
      if (file.duration) optimized.duration = file.duration;
      // Não incluir thumbnail na resposta inicial (pode ser carregado sob demanda)
      if (file.bpm) optimized.bpm = file.bpm;
      if (file.key) optimized.key = file.key;
      if (file.genre) optimized.genre = file.genre;
      if (file.album) optimized.album = file.album;
      if (file.fileCreatedAt) optimized.fileCreatedAt = file.fileCreatedAt;
      // Só incluir isBeatportFormat se for true (reduz tamanho)
      if (file.isBeatportFormat === true) optimized.isBeatportFormat = true;
      // Incluir informação sobre a pasta (só se não for principal)
      if (file.folder && file.folder !== 'principal') optimized.folder = file.folder;
      if (file.label) optimized.label = file.label;
      if (file.ano) optimized.ano = file.ano;
      if (file.remixer) optimized.remixer = file.remixer;
      if (file.catalogNumber) optimized.catalogNumber = file.catalogNumber;
      if (file.catalog) optimized.catalog = file.catalog;
      
      // Não incluir path completo (muito grande) - pode ser reconstruído se necessário
      // Não incluir downloadedAt se não for crítico
      // Não incluir metadata completo
      
      return optimized;
    });

    // Verificar tamanho da resposta antes de enviar
    const responseData = { files: optimizedFiles };
    const responseJson = JSON.stringify(responseData);
    const responseSize = Buffer.byteLength(responseJson, 'utf8');
    const maxResponseSize = 30 * 1024 * 1024; // 30MB - limite mais seguro

    console.log(`📊 [files API] Tamanho da resposta: ${(responseSize / 1024 / 1024).toFixed(2)}MB`);

    if (responseSize > maxResponseSize) {
      console.warn(`⚠️ [files API] Resposta muito grande (${(responseSize / 1024 / 1024).toFixed(2)}MB), aplicando otimização adicional...`);
      
      // Remover campos menos críticos para reduzir tamanho
      const minimalFiles = optimizedFiles.map(file => {
        const minimal: any = {
          name: file.name,
          displayName: file.displayName,
          size: file.size,
        };
        
        // Manter apenas campos absolutamente essenciais
        if (file.title) minimal.title = file.title;
        if (file.artist) minimal.artist = file.artist;
        if (file.duration) minimal.duration = file.duration;
        if (file.fileCreatedAt) minimal.fileCreatedAt = file.fileCreatedAt;
        if (file.isBeatportFormat === true) minimal.isBeatportFormat = true;
        
        return minimal;
      });
      
      const minimalResponse = { files: minimalFiles };
      const minimalJson = JSON.stringify(minimalResponse);
      const minimalSize = Buffer.byteLength(minimalJson, 'utf8');
      
      console.log(`📊 [files API] Tamanho após otimização: ${(minimalSize / 1024 / 1024).toFixed(2)}MB`);
      
      if (minimalSize > maxResponseSize) {
        console.error(`❌ [files API] Resposta ainda muito grande mesmo após otimização (${(minimalSize / 1024 / 1024).toFixed(2)}MB)`);
        // Retornar apenas uma amostra ou erro
        return NextResponse.json(
          { 
            error: 'Resposta muito grande',
            files: minimalFiles.slice(0, 100), // Retornar apenas primeiros 100 arquivos
            total: minimalFiles.length,
            message: 'Resposta truncada devido ao tamanho.'
          },
          { status: 206 } // Partial Content
        );
      }
      
      return NextResponse.json(minimalResponse);
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Erro ao listar arquivos:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao listar arquivos' },
      { status: 500 }
    );
  }
} 