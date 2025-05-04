import ffmpeg from 'fluent-ffmpeg';
import { join } from 'path';

// Configurar o caminho do ffmpeg
const ffmpegPath = join(process.cwd(), 'node_modules', '@ffmpeg-installer', 'ffmpeg', 'ffmpeg.exe');
ffmpeg.setFfmpegPath(ffmpegPath);

export default ffmpeg; 