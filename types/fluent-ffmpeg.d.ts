declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    format(format: string): this;
    audioBitrate(bitrate: string | number): this;
    on(event: 'error', callback: (err: Error) => void): this;
    on(event: 'end', callback: () => void): this;
    save(outputPath: string): this;
    pipe(stream: NodeJS.WritableStream, options?: { end?: boolean }): this;
  }

  function ffmpeg(input: string | NodeJS.ReadableStream): FfmpegCommand;
  
  namespace ffmpeg {
    function setFfmpegPath(path: string): void;
  }

  export = ffmpeg;
} 