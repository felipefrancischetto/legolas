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

  webpack: (config, { isServer, dev }) => {
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
    
    // Otimizações para desenvolvimento - reduzir tamanho de mensagens durante Fast Refresh
    if (dev && !isServer) {
      // Limitar o tamanho máximo de chunks durante desenvolvimento
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          ...config.optimization?.splitChunks,
          maxSize: 244000, // ~240KB por chunk para evitar mensagens muito grandes
        },
      };
      
      // Reduzir informações de debug durante hot-reload
      config.devtool = 'eval-cheap-module-source-map';
    }
    
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
    // Desabilitar Strict Mode para evitar rebuilds duplos em desenvolvimento
    reactStrictMode: false,
    // Otimizar Fast Refresh para reduzir tamanho de mensagens
    reactRefresh: true,
  }),
  
  // Configurações para melhorar o tratamento de erros
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
};

module.exports = nextConfig; 