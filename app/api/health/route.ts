import { NextResponse } from 'next/server';
import ytdl from 'ytdl-core';

export async function GET() {
  try {
    // URL de um vídeo curto e conhecido para teste
    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    
    // Verificar se a URL é válida
    const isValid = ytdl.validateURL(testUrl);
    
    if (!isValid) {
      return NextResponse.json({
        status: 'error',
        message: 'URL inválida'
      }, { status: 400 });
    }

    // Obter informações básicas do vídeo
    const info = await ytdl.getBasicInfo(testUrl);
    
    return NextResponse.json({
      status: 'ok',
      test: {
        url: testUrl,
        isValid,
        title: info.videoDetails.title
      }
    });
  } catch (error) {
    console.error('Erro no health check:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Falha ao testar ytdl-core',
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      },
      { status: 500 }
    );
  }
} 