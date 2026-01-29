# Infraestrutura e Deploy - Legolas

## ⚠️ Limitações Importantes

Este projeto possui dependências nativas que **NÃO funcionam em ambientes serverless** como Vercel:

- **ffmpeg** - Requer binário nativo instalado no sistema
- **puppeteer** - Requer Chrome/Chromium instalado
- **playwright** - Requer navegadores instalados
- **yt-dlp-exec** - Requer executável do sistema

## 🚀 Opções de Deploy

### 1. Vercel (Limitado - Apenas Frontend)

O Vercel pode fazer deploy do frontend Next.js, mas **as APIs que usam dependências nativas não funcionarão**.

**Configuração:**
- O arquivo `vercel.json` já está configurado
- Variáveis de ambiente devem ser configuradas no painel do Vercel
- APIs que usam ffmpeg/puppeteer retornarão erro

**Limitações:**
- ❌ Download de áudio não funcionará
- ❌ Scraping com Puppeteer/Playwright não funcionará
- ❌ Processamento de metadados com ffmpeg não funcionará
- ✅ Frontend funcionará normalmente
- ✅ APIs que não usam dependências nativas funcionarão

### 2. Railway (Recomendado)

Railway suporta dependências nativas e é ideal para este projeto.

**Configuração:**

1. Crie uma conta em [Railway](https://railway.app)
2. Conecte seu repositório GitHub
3. Configure as variáveis de ambiente (veja `.env.example`)
4. Railway detectará automaticamente o `package.json` e fará o deploy

**Vantagens:**
- ✅ Suporta dependências nativas
- ✅ Deploy automático via GitHub
- ✅ Ambiente isolado e escalável
- ✅ Logs em tempo real

### 3. Render

Render também suporta dependências nativas.

**Configuração:**

1. Crie uma conta em [Render](https://render.com)
2. Conecte seu repositório GitHub
3. Crie um novo "Web Service"
4. Configure:
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment: Node

### 4. VPS (Servidor Dedicado)

Para controle total, você pode usar uma VPS (DigitalOcean, AWS EC2, etc.).

**Requisitos:**
- Node.js 20+
- FFmpeg instalado
- Chrome/Chromium para Puppeteer
- Espaço em disco para downloads

**Setup básico:**

```bash
# Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar FFmpeg
sudo apt-get update
sudo apt-get install -y ffmpeg

# Instalar Chrome para Puppeteer
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
sudo apt-get update
sudo apt-get install -y google-chrome-stable

# Clonar e configurar projeto
git clone <seu-repo>
cd legolas
npm install
npm run build

# Usar PM2 para gerenciar processo
npm install -g pm2
pm2 start npm --name "legolas" -- start
pm2 save
pm2 startup
```

## 📋 Variáveis de Ambiente

Crie um arquivo `.env.local` (não commitado) com:

```env
# Ambiente
NODE_ENV=production
PORT=3000

# Caminho para downloads (absoluto)
DOWNLOADS_PATH=/caminho/absoluto/para/downloads

# Configurações do Next.js
NEXT_TELEMETRY_DISABLED=1
NODE_OPTIONS=--max-old-space-size=4096

# Configurações de FFmpeg (se necessário)
FFMPEG_PATH=/usr/bin/ffmpeg

# Configurações de Puppeteer
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
```

## 🔧 Configuração do GitHub Actions

O workflow `.github/workflows/ci.yml` está configurado para:

- ✅ Executar lint em PRs
- ✅ Verificar TypeScript
- ✅ Tentar build (pode falhar devido a dependências nativas, mas valida estrutura)

**Nota:** O build pode falhar no CI porque não há binários nativos instalados, mas isso é esperado e não impede o deploy.

## 🐳 Docker (Opcional)

Para facilitar o deploy, você pode criar um `Dockerfile`:

```dockerfile
FROM node:20-slim

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y \
    ffmpeg \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Instalar Chrome
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

## 📝 Checklist de Deploy

- [ ] Variáveis de ambiente configuradas
- [ ] Caminho de downloads configurado e acessível
- [ ] FFmpeg instalado (se necessário)
- [ ] Chrome/Chromium instalado (se necessário)
- [ ] Porta configurada corretamente
- [ ] Logs configurados para monitoramento
- [ ] Backup do diretório de downloads configurado

## 🔍 Troubleshooting

### Build falha no Vercel
- **Causa:** Dependências nativas não suportadas
- **Solução:** Use Railway, Render ou VPS

### Puppeteer não funciona
- **Causa:** Chrome não instalado ou caminho incorreto
- **Solução:** Instale Chrome e configure `PUPPETEER_EXECUTABLE_PATH`

### FFmpeg não encontrado
- **Causa:** FFmpeg não instalado no sistema
- **Solução:** Instale FFmpeg: `apt-get install ffmpeg` ou `brew install ffmpeg`

### Erro de memória
- **Causa:** Processo usando muita memória
- **Solução:** Aumente `NODE_OPTIONS=--max-old-space-size=4096` ou mais
