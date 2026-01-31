import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getDownloadsPath } from '../utils/common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const downloadsFolder = await getDownloadsPath();
    const statusFile = join(downloadsFolder, 'playlist-status.json');
    const content = await readFile(statusFile, 'utf-8');
    return NextResponse.json(JSON.parse(content));
  } catch (error) {
    return NextResponse.json({ status: 'not_found', videos: [] });
  }
} 