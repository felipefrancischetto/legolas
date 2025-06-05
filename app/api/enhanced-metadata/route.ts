import { NextRequest, NextResponse } from 'next/server';
import { metadataAggregator } from '@/lib/services/metadataService';

interface MetadataRequest {
  title: string;
  artist: string;
  useBeatport?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: MetadataRequest = await request.json();
    const { title, artist, useBeatport = false } = body;

    console.log('\n🎯 [Enhanced-Metadata API] Iniciando busca de metadados:');
    console.log(`   📋 Title: "${title}"`);
    console.log(`   🎤 Artist: "${artist}"`);
    console.log(`   🎧 Beatport habilitado: ${useBeatport}`);
    console.log('───────────────────────────────────────────────────');

    if (!title) {
      console.log('❌ [Enhanced-Metadata API] Erro: título não fornecido');
      return NextResponse.json({ 
        success: false, 
        error: 'Title is required' 
      }, { status: 400 });
    }

    const startTime = Date.now();
    
    // Buscar metadados usando o agregador
    const metadata = await metadataAggregator.searchMetadata(title, artist, { 
      useBeatport 
    });

    const duration = Date.now() - startTime;
    
    console.log(`\n📊 [Enhanced-Metadata API] Busca concluída em ${duration}ms:`);
    console.log('   📈 Resultado agregado final:');
    console.log(`      • BPM: ${metadata.bpm || 'N/A'}`);
    console.log(`      • Key: ${metadata.key || 'N/A'}`);
    console.log(`      • Genre: ${metadata.genre || 'N/A'}`);
    console.log(`      • Label: ${metadata.label || 'N/A'}`);
    console.log(`      • Year: ${metadata.year || 'N/A'}`);
    console.log(`      • Album: ${metadata.album || 'N/A'}`);
    console.log(`      • Duration: ${metadata.duration || 'N/A'}`);
    console.log(`   📍 Fontes: ${metadata.sources?.join(', ') || 'Nenhuma'}`);
    
    // Verificar se encontrou dados úteis
    const hasUsefulData = metadata.bpm || metadata.key || metadata.genre || metadata.label || metadata.year;
    console.log(`   ✅ Dados úteis encontrados: ${hasUsefulData ? 'SIM' : 'NÃO'}`);
    
    if (useBeatport && metadata.sources?.includes('Beatport')) {
      console.log('🎉 [Enhanced-Metadata API] BEATPORT SUCESSO! Dados obtidos do Beatport!');
    } else if (useBeatport) {
      console.log('⚠️  [Enhanced-Metadata API] Beatport habilitado mas não retornou dados');
    }

    console.log('═══════════════════════════════════════════════════\n');

    return NextResponse.json({
      success: true,
      metadata,
      beatportMode: useBeatport,
      searchDuration: duration
    });

  } catch (error) {
    console.error('❌ [Enhanced-Metadata API] Erro na busca de metadados:', error);
    
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Return configuration status of all providers
    const status = await metadataAggregator.getConfigurationStatus();
    
    return NextResponse.json({
      success: true,
      providers: status,
      configured: Object.values(status).filter(Boolean).length,
      total: Object.keys(status).length
    });

  } catch (error) {
    console.error('Error getting provider status:', error);
    return NextResponse.json(
      { error: 'Failed to get provider status' },
      { status: 500 }
    );
  }
} 