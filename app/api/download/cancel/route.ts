import { NextRequest, NextResponse } from 'next/server';
import { playlistDownloadService } from '@/lib/services/playlistDownloadService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cancela uma execução de playlist em andamento. Aborta os downloads pendentes na fila
 * (propaga AbortSignal às tasks). Idempotente: retorna cancelled=false se não havia nada ativo.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const downloadId = body?.downloadId || request.nextUrl.searchParams.get('downloadId');

    if (!downloadId) {
      return NextResponse.json({ error: 'downloadId é obrigatório' }, { status: 400 });
    }

    const cancelled = playlistDownloadService.cancel(String(downloadId));
    return NextResponse.json({ cancelled, downloadId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao cancelar download' },
      { status: 500 }
    );
  }
}
