#!/bin/bash

# Script de setup para Linux - Legolas
# Este script configura o ambiente necessário para rodar o Legolas no Linux

set -e  # Para em caso de erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Configurando ambiente Legolas para Linux...${NC}\n"

# Função para verificar se comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Função para verificar versão do Node.js
check_node_version() {
    if command_exists node; then
        NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            return 0
        fi
    fi
    return 1
}

# 1. Verificar/Instalar Node.js 18+
echo -e "${BLUE}📦 Verificando Node.js...${NC}"
if check_node_version; then
    echo -e "${GREEN}✅ Node.js $(node --version) já instalado${NC}"
else
    echo -e "${YELLOW}⚠️  Node.js 18+ necessário. Instalando...${NC}"
    
    # Detectar distribuição Linux
    if [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        echo -e "${BLUE}Detectado Debian/Ubuntu${NC}"
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [ -f /etc/redhat-release ]; then
        # RHEL/CentOS/Fedora
        echo -e "${BLUE}Detectado RHEL/CentOS/Fedora${NC}"
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo yum install -y nodejs
    elif command_exists pacman; then
        # Arch Linux
        echo -e "${BLUE}Detectado Arch Linux${NC}"
        sudo pacman -S --noconfirm nodejs npm
    else
        echo -e "${RED}❌ Distribuição não suportada automaticamente${NC}"
        echo -e "${YELLOW}Por favor, instale Node.js 18+ manualmente${NC}"
        exit 1
    fi
    
    if check_node_version; then
        echo -e "${GREEN}✅ Node.js $(node --version) instalado com sucesso${NC}"
    else
        echo -e "${RED}❌ Falha ao instalar Node.js${NC}"
        exit 1
    fi
fi

# 2. Verificar/Instalar FFmpeg
echo -e "\n${BLUE}🎬 Verificando FFmpeg...${NC}"
if command_exists ffmpeg; then
    echo -e "${GREEN}✅ FFmpeg já instalado: $(ffmpeg -version | head -n1)${NC}"
else
    echo -e "${YELLOW}⚠️  FFmpeg não encontrado. Instalando...${NC}"
    
    if [ -f /etc/debian_version ]; then
        sudo apt-get update
        sudo apt-get install -y ffmpeg
    elif [ -f /etc/redhat-release ]; then
        sudo yum install -y ffmpeg
    elif command_exists pacman; then
        sudo pacman -S --noconfirm ffmpeg
    else
        echo -e "${RED}❌ Por favor, instale FFmpeg manualmente${NC}"
        exit 1
    fi
    
    if command_exists ffmpeg; then
        echo -e "${GREEN}✅ FFmpeg instalado com sucesso${NC}"
    else
        echo -e "${RED}❌ Falha ao instalar FFmpeg${NC}"
        exit 1
    fi
fi

# 3. Verificar/Instalar Chrome/Chromium
echo -e "\n${BLUE}🌐 Verificando Chrome/Chromium...${NC}"
CHROME_FOUND=false

if [ -f /usr/bin/google-chrome-stable ] || [ -f /usr/bin/chromium-browser ] || [ -f /usr/bin/chromium ]; then
    CHROME_FOUND=true
    echo -e "${GREEN}✅ Chrome/Chromium já instalado${NC}"
else
    echo -e "${YELLOW}⚠️  Chrome/Chromium não encontrado. Instalando Chromium...${NC}"
    
    if [ -f /etc/debian_version ]; then
        sudo apt-get update
        sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium
    elif [ -f /etc/redhat-release ]; then
        sudo yum install -y chromium
    elif command_exists pacman; then
        sudo pacman -S --noconfirm chromium
    else
        echo -e "${YELLOW}⚠️  Por favor, instale Chrome/Chromium manualmente${NC}"
        echo -e "${YELLOW}   Puppeteer precisa de um navegador para funcionar${NC}"
    fi
    
    if [ -f /usr/bin/google-chrome-stable ] || [ -f /usr/bin/chromium-browser ] || [ -f /usr/bin/chromium ]; then
        CHROME_FOUND=true
        echo -e "${GREEN}✅ Chrome/Chromium instalado com sucesso${NC}"
    fi
fi

# 4. Instalar dependências npm
echo -e "\n${BLUE}📚 Instalando dependências npm...${NC}"
if [ -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  node_modules já existe. Atualizando...${NC}"
    npm install
else
    echo -e "${BLUE}Instalando dependências...${NC}"
    npm install
fi

if [ -d "node_modules" ]; then
    echo -e "${GREEN}✅ Dependências instaladas com sucesso${NC}"
else
    echo -e "${RED}❌ Falha ao instalar dependências${NC}"
    exit 1
fi

# 5. Configurar downloads.config.json
echo -e "\n${BLUE}⚙️  Configurando downloads.config.json...${NC}"
DOWNLOADS_DIR="$HOME/Downloads/legolas"

if [ ! -f "downloads.config.json" ]; then
    echo -e "${YELLOW}⚠️  downloads.config.json não encontrado. Criando...${NC}"
    mkdir -p "$DOWNLOADS_DIR"
    cat > downloads.config.json << EOF
{
  "path": "$DOWNLOADS_DIR"
}
EOF
    echo -e "${GREEN}✅ downloads.config.json criado com caminho: $DOWNLOADS_DIR${NC}"
else
    echo -e "${GREEN}✅ downloads.config.json já existe${NC}"
    # Verificar se o diretório existe
    CURRENT_PATH=$(grep -o '"path":\s*"[^"]*"' downloads.config.json | cut -d'"' -f4)
    if [ -n "$CURRENT_PATH" ] && [ ! -d "$CURRENT_PATH" ]; then
        echo -e "${YELLOW}⚠️  Diretório de downloads não existe: $CURRENT_PATH${NC}"
        read -p "Deseja criar o diretório? (s/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Ss]$ ]]; then
            mkdir -p "$CURRENT_PATH"
            echo -e "${GREEN}✅ Diretório criado${NC}"
        fi
    fi
fi

# 6. Criar .env.local se não existir
echo -e "\n${BLUE}🔐 Verificando .env.local...${NC}"
if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}⚠️  .env.local não encontrado. Criando...${NC}"
    cat > .env.local << EOF
# Ambiente
NODE_ENV=development
PORT=3000

# Caminho para downloads (será usado downloads.config.json se disponível)
# DOWNLOADS_PATH=$DOWNLOADS_DIR

# Configurações do Next.js
NEXT_TELEMETRY_DISABLED=1
NODE_OPTIONS=--max-old-space-size=4096

# Configurações de FFmpeg (ajuste se necessário)
# FFMPEG_PATH=/usr/bin/ffmpeg

# Configurações de Puppeteer
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
EOF
    echo -e "${GREEN}✅ .env.local criado${NC}"
else
    echo -e "${GREEN}✅ .env.local já existe${NC}"
fi

# 7. Verificar ambiente
echo -e "\n${BLUE}🔍 Verificando ambiente...${NC}"
npm run check-env

# Resumo final
echo -e "\n${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Setup concluído com sucesso!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}\n"

echo -e "${BLUE}📋 Próximos passos:${NC}"
echo -e "   ${YELLOW}1.${NC} Para desenvolvimento web: ${GREEN}npm run dev${NC}"
echo -e "   ${YELLOW}2.${NC} Para desenvolvimento com áudio: ${GREEN}npm run dev:audio${NC}"
echo -e "   ${YELLOW}3.${NC} Para versão desktop (Electron): ${GREEN}npm run electron:dev${NC}"
echo -e "\n${BLUE}💡 Dica:${NC} Use ${GREEN}npm run check-env${NC} para verificar o ambiente a qualquer momento\n"
