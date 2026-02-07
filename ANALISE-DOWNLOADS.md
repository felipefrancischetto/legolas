# 🔍 Análise dos Problemas de Download

## Problemas Identificados

### 1. ❌ Python 3.8 (Deprecated)
- **Status atual**: Python 3.8.10 instalado
- **Requisito**: Python 3.9+ necessário para yt-dlp
- **Impacto**: Warnings de depreciação e possíveis incompatibilidades

### 2. ❌ Downloads Falhando (HTTP 403)
- **Sintoma**: Apenas thumbnails (.jpg) estão sendo salvas
- **Causa**: YouTube bloqueando downloads com erro 403 Forbidden
- **Evidência nos logs**:
  ```
  ERROR: unable to download video data: HTTP Error 403: Forbidden
  WARNING: [youtube] No PO Token provided for android client
  WARNING: Signature extraction failed
  ERROR: Requested format is not available
  ```

### 3. ✅ Caminho de Downloads
- **Status**: Configurado corretamente
- **Caminho atual**: `/home/felipe/Workspace/DEV/legolas/downloads`
- **Diretório existe**: Sim, com permissões corretas
- **Arquivos encontrados**: Apenas .jpg (thumbnails), nenhum arquivo de áudio

## Soluções Recomendadas

### Solução 1: Atualizar Python para 3.9+

```bash
# Opção A: Usando deadsnakes PPA (Ubuntu/Debian)
sudo apt update
sudo apt install software-properties-common
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update
sudo apt install python3.9 python3.9-venv python3.9-dev

# Verificar instalação
python3.9 --version

# Opção B: Usando pyenv (recomendado para desenvolvimento)
curl https://pyenv.run | bash
# Adicionar ao ~/.zshrc ou ~/.bashrc:
# export PYENV_ROOT="$HOME/.pyenv"
# export PATH="$PYENV_ROOT/bin:$PATH"
# eval "$(pyenv init -)"

# Instalar Python 3.9
pyenv install 3.9.18
pyenv global 3.9.18
```

### Solução 2: Atualizar yt-dlp

```bash
# Atualizar yt-dlp para versão mais recente
pip3 install --upgrade yt-dlp

# Ou usar o instalador standalone
sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### Solução 3: Configurar Cookies do YouTube

O YouTube pode estar bloqueando downloads sem autenticação. Configure cookies:

1. Instale extensão do navegador para exportar cookies:
   - Chrome: "Get cookies.txt LOCALLY"
   - Firefox: "cookies.txt"

2. Exporte cookies do YouTube:
   - Acesse youtube.com e faça login
   - Exporte cookies para `cookies.txt` na raiz do projeto

3. O código já suporta cookies (verifica `cookies.txt` automaticamente)

### Solução 4: Adicionar Estratégias Alternativas de Download

O código já tenta múltiplas estratégias, mas podemos melhorar:

1. **Usar cookies** (se disponível)
2. **Tentar formato mp3 como fallback** se flac falhar
3. **Adicionar delay maior entre tentativas**
4. **Usar user-agent rotativo**

## Verificações Imediatas

### Verificar se downloads estão sendo salvos em outro lugar:

```bash
# Buscar arquivos de áudio recentes
find /home/felipe -name "*.flac" -mtime -1 2>/dev/null
find /home/felipe -name "*.mp3" -mtime -1 2>/dev/null
find /home/felipe -name "*.m4a" -mtime -1 2>/dev/null

# Verificar diretório de downloads atual
ls -lah /home/felipe/Workspace/DEV/legolas/downloads/
```

### Testar yt-dlp manualmente:

```bash
# Teste simples de download
yt-dlp -x --audio-format flac --audio-quality 10 \
  "https://www.youtube.com/watch?v=Dezere" \
  -o "/tmp/test.%(ext)s"

# Se funcionar, verificar onde foi salvo
ls -lah /tmp/test.*
```

## Correções Aplicadas

### ✅ Correção 1: Log com barra invertida do Windows
- **Arquivo**: `lib/services/playlistDownloadService.ts` (linha 554)
- **Problema**: Log mostrava `downloadsFolder\\${tempFilename}` com barra invertida do Windows
- **Solução**: Alterado para usar `/` (compatível com Linux/Windows/Mac)

### ✅ Correção 2: Adicionado suporte a cookies nas estratégias de download
- **Arquivo**: `lib/services/playlistDownloadService.ts` (linhas 563-603)
- **Problema**: Estratégias de download não estavam usando cookies mesmo quando disponíveis
- **Solução**: Adicionada verificação de cookies e inclusão do flag `--cookies "cookies.txt"` em todas as estratégias
- **Impacto**: Downloads agora devem funcionar melhor com autenticação do YouTube

## Próximos Passos

1. ✅ **Corrigido**: Log com barra invertida do Windows (linha 554)
2. ✅ **Corrigido**: Adicionado suporte a cookies nas estratégias de download
3. ⏳ **Pendente**: Atualizar Python para 3.9+ (recomendado mas não crítico)
4. ⏳ **Pendente**: Atualizar yt-dlp (já está na versão 2024.10.22)
5. ✅ **Verificado**: cookies.txt existe no projeto
6. ⏳ **Pendente**: Testar download após correções

## Arquivos Modificados

- `lib/services/playlistDownloadService.ts`:
  - Linha 554: Corrigido log para usar `/` ao invés de `\`
  - Linhas 563-603: Adicionado suporte a cookies em todas as estratégias de download

## Notas

- O diretório de downloads está correto e acessível
- O problema não é o caminho, mas sim os downloads que estão falhando
- Apenas thumbnails estão sendo baixadas porque o YouTube permite download de imagens mesmo quando bloqueia áudio
