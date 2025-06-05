import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, access, readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { constants } from 'fs';
import NodeID3 from 'node-id3';
import { metadataAggregator } from './metadataService';
import { logger } from '../utils/logger';
import { scrapeTracklist } from '../tracklistScraper';

const execAsync = promisify(exec);

export interface PlaylistDownloadOptions {
  format?: 'mp3' | 'flac' | 'wav';
  quality?: string;
  enhanceMetadata?: boolean;
  maxConcurrent?: number;
  useBeatport?: boolean;
}

export interface PlaylistDownloadResult {
  success: boolean;
  totalTracks: number;
  processedTracks: number;
  enhancedTracks: number;
  errors: string[];
  downloadPath: string;
  beatportTracksFound?: number;
  tracklistScraping?: any[];
}

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
    return join(process.cwd(), 'downloads');
  }
}

function sanitizeTitle(title: string): string {
  return title.replace(/[^\w\s\-\(\)\[\]]/g, '').replace(/\s+/g, ' ').trim();
}

function cleanArtistName(artist: string): string {
  if (!artist) return '';
  // Remove sufixos comuns do YouTube e plataformas
  return artist
    .replace(/\s*[-–—]\s*(Topic|Official|Subject|Channel|VEVO| - .*|\(.*\)|\[.*\])$/gi, '')
    .replace(/\s*\(.*?\)$/g, '')
    .replace(/\s*\[.*?\]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class PlaylistDownloadService {
  async downloadPlaylist(
    url: string, 
    options: PlaylistDownloadOptions = {}
  ): Promise<PlaylistDownloadResult & { tracklistScraping?: any[] }> {
    const {
      format = 'mp3',
      quality = '0',
      enhanceMetadata = true,
      maxConcurrent = 3,
      useBeatport = false
    } = options;

    const downloadsFolder = await getDownloadsPath();
    await mkdir(downloadsFolder, { recursive: true });

    const result: PlaylistDownloadResult = {
      success: false,
      totalTracks: 0,
      processedTracks: 0,
      enhancedTracks: 0,
      errors: [],
      downloadPath: downloadsFolder,
      beatportTracksFound: 0
    };

    // Declarar scrapedTracklist fora do try block para evitar ReferenceError
    let scrapedTracklist: any[] = [];

    try {
      logger.info(`Starting playlist download: ${url} (Beatport mode: ${useBeatport})`);

      // 1. Scraping da tracklist antes de baixar
      try {
        logger.info('Iniciando scraping da tracklist...');
        const scrapingResult = await scrapeTracklist(url);
        if (scrapingResult && scrapingResult.tracks) {
          scrapedTracklist = scrapingResult.tracks;
          logger.info(`Tracklist scraping: ${scrapedTracklist.length} faixas encontradas.`);
        } else {
          logger.warn('Tracklist scraping não retornou faixas.');
        }
      } catch (err) {
        logger.error('Erro ao fazer scraping da tracklist:', err);
        // Manter scrapedTracklist como array vazio em caso de erro
        scrapedTracklist = [];
      }

      // Get playlist info to determine number of tracks
      logger.info('🔍 Getting playlist information...');
      const { stdout: playlistInfo } = await execAsync(
        `yt-dlp --dump-json --flat-playlist "${url}"`,
        { maxBuffer: 1024 * 1024 * 50 } // 50MB buffer for large playlists
      );

      const playlistEntries = playlistInfo
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(entry => entry !== null);

      result.totalTracks = playlistEntries.length;
      logger.info(`📊 Found ${result.totalTracks} tracks in playlist`);

      // Associate scraping data with playlist entries
      playlistEntries.forEach((entry, idx) => {
        // Try to associate by position (idx)
        if (scrapedTracklist[idx]) {
          entry.scraping = scrapedTracklist[idx];
        } else {
          // fallback: try by title
          const found = scrapedTracklist.find(t => t.title && entry.title && t.title.toLowerCase().includes(entry.title.toLowerCase()));
          if (found) entry.scraping = found;
        }
      });

      // **NOVO FLUXO: Download + Metadata por música individual**
      logger.info('🎵 Starting sequential download with real-time metadata enhancement...');
      await this.downloadAndProcessTracksSequentially(
        url,
        playlistEntries,
        downloadsFolder,
        format,
        quality,
        enhanceMetadata,
        useBeatport,
        result
      );

      result.success = true;
      logger.info(`Playlist download completed. Enhanced ${result.enhancedTracks}/${result.totalTracks} tracks (Beatport: ${result.beatportTracksFound})`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(errorMessage);
      logger.error('Playlist download failed:', error);
    }

    // Retorna também o scraping da tracklist junto do resultado
    return { ...result, tracklistScraping: scrapedTracklist };
  }

  private async downloadAndProcessTracksSequentially(
    playlistUrl: string,
    playlistEntries: any[],
    downloadsFolder: string,
    format: string,
    quality: string,
    enhanceMetadata: boolean,
    useBeatport: boolean,
    result: PlaylistDownloadResult
  ): Promise<void> {
    logger.info(`🚀 Processing ${playlistEntries.length} tracks sequentially...`);

    for (let i = 0; i < playlistEntries.length; i++) {
      const entry = playlistEntries[i];
      const trackNumber = i + 1;
      const totalTracks = playlistEntries.length;
      
      logger.info(`\n🎵 [${trackNumber}/${totalTracks}] Processing: "${entry.title}"`);

      try {
        // 1. Download individual track
        const trackUrl = `https://www.youtube.com/watch?v=${entry.id}`;
        const filename = sanitizeTitle(entry.title || 'Unknown');
        const outputPath = `${downloadsFolder}/${filename}.%(ext)s`;

        logger.info(`   ⬇️ Downloading track ${trackNumber}...`);
        
        // Tentativa 1: Com cookies normais
        let downloadOutput = '';
        let downloadSuccess = false;
        let hadYouTubeIssues = false;
        
        try {
          const { stdout } = await execAsync(
            `yt-dlp -x --audio-format ${format} --audio-quality ${quality} ` +
            `--embed-thumbnail --convert-thumbnails jpg ` +
            `--add-metadata ` +
            `--cookies "cookies.txt" ` +
            `--user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" ` +
            `--sleep-interval 2 --max-sleep-interval 5 ` +
            `-o "${outputPath}" ` +
            `--no-part --force-overwrites "${trackUrl}"`,
            { maxBuffer: 1024 * 1024 * 20 } // 20MB buffer per track
          );
          downloadOutput = stdout;
          downloadSuccess = true;
          logger.info(`   ✅ Download successful with standard method`);
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          if (errorMessage.includes('Sign in to confirm') || errorMessage.includes('not a bot')) {
            hadYouTubeIssues = true;
            logger.warn(`   ⚠️ YouTube bot detection triggered for track ${trackNumber}`);
            logger.warn(`   🔄 Trying alternative method with browser cookies...`);
            
            // Tentativa 2: Com cookies do browser
            try {
              const { stdout } = await execAsync(
                `yt-dlp -x --audio-format ${format} --audio-quality ${quality} ` +
                `--embed-thumbnail --convert-thumbnails jpg ` +
                `--add-metadata ` +
                `--cookies-from-browser chrome ` +
                `--user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" ` +
                `--sleep-interval 5 --max-sleep-interval 10 ` +
                `-o "${outputPath}" ` +
                `--no-part --force-overwrites "${trackUrl}"`,
                { maxBuffer: 1024 * 1024 * 20, timeout: 120000 } // 2 minutos timeout
              );
              downloadOutput = stdout;
              downloadSuccess = true;
              logger.info(`   ✅ Download successful with browser cookies method`);
              
            } catch (browserError) {
              logger.error(`   ❌ Both download methods failed for track ${trackNumber}`);
              logger.error(`   🚨 YouTube may be blocking access - consider waiting before retrying`);
              throw new Error(`YouTube access blocked: ${errorMessage}`);
            }
          } else {
            throw error; // Re-throw se não for problema de bot detection
          }
        }

        const finalFilePath = `${downloadsFolder}/${filename}.${format}`;
        
        // 2. Enhance metadata immediately after download
        if (enhanceMetadata) {
          logger.info(`   🔍 Enhancing metadata for track ${trackNumber}...`);
          const enhanced = await this.enhanceFileMetadata(
            finalFilePath, 
            `${filename}.${format}`, 
            useBeatport, 
            entry
          );

          if (enhanced.success) {
            result.enhancedTracks++;
            if (enhanced.fromBeatport) {
              result.beatportTracksFound = (result.beatportTracksFound || 0) + 1;
            }
            logger.info(`   ✅ Metadata enhanced successfully!`);
          } else {
            logger.warn(`   ⚠️ Failed to enhance metadata`);
          }
        }

        result.processedTracks++;
        logger.info(`   ✅ Track ${trackNumber} completed! Progress: ${result.processedTracks}/${totalTracks}`);

        // Progress report every 5 tracks
        if (trackNumber % 5 === 0) {
          const successRate = ((result.enhancedTracks / result.processedTracks) * 100).toFixed(1);
          logger.info(`📊 Progress Report: ${result.processedTracks}/${totalTracks} processed, ${result.enhancedTracks} enhanced (${successRate}%), ${result.beatportTracksFound || 0} from Beatport`);
        }

        // Smart delay based on success/failure
        if (trackNumber < totalTracks) {
          if (hadYouTubeIssues) {
            // Longer delay if we had YouTube issues
            logger.info(`   ⏳ Extended delay (15s) due to YouTube issues...`);
            await new Promise(resolve => setTimeout(resolve, 15000));
          } else {
            // Normal delay
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }

      } catch (error) {
        const errorMessage = `Failed to process track ${trackNumber} ("${entry.title}"): ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMessage);
        logger.error(`   ❌ ${errorMessage}`);
        
        // Continue with next track instead of failing entire playlist
        continue;
      }
    }

    // Final summary
    const successRate = result.totalTracks > 0 ? ((result.enhancedTracks / result.totalTracks) * 100).toFixed(1) : '0';
    logger.info(`\n🎉 Sequential processing completed!`);
    logger.info(`📊 Final Statistics:`);
    logger.info(`   - Total tracks: ${result.totalTracks}`);
    logger.info(`   - Successfully processed: ${result.processedTracks}`);
    logger.info(`   - Enhanced with metadata: ${result.enhancedTracks} (${successRate}%)`);
    logger.info(`   - Enhanced with Beatport: ${result.beatportTracksFound || 0}`);
    logger.info(`   - Errors: ${result.errors.length}`);
  }

  private async enhancePlaylistMetadata(
    downloadsFolder: string,
    format: string,
    playlistEntries: any[],
    maxConcurrent: number,
    result: PlaylistDownloadResult,
    useBeatport: boolean = false
  ): Promise<void> {
    logger.info(`Starting metadata enhancement... (Beatport mode: ${useBeatport})`);

    // Get list of downloaded files with their creation times
    const files = await readdir(downloadsFolder);
    const audioFiles = files.filter(file => file.endsWith(`.${format}`));

    // **NOVO: Criar mapeamento de arquivos com suas informações originais**
    const { stat } = require('fs/promises');
    const fileInfos = await Promise.all(
      audioFiles.map(async (filename, index) => {
        const filePath = join(downloadsFolder, filename);
        const stats = await stat(filePath);
        
        // Tentar associar com playlistEntry correspondente
        const baseTitle = filename.replace(/\.(mp3|flac|wav)$/i, '');
        const matchingEntry = playlistEntries.find(entry => 
          entry.title && baseTitle.includes(entry.title.substring(0, 30))
        );
        const info = {
          filename,
          filePath,
          created: stats.birthtimeMs,
          modified: stats.mtimeMs,
          baseTitle,
          matchingEntryTitle: matchingEntry?.title,
          matchingEntryUploader: matchingEntry?.uploader,
          matchingEntryChannel: matchingEntry?.channel,
          matchingEntry
        };
        logger.info(`[DEBUG] fileInfo: ${JSON.stringify(info)}`);
        return info;
      })
    );

    // **NOVO: Ordenar pelos índices originais da playlist para manter ordem**
    fileInfos.sort((a, b) => a.created - b.created);

    logger.info(`Processing ${fileInfos.length} files sequentially in ORIGINAL PLAYLIST ORDER - Beatport: ${useBeatport}`);

    // **PROCESSAMENTO SEQUENCIAL mantendo ordem original da playlist**
    for (let i = 0; i < fileInfos.length; i++) {
      const fileInfo = fileInfos[i];
      logger.info(`Processing file ${i + 1}/${fileInfos.length}: ${fileInfo.filename} (Original position: ${i + 1}) - Beatport: ${useBeatport}`);

      try {
        // **PRESERVAR data de criação original antes da modificação**
        const originalCreationTime = fileInfo.created;
        
        const enhanced = await this.enhanceFileMetadata(fileInfo.filePath, fileInfo.filename, useBeatport, fileInfo.matchingEntry);
        
        if (enhanced.success) {
          result.enhancedTracks++;
          if (enhanced.fromBeatport) {
            result.beatportTracksFound = (result.beatportTracksFound || 0) + 1;
          }

          // **NOVO: Restaurar timestamp original após modificação**
          try {
            const { utimes } = require('fs/promises');
            // Manter a data de criação original para preservar ordem
            await utimes(fileInfo.filePath, originalCreationTime, originalCreationTime);
            logger.info(`✅ Restored original timestamp for: ${fileInfo.filename}`);
          } catch (timestampError) {
            logger.warn(`⚠️  Could not restore timestamp for ${fileInfo.filename}: ${timestampError}`);
          }
        }
        result.processedTracks++;

      } catch (error) {
        const errorMessage = `Failed to enhance ${fileInfo.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMessage);
        logger.error(errorMessage);
      }

      // Small delay between files to avoid overwhelming APIs
      if (i < fileInfos.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  private async enhanceFileMetadata(
    filePath: string, 
    filename: string, 
    useBeatport: boolean = false,
    playlistEntry?: any  // NOVO: informações da entrada original da playlist
  ): Promise<{ success: boolean; fromBeatport: boolean }> {
    logger.info(`[DEBUG] Iniciando enhanceFileMetadata para: ${filename}`);
    // Read existing metadata
    const existingTags = NodeID3.read(filePath);
    logger.info(`[DEBUG] existingTags: ${JSON.stringify(existingTags)}`);
    const title = existingTags.title || filename.replace(/\.[^/.]+$/, '');
    
    // **MELHORADO: Usar múltiplas fontes para extrair artista**
    let artist = existingTags.artist || '';
    logger.info(`[DEBUG] Artista inicial extraído dos tags: ${artist}`);
    
    // Tentar extrair artista das informações da playlist se disponível
    if (!artist && playlistEntry) {
      if (playlistEntry.uploader && playlistEntry.uploader !== 'Unknown') {
        artist = playlistEntry.uploader;
        logger.info(`[DEBUG] Artist extracted from playlist entry: ${artist}`);
      } else if (playlistEntry.channel && playlistEntry.channel !== 'Unknown') {
        artist = playlistEntry.channel;
        logger.info(`[DEBUG] Artist extracted from channel: ${artist}`);
      }
    }

    // Clean up title (remove common YouTube suffixes)
    const cleanTitle = this.cleanTrackTitle(title);
    let cleanArtist = this.extractArtistFromTitle(cleanTitle, artist);
    cleanArtist = cleanArtistName(cleanArtist);
    logger.info(`[DEBUG] cleanTitle: ${cleanTitle}, cleanArtist: ${cleanArtist}`);

    logger.info(`🔍 Searching metadata for: "${cleanTitle}" by "${cleanArtist}" (Beatport: ${useBeatport})`);

    // Get enhanced metadata with Beatport option
    const metadata = await metadataAggregator.searchMetadata(
      cleanTitle, 
      cleanArtist,
      { useBeatport }
    );
    logger.info(`[DEBUG] metadataAggregator.searchMetadata retornou: ${JSON.stringify(metadata)}`);

    // Check if we got useful enhanced data
    const hasEnhancedData = metadata.bpm || metadata.key || metadata.label || 
                           metadata.genre || metadata.album || metadata.artist;

    if (!hasEnhancedData) {
      logger.warn(`[DEBUG] No enhanced metadata found for: ${cleanTitle} - ${cleanArtist}`);
      return { success: false, fromBeatport: false };
    }

    const fromBeatport = metadata.sources?.includes('Beatport') || false;

    // **MELHORADO: Usar artista do Beatport se disponível, senão manter o extraído**
    let finalArtist = metadata.artist || cleanArtist || artist;
    finalArtist = cleanArtistName(finalArtist);
    logger.info(`[DEBUG] Final artist determined: "${finalArtist}" (from Beatport: ${!!metadata.artist})`);

    // Detect file format
    const fileExtension = filePath.split('.').pop()?.toLowerCase();
    let success = false;

    if (fileExtension === 'mp3') {
      // Use NodeID3 for MP3 files
      const enhancedTags = {
        title: metadata.title || cleanTitle,
        artist: finalArtist,  // **CORRIGIDO: usar finalArtist**
        album: metadata.album || existingTags.album || '',
        year: metadata.year?.toString() || existingTags.year || '',
        genre: metadata.genre || existingTags.genre || '',
        publisher: metadata.label || existingTags.publisher || '',
        bpm: metadata.bpm?.toString() || '',
        initialkey: metadata.key || '',
        comment: {
          language: 'por',
          text: `Enhanced metadata${useBeatport ? ' (Beatport mode)' : ''} | Artist: ${finalArtist} | BPM: ${metadata.bpm || 'N/A'} | Key: ${metadata.key || 'N/A'} | Genre: ${metadata.genre || 'N/A'} | Album: ${metadata.album || 'N/A'} | Label: ${metadata.label || 'N/A'} | Sources: ${metadata.sources?.join(', ') || 'None'}`
        }
      };
      logger.info(`[DEBUG] enhancedTags a serem escritos: ${JSON.stringify(enhancedTags)}`);
      const writeResult = NodeID3.write(enhancedTags, filePath);
      success = writeResult === true;
      logger.info(`[DEBUG] Resultado NodeID3.write: ${success}`);

    } else if (fileExtension === 'flac') {
      // Use ffmpeg for FLAC files  
      logger.info(`[DEBUG] Chamando writeFlacMetadata para FLAC: ${filePath}`);
      success = await this.writeFlacMetadata(filePath, metadata, cleanTitle, finalArtist, useBeatport);
      logger.info(`[DEBUG] Resultado writeFlacMetadata: ${success}`);
    } else {
      logger.warn(`[DEBUG] Unsupported file format for metadata writing: ${fileExtension}`);
      return { success: false, fromBeatport: false };
    }

    return { success, fromBeatport };
  }

  private async writeFlacMetadata(
    filePath: string, 
    metadata: any, 
    cleanTitle: string, 
    cleanArtist: string, 
    useBeatport: boolean
  ): Promise<boolean> {
    try {
      // Create temporary file for ffmpeg output with correct .flac extension
      const tempPath = filePath.replace('.flac', '_temp.flac');
      
      // Helper function to escape metadata values for ffmpeg in PowerShell
      const escapeMetadataValue = (value: string): string => {
        if (!value) return '';
        // PowerShell-safe escaping
        return value
          .replace(/\|/g, '-')        // Replace pipes with hyphens (PowerShell interprets | as pipe)
          .replace(/:/g, ' -')        // Replace colons (PowerShell interprets : as command separator)
          .replace(/"/g, "'")         // Replace double quotes with single quotes
          .replace(/\$/g, '')         // Remove $ signs (PowerShell variables)
          .replace(/`/g, "'")         // Replace backticks (PowerShell escape char)
          .replace(/&/g, 'and')       // Replace & (PowerShell background operator)
          .replace(/<|>/g, '')        // Remove redirects
          .replace(/;/g, ',')         // Replace semicolons
          .trim();
      };
      
      // Build ffmpeg command with FLAC tags
      const ffmpegArgs = [
        '-i', `"${filePath}"`,
        '-c', 'copy', // Copy without re-encoding
        '-metadata', `"title=${escapeMetadataValue(metadata.title || cleanTitle)}"`,
        '-metadata', `"artist=${escapeMetadataValue(metadata.artist || cleanArtist)}"`,
      ];

      // Add optional metadata fields if they exist
      if (metadata.album) {
        ffmpegArgs.push('-metadata', `"album=${escapeMetadataValue(metadata.album)}"`);
      }
      if (metadata.year) {
        ffmpegArgs.push('-metadata', `"date=${metadata.year}"`);
      }
      if (metadata.genre) {
        // Use both 'genre' and 'Genre' for better compatibility
        const escapedGenre = escapeMetadataValue(metadata.genre);
        ffmpegArgs.push('-metadata', `"genre=${escapedGenre}"`);
        ffmpegArgs.push('-metadata', `"Genre=${escapedGenre}"`);
      }
      if (metadata.label) {
        // Use both 'publisher' and 'label' fields that the API reads
        const escapedLabel = escapeMetadataValue(metadata.label);
        ffmpegArgs.push('-metadata', `"publisher=${escapedLabel}"`);
        ffmpegArgs.push('-metadata', `"label=${escapedLabel}"`);
      }
      if (metadata.bpm) {
        // Use both 'BPM' and 'bpm' for better compatibility
        ffmpegArgs.push('-metadata', `"BPM=${metadata.bpm}"`);
        ffmpegArgs.push('-metadata', `"bpm=${metadata.bpm}"`);
      }
      if (metadata.key) {
        // Use multiple key field names that the API searches for
        const escapedKey = escapeMetadataValue(metadata.key);
        ffmpegArgs.push('-metadata', `"key=${escapedKey}"`);
        ffmpegArgs.push('-metadata', `"initialKey=${escapedKey}"`);
        ffmpegArgs.push('-metadata', `"INITIALKEY=${escapedKey}"`);
        ffmpegArgs.push('-metadata', `"initialkey=${escapedKey}"`);
      }

      // Add comment with source info (escape pipes to avoid shell interpretation)
      const commentText = `Enhanced metadata${useBeatport ? ' (Beatport mode)' : ''} -- BPM: ${metadata.bpm || 'N/A'} -- Key: ${metadata.key || 'N/A'} -- Genre: ${metadata.genre || 'N/A'} -- Album: ${metadata.album || 'N/A'} -- Label: ${metadata.label || 'N/A'} -- Sources: ${metadata.sources?.join(', ') || 'None'}`;
      ffmpegArgs.push('-metadata', `"comment=${escapeMetadataValue(commentText)}"`);

      // Specify FLAC format explicitly and output to temp file
      ffmpegArgs.push('-f', 'flac', `"${tempPath}"`);

      // Execute ffmpeg command - Use PowerShell-safe format
      const ffmpegCommand = `ffmpeg -y ${ffmpegArgs.join(' ')}`;
      logger.info(`Writing FLAC metadata with: ${ffmpegCommand}`);
      
      // Execute with shell: false to avoid PowerShell interpretation issues
      const { execSync } = require('child_process');
      try {
        execSync(ffmpegCommand, { 
          stdio: 'pipe',
          encoding: 'utf8',
          timeout: 30000,
          windowsHide: true
        });
      } catch (execError: any) {
        // Fallback: try with cmd.exe instead of PowerShell
        logger.warn('FFmpeg failed with PowerShell, trying with cmd.exe...');
        const cmdCommand = `cmd /c "${ffmpegCommand}"`;
        execSync(cmdCommand, { 
          stdio: 'pipe',
          encoding: 'utf8',
          timeout: 30000,
          windowsHide: true
        });
      }
      
      // Replace original file with updated version
      const { rename } = require('fs/promises');
      await rename(tempPath, filePath);
      
      logger.info(`✅ FLAC metadata written successfully for: ${cleanTitle}`);
      return true;

    } catch (error) {
      logger.error(`❌ Failed to write FLAC metadata: ${error instanceof Error ? error.message : error}`);
      
      // Clean up temp file if it exists
      try {
        const { unlink } = require('fs/promises');
        const tempPath = filePath.replace('.flac', '_temp.flac');
        await unlink(tempPath);
      } catch (e) {
        // Ignore cleanup errors
      }
      
      return false;
    }
  }

  private cleanTrackTitle(title: string): string {
    // Remove common YouTube/platform suffixes and patterns
    return title
      .replace(/\s*\(Official.*?\)/gi, '')
      .replace(/\s*\[Official.*?\]/gi, '')
      .replace(/\s*-\s*Official.*$/gi, '')
      .replace(/\s*\(Audio\)/gi, '')
      .replace(/\s*\[Audio\]/gi, '')
      .replace(/\s*\(Music Video\)/gi, '')
      .replace(/\s*\[Music Video\]/gi, '')
      .replace(/\s*\(HD\)/gi, '')
      .replace(/\s*\[HD\]/gi, '')
      .replace(/\s*\(4K\)/gi, '')
      .replace(/\s*\[4K\]/gi, '')
      .replace(/\s*\(Lyric.*?\)/gi, '')
      .replace(/\s*\[Lyric.*?\]/gi, '')
      .replace(/\s*\(Visualizer\)/gi, '')
      .replace(/\s*\[Visualizer\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractArtistFromTitle(title: string, existingArtist: string): string {
    if (existingArtist && existingArtist !== 'Unknown' && existingArtist.trim() !== '') {
      return existingArtist;
    }

    // Try to extract artist from title patterns like "Artist - Title"
    const dashMatch = title.match(/^([^-]+)\s*-\s*(.+)$/);
    if (dashMatch) {
      const possibleArtist = dashMatch[1].trim();
      // Only use if it looks like an artist name (not too long, contains letters)
      if (possibleArtist.length <= 50 && /[a-zA-Z]/.test(possibleArtist)) {
        return possibleArtist;
      }
    }

    // Try patterns like "Title by Artist" or "Title feat. Artist"
    const byMatch = title.match(/(.+)\s+(?:by|feat\.?|featuring)\s+([^-]+)$/i);
    if (byMatch) {
      const possibleArtist = byMatch[2].trim();
      if (possibleArtist.length <= 50 && /[a-zA-Z]/.test(possibleArtist)) {
        return possibleArtist;
      }
    }

    // Try parentheses pattern "Title (Artist)"
    const parenMatch = title.match(/(.+)\s*\(([^)]+)\)$/);
    if (parenMatch) {
      const possibleArtist = parenMatch[2].trim();
      // Only if it doesn't look like a remix or edit
      if (possibleArtist.length <= 50 && 
          /[a-zA-Z]/.test(possibleArtist) && 
          !/(remix|edit|mix|version|vocal|dub|bootleg|rework)/i.test(possibleArtist)) {
        return possibleArtist;
      }
    }

    return existingArtist || '';
  }

  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }
}

// Singleton instance
export const playlistDownloadService = new PlaylistDownloadService(); 