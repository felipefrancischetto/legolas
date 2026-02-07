# 🐧 Guia de Setup para Linux

Este guia vai te ajudar a configurar o ambiente Legolas no Linux.

## ⚠️ Requisito Crítico: Node.js 18+

O projeto **requer Node.js 18 ou superior**. Atualmente você tem Node.js 14.21.3 instalado, que é incompatível.

## 📋 Passos para Configuração

### 1. Atualizar Node.js para versão 20 (Recomendado)

Execute os seguintes comandos no terminal:

```bash
# Adicionar repositório do NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Instalar Node.js 20
sudo apt-get install -y nodejs

# Verificar instalação
node --version  # Deve mostrar v20.x.x
npm --version   # Deve mostrar 10.x.x ou superior
```

**Alternativa usando NVM (sem sudo):**

```bash
# Instalar NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Recarregar shell
source ~/.bashrc  # ou source ~/.zshrc

# Instalar Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

# Verificar
node --version
```

### 2. Verificar Dependências do Sistema

As seguintes dependências já estão instaladas no seu sistema:
- ✅ FFmpeg (`/usr/bin/ffmpeg`)
- ✅ Google Chrome (`/usr/bin/google-chrome-stable`)

### 3. Instalar Dependências do Projeto

Após atualizar o Node.js, execute:

```bash
cd /home/felipe/Workspace/DEV/legolas
npm install
```

### 4. Configurações Já Realizadas

Os seguintes arquivos já foram configurados:
- ✅ `downloads.config.json` - Configurado para `/home/felipe/Downloads/legolas`
- ✅ `.env.local` - Criado com configurações básicas
- ✅ Diretório de downloads criado em `/home/felipe/Downloads/legolas`

### 5. Verificar Ambiente

Após instalar as dependências, execute:

```bash
npm run check-env
```

Este comando vai verificar se tudo está configurado corretamente.

### 6. Executar o Projeto

#### Desenvolvimento Web:
```bash
npm run dev
# ou
npm run dev:audio  # Com otimizações para áudio
```

Acesse: http://localhost:3000

#### Desenvolvimento Desktop (Electron):
```bash
npm run electron:dev
```

Isso iniciará o Next.js e abrirá a aplicação em uma janela Electron.

## 🔧 Script de Setup Automatizado

Um script de setup foi criado em `setup-linux.sh`. Você pode executá-lo após atualizar o Node.js:

```bash
./setup-linux.sh
```

**Nota:** O script precisa de permissões sudo para instalar dependências do sistema, mas você já tem tudo instalado.

## 🐛 Troubleshooting

### Erro: "Unsupported engine for..."
- **Causa:** Node.js versão antiga
- **Solução:** Atualize para Node.js 18+ (preferencialmente 20)

### Erro ao instalar dependências
- **Causa:** Versão antiga do npm
- **Solução:** Atualize o Node.js (npm vem junto)

### Puppeteer não funciona
- **Causa:** Chrome não encontrado
- **Solução:** Chrome já está instalado, mas se necessário:
  ```bash
  sudo apt-get install -y google-chrome-stable
  ```

### FFmpeg não encontrado
- **Causa:** FFmpeg não instalado
- **Solução:** FFmpeg já está instalado, mas se necessário:
  ```bash
  sudo apt-get install -y ffmpeg
  ```

## 📝 Resumo Rápido

1. ✅ Atualizar Node.js para 20: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs`
2. ✅ Instalar dependências: `npm install`
3. ✅ Verificar ambiente: `npm run check-env`
4. ✅ Executar: `npm run dev` ou `npm run electron:dev`

## 🎯 Próximos Passos

Após completar a atualização do Node.js e instalar as dependências:

1. Execute `npm run check-env` para verificar tudo
2. Execute `npm run dev` para iniciar o servidor de desenvolvimento
3. Acesse http://localhost:3000 no navegador

---

**Dúvidas?** Consulte o [README.md](./README.md) ou [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) para mais informações.
