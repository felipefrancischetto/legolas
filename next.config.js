/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb'
    }
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        readline: false,
      };
    }
    return config;
  },
  // Desabilitar o cache para evitar problemas com o ytdl-core
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 2,
  },
  // Configurar para servir arquivos da pasta downloads
  rewrites: async () => {
    return [
      {
        source: '/downloads/:path*',
        destination: '/downloads/:path*'
      }
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      }
    ],
    domains: ['i.ytimg.com'],
    unoptimized: true
  }
};

module.exports = nextConfig; 