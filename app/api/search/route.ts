import { NextRequest, NextResponse } from 'next/server';

// Redirecionamento para API unificada
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  
  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
  }

  // Redirecionar para API unificada
  const unifiedUrl = new URL('/api/search/unified', request.url);
  unifiedUrl.searchParams.set('q', query);
  unifiedUrl.searchParams.set('platform', 'youtube');

  return NextResponse.redirect(unifiedUrl);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // Criar nova requisição para API unificada
  const unifiedRequest = new NextRequest(new URL('/api/search/unified', request.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: body.query || body.q,
      platform: 'youtube',
      maxResults: body.maxResults || 5
    })
  });

  // Importar e chamar a API unificada diretamente
  const { POST: unifiedPOST } = await import('./unified/route');
  return unifiedPOST(unifiedRequest);
} 