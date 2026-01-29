/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output standalone para Electron
  output: process.env.ELECTRON_BUILD ? 'standalone' : undefined,
  
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb'
    },
    // Otimizações para streaming de áudio
    // turbo: {
    //   rules: {
    //     '*.flac': {
    //       loaders: ['raw-loader'],
    //       as: '*.flac'
    //     },
    //     '*.mp3': {
    //       loaders: ['raw-loader'],
    //       as: '*.mp3'
    //     }
    //   }
    // }
  },
  
  // Configurações de servidor otimizadas para áudio
  serverRuntimeConfig: {
    // Configurações específicas do servidor
  },
  
  // Configurações públicas
  publicRuntimeConfig: {
    // Configurações que podem ser acessadas no cliente
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
    
    // Otimizações para arquivos de áudio
    config.module.rules.push({
      test: /\.(mp3|flac|wav)$/,
      use: {
        loader: 'file-loader',
        options: {
          publicPath: '/_next/static/audio/',
          outputPath: 'static/audio/',
        },
      },
    });

    // Configurar o alias @
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': __dirname,
    };
    
    return config;
  },
  
  // Configurações de headers para streaming
  async headers() {
    return [
      {
        source: '/api/downloads/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'Accept-Ranges',
            value: 'bytes',
          },
          {
            key: 'Content-Type',
            value: 'audio/*',
          },
        ],
      },
      {
        source: '/api/thumbnail/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400',
          },
        ],
      },
    ];
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
  },
  
  // Configurações de compressão
  compress: true,
  
  // Configurações de desenvolvimento
  ...(process.env.NODE_ENV === 'development' && {
    // Configurações específicas para desenvolvimento
    devIndicators: {
      buildActivity: true,
      buildActivityPosition: 'bottom-right',
    },
    // Desabilitar overlay de erros que pode causar problemas com source maps
    reactStrictMode: true,
  }),
  
  // Configurações para melhorar o tratamento de erros
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
};

module.exports = nextConfig; 