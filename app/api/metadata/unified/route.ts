import { NextRequest, NextResponse } from 'next/server';
import { metadataAggregator } from '@/lib/services/metadataService';
import { individualMetadataAggregator } from '@/lib/services/individualMetadataService';
import { getDownloadsPath, fileExists, sanitizeYear } from '../../utils/common';
import { join } from 'path';
import { readFile } from 'fs/promises';
import NodeID3 from 'node-id3';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { mkdtempSync, existsSync, renameSync } from 'fs';
import os from 'os';

const execAsync = promisify(exec);

interface MetadataRequest {
  // Para busca de metadados
  title?: string;
  artist?: string;
  useBeatport?: boolean;
  skipMetadata?: boolean;
  
  // Para atualização de arquivos
  fileName?: string;
  album?: string;
  year?: string | number;
  genre?: string;
  label?: string;
  bpm?: string | number;
  key?: string;
  duration?: string | number;
  comment?: string;
  newFileName?: string;
  catalogNumber?: string;
  
  // Tipo de operação
  operation?: 'search' | 'update' | 'release' | 'individual' | 'enhance';
}

export async function POST(request: NextRequest) {
  try {
    const body: MetadataRequest = await request.json();
    const { operation = 'search', ...params } = body;

    console.log(`🎵 [Unified Metadata] Operation: ${operation}`);

    switch (operation) {
      case 'search':
        return await handleMetadataSearch(params);
      
      case 'update':
        return await handleMetadataUpdate(params, request);
      
      case 'release':
        return await handleReleaseMetadata(params);
      
      case 'individual':
        return await handleIndividualMetadata(params);
      
      case 'enhance':
        return await handleMetadataEnhance(params);
      
      default:
        return NextResponse.json({ 
          success: false, 
          error: 'Invalid operation. Use: search, update, release, or individual' 
        }, { status: 400 });
    }

  } catch (error) {
    console.error('❌ [Unified Metadata] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Metadata operation failed' 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const operation = searchParams.get('operation') as MetadataRequest['operation'] || 'search';
  
  // Converter parâmetros GET para formato POST
  const params: MetadataRequest = {
    operation,
    title: searchParams.get('title') || undefined,
    artist: searchParams.get('artist') || undefined,
    fileName: searchParams.get('fileName') || undefined,
    album: searchParams.get('album') || undefined,
    useBeatport: searchParams.get('useBeatport') === 'true',
    skipMetadata: searchParams.get('skipMetadata') !== 'false'
  };

  // Criar requisição POST
  const postRequest = new NextRequest(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  return POST(postRequest);
}

async function handleMetadataSearch(params: MetadataRequest) {
  const { title, artist, useBeatport = false, skipMetadata = true } = params;

  if (!title) {
    return NextResponse.json({ 
      success: false, 
      error: 'Title is required for metadata search' 
    }, { status: 400 });
  }

  console.log(`🔍 [Metadata Search] Title: "${title}", Artist: "${artist}", Beatport: ${useBeatport}`);

  const startTime = Date.now();
  
  // Buscar metadados usando o agregador
  const metadata = await metadataAggregator.searchMetadata(title, artist || '', { 
    useBeatport
  });

  const duration = Date.now() - startTime;
  
  console.log(`📊 [Metadata Search] Completed in ${duration}ms`);
  console.log(`   📈 Result: BPM: ${metadata.bpm || 'N/A'}, Key: ${metadata.key || 'N/A'}, Genre: ${metadata.genre || 'N/A'}`);

  return NextResponse.json({
    success: true,
    metadata,
    beatportMode: useBeatport,
    searchDuration: duration
  });
}

async function handleMetadataUpdate(params: MetadataRequest, request: NextRequest) {
  const { 
    fileName, title, artist, album, year, genre, label, bpm, key, duration, comment, newFileName, catalogNumber 
  } = params;

  if (!fileName) {
    return NextResponse.json({ 
      success: false, 
      error: 'fileName is required for metadata update' 
    }, { status: 400 });
  }

  console.log(`📝 [Metadata Update] File: ${fileName}`);

  const downloadsFolder = await getDownloadsPath();
  let filePath = join(downloadsFolder, fileName);
  
  if (!(await fileExists(filePath))) {
    return NextResponse.json({ 
      success: false, 
      error: 'File not found' 
    }, { status: 404 });
  }

  // Renomear arquivo se necessário
  if (newFileName && newFileName !== fileName) {
    const newFilePath = join(downloadsFolder, newFileName);
    if (await fileExists(newFilePath)) {
      return NextResponse.json({ 
        success: false, 
        error: 'File with new name already exists' 
      }, { status: 400 });
    }
    try {
      renameSync(filePath, newFilePath);
      filePath = newFilePath;
    } catch (err) {
      return NextResponse.json({ 
        success: false, 
        error: 'Error renaming file' 
      }, { status: 500 });
    }
  }

  // Atualizar metadados se fornecidos
  if (title || artist || album || year || genre || label || bpm || key || duration || comment || catalogNumber) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const safeYear = sanitizeYear(year || '');

    if (ext === 'mp3') {
      const tags: any = {};
      if (title) tags.title = title;
      if (artist) tags.artist = artist;
      if (album) tags.album = album;
      if (safeYear) tags.year = safeYear;
      if (genre) tags.genre = genre;
      if (label) tags.publisher = label;
      if (bpm) tags.TBPM = bpm.toString();
      if (key) tags.initialKey = key;
      if (duration) tags.length = duration.toString();
      if (comment) tags.comment = { language: 'por', text: comment };
      if (catalogNumber) tags.catalogNumber = catalogNumber;

      const success = NodeID3.write(tags, filePath);
      if (!success) {
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to write MP3 metadata' 
        }, { status: 500 });
      }
    } else if (ext === 'flac') {
      // Montar argumentos do ffmpeg
      const args = ['-y', '-i', filePath];
      if (title) args.push('-metadata', `title=${title}`);
      if (artist) args.push('-metadata', `artist=${artist}`);
      if (album) args.push('-metadata', `album=${album}`);
      if (safeYear) args.push('-metadata', `date=${safeYear}`);
      if (genre) args.push('-metadata', `genre=${genre}`);
      if (label) args.push('-metadata', `publisher=${label}`);
      if (bpm) args.push('-metadata', `bpm=${bpm}`);
      if (key) args.push('-metadata', `key=${key}`);
      if (duration) args.push('-metadata', `duration=${duration}`);
      if (comment) args.push('-metadata', `comment=${comment}`);
      if (catalogNumber) args.push('-metadata', `catalogNumber=${catalogNumber}`);
      
      // Arquivo temporário de saída
      const tmpDir = mkdtempSync(os.tmpdir() + '/flacmeta-');
      const outPath = `${tmpDir}/out.flac`;
      args.push('-c', 'copy', outPath);
      
      // Executar ffmpeg
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', args);
        let stderr = '';
        ffmpeg.stderr.on('data', (data) => { stderr += data.toString(); });
        ffmpeg.on('close', (code) => {
          if (code === 0 && existsSync(outPath)) {
            try {
              renameSync(outPath, filePath);
              resolve(true);
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error('ffmpeg error: ' + stderr));
          }
        });
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: 'File format not supported for metadata editing' 
      }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Metadata updated successfully' 
    });
  }

  // Se não foram fornecidos metadados, buscar automaticamente
  const tags = NodeID3.read(filePath);
  const fallbackTitle = tags.title || fileName.replace(/\.flac$/i, '');
  const fallbackArtist = tags.artist || '';
  
  // Buscar metadados no MusicBrainz
  try {
    const host = request.headers.get('host');
    const protocol = host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https';
    const mbRes = await fetch(`${protocol}://${host}/api/musicbrainz-metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: fallbackTitle, artist: fallbackArtist })
    });
    const metadata = await mbRes.json();
    
    if (!metadata || metadata.error) {
      return NextResponse.json({ 
        success: false, 
        error: 'Metadata not found' 
      }, { status: 404 });
    }
    
    const success = NodeID3.write({
      title: metadata.titulo || fallbackTitle,
      artist: metadata.artista || fallbackArtist,
      album: metadata.album || '',
      year: metadata.ano || '',
      genre: metadata.genero || '',
      publisher: metadata.label || '',
      comment: { language: 'por', text: metadata.descricao || '' }
    }, filePath);
    
    if (!success) {
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to write metadata' 
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Metadata updated successfully' 
    });
  } catch (err) {
    return NextResponse.json({ 
      success: false, 
      error: 'Error fetching MusicBrainz metadata' 
    }, { status: 500 });
  }
}

async function handleReleaseMetadata(params: MetadataRequest) {
  const { album } = params;
  
  if (!album) {
    return NextResponse.json({ 
      success: false, 
      error: 'Album name is required for release metadata' 
    }, { status: 400 });
  }

  console.log(`🔎 [Release Metadata] Album: ${album}`);

  // Importar puppeteer dinamicamente
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({
            headless: false, // Browser visível para debug
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // Buscar releases pelo nome do álbum
    const searchUrl = `https://www.beatport.com/search/releases?q=${encodeURIComponent(album)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 45000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Aceitar cookies se necessário
    try {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        for (const btn of btns) {
          const txt = (btn.textContent || '').toLowerCase();
          if (txt.includes('accept') || txt.includes('aceitar') || txt.includes('i accept') || txt.includes('essential only')) {
            btn.click();
          }
        }
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {}

    // Encontrar a release mais relevante
    const releaseUrl = await page.evaluate((album) => {
      const links = Array.from(document.querySelectorAll('a[href*="/release/"]'));
      let bestHref = null;
      let bestScore = -999;
      for (const link of links) {
        const text = (link.textContent || '').trim().toLowerCase();
        let score = 0;
        if (text === album.toLowerCase()) score += 1000;
        if (text.includes(album.toLowerCase())) score += 500;
        if (score > bestScore) {
          bestScore = score;
          const href = link.getAttribute('href');
          bestHref = href && href.startsWith('http') ? href : 'https://www.beatport.com' + href;
        }
      }
      return bestHref;
    }, album);

    if (!releaseUrl) {
      return NextResponse.json({ 
        success: false, 
        error: 'Release not found on Beatport' 
      }, { status: 404 });
    }

    // Acessar página da release
    await page.goto(releaseUrl, { waitUntil: 'networkidle0', timeout: 45000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Aceitar cookies novamente se aparecerem
    try {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        for (const btn of btns) {
          const txt = (btn.textContent || '').toLowerCase();
          if (txt.includes('accept') || txt.includes('aceitar') || txt.includes('i accept') || txt.includes('essential only')) {
            btn.click();
          }
        }
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {}

    // Aguardar a presença da tabela de faixas
    await page.waitForSelector('table', { timeout: 15000 });

    // Extrair metadados da release e faixas
    const scrapingResult = await page.evaluate(() => {
      try {
        // Metadados principais
        const meta = {
          album: '',
          label: '',
          year: '',
          releaseDate: '',
          artists: '',
          cover: '',
          catalogNumber: '',
        };
        
        // Nome do álbum
        const h1 = document.querySelector('h1');
        if (h1) meta.album = h1.textContent?.trim() || '';
        
        // Artista principal: primeiro <a> após o <h1>
        let artistMain = null;
        if (h1) {
          let el = h1.nextElementSibling;
          while (el) {
            if (el.tagName === 'A' && el.getAttribute('href')?.includes('/artist/')) {
              artistMain = el.textContent?.trim();
              break;
            }
            el = el.nextElementSibling;
          }
        }
        if (artistMain) meta.artists = artistMain;
        
        // Label
        const labelEl = document.querySelector('a[href*="/label/"]');
        if (labelEl) meta.label = labelEl.textContent?.trim() || '';
        
        // Data de lançamento e ano
        const releaseDateEl = Array.from(document.querySelectorAll('li, span')).find(el => el.textContent?.toLowerCase().includes('data de lançamento'));
        if (releaseDateEl && releaseDateEl.textContent) {
          const match = releaseDateEl.textContent.match(/\d{4}-\d{2}-\d{2}/);
          if (match) meta.releaseDate = match[0];
          if (match) meta.year = match[0].slice(0, 4);
        }
        
        // Número do catálogo
        let catalogNumber = '';
        const catalogEl = Array.from(document.querySelectorAll('li, span')).find(el => el.textContent && el.textContent.match(/cat(á|a)logo/i));
        if (catalogEl && catalogEl.textContent) {
          const match = catalogEl.textContent.match(/([A-Z0-9]{4,})/);
          if (match) catalogNumber = match[1];
        }
        meta.catalogNumber = catalogNumber;
        
        // Capa
        const img = document.querySelector('img[src*="cloudfront"], img[alt*="cover"]');
        if (img) meta.cover = img.getAttribute('src') || '';
        
        // Faixas: primeira <table> após o header
        let tracks: any[] = [];
        let table = document.querySelector('table');
        if (table) {
          // Mapear colunas pelo cabeçalho
          const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent?.toLowerCase().trim() || '');
          const rows = Array.from(table.querySelectorAll('tbody tr'));
          rows.forEach(row => {
            const tds = Array.from(row.querySelectorAll('td'));
            let track: any = {};
            headers.forEach((header, idx) => {
              const val = tds[idx]?.textContent?.trim() || '';
              if (header.includes('título')) track.title = val;
              if (header.includes('artista')) track.artists = val;
              if (header.includes('gravadora')) track.label = val;
              if (header.includes('gênero')) track.genre = val;
              if (header.includes('bpm')) track.bpm = val;
              if (header.includes('tom')) track.key = val;
              if (header.includes('dura')) track.duration = val;
              if (header.includes('remix')) track.remixers = val;
              if (header.includes('lançamento')) track.releaseDate = val;
            });
            
            // Fallback para título: pegar <span> se existir
            if (!track.title) {
              const spanTitle = row.querySelector('span[data-testid*="track-title"], .buk-track-primary-title, .track-title, .bucket-item__title, .track__title');
              if (spanTitle) track.title = spanTitle.textContent?.trim() || '';
            }
            if (track.title) tracks.push(track);
          });
        }
        return { metadata: meta, tracks, error: null };
      } catch (err) {
        return { metadata: {}, tracks: [], error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (scrapingResult.error) {
      console.error('❌ [Release Metadata] Scraping error:', scrapingResult.error);
      return NextResponse.json({ 
        success: false, 
        error: 'Scraping error: ' + scrapingResult.error 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        metadata: scrapingResult.metadata,
        tracks: scrapingResult.tracks,
        releaseUrl
      }
    });

  } finally {
    await browser.close();
  }
}

async function handleIndividualMetadata(params: MetadataRequest) {
  const { fileName, title, artist } = params;

  if (!fileName || !title || !artist) {
    return NextResponse.json({ 
      success: false, 
      error: 'fileName, title and artist are required for individual metadata' 
    }, { status: 400 });
  }

  console.log(`🎵 [Individual Metadata] File: ${fileName}, Title: "${title}", Artist: "${artist}"`);

  const metadata = await individualMetadataAggregator.searchMetadata(title, artist);

  if (!metadata) {
    return NextResponse.json({ 
      success: false, 
      error: 'Could not find metadata for this track' 
    }, { status: 404 });
  }

  return NextResponse.json({ 
    success: true, 
    metadata 
  });
}

async function handleMetadataEnhance(params: MetadataRequest) {
  const { fileName, useBeatport = true } = params;
  if (!fileName) {
    return NextResponse.json({ 
      success: false, 
      error: 'fileName is required for enhance operation' 
    }, { status: 400 });
  }

  const downloadsFolder = await getDownloadsPath();
  const filePath = join(downloadsFolder, fileName);
  if (!(await fileExists(filePath))) {
    return NextResponse.json({ 
      success: false, 
      error: 'File not found' 
    }, { status: 404 });
  }

  // Tentar extrair título/artista/álbum dos metadados atuais
  const ext = filePath.split('.').pop()?.toLowerCase();
  let tags: any = {};
  let originalTitle = fileName.replace(/\.(flac|mp3)$/i, '');
  let originalArtist = '';
  let originalAlbum = '';
  
  try {
    if (ext === 'mp3') {
      // Para MP3, usar NodeID3
      tags = NodeID3.read(filePath);
      originalTitle = tags.title || originalTitle;
      originalArtist = tags.artist || '';
      originalAlbum = tags.album || '';
    } else if (ext === 'flac') {
      // Para FLAC, usar ffprobe
      const { stdout } = await execAsync(
        `ffprobe -v quiet -print_format json -show_format "${filePath}"`,
        { maxBuffer: 1024 * 1024 * 10 }
      );
      const info = JSON.parse(stdout);
      const flacTags = info.format?.tags || {};
      originalTitle = flacTags.title || flacTags.TITLE || originalTitle;
      originalArtist = flacTags.artist || flacTags.ARTIST || flacTags.albumartist || flacTags.ALBUMARTIST || '';
      originalAlbum = flacTags.album || flacTags.ALBUM || '';
    }
  } catch (error) {
    console.error('Erro ao ler metadados existentes:', error);
    // Manter valores padrão se falhar
  }

  // Buscar metadados aprimorados (apenas para obter BPM, Key, Genre, Label, etc.)
  const metadata = await metadataAggregator.searchMetadata(
    originalTitle,
    originalArtist,
    { useBeatport }
  );

  // Gravar metadados se encontrados (preservando título e artista originais)
  if (metadata && (metadata.bpm || metadata.key || metadata.genre || metadata.label || metadata.year)) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const safeYear = sanitizeYear(metadata.year || '');

    if (ext === 'mp3') {
      const tags: any = {};
      // PRESERVAR título, artista e álbum originais - não alterar
      tags.title = originalTitle;
      tags.artist = originalArtist;
      tags.album = originalAlbum || metadata.album || '';
      if (safeYear) tags.year = safeYear;
      if (metadata.genre) tags.genre = metadata.genre;
      if (metadata.label) tags.publisher = metadata.label;
      if (metadata.bpm) tags.TBPM = metadata.bpm.toString();
      if (metadata.key) tags.initialKey = metadata.key;
      if (metadata.duration) tags.length = metadata.duration.toString();
      tags.comment = { language: 'por', text: `Enhanced metadata -- BPM: ${metadata.bpm || 'N/A'} -- Key: ${metadata.key || 'N/A'} -- Genre: ${metadata.genre || 'N/A'} -- Album: ${metadata.album || 'N/A'} -- Label: ${metadata.label || 'N/A'} -- Sources: ${metadata.sources?.join(', ') || 'None'}` };
      const success = NodeID3.write(tags, filePath);
      if (!success) {
        return NextResponse.json({ success: false, error: 'Failed to write MP3 metadata' }, { status: 500 });
      }
    } else if (ext === 'flac') {
      // Montar argumentos do ffmpeg
      const args = ['-y', '-i', filePath];
      // PRESERVAR título, artista e álbum originais - não alterar
      args.push('-metadata', `title=${originalTitle}`);
      args.push('-metadata', `artist=${originalArtist}`);
      args.push('-metadata', `album=${originalAlbum || metadata.album || ''}`);
      if (safeYear) args.push('-metadata', `date=${safeYear}`);
      if (metadata.genre) args.push('-metadata', `genre=${metadata.genre}`);
      if (metadata.label) args.push('-metadata', `publisher=${metadata.label}`);
      if (metadata.bpm) args.push('-metadata', `bpm=${metadata.bpm}`);
      if (metadata.key) args.push('-metadata', `key=${metadata.key}`);
      if (metadata.duration) args.push('-metadata', `duration=${metadata.duration}`);
      args.push('-metadata', `comment=Enhanced metadata -- BPM: ${metadata.bpm || 'N/A'} -- Key: ${metadata.key || 'N/A'} -- Genre: ${metadata.genre || 'N/A'} -- Album: ${metadata.album || 'N/A'} -- Label: ${metadata.label || 'N/A'} -- Sources: ${metadata.sources?.join(', ') || 'None'}`);
      // Arquivo temporário de saída
      const tmpDir = mkdtempSync(os.tmpdir() + '/flacmeta-');
      const outPath = `${tmpDir}/out.flac`;
      args.push('-c', 'copy', outPath);
      // Executar ffmpeg
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', args);
        let stderr = '';
        ffmpeg.stderr.on('data', (data) => { stderr += data.toString(); });
        ffmpeg.on('close', (code) => {
          if (code === 0 && existsSync(outPath)) {
            try {
              renameSync(outPath, filePath);
              resolve(true);
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error('ffmpeg error: ' + stderr));
          }
        });
      });
    } else {
      return NextResponse.json({ success: false, error: 'File format not supported for metadata editing' }, { status: 400 });
    }
    return NextResponse.json({ success: true, metadata, message: 'Metadata enhanced and written successfully' });
  } else {
    return NextResponse.json({ success: false, error: 'No useful metadata found to enhance' }, { status: 404 });
  }
} 