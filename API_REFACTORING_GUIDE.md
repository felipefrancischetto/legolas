# API Refatoring Guide - Legolas Downloader

## 📋 Resumo da Refatoração

Esta refatoração organizou e consolidou as APIs do Legolas Downloader, eliminando duplicações e criando endpoints unificados mais eficientes.

## 🗂️ Estrutura Antiga vs Nova

### Antes (Duplicações Identificadas)
```
app/api/
├── search/route.ts                    # Busca YouTube Music
├── youtube-search/route.ts            # Busca YouTube (duplicado)
├── soundcloud-search/route.ts         # Busca SoundCloud
├── track101-search/route.ts           # Busca Track101
├── tracklists-search/route.ts         # Busca tracklists
├── scrape-tracklist/route.ts          # Scraping tracklists (duplicado)
├── tracklist-scrape/route.ts          # Scraping tracklists (duplicado)
├── music-metadata/route.ts            # Metadados OpenAI
├── enhanced-metadata/route.ts         # Metadados agregador
├── update-metadata/route.ts           # Atualização metadados
├── update-individual-metadata/route.ts # Metadados individuais
├── update-release-metadata/route.ts   # Metadados release
└── musicbrainz-metadata/route.ts      # Metadados MusicBrainz
```

### Depois (APIs Unificadas)
```
app/api/
├── utils/common.ts                    # Utilitários compartilhados
├── search/unified/route.ts            # Busca unificada (todas as plataformas)
├── tracklist/unified/route.ts         # Tracklist unificada (busca + scraping)
├── metadata/unified/route.ts          # Metadados unificados (todas as operações)
└── [outras APIs mantidas]             # APIs específicas mantidas
```

## 🚀 Novas APIs Unificadas

### 1. API de Busca Unificada (`/api/search/unified`)

**Consolida:** `search`, `youtube-search`, `soundcloud-search`, `track101-search`

#### Uso:
```typescript
// POST - Busca com parâmetros
const response = await fetch('/api/search/unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'nome da música',
    platform: 'youtube' | 'soundcloud' | 'track101' | 'auto',
    maxResults: 5
  })
});

// GET - Busca via query params
const response = await fetch('/api/search/unified?q=nome da música&platform=youtube');
```

#### Resposta:
```json
{
  "success": true,
  "query": "nome da música",
  "platform": "youtube",
  "results": [
    {
      "platform": "youtube",
      "title": "Nome da Música",
      "artist": "Nome do Artista",
      "url": "https://music.youtube.com/watch?v=...",
      "thumbnail": "url_da_thumbnail",
      "duration": "3:45"
    }
  ],
  "totalResults": 1
}
```

### 2. API de Tracklist Unificada (`/api/tracklist/unified`)

**Consolida:** `scrape-tracklist`, `tracklist-scrape`, `tracklists-search`

#### Uso:
```typescript
// POST - Scraping de URL
const response = await fetch('/api/tracklist/unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://www.1001tracklists.com/tracklist/...',
    options: { useCache: true }
  })
});

// POST - Busca por query
const response = await fetch('/api/tracklist/unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'nome do dj',
    options: { useCache: true }
  })
});

// GET - Estatísticas e health check
const stats = await fetch('/api/tracklist/unified?action=stats');
const health = await fetch('/api/tracklist/unified?action=health');
```

### 3. API de Metadados Unificada (`/api/metadata/unified`)

**Consolida:** `music-metadata`, `enhanced-metadata`, `update-metadata`, `update-individual-metadata`, `update-release-metadata`

#### Uso:
```typescript
// POST - Busca de metadados
const response = await fetch('/api/metadata/unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    operation: 'search',
    title: 'Nome da Música',
    artist: 'Nome do Artista',
    useBeatport: true,
    skipMetadata: false
  })
});

// POST - Atualização de metadados
const response = await fetch('/api/metadata/unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    operation: 'update',
    fileName: 'musica.mp3',
    title: 'Novo Título',
    artist: 'Novo Artista',
    album: 'Novo Álbum',
    year: 2024,
    genre: 'Electronic',
    bpm: 128,
    key: 'Am'
  })
});

// POST - Metadados de release
const response = await fetch('/api/metadata/unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    operation: 'release',
    album: 'Nome do Álbum'
  })
});

// POST - Metadados individuais
const response = await fetch('/api/metadata/unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    operation: 'individual',
    fileName: 'musica.mp3',
    title: 'Nome da Música',
    artist: 'Nome do Artista'
  })
});
```

## 🔧 Utilitários Compartilhados

### `app/api/utils/common.ts`

Funções utilitárias compartilhadas entre todas as APIs:

```typescript
// Obter caminho de downloads configurado
const downloadsPath = await getDownloadsPath();

// Verificar se arquivo existe
const exists = await fileExists(filePath);

// Formatar duração
const duration = formatDuration(seconds);

// Formatar duração curta
const shortDuration = formatDurationShort(seconds);

// Sanitizar ano
const cleanYear = sanitizeYear('2024-01-01'); // Retorna '2024'

// Gerar ID de download
const downloadId = generateDownloadId();

// Validar URL
const isValid = validateUrl('https://example.com');

// Extrair ID do vídeo
const videoId = extractVideoId('https://youtube.com/watch?v=abc123');
```

## 📊 Benefícios da Refatoração

### ✅ Eliminado
- **Duplicação de código:** Funções `getDownloadsPath()`, `formatDuration()`, `fileExists()` agora centralizadas
- **APIs redundantes:** 12 APIs antigas → 3 APIs unificadas + utilitários
- **Inconsistências:** Padronização de respostas e tratamento de erros
- **Código não utilizado:** Remoção de lógica obsoleta

### ✅ Melhorado
- **Manutenibilidade:** Código centralizado e organizado
- **Performance:** Cache compartilhado e otimizações
- **Consistência:** Padrões uniformes de API
- **Documentação:** APIs bem documentadas e tipadas

### ✅ Mantido
- **Funcionalidade:** Todas as funcionalidades preservadas
- **Compatibilidade:** APIs antigas ainda funcionam (redirecionamento)
- **Configurações:** Configurações existentes mantidas

## 🔄 Migração

### Para Desenvolvedores

1. **Atualizar imports:**
```typescript
// Antes
import { getDownloadsPath } from '@/app/api/download/route';

// Depois
import { getDownloadsPath } from '@/app/api/utils/common';
```

2. **Usar APIs unificadas:**
```typescript
// Antes
const searchResponse = await fetch('/api/search?q=query');
const metadataResponse = await fetch('/api/enhanced-metadata', {
  method: 'POST',
  body: JSON.stringify({ title, artist })
});

// Depois
const searchResponse = await fetch('/api/search/unified?q=query');
const metadataResponse = await fetch('/api/metadata/unified', {
  method: 'POST',
  body: JSON.stringify({ 
    operation: 'search',
    title, 
    artist 
  })
});
```

### Para Frontend

1. **Atualizar chamadas de API:**
```typescript
// Busca unificada
const searchResults = await api.search.unified({
  query: 'nome da música',
  platform: 'youtube'
});

// Metadados unificados
const metadata = await api.metadata.unified({
  operation: 'search',
  title: 'nome da música',
  artist: 'nome do artista',
  useBeatport: true
});
```

## 🧪 Testes

### Testar APIs Unificadas

```bash
# Testar busca unificada
curl -X POST http://localhost:3000/api/search/unified \
  -H "Content-Type: application/json" \
  -d '{"query": "test music", "platform": "youtube"}'

# Testar tracklist unificada
curl -X POST http://localhost:3000/api/tracklist/unified \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.1001tracklists.com/tracklist/..."}'

# Testar metadados unificados
curl -X POST http://localhost:3000/api/metadata/unified \
  -H "Content-Type: application/json" \
  -d '{"operation": "search", "title": "test", "artist": "test"}'
```

## 📝 Notas Importantes

1. **Compatibilidade:** APIs antigas continuam funcionando durante período de transição
2. **Performance:** APIs unificadas são mais eficientes devido ao cache compartilhado
3. **Rate Limiting:** Implementado nas APIs unificadas para proteção
4. **Logs:** Logs centralizados e padronizados para melhor debugging
5. **Error Handling:** Tratamento de erros consistente em todas as APIs

## 🚀 Próximos Passos

1. **Migração gradual:** Substituir chamadas antigas pelas novas APIs
2. **Testes:** Validar todas as funcionalidades com as novas APIs
3. **Documentação:** Atualizar documentação do frontend
4. **Deprecação:** Marcar APIs antigas como deprecated após migração completa
5. **Remoção:** Remover APIs antigas após período de transição

---

**Status:** ✅ Refatoração concluída
**Compatibilidade:** ✅ Mantida
**Performance:** ✅ Melhorada
**Manutenibilidade:** ✅ Significativamente melhorada 