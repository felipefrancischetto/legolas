# Legolas - Versão Electron

Esta é a versão desktop do Legolas usando Electron, permitindo rodar a aplicação localmente com todas as dependências nativas funcionando perfeitamente.

## 🚀 Vantagens da Versão Electron

- ✅ **Todas as dependências nativas funcionam** (ffmpeg, puppeteer, playwright)
- ✅ **Acesso completo ao sistema de arquivos**
- ✅ **Não precisa de servidor externo**
- ✅ **Aplicação desktop nativa**
- ✅ **Pode ser distribuída como executável**

## 📋 Pré-requisitos

- Node.js 18+
- npm ou yarn
- FFmpeg instalado (será detectado automaticamente)
- Chrome/Chromium instalado (para Puppeteer)

## 🛠️ Instalação

1. Instale as dependências (incluindo Electron):
```bash
npm install
```

2. Verifique o ambiente:
```bash
npm run check-env
```

## 🎮 Como Usar

### Desenvolvimento

Em um terminal, inicie o servidor Next.js:
```bash
npm run dev
```

Em outro terminal, inicie o Electron:
```bash
npm run electron
```

**OU** use o comando combinado (recomendado):
```bash
npm run electron:dev
```

Este comando inicia o Next.js e o Electron automaticamente.

### Produção

1. Faça o build do Next.js:
```bash
npm run build
```

2. Inicie o Electron:
```bash
npm run electron
```

## 📦 Build para Distribuição

### Windows
```bash
npm run electron:build:win
```

Isso criará um instalador `.exe` na pasta `dist-electron`.

### macOS
```bash
npm run electron:build:mac
```

Isso criará um arquivo `.dmg` na pasta `dist-electron`.

### Linux
```bash
npm run electron:build:linux
```

Isso criará um arquivo `.AppImage` na pasta `dist-electron`.

### Todas as plataformas
```bash
npm run electron:build
```

## 🔧 Configuração

### Selecionar Pasta de Downloads

A aplicação Electron permite selecionar a pasta de downloads através de uma interface nativa. A pasta selecionada será salva no arquivo `downloads.config.json`.

### Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz do projeto:

```env
NODE_ENV=production
PORT=3000
DOWNLOADS_PATH=C:\Users\SeuUsuario\Downloads\legolas
```

## 📁 Estrutura

```
electron/
├── main.js      # Processo principal do Electron
├── preload.js   # Script de pré-carregamento (bridge seguro)
└── README.md    # Esta documentação
```

## 🔒 Segurança

O Electron está configurado com as melhores práticas de segurança:

- ✅ `contextIsolation: true` - Isolamento de contexto
- ✅ `nodeIntegration: false` - Node.js desabilitado no renderer
- ✅ `enableRemoteModule: false` - Módulo remoto desabilitado
- ✅ Preload script para comunicação segura entre processos

## 🐛 Troubleshooting

### Electron não inicia

1. Verifique se o Next.js está rodando na porta 3000:
```bash
npm run dev
```

2. Verifique se todas as dependências estão instaladas:
```bash
npm install
```

### Build falha

1. Certifique-se de que o build do Next.js foi feito:
```bash
npm run build
```

2. Verifique se você tem espaço em disco suficiente (builds podem ser grandes)

### FFmpeg não encontrado

O Electron tentará encontrar o FFmpeg automaticamente. Se não encontrar:

1. Instale o FFmpeg no sistema
2. Configure a variável de ambiente `FFMPEG_PATH` no `.env.local`

### Puppeteer não funciona

1. Certifique-se de que o Chrome está instalado
2. Configure `PUPPETEER_EXECUTABLE_PATH` no `.env.local` se necessário

## 📝 Notas

- Em desenvolvimento, o Electron se conecta ao servidor Next.js em `http://localhost:3000`
- Em produção, o Electron inicia seu próprio servidor Next.js standalone
- Os arquivos compilados ficam em `dist-electron/`
- O ícone da aplicação está em `public/legolas_thumb.png`

## 🚀 Próximos Passos

- [ ] Adicionar auto-updater
- [ ] Adicionar menu nativo
- [ ] Adicionar notificações do sistema
- [ ] Adicionar atalhos de teclado
- [ ] Melhorar tratamento de erros
