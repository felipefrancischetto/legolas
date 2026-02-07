# Solução: Downloads Falhando no Linux - Problema de Cookies

## Problema Identificado

Os downloads estão falhando com erro **403 (Forbidden)** porque o YouTube está bloqueando requisições sem cookies válidos. Os logs mostram:

```
🍪 Cookies disponíveis: Não
ERROR: unable to download video data: HTTP Error 403: Forbidden
WARNING: [youtube] No PO Token provided
```

## Causa

No Linux, o sistema não está encontrando cookies válidos do YouTube. No Windows provavelmente havia cookies configurados anteriormente.

## Soluções Implementadas

### 1. Extração Automática de Cookies

O código agora tenta extrair cookies automaticamente do browser antes de iniciar downloads:

- Verifica se há cookies válidos
- Se não houver, tenta extrair automaticamente do Chrome, Chromium, Firefox, Brave, Opera ou Edge
- Exibe mensagens claras sobre o status dos cookies

### 2. Melhorias nas Mensagens de Erro

Quando os downloads falham por falta de cookies, o sistema agora exibe mensagens mais claras orientando o usuário sobre como resolver.

### 3. Script de Extração Manual

Foi criado um script shell para facilitar a extração manual de cookies:

```bash
./scripts/extract-cookies-linux.sh
```

## Como Resolver Manualmente

### Opção 1: Usar o Script Automático

```bash
cd /home/felipe/Workspace/DEV/legolas
./scripts/extract-cookies-linux.sh
```

### Opção 2: Extração Manual via yt-dlp

1. **Abra o Chrome/Chromium** e acesse: https://www.youtube.com
2. **Faça login** na sua conta YouTube (se não estiver logado)
3. **Reproduza algumas músicas** para "aquecer" a sessão
4. **Execute o comando**:

```bash
cd /home/felipe/Workspace/DEV/legolas
yt-dlp --cookies-from-browser chrome --cookies cookies.txt "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

Ou se usar Chromium:

```bash
yt-dlp --cookies-from-browser chromium --cookies cookies.txt "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

Ou Firefox:

```bash
yt-dlp --cookies-from-browser firefox --cookies cookies.txt "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

5. **Verifique** se o arquivo `cookies.txt` foi criado/atualizado na raiz do projeto

### Opção 3: Usar o Script Node.js Existente

```bash
cd /home/felipe/Workspace/DEV/legolas
node scripts/fix-youtube-cookies.js
```

## Verificação

Após extrair os cookies, você pode verificar se estão válidos:

```bash
# Verificar se o arquivo existe e tem conteúdo
ls -lh cookies.txt

# Verificar conteúdo (primeiras linhas)
head -20 cookies.txt
```

O arquivo deve começar com `# Netscape HTTP Cookie File` ou ter linhas com tabs separando os campos.

## Notas Importantes

1. **Cookies expiram**: Os cookies do YouTube têm validade limitada. Se os downloads começarem a falhar novamente após alguns dias, re-extraia os cookies.

2. **Login necessário**: Você precisa estar logado no YouTube no browser para que os cookies sejam válidos.

3. **Browser deve estar fechado**: Alguns browsers bloqueiam acesso aos cookies quando estão abertos. Feche o browser antes de extrair cookies, ou use um browser diferente.

4. **Permissões**: O script precisa de permissão para ler os cookies do browser. No Linux, isso geralmente funciona automaticamente, mas se houver problemas, verifique as permissões do diretório do browser.

## Teste

Após configurar os cookies, teste fazendo um download simples:

```bash
yt-dlp --cookies cookies.txt -x --audio-format flac "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

Se funcionar, os downloads da aplicação também devem funcionar.

## Próximos Passos

1. Execute o script de extração de cookies
2. Tente fazer um download novamente pela aplicação
3. Se ainda falhar, verifique os logs para mensagens mais específicas
