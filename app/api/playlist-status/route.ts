import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const downloadsFolder = join(process.cwd(), 'downloads');
    const statusFile = join(downloadsFolder, 'playlist-status.json');
    const content = await readFile(statusFile, 'utf-8');
    return NextResponse.json(JSON.parse(content));
  } catch (error) {
    return NextResponse.json({ status: 'not_found', videos: [] });
  }
} 