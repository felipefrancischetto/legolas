# 🎵 Tracklist Scraper POTÊNCIA MÁXIMA

Uma solução completa e profissional para extrair links de músicas do 1001tracklists.com com tecnologia avançada de scraping.

## 🚀 Características

### ⚡ Múltiplas Estratégias de Scraping
- **Cheerio** - Rápido e eficiente para conteúdo estático
- **Puppeteer** - Robusto para JavaScript pesado
- **Playwright** - Mais avançado com melhor performance
- **Auto-detection** - Escolha inteligente baseada no ambiente

### 🛡️ Sistema Robusto
- **Retry Logic** - Tentativas automáticas com backoff exponencial
- **Rate Limiting** - Controle inteligente de requisições
- **Cache System** - Cache em memória e persistente com TTL
- **Error Handling** - Tratamento abrangente de erros
- **Validation** - Validação completa com Zod

### 🎯 Plataformas Suportadas
- 🎵 **Spotify**
- 📺 **YouTube**
- ☁️ **SoundCloud**
- 🎛️ **Beatport**
- 🍎 **Apple Music**
- 🌊 **Tidal**
- 🎧 **Deezer**

### 📊 Recursos Avançados
- **Link Validation** - Verificação automática de links
- **Metadata Enhancement** - Enriquecimento de dados
- **Duplicate Removal** - Remoção automática de duplicatas
- **Export Support** - JSON, CSV, Excel
- **Performance Monitoring** - Logging estruturado
- **Real-time Progress** - Interface responsiva

## 🏗️ Arquitetura

```
lib/
├── types.ts                 # Tipos TypeScript
├── tracklistScraper.ts      # Core do scraper
└── utils/
    ├── cache.ts             # Sistema de cache
    ├── logger.ts            # Logging estruturado
    └── validation.ts        # Validação com Zod

app/
├── api/scrape-tracklist/
│   └── route.ts             # API Routes do Next.js
└── tracklist-scraper/
    └── page.tsx             # Página da interface

components/
└── TracklistScraper.tsx     # Componente React
```

## 🚀 Instalação

1. **Clone o projeto**
```bash
git clone <repository-url>
cd legolas
```

2. **Instale as dependências**
```bash
npm install
```

3. **Configure as variáveis de ambiente** (opcional)
```bash
# .env.local
LOG_LEVEL=info
ADMIN_KEY=your-admin-key
DISABLE_HEADLESS=false
```

4. **Execute o projeto**
```bash
npm run dev
```

## 💻 Uso

### Interface Web

Acesse `http://localhost:3000/tracklist-scraper`

1. Cole a URL do 1001tracklists.com
2. Configure opções avançadas se necessário
3. Clique em "🚀 Extract Tracks"
4. Exporte os resultados em JSON ou CSV

### API REST

#### POST /api/scrape-tracklist

```typescript
// Request
{
  "url": "https://www.1001tracklists.com/tracklist/...",
  "options": {
    "method": "auto",           // auto, cheerio, puppeteer, playwright
    "useCache": true,
    "validateLinks": true,
    "includeMetadata": true,
    "timeout": 30000,
    "retries": 3
  }
}

// Response
{
  "success": true,
  "data": {
    "metadata": {
      "title": "Spectrum Radio 422",
      "artist": "Joris Voorn",
      "venue": "Silo Brooklyn",
      "date": "2024-03-30",
      "totalTracks": 25
    },
    "tracks": [
      {
        "id": "abc123",
        "title": "Track Name",
        "artist": "Artist Name",
        "time": "3:45",
        "position": 1,
        "links": [
          {
            "platform": "Spotify",
            "url": "https://open.spotify.com/...",
            "verified": true
          }
        ]
      }
    ],
    "stats": {
      "totalTracks": 25,
      "tracksWithLinks": 23,
      "uniquePlatforms": ["Spotify", "YouTube", "SoundCloud"],
      "scrapingTime": 5420,
      "method": "playwright"
    }
  },
  "cached": false,
  "processingTime": 5450
}
```

#### GET /api/scrape-tracklist?action=stats

Retorna estatísticas do cache e rate limiting.

#### GET /api/scrape-tracklist?action=health

Health check do sistema.

### Programático

```typescript
import { scrapeTracklist } from '@/lib/tracklistScraper';

const result = await scrapeTracklist(
  'https://www.1001tracklists.com/tracklist/...',
  {
    method: 'playwright',
    validateLinks: true,
    useCache: true
  }
);

console.log(`Found ${result.tracks.length} tracks`);
result.tracks.forEach(track => {
  console.log(`${track.title} - ${track.artist}`);
  track.links.forEach(link => {
    console.log(`  ${link.platform}: ${link.url}`);
  });
});
```

## ⚙️ Configuração Avançada

### Opções de Scraping

```typescript
interface ScrapingOptions {
  timeout?: number;           // Timeout em ms (default: 30000)
  retries?: number;           // Número de tentativas (default: 3)
  delay?: number;             // Delay entre tentativas (default: 1000)
  useCache?: boolean;         // Usar cache (default: true)
  cacheTTL?: number;          // TTL do cache em segundos (default: 3600)
  method?: 'auto' | 'cheerio' | 'puppeteer' | 'playwright';
  userAgent?: string;         // User agent personalizado
  proxy?: string;             // Proxy URL
  headers?: Record<string, string>; // Headers customizados
  validateLinks?: boolean;    // Validar links (default: true)
  includeMetadata?: boolean;  // Incluir metadata (default: true)
  exportFormat?: 'json' | 'csv' | 'xlsx';
}
```

### Cache

O sistema de cache opera em duas camadas:
- **Memory Cache** - NodeCache para acesso rápido
- **Persistent Cache** - Map para persistência entre reinicializações

### Rate Limiting

- **Window**: 60 segundos
- **Max Requests**: 10 por IP
- **Headers**: `X-RateLimit-*` nos responses

### Logging

Logs estruturados com Winston:
- **Console** - Para desenvolvimento
- **Files** - `logs/error.log` e `logs/combined.log`
- **Levels** - error, warn, info, debug

## 🔧 Desenvolvimento

### Estrutura do Projeto

```typescript
// Core Scraper Class
class TracklistScraper {
  async scrapeTracklist(url: string, options: ScrapingOptions): Promise<ScrapingResult>
  private determineBestMethod(method: string): string
  private scrapeWithCheerio(url: string, options: ScrapingOptions): Promise<ScrapingResult>
  private scrapeWithPuppeteer(url: string, options: ScrapingOptions): Promise<ScrapingResult>
  private scrapeWithPlaywright(url: string, options: ScrapingOptions): Promise<ScrapingResult>
  private validateLinks(result: ScrapingResult): Promise<ScrapingResult>
  private enhanceMetadata(result: ScrapingResult): Promise<ScrapingResult>
}
```

### Validação

Todos os dados são validados com Zod schemas:
- URLs específicas do 1001tracklists.com
- Plataformas de música suportadas
- Formatos de tempo e BPM
- Estruturas de resposta completas

### Performance

- **Request Queue** - PQueue para controle de concorrência
- **Parallel Processing** - Validação de links em paralelo
- **Smart Caching** - Cache inteligente com TTL dinâmico
- **Connection Pooling** - Reutilização de conexões

## 📈 Monitoramento

### Métricas Disponíveis

```typescript
// Cache Stats
{
  memoryKeys: number;
  persistentKeys: number;
  memoryHits: number;
  memoryMisses: number;
  hitRate: string;
}

// Performance Metrics
{
  scrapingTime: number;
  method: string;
  tracksFound: number;
  uniquePlatforms: string[];
  processingTime: number;
}
```

### Health Check

```bash
curl http://localhost:3000/api/scrape-tracklist?action=health
```

## 🐛 Troubleshooting

### Erros Comuns

1. **Timeout Errors**
   - Aumente o `timeout` nas opções
   - Use método `cheerio` para URLs simples

2. **Rate Limiting**
   - Aguarde 60 segundos entre muitas requisições
   - Use cache para evitar requisições desnecessárias

3. **Validation Errors**
   - Verifique se a URL é válida do 1001tracklists.com
   - Certifique-se que a playlist existe

4. **Memory Issues**
   - Configure `DISABLE_HEADLESS=true` em produção
   - Use método `cheerio` para reduzir uso de memória

### Debug

```bash
# Habilitar logs debug
LOG_LEVEL=debug npm run dev

# Verificar logs
tail -f logs/combined.log
```

## 🚢 Deploy

### Vercel (Recomendado)

```bash
npm run build
vercel --prod
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Variáveis de Ambiente

```bash
NODE_ENV=production
LOG_LEVEL=warn
ADMIN_KEY=your-secure-admin-key
DISABLE_HEADLESS=true  # Para ambientes sem GUI
```

## 📄 Licença

MIT License - Veja o arquivo LICENSE para detalhes.

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📞 Suporte

- **Issues**: GitHub Issues
- **Docs**: Este README
- **Examples**: `/examples` directory

---

**Desenvolvido com 💜 usando Next.js, TypeScript, Tailwind CSS, e muita POTÊNCIA MÁXIMA!** 