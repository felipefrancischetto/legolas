# 🎵 Como Rodar o Legolas Audio Player

## Comandos Disponíveis

### Comando Principal (Recomendado)
```bash
npm run legolas
```
Este comando inicia a aplicação completa com todas as otimizações para streaming de áudio.

### Comandos Específicos

#### Desenvolvimento
```bash
npm run legolas:dev
```
- Inicia em modo desenvolvimento
- Hot reload ativo
- Logs detalhados
- Otimizações de desenvolvimento

#### Produção
```bash
npm run legolas:prod
```
- Inicia em modo produção
- Performance otimizada
- Logs reduzidos
- Cache otimizado

### Comandos Alternativos

#### Desenvolvimento Tradicional
```bash
npm run dev
```
Comando padrão do Next.js (sem otimizações específicas)

#### Desenvolvimento com Turbo
```bash
npm run dev:audio
```
Next.js com Turbo habilitado para melhor performance

#### Desenvolvimento Completo
```bash
npm run dev:full
```
Roda o servidor + monitor de downloads em paralelo

## Funcionalidades Incluídas

### ✅ Servidor Otimizado
- **Streaming de Áudio**: Headers otimizados para streaming
- **Cache Inteligente**: Cache de thumbnails e metadados
- **Compressão**: Compressão gzip habilitada
- **Range Requests**: Suporte a requisições parciais (seeking)

### ✅ Monitor de Downloads
- **Monitoramento Automático**: Detecta novos downloads
- **Health Check**: Verifica se o servidor está ativo
- **Logs Coloridos**: Interface amigável no terminal

### ✅ Configurações Automáticas
- **Pasta de Downloads**: Criação automática se não existir
- **Variáveis de Ambiente**: Configuração automática
- **Dependências**: Verificação automática

## Como Usar

### 1. Primeira Execução
```bash
# Instalar dependências (se ainda não instalou)
npm install

# Rodar a aplicação
npm run legolas
```

### 2. Desenvolvimento
```bash
# Para desenvolvimento com hot reload
npm run legolas:dev
```

### 3. Produção
```bash
# Build da aplicação
npm run build

# Rodar em produção
npm run legolas:prod
```

## Configurações

### Porta
Por padrão roda na porta **3000**. Para mudar:
```bash
PORT=8080 npm run legolas
```

### Pasta de Downloads
Configure no arquivo `downloads.config.json`:
```json
{
  "downloadsPath": "/caminho/para/downloads"
}
```

## Logs

O sistema usa logs coloridos para facilitar o monitoramento:

- 🔵 **Azul**: Informações do sistema
- 🟢 **Verde**: Sucessos e confirmações
- 🟡 **Amarelo**: Avisos
- 🔴 **Vermelho**: Erros
- 🟣 **Magenta**: Início da aplicação
- 🔷 **Ciano**: Configurações e URLs

## Solução de Problemas

### Erro de Porta em Uso
```bash
# Matar processo na porta 3000
npx kill-port 3000

# Ou usar outra porta
PORT=3001 npm run legolas
```

### Problemas com Downloads
```bash
# Verificar pasta de downloads
ls -la downloads/

# Verificar configuração
cat downloads.config.json
```

### Performance
- Use `npm run legolas:prod` para melhor performance
- Verifique se tem espaço suficiente na pasta de downloads
- Monitore o uso de memória com o comando `htop` ou `top`

## Funcionalidades do Player

### 🎵 Reprodução
- **Streaming**: Reprodução direta sem download completo
- **Seeking**: Busca em qualquer posição da música
- **Volume**: Controle de volume com memória
- **Playlist**: Navegação entre músicas

### 🎨 Interface
- **Responsive**: Funciona em qualquer resolução
- **Cores Dinâmicas**: Extração de cores das capas
- **Transparência**: Efeitos glass modernos
- **WaveSurfer**: Visualização de ondas sonoras

### 📱 Compatibilidade
- **Desktop**: 1920x1080, 1366x768, etc.
- **Mobile**: Adaptação automática
- **Tablets**: Layout otimizado
- **Browsers**: Chrome, Firefox, Safari, Edge

---

**Acesse**: http://localhost:3000 após iniciar a aplicação 