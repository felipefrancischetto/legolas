import { NextRequest, NextResponse } from 'next/server';
import { rename } from 'fs/promises';
import { join, dirname } from 'path';

export async function DELETE(request: NextRequest) {
  const fileName = request.nextUrl.searchParams.get('fileName');
  if (!fileName) {
    return NextResponse.json({ error: 'Nome do arquivo não informado' }, { status: 400 });
  }

  try {
    // Caminho da pasta de downloads
    const downloadsDir = process.env.DOWNLOADS_DIR || './downloads';
    const filePath = join(downloadsDir, fileName);
    const dir = dirname(filePath);
    const newFileName = '[excluir]_' + fileName;
    const newFilePath = join(dir, newFileName);
    // Renomeia o arquivo
    await rename(filePath, newFilePath);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao renomear arquivo para exclusão' }, { status: 500 });
  }
} 