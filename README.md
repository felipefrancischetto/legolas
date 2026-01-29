# Legolas - Audio Player & Downloader

Legolas é uma aplicação Next.js para download e gerenciamento de áudio com suporte a metadados, playlists e streaming.

## 🚀 Getting Started

### Pré-requisitos

- Node.js 18+ 
- npm ou yarn
- FFmpeg (para processamento de áudio)
- Chrome/Chromium (para scraping com Puppeteer)

### Instalação

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/legolas.git
cd legolas
```

2. Instale as dependências:
```bash
npm install
```

3. Configure o ambiente:
```bash
cp .env.example .env.local
# Edite .env.local com suas configurações
```

4. Configure o caminho de downloads:
```bash
# Edite downloads.config.json com o caminho desejado
```

5. Verifique o ambiente:
```bash
npm run check-env
```

6. Execute em desenvolvimento:
```bash
npm run dev
# ou
npm run dev:audio  # Com otimizações para áudio
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

### 🖥️ Versão Desktop (Electron) - Recomendado para uso local

Para rodar como aplicação desktop com todas as dependências nativas funcionando:

```bash
npm run electron:dev
```

Isso iniciará o Next.js e abrirá a aplicação em uma janela Electron. Todas as funcionalidades (download, ffmpeg, puppeteer) funcionarão perfeitamente!

Consulte [electron/README.md](./electron/README.md) para mais informações sobre a versão Electron.

## 📋 Scripts Disponíveis

### Web (Next.js)
- `npm run dev` - Inicia servidor de desenvolvimento
- `npm run dev:audio` - Inicia com otimizações para áudio
- `npm run build` - Cria build de produção
- `npm start` - Inicia servidor de produção
- `npm run lint` - Executa linter
- `npm run check-env` - Verifica configuração do ambiente
- `npm run legolas` - Inicia aplicação completa

### Desktop (Electron) 🖥️
- `npm run electron` - Inicia aplicação Electron (requer Next.js rodando)
- `npm run electron:dev` - Inicia Next.js + Electron em desenvolvimento
- `npm run electron:build` - Build para todas as plataformas
- `npm run electron:build:win` - Build para Windows
- `npm run electron:build:mac` - Build para macOS
- `npm run electron:build:linux` - Build para Linux

**💡 Recomendado para uso local:** Use `npm run electron:dev` para rodar a versão desktop com todas as funcionalidades funcionando!

## 🏗️ Infraestrutura e Deploy

⚠️ **IMPORTANTE**: Este projeto usa dependências nativas (ffmpeg, puppeteer, playwright) que **NÃO funcionam em ambientes serverless** como Vercel.

Consulte [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) para informações detalhadas sobre:
- Opções de deploy (Railway, Render, VPS)
- Configuração de variáveis de ambiente
- Troubleshooting
- Requisitos do sistema

### Deploy Recomendado

**Railway** ou **Render** são as melhores opções pois suportam dependências nativas.

## 📚 Tecnologias

- **Next.js 15** - Framework React
- **TypeScript** - Tipagem estática
- **Tailwind CSS** - Estilização
- **FFmpeg** - Processamento de áudio
- **Puppeteer/Playwright** - Web scraping
- **yt-dlp** - Download de vídeos/áudio

## 📖 Documentação

- [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) - Guia completo de infraestrutura e deploy
- [.env.example](./.env.example) - Exemplo de variáveis de ambiente

## 🤝 Contribuindo

1. Faça fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto é privado.
