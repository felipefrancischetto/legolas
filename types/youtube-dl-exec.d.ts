declare module 'youtube-dl-exec' {
  interface ExecOptions {
    dumpSingleJson?: boolean;
    noWarnings?: boolean;
    noCheckCertificates?: boolean;
    preferFreeFormats?: boolean;
    userAgent?: string;
    output?: string;
    format?: string;
  }

  interface VideoInfo {
    title: string;
    duration: number;
  }

  function exec(url: string, options?: ExecOptions): Promise<VideoInfo>;

  export { exec };
  export default exec;
} 