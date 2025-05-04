declare module 'node-youtube-dl' {
  interface VideoInfo {
    title: string;
    duration: number;
  }

  interface YoutubeDLOptions {
    maxBuffer?: number;
    timeout?: number;
    headers?: Record<string, string>;
  }

  interface YoutubeDL {
    getInfo(url: string, options: string[], config: YoutubeDLOptions): Promise<VideoInfo>;
    (url: string, options: string[], config: YoutubeDLOptions): any;
  }

  const youtubeDL: YoutubeDL;
  export default youtubeDL;
} 