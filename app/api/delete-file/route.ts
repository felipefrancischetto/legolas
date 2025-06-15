import { NextRequest, NextResponse } from 'next/server';
import { rename, access, readdir } from 'fs/promises';
import { join, dirname } from 'path';

export async function DELETE(request: NextRequest) {
  let fileName = request.nextUrl.searchParams.get('fileName');
  if (!fileName) {
    return NextResponse.json({ error: 'Nome do arquivo não informado' }, { status: 400 });
  }

  try {
    // Decodifica o nome do arquivo para tratar espaços e caracteres especiais
    fileName = decodeURIComponent(fileName);
    const downloadsDir = process.env.DOWNLOADS_DIR || './downloads';
    const filePath = join(downloadsDir, fileName);
    const dir = dirname(filePath);
    const newFileName = '[excluir]_' + fileName;
    const newFilePath = join(dir, newFileName);

    // Lista todos os arquivos na pasta de downloads para depuração
    const files = await readdir(downloadsDir);
    console.log('Arquivos na pasta de downloads:', files);
    console.log('Tentando renomear:', filePath, 'para', newFilePath);

    // Verifica se o arquivo existe
    await access(filePath);

    await rename(filePath, newFilePath);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao renomear:', err);
    return NextResponse.json({ error: 'Erro ao renomear arquivo para exclusão', details: String(err) }, { status: 500 });
  }
} 