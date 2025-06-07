import { NextResponse } from 'next/server';
import { individualMetadataAggregator } from '@/lib/services/individualMetadataService';

export async function POST(request: Request) {
  try {
    const { fileName, title, artist } = await request.json();

    if (!fileName || !title || !artist) {
      return NextResponse.json(
        { error: 'fileName, title e artist são obrigatórios' },
        { status: 400 }
      );
    }

    console.log(`\n🎵 [API] Atualizando metadados individuais para: "${title}" - "${artist}"`);

    const metadata = await individualMetadataAggregator.searchMetadata(title, artist);

    if (!metadata) {
      return NextResponse.json(
        { error: 'Não foi possível encontrar metadados para esta música' },
        { status: 404 }
      );
    }

    return NextResponse.json({ metadata });
  } catch (error) {
    console.error('❌ [API] Erro ao atualizar metadados individuais:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar metadados' },
      { status: 500 }
    );
  }
} 