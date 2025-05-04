declare module '@distube/ytdl-core' {
  interface VideoDetails {
    title: string;
    lengthSeconds: string;
  }

  interface VideoInfo {
    videoDetails: VideoDetails;
  }

  interface YtdlOptions {
    quality?: string;
    filter?: string;
    requestOptions?: {
      headers?: Record<string, string>;
    };
  }

  export function getInfo(url: string, options?: YtdlOptions): Promise<VideoInfo>;
  export function ytdl(url: string, options?: YtdlOptions): any;
} 