declare module '@distube/ytdl-core' {
  interface VideoDetails {
    title: string;
    lengthSeconds: string;
    videoId: string;
    author?: {
      name?: string;
    };
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

  interface YtdlModule {
    validateURL(url: string): boolean;
    getBasicInfo(url: string, options?: YtdlOptions): Promise<VideoInfo>;
    getInfo(url: string, options?: YtdlOptions): Promise<VideoInfo>;
    (url: string, options?: YtdlOptions): any;
  }

  const ytdl: YtdlModule;
  export default ytdl;
  export function getInfo(url: string, options?: YtdlOptions): Promise<VideoInfo>;
  export function ytdl(url: string, options?: YtdlOptions): any;
  export function validateURL(url: string): boolean;
  export function getBasicInfo(url: string, options?: YtdlOptions): Promise<VideoInfo>;
} 