import { NextRequest, NextResponse } from 'next/server';
import { playlistDownloadService } from '@/lib/services/playlistDownloadService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');
    const format = searchParams.get('format') || 'mp3';
    const enhanceMetadata = searchParams.get('enhanceMetadata') !== 'false'; // Default to true
    const maxConcurrent = parseInt(searchParams.get('maxConcurrent') || '3');
    const useBeatport = searchParams.get('useBeatport') === 'true'; // Toggle para Beatport
    
    if (!url) {
      return NextResponse.json(
        { error: 'URL é obrigatória' },
        { status: 400 }
      );
    }

    console.log('Iniciando download melhorado da playlist:', url, {
      format,
      enhanceMetadata,
      maxConcurrent,
      useBeatport
    });

    // Use the enhanced playlist download service
    const result = await playlistDownloadService.downloadPlaylist(url, {
      format: format as 'mp3' | 'flac' | 'wav',
      enhanceMetadata,
      maxConcurrent,
      useBeatport // Passar o toggle para o serviço
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

  } catch (error) {
    console.error('Erro detalhado ao processar playlist:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao processar a playlist' },
      { status: 500 }
    );
  }
} 