'use client';

import { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { usePlayer } from '../contexts/PlayerContext';
import { useUI } from '../contexts/UIContext';
import { getThumbnailUrl } from '../utils/thumbnailCache';
import { getCachedDominantColor } from '../utils/colorExtractor';
import { useFile } from '../contexts/FileContext';
import { useSettings } from '../hooks/useSettings';
import { useQuickPlaylist } from '../contexts/QuickPlaylistContext';
import AlbumModal from './AlbumModal';
import MusicStudyModal from './MusicStudyModal';
import LoadingSpinner from './LoadingSpinner';
import { SkeletonAudioPlayer } from './SkeletonComponents';
import { logger } from '../utils/logger';
import { focusArtistInFeed } from '../utils/focusArtist';

// ---------------------------------------------------------------------------
// YouTube IFrame API — player de PRÉVIA (faixas ainda não baixadas).
// Em vez de baixar+transcodificar o áudio no servidor (/api/preview-stream, que
// deixava o play lento pra começar), tocamos o áudio direto da CDN do YouTube
// num <iframe> oculto. O play começa em ~1s. A waveform não é usada nas prévias
// (o player fica minimizado na aba Novidades).
let ytApiPromise: Promise<any> | null = null;
// Quando a API do YouTube não carrega (offline, bloqueada por rede/adblock, região),
// marcamos como indisponível para cair direto na prévia via /api/preview-stream sem
// esperar o timeout de novo a cada faixa.
let ytApiBlocked = false;
function loadYouTubeIframeApi(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (ytApiBlocked) return Promise.reject(new Error('YouTube IFrame API indisponível'));
  const w = window as any;
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve, reject) => {
    let settled = false;
    const succeed = (yt: any) => { if (!settled) { settled = true; resolve(yt); } };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      // Permite nova tentativa de carregamento numa próxima sessão, mas durante esta
      // sessão caímos direto no fallback nativo.
      ytApiBlocked = true;
      ytApiPromise = null;
      reject(err);
    };
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try { prev?.(); } catch { /* ignore */ }
      succeed(w.YT);
    };
    if (!document.querySelector('script[data-yt-iframe-api]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.setAttribute('data-yt-iframe-api', '1');
      tag.onerror = () => fail(new Error('Falha ao carregar a YouTube IFrame API'));
      document.head.appendChild(tag);
    }
    // Sem onload/onerror confiável para o callback global: usa um timeout como rede de
    // segurança para nunca deixar o play "preso" carregando para sempre.
    setTimeout(() => fail(new Error('Timeout ao carregar a YouTube IFrame API')), 7000);
  });
  return ytApiPromise;
}

// Componente memoizado para thumbnail que evita re-renders desnecessários
const ThumbnailImage = memo(({ 
  src, 
  alt, 
  onError, 
  onLoad,
  className,
  style
}: { 
  src: string; 
  alt: string; 
  onError: () => void;
  onLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  className?: string;
  style?: React.CSSProperties;
}) => {
  return (
    <img
      src={src}
      alt={alt}
      width={82}
      height={82}
      className={className}
      style={style}
      onError={onError}
      onLoad={onLoad}
      loading="eager"
      decoding="async"
    />
  );
}, (prevProps, nextProps) => {
  // Só re-renderizar se a URL mudar (retorna true se props são iguais = não re-renderizar)
  // Retorna false se precisar re-renderizar
  if (prevProps.src !== nextProps.src) {
    return false; // URL mudou, precisa re-renderizar
  }
  // Se a URL é a mesma, não precisa re-renderizar
  return true; // Props são iguais, não re-renderizar
});

ThumbnailImage.displayName = 'ThumbnailImage';


export default function AudioPlayer() {
  const waveformDesktopRef = useRef<HTMLDivElement>(null);
  const waveformMobileRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isSeekingRef = useRef(false);
  const lastProgressUpdateTime = useRef(0);
  const isDraggingRef = useRef(false);
  
  const [isMobile, setIsMobile] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [showMusicStudyModal, setShowMusicStudyModal] = useState(false);
  const [playerDominantColor, setPlayerDominantColor] = useState('rgba(16, 185, 129, 0.2)');
  const [isWaveReady, setIsWaveReady] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [imageError, setImageError] = useState(false);

  const lastInitializedFile = useRef<string | null>(null);
  const isInitializing = useRef(false); // Para evitar múltiplas inicializações simultâneas do áudio nativo
  const isWaveInitializing = useRef(false); // Guarda própria do WaveSurfer (não compartilhar com o áudio: prévias demoram a carregar o áudio e bloqueariam a wave)
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Para debounce
  const isNavigatingRef = useRef(false); // Flag para indicar navegação (next/prev)
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Timeout para resetar flag de navegação
  const isHandlingEndedRef = useRef(false); // Flag para evitar múltiplas chamadas de handleEnded
  const isPlayingRef = useRef(false); // Ref para isPlaying para evitar dependências
  const currentTimeRef = useRef(0); // Ref para currentTime para evitar dependências
  const currentFileNameRef = useRef<string | null>(null); // Ref para o nome do arquivo atual (auto-avanço estável)
  const lastPlayerMinimizedRef = useRef<boolean | null>(null); // Ref para rastrear mudanças de playerMinimized

  // Player de PRÉVIA (YouTube IFrame, sem vídeo) — ativo quando currentFile é uma prévia.
  const ytPlayerRef = useRef<any>(null);
  const ytReadyRef = useRef(false);
  const ytPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ytHostElRef = useRef<HTMLElement | null>(null);
  const ytLoadedVideoRef = useRef<string | null>(null);
  const pendingPreviewVideoRef = useRef<string | null>(null);
  // Espelha `ytPreview` para os callbacks do YouTube (criados uma vez, no mount). Quando a
  // prévia caiu para o <audio> nativo, o player do YT é parado (stopVideo) e pode disparar
  // PAUSED/ENDED residuais — sem esta guarda, esses eventos zeravam o isPlaying (e até
  // chamavam o auto-avanço) por cima da faixa nativa que está tocando.
  const ytActiveRef = useRef(false);

  const { playerState, setPlayerState, pause, resume, setVolume, setIsMuted, play, queue } = usePlayer();
  const { setPlayerOpen, playerMinimized, setPlayerMinimized } = useUI();
  const { files } = useFile();

  const filesRef = useRef(files); // Ref para files
  const playRef = useRef(play); // Ref para função play
  const queueRef = useRef(queue); // Ref para a fila de prévias (álbum)

  // Lista ativa de navegação: a fila de prévias quando a faixa atual pertence a ela
  // (ex.: tocando um álbum), senão a biblioteca. Mantém next/prev/auto-avanço unificados.
  const navigationList = useCallback((name?: string) => {
    const q = queueRef.current;
    if (name && q.length > 0 && q.some(f => f.name === name)) return q;
    return filesRef.current;
  }, []);

  // Atualizar refs quando valores mudam
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    playRef.current = play;
  }, [play]);
  const { settings } = useSettings();
  const { isInPlaylist, toggleTrack } = useQuickPlaylist();

  // Memoize valores para evitar re-renders desnecessários
  const currentFile = playerState.currentFile;
  const isPlaying = playerState.isPlaying;
  const currentTime = playerState.currentTime;
  const duration = playerState.duration;
  const isLoading = playerState.isLoading;
  const isReady = playerState.isReady;
  const error = playerState.error;

  // Prévia (faixa não baixada): tocar via YouTube IFrame em vez do <audio>/preview-stream.
  const isPreview = !!(currentFile && ((currentFile as any).isPreview || (currentFile as any).streamUrl));
  // Fallback: quando o YouTube IFrame não inicia (API bloqueada/offline, onReady nunca
  // dispara, autoplay barrado), tocamos a prévia pelo <audio> nativo via /api/preview-stream
  // (caminho comprovado).
  const [previewNative, setPreviewNative] = useState(false);
  // Uma vez que o YouTube prova que NÃO consegue tocar nesta sessão (embed bloqueado,
  // autoplay barrado, iframe que carrega mas nunca avança), paramos de brigar com ele: a
  // troca de faixa não volta a tentar o YT. Sem isto, cada nova faixa reativava o YT (que
  // de novo não toca) e o toggle YT⇄nativo destruía o <audio> antes de ele carregar — a
  // PRÓXIMA faixa do álbum ficava presa em 0:00 (auto-play "não funciona"). Se o YT tocar
  // de fato, este flag nunca liga e seguimos no caminho rápido do YouTube em cada faixa.
  const ytUnplayableRef = useRef(false);
  // Nova faixa: tenta o YouTube primeiro (caminho rápido, ~1s) — a menos que a API esteja
  // indisponível (offline/adblock) ou que o YT já tenha se provado inválido nesta sessão.
  useEffect(() => { setPreviewNative(ytApiBlocked || ytUnplayableRef.current); }, [currentFile?.name]);
  // Cai para o <audio> nativo (/api/preview-stream, caminho comprovado) e marca o YT como
  // inválido para o resto da sessão, evitando o thrash descrito acima.
  const fallBackToNativePreview = useCallback(() => { ytUnplayableRef.current = true; setPreviewNative(true); }, []);
  // Prévia tocando pelo YouTube IFrame (modo padrão, enquanto não caiu no fallback).
  const ytPreview = isPreview && !previewNative;
  useEffect(() => { ytActiveRef.current = ytPreview; }, [ytPreview]);
  const previewVideoId = useMemo(() => {
    if (!isPreview || !currentFile) return null;
    const n = currentFile.name || '';
    if (n.startsWith('preview:')) return n.slice('preview:'.length);
    const m = ((currentFile as any).streamUrl || '').match(/[?&]videoId=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }, [isPreview, currentFile?.name]);

  // Memoizar URL do thumbnail para evitar requisições repetidas
  const thumbnailUrl = useMemo(() => {
    if (!currentFile?.name) return '';
    // Prévia (faixa não baixada): usar a capa externa (YouTube), não /api/thumbnail.
    if ((currentFile as any).streamUrl) return currentFile.thumbnail || '';
    return getThumbnailUrl(currentFile.name);
  }, [currentFile?.name, (currentFile as any)?.streamUrl, currentFile?.thumbnail]);

  // Ref para rastrear a última URL do thumbnail carregada e evitar re-renders
  const lastThumbnailUrlRef = useRef<string>('');
  const imageErrorRef = useRef<boolean>(false);
  const imageLoadedUrlsRef = useRef<Set<string>>(new Set());
  
  // Resetar erro de imagem quando o arquivo mudar
  useEffect(() => {
    if (currentFile?.name) {
      setImageError(false);
      imageErrorRef.current = false;
      lastThumbnailUrlRef.current = '';
      // Limpar cache de URLs carregadas quando mudar de arquivo
      imageLoadedUrlsRef.current.clear();
    }
  }, [currentFile?.name]);
  
  // Atualizar ref quando thumbnailUrl mudar
  useEffect(() => {
    if (thumbnailUrl && thumbnailUrl !== lastThumbnailUrlRef.current) {
      lastThumbnailUrlRef.current = thumbnailUrl;
      // Resetar erro quando URL mudar
      if (imageErrorRef.current) {
        setImageError(false);
        imageErrorRef.current = false;
      }
    }
  }, [thumbnailUrl]);
  
  // Handler memoizado para onError para evitar re-renders
  const handleImageError = useCallback(() => {
    if (!imageErrorRef.current && currentFile?.name) {
      console.warn('Erro ao carregar imagem no player:', currentFile.name);
      setImageError(true);
      imageErrorRef.current = true;
    }
  }, [currentFile?.name]);
  
  // Handler para quando a imagem carregar com sucesso - evita requisições repetidas
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.src && !imageLoadedUrlsRef.current.has(img.src)) {
      imageLoadedUrlsRef.current.add(img.src);
    }
  }, []);
  
  // Estado local para volume durante interação (evita re-renders)
  const [localVolume, setLocalVolume] = useState(playerState.volume);
  const [localIsMuted, setLocalIsMuted] = useState(playerState.isMuted);
  
  // Refs para volume para evitar dependências em useEffects críticos
  const localVolumeRef = useRef(playerState.volume);
  const localIsMutedRef = useRef(playerState.isMuted);
  
  // Usar valores locais para renderização
  const volume = localVolume;
  const isMuted = localIsMuted;
  
  // Atualizar refs quando estado local muda
  useEffect(() => {
    localVolumeRef.current = localVolume;
  }, [localVolume]);
  
  useEffect(() => {
    localIsMutedRef.current = localIsMuted;
  }, [localIsMuted]);

  // Atualizar refs quando valores mudam
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    currentFileNameRef.current = currentFile?.name ?? null;
  }, [currentFile?.name]);

  // Auto-avanço unificado: usado pelo fim da faixa nativa (<audio>) E pelo fim da prévia
  // (YouTube IFrame). Usa a mesma lista de navegação (fila do álbum quando aplicável, senão
  // a biblioteca) e o MESMO caminho de play do botão "próxima". Marca isNavigatingRef para
  // que o tempo da próxima faixa seja resetado a 0 — sem isso, o canplay do <audio> podia
  // restaurar um tempo antigo e a faixa carregava mas não tocava (autoplay "preso").
  // Retorna true se avançou.
  const advanceToNext = useCallback(() => {
    const currentName = currentFileNameRef.current;
    if (!currentName) return false;
    const list = navigationList(currentName);
    const idx = list.findIndex(f => f.name === currentName);
    if (idx >= 0 && idx < list.length - 1) {
      const nextFile = list[idx + 1];
      logger.debug('⏭️ Auto-avanço para:', nextFile.displayName);
      isNavigatingRef.current = true;
      if (navigationTimeoutRef.current) clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = setTimeout(() => { isNavigatingRef.current = false; }, 1500);
      playRef.current(nextFile, true);
      return true;
    }
    return false;
  }, [navigationList]);
  const advanceToNextRef = useRef(advanceToNext);
  useEffect(() => { advanceToNextRef.current = advanceToNext; }, [advanceToNext]);

  // Funções de navegação otimizadas
  const handleNext = useCallback(() => {
    if (!currentFile || isNavigatingRef.current) {
      logger.debug('⚠️ handleNext ignorado:', { 
        hasCurrentFile: !!currentFile, 
        isNavigating: isNavigatingRef.current 
      });
      return; // Prevenir múltiplos cliques
    }
    
    const list = navigationList(currentFile.name);
    const currentIndex = list.findIndex(f => f.name === currentFile.name);
    if (currentIndex >= 0 && currentIndex < list.length - 1) {
      const nextFile = list[currentIndex + 1];
      logger.debug('▶️ Próxima música:', nextFile.displayName);
      
      // Marcar como navegação para resetar tempo
      isNavigatingRef.current = true;
      
      // Pausar e limpar áudio atual antes de trocar
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      
      // Resetar flag de handleEnded também
      isHandlingEndedRef.current = false;
      
      // Limpar timeout anterior se existir
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
      
      // Resetar flag após um tempo
      navigationTimeoutRef.current = setTimeout(() => {
        isNavigatingRef.current = false;
      }, 1500);
      
      // Chamar play com resetTime=true para não restaurar progresso
      // E garantir que isPlaying seja true para auto-play funcionar
      play(nextFile, true);
    } else {
      logger.debug('ℹ️ Não há próxima música disponível');
    }
  }, [currentFile, play, navigationList]);

  const handlePrev = useCallback(() => {
    if (!currentFile || isNavigatingRef.current) {
      logger.debug('⚠️ handlePrev ignorado:', { 
        hasCurrentFile: !!currentFile, 
        isNavigating: isNavigatingRef.current 
      });
      return; // Prevenir múltiplos cliques
    }
    
    const list = navigationList(currentFile.name);
    const currentIndex = list.findIndex(f => f.name === currentFile.name);
    if (currentIndex > 0) {
      const prevFile = list[currentIndex - 1];
      logger.debug('◀️ Música anterior:', prevFile.displayName);
      
      // Marcar como navegação para resetar tempo
      isNavigatingRef.current = true;
      
      // Pausar e limpar áudio atual antes de trocar
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      
      // Resetar flag de handleEnded também
      isHandlingEndedRef.current = false;
      
      // Limpar timeout anterior se existir
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
      
      // Resetar flag após um tempo
      navigationTimeoutRef.current = setTimeout(() => {
        isNavigatingRef.current = false;
      }, 1500);
      
      // Chamar play com resetTime=true para não restaurar progresso
      // E garantir que isPlaying seja true para auto-play funcionar
      play(prevFile, true);
    } else {
      logger.debug('ℹ️ Não há música anterior disponível');
    }
  }, [currentFile, play, navigationList]);

  // Cleanup de timeouts ao desmontar
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
      if (volumeUpdateTimeoutRef.current) {
        clearTimeout(volumeUpdateTimeoutRef.current);
      }
      isHandlingEndedRef.current = false;
      isNavigatingRef.current = false;
    };
  }, []);

  // Detectar mobile e inicializar cliente
  useEffect(() => {
    setIsClient(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Polling do progresso da prévia (YouTube IFrame). Estável — usado pelo onReady e pelo
  // efeito de prévia. Só roda enquanto há uma prévia ativa (o efeito limpa ao sair).
  const startYtPolling = useCallback(() => {
    if (ytPollRef.current) clearInterval(ytPollRef.current);
    ytPollRef.current = setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p || !ytReadyRef.current) return;
      if (isSeekingRef.current || isDraggingRef.current) return;
      try {
        const t = p.getCurrentTime?.() || 0;
        setPlayerState(prev => (Math.abs(prev.currentTime - t) < 0.2 ? prev : { ...prev, currentTime: t }));
      } catch { /* ignore */ }
    }, 250);
  }, [setPlayerState]);

  // Cria UMA vez o player de PRÉVIA do YouTube e o deixa PRONTO (ocioso, sem vídeo).
  // Pré-criar no mount é o que faz o play começar já no 1º clique: o <iframe> existe e
  // está "ready" antes do clique, então loadVideoById/playVideo conseguem autoplay (a
  // página já teve interação do usuário). Se o player só nascesse no clique, o onReady
  // dispararia FORA do gesto e o navegador barraria o autoplay — exigindo o 2º clique.
  const ensureYtPlayer = useCallback((YT: any) => {
    if (!YT || ytPlayerRef.current) return;
    const getDur = () => { try { return ytPlayerRef.current?.getDuration?.() || 0; } catch { return 0; } };

    // Host fora do React: sobrevive aos early-returns de skeleton/erro do render.
    let host = ytHostElRef.current;
    if (!host || !host.isConnected) {
      const wrap = document.createElement('div');
      wrap.setAttribute('data-yt-preview', '1');
      wrap.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      const inner = document.createElement('div');
      wrap.appendChild(inner);
      document.body.appendChild(wrap);
      host = inner;
      ytHostElRef.current = inner;
    }

    const onReady = () => {
      ytReadyRef.current = true;
      const p = ytPlayerRef.current;
      try { p.setVolume((localIsMutedRef.current ? 0 : localVolumeRef.current) * 100); } catch { /* ignore */ }
      const want = pendingPreviewVideoRef.current;
      // Player pré-criado e ocioso (sem prévia pendente): não mexe no estado nem inicia
      // o polling — pode haver uma faixa nativa da biblioteca tocando.
      if (!want) return;
      if (want !== ytLoadedVideoRef.current) {
        ytLoadedVideoRef.current = want;
        try { isPlayingRef.current ? p.loadVideoById(want) : p.cueVideoById(want); } catch { /* ignore */ }
      } else if (isPlayingRef.current) {
        try { p.playVideo(); } catch { /* ignore */ }
      }
      setPlayerState(prev => ({ ...prev, isReady: true, isLoading: false, duration: getDur() || prev.duration }));
      startYtPolling();
    };

    const onStateChange = (e: any) => {
      // Ignora eventos do YT quando ele NÃO é a fonte ativa (caiu para o <audio> nativo):
      // o stopVideo do fallback dispara estados residuais que não devem mexer no playback.
      if (!ytActiveRef.current) return;
      const S = YT.PlayerState;
      if (e.data === S.PLAYING) {
        setPlayerState(prev => ({ ...prev, isPlaying: true, isReady: true, isLoading: false, duration: getDur() || prev.duration }));
      } else if (e.data === S.PAUSED) {
        setPlayerState(prev => (prev.isPlaying ? { ...prev, isPlaying: false } : prev));
      } else if (e.data === S.ENDED) {
        setPlayerState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
        // Auto-avançar a prévia para a próxima faixa da fila (mesmo caminho do <audio> nativo).
        if (!isHandlingEndedRef.current) {
          isHandlingEndedRef.current = true;
          setTimeout(() => {
            advanceToNextRef.current();
            isHandlingEndedRef.current = false;
          }, 300);
        }
      }
    };

    // YouTube recusou a faixa (indisponível/embed bloqueado): cair para o áudio nativo.
    const onError = () => { fallBackToNativePreview(); };

    try {
      ytPlayerRef.current = new YT.Player(host, {
        // Sem videoId/autoplay aqui: o player nasce ocioso e pronto. O vídeo entra via
        // loadVideoById no clique (autoplay confiável depois da interação do usuário).
        playerVars: { controls: 0, disablekb: 1, fs: 0, modestbranding: 1, playsinline: 1, rel: 0 },
        events: { onReady, onStateChange, onError },
      });
    } catch {
      fallBackToNativePreview();
    }
  }, [setPlayerState, fallBackToNativePreview, startYtPolling]);

  // Pré-aquecer a API do YouTube E pré-criar o player já no mount, para que o play da
  // prévia comece no 1º clique (o player já está pronto antes da interação).
  useEffect(() => {
    if (!isClient) return;
    loadYouTubeIframeApi().then((YT) => ensureYtPlayer(YT)).catch(() => { /* offline / bloqueado */ });
    return () => {
      if (ytPollRef.current) { clearInterval(ytPollRef.current); ytPollRef.current = null; }
      if (ytPlayerRef.current) { try { ytPlayerRef.current.destroy(); } catch { /* ignore */ } ytPlayerRef.current = null; }
      ytReadyRef.current = false;
    };
  }, [isClient, ensureYtPlayer]);

  // Extrair cor dominante quando arquivo muda (respeitando configuração)
  useEffect(() => {
    if (!currentFile) return;
    
    const extractPlayerColor = async () => {
      // Usar cor padrão se cores dinâmicas estiverem desabilitadas
      if (settings.disableDynamicColors) {
        setPlayerDominantColor('rgba(16, 185, 129, 0.2)');
        return;
      }

      try {
        const colorData = await getCachedDominantColor(thumbnailUrl);
        const dominantColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.2)`;
        setPlayerDominantColor(dominantColor);
      } catch (error) {
        logger.warn('Erro ao extrair cor dominante:', error);
        setPlayerDominantColor('rgba(16, 185, 129, 0.2)');
      }
    };
    
    extractPlayerColor();
  }, [currentFile?.name, settings.disableDynamicColors]);

  // Inicializar áudio nativo
  useEffect(() => {
    if (!currentFile) {
      // Limpar referências quando não há arquivo
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      lastInitializedFile.current = null;
      isInitializing.current = false;
      return;
    }

    // Prévia via YouTube IFrame (efeito dedicado): encerrar qualquer <audio> nativo e não
    // inicializar /api/preview-stream. No fallback (previewNative) seguimos adiante e o
    // <audio> nativo toca a prévia normalmente pelo streamUrl.
    if (ytPreview) {
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch { /* ignore */ }
        audioRef.current.src = '';
        audioRef.current = null;
      }
      lastInitializedFile.current = null;
      isInitializing.current = false;
      return;
    }

    // Proteção contra múltiplas inicializações do mesmo arquivo
    if (lastInitializedFile.current === currentFile.name) {
      // Verificar se o audioRef ainda está válido e com o mesmo arquivo
      if (audioRef.current && audioRef.current.src && audioRef.current.src.includes(encodeURIComponent(currentFile.name))) {
        logger.debug('⚠️ Áudio já inicializado para este arquivo, ignorando:', currentFile.name);
        return;
      }
      // Se o audioRef não está mais válido, permitir re-inicialização
      logger.debug('⚠️ Arquivo já foi inicializado mas audioRef não está válido, re-inicializando');
    }

    // Proteção contra inicializações simultâneas
    if (isInitializing.current) {
      logger.debug('⚠️ Inicialização já em andamento, ignorando nova inicialização');
      return;
    }

    // Fonte: prévia externa (streamUrl) ou arquivo local em /api/downloads.
    const audioUrl = (currentFile as any).streamUrl
      || `/api/downloads/${encodeURIComponent(currentFile.name)}`;

    // Limpar áudio anterior se existir e for diferente
    if (audioRef.current) {
      const currentSrc = audioRef.current.src;
      if (currentSrc && !currentSrc.includes(audioUrl)) {
        logger.debug('🧹 Limpando áudio anterior antes de inicializar novo');
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.removeEventListener('loadedmetadata', () => {});
        audioRef.current.removeEventListener('canplay', () => {});
        audioRef.current.removeEventListener('timeupdate', () => {});
        audioRef.current.removeEventListener('ended', () => {});
        audioRef.current.removeEventListener('error', () => {});
        audioRef.current = null;
      } else if (currentSrc && currentSrc.includes(audioUrl)) {
        logger.debug('⚠️ Áudio já existe para este arquivo, ignorando:', currentFile.name);
        return;
      }
    }

    logger.debug('🎵 Inicializando áudio para:', currentFile.name);
    
    // Marcar como inicializando ANTES de criar o novo Audio
    isInitializing.current = true;
    lastInitializedFile.current = currentFile.name;
    
    const audio = new Audio();
    audio.preload = 'metadata';
    // Usar refs para obter valores atuais sem causar re-inicialização
    audio.volume = localIsMutedRef.current ? 0 : localVolumeRef.current;
    audio.crossOrigin = 'anonymous';
    
    // Event listeners otimizados
    const handleLoadedMetadata = () => {
      logger.debug('✅ Metadados carregados');
      // Verificar se ainda é o arquivo atual antes de atualizar estado
      if (lastInitializedFile.current !== currentFile.name) {
        logger.debug('⚠️ Arquivo mudou durante carregamento, ignorando metadados');
        return;
      }
      setPlayerState(prev => ({
        ...prev,
        duration: audio.duration || 0,
        isReady: true,
        isLoading: false,
        error: null
      }));
      isInitializing.current = false;
    };

    const handleCanPlay = () => {
      // Verificar se ainda é o arquivo atual antes de processar
      if (lastInitializedFile.current !== currentFile.name) {
        logger.debug('⚠️ Arquivo mudou durante canplay, ignorando');
        return;
      }
      
      const shouldPlay = isPlayingRef.current;
      const savedTime = currentTimeRef.current;
      
      logger.debug('✅ Áudio pronto para reprodução', {
        shouldPlay,
        paused: audio.paused,
        isNavigating: isNavigatingRef.current,
        savedTime
      });
      
      // Aplicar progresso inicial salvo APENAS se não estivermos navegando
      // Quando navegamos (next/prev), o tempo deve ser 0
      if (!isNavigatingRef.current && savedTime > 0 && Math.abs(audio.currentTime - savedTime) > 1) {
        // Aplicando progresso inicial apenas se não for navegação
        audio.currentTime = savedTime;
        logger.debug('⏩ Restaurando progresso salvo:', savedTime);
      } else if (isNavigatingRef.current) {
        // Garantir que o tempo seja 0 ao navegar
        audio.currentTime = 0;
        logger.debug('🔄 Resetando tempo para navegação');
      }
      
      // Atualizar estado apenas se necessário para evitar re-renders
      setPlayerState(prev => {
        const newCurrentTime = isNavigatingRef.current ? 0 : savedTime;
        // Só atualizar se realmente mudou algo
        if (prev.isReady && !prev.isLoading && Math.abs(prev.currentTime - newCurrentTime) < 0.1) {
          return prev; // Não atualizar se já está correto
        }
        return {
          ...prev,
          isReady: true,
          isLoading: false,
          currentTime: newCurrentTime
        };
      });
      
      // Marcar inicialização como completa
      isInitializing.current = false;
      
      // Auto-play se solicitado - garantir que realmente toque
      if (shouldPlay && audio.paused) {
        logger.debug('▶️ Tentando auto-play...');
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              logger.debug('✅ Auto-play bem-sucedido');
            })
            .catch(err => {
              logger.warn('❌ Auto-play falhou:', err);
              // Não pausar automaticamente - deixar o usuário decidir
              setPlayerState(prev => ({ ...prev, isPlaying: false }));
            });
        }
      }
    };

         const handleTimeUpdate = () => {
       // Ignorar completamente se estamos fazendo seek ou arrastando
       if (isSeekingRef.current || isDraggingRef.current) {
         return; // Sem logs para evitar spam
       }
       
       const now = Date.now();
       if (now - lastProgressUpdateTime.current < 100) return; // Throttle reduzido para 100ms para melhor sincronização
       lastProgressUpdateTime.current = now;
       
       const newTime = audio.currentTime || 0;
       
       // Só atualizar se houve mudança significativa E não estamos em seek
       setPlayerState(prev => {
         // Verificação dupla de seeking antes de atualizar
         if (isSeekingRef.current || isDraggingRef.current) {
           return prev;
         }
         
         // Só atualizar para mudanças maiores que 0.1s para melhor responsividade visual
         if (Math.abs(prev.currentTime - newTime) < 0.1) {
           return prev;
         }
         
         return { ...prev, currentTime: newTime };
       });
     };

    const handleEnded = () => {
      // Proteção contra múltiplas chamadas
      if (isHandlingEndedRef.current) {
        logger.debug('⚠️ handleEnded já está sendo processado, ignorando');
        return;
      }
      
      isHandlingEndedRef.current = true;
      logger.debug('🎵 Música terminou');
      
      // Pausar e resetar estado
      setPlayerState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));

      // Avançar pela MESMA lógica do botão "próxima" (fila do álbum quando houver, senão a
      // biblioteca), garantindo o auto-play da faixa seguinte.
      setTimeout(() => {
        if (!advanceToNextRef.current()) {
          logger.debug('ℹ️ Não há próxima música, parando reprodução');
        }
        isHandlingEndedRef.current = false;
      }, 300);
    };

    const handleError = (e: Event) => {
      // Verificar se ainda é o arquivo atual antes de processar erro
      if (lastInitializedFile.current !== currentFile.name) {
        logger.debug('⚠️ Arquivo mudou durante erro, ignorando');
        return;
      }
      
      const audioElement = e.target as HTMLAudioElement;
      const error = audioElement?.error;
      
      let errorMessage = 'Erro ao carregar áudio';
      let errorCode: number | null = null;
      
      if (error) {
        errorCode = error.code;
        switch (error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMessage = 'Reprodução cancelada';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = 'Erro de rede ao carregar áudio';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = 'Erro ao decodificar áudio';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = 'Formato de áudio não suportado ou arquivo não encontrado';
            break;
          default:
            errorMessage = `Erro ao carregar áudio (código: ${error.code})`;
        }
      } else {
        // Se não há objeto de erro, tentar inferir a causa
        if (audioElement?.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
          errorMessage = 'Nenhuma fonte de áudio disponível';
        } else if (audioElement?.readyState === HTMLMediaElement.HAVE_NOTHING) {
          errorMessage = 'Áudio não pôde ser carregado';
        }
      }
      
      // Log detalhado apenas se houver informações úteis
      const errorDetails: Record<string, any> = {
        message: errorMessage,
        url: audioUrl || 'N/A',
        eventType: e.type || 'unknown'
      };
      
      if (errorCode !== null) {
        errorDetails.code = errorCode;
      }
      
      if (audioElement) {
        if (audioElement.readyState !== undefined) {
          errorDetails.readyState = audioElement.readyState;
        }
        if (audioElement.networkState !== undefined) {
          errorDetails.networkState = audioElement.networkState;
        }
        if (audioElement.src) {
          errorDetails.src = audioElement.src;
        }
      }

      // Uma única string: o overlay do Next serializa o 2º arg de console.error como "{}".
      logger.error(`❌ Erro no áudio: ${JSON.stringify(errorDetails)}`);
      
      setPlayerState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
        isReady: false,
        isPlaying: false
      }));
      
      // Resetar flag de inicialização em caso de erro
      isInitializing.current = false;
    };

    // Adicionar listeners
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    
    // Definir source e inicializar loading
    audio.src = audioUrl;
    audioRef.current = audio;
    
    // Só atualizar estado se realmente mudou para evitar re-renders
    setPlayerState(prev => {
      if (prev.isLoading && !prev.isReady && !prev.error) {
        return prev; // Já está no estado de loading correto
      }
      return { 
        ...prev, 
        isLoading: true, 
        error: null, 
        isReady: false
      };
    });
    
    return () => {
      logger.debug('🧹 Limpando áudio anterior');
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      
      // Pausar e limpar áudio atual se for o mesmo que estamos limpando
      if (audioRef.current === audio) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      
      // Resetar flag de inicialização quando limpamos
      // Se o arquivo mudou, o lastInitializedFile será atualizado no próximo useEffect
      if (lastInitializedFile.current === currentFile?.name) {
        isInitializing.current = false;
        // Não resetar lastInitializedFile aqui - será atualizado quando novo arquivo for carregado
      }
    };
  }, [currentFile?.name, isPreview, ytPreview]); // Apenas arquivo atual - volume é controlado separadamente

  // Controlar reprodução/pausa
  useEffect(() => {
    // Prévia via YouTube: controlar o player do YouTube em vez do <audio>.
    if (ytPreview) {
      const p = ytPlayerRef.current;
      if (!p || !ytReadyRef.current) return;
      try { if (isPlayingRef.current) p.playVideo(); else p.pauseVideo(); } catch { /* ignore */ }
      return;
    }

    if (!audioRef.current || !isReady) return;

    // Usar ref para evitar dependências desnecessárias
    const shouldPlay = isPlayingRef.current;
    
    if (shouldPlay && audioRef.current.paused) {
      logger.debug('▶️ Iniciando reprodução', {
        readyState: audioRef.current.readyState,
        paused: audioRef.current.paused,
        src: audioRef.current.src
      });
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            logger.debug('✅ Reprodução iniciada com sucesso');
          })
          .catch(err => {
            logger.warn('❌ Erro ao reproduzir:', err);
            setPlayerState(prev => ({ ...prev, isPlaying: false }));
          });
      }
    } else if (!shouldPlay && !audioRef.current.paused) {
      logger.debug('⏸️ Pausando reprodução');
      audioRef.current.pause();
    }
  }, [isPlaying, isReady, setPlayerState, ytPreview]); // Manter dependências para sincronizar com refs

  // Controlar volume do áudio usando estado local (não depende do contexto)
  // Este é o único lugar onde o volume do áudio é atualizado
  useEffect(() => {
    if (ytPreview) {
      const p = ytPlayerRef.current;
      if (p && ytReadyRef.current) {
        try { p.setVolume((localIsMuted ? 0 : localVolume) * 100); } catch { /* ignore */ }
      }
      return;
    }
    if (audioRef.current) {
      const newVolume = localIsMuted ? 0 : localVolume;
      // Só atualizar se realmente mudou para evitar operações desnecessárias
      if (Math.abs(audioRef.current.volume - newVolume) > 0.01) {
        audioRef.current.volume = newVolume;
      }
    }
  }, [localVolume, localIsMuted, ytPreview]);

  // ---- Player de PRÉVIA (YouTube IFrame, sem vídeo) ----
  // Toca o áudio das prévias direto do YouTube (play em ~1s), alimentando o mesmo
  // playerState (currentTime/duration/isReady/isPlaying) que a UI já consome.
  useEffect(() => {
    if (!isClient) return;

    // Não é prévia por YT (ou caiu no fallback nativo): parar o player do YT.
    if (!ytPreview || !previewVideoId) {
      if (ytPollRef.current) { clearInterval(ytPollRef.current); ytPollRef.current = null; }
      if (ytPlayerRef.current && ytReadyRef.current) {
        try { ytPlayerRef.current.stopVideo?.(); } catch { /* ignore */ }
      }
      ytLoadedVideoRef.current = null;
      return;
    }

    let cancelled = false;
    pendingPreviewVideoRef.current = previewVideoId;

    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !YT) return;
      // Garante que o player existe (normalmente já foi criado no mount).
      ensureYtPlayer(YT);
      const p = ytPlayerRef.current;
      if (p && ytReadyRef.current) {
        const isNewVideo = ytLoadedVideoRef.current !== previewVideoId;
        if (isNewVideo) {
          ytLoadedVideoRef.current = previewVideoId;
          try { isPlayingRef.current ? p.loadVideoById(previewVideoId) : p.cueVideoById(previewVideoId); } catch { /* ignore */ }
        } else if (isPlayingRef.current) {
          try { p.playVideo(); } catch { /* ignore */ }
        }
        try { p.setVolume((localIsMutedRef.current ? 0 : localVolumeRef.current) * 100); } catch { /* ignore */ }
        setPlayerState(prev => ({ ...prev, isReady: true, isLoading: false, ...(isNewVideo ? { currentTime: 0, duration: 0 } : {}) }));
        startYtPolling();
      }
      // else: player ainda em criação; onReady carregará pendingPreviewVideoRef.
    }).catch(() => {
      // API do YouTube indisponível (offline/bloqueada/timeout): usar o fallback nativo.
      if (!cancelled) fallBackToNativePreview();
    });

    return () => { cancelled = true; };
  }, [ytPreview, previewVideoId, isClient, setPlayerState, fallBackToNativePreview, ensureYtPlayer, startYtPolling]);

  // Watchdog: se a prévia por YouTube não começar a tocar em poucos segundos (onReady
  // nunca dispara, autoplay barrado, etc.), cai para o <audio> nativo (/api/preview-stream),
  // que é o caminho comprovado — evita o play "preso" carregando para sempre.
  useEffect(() => {
    if (!ytPreview || !previewVideoId || !isLoading) return;
    const t = setTimeout(() => fallBackToNativePreview(), 2000);
    return () => clearTimeout(t);
  }, [ytPreview, previewVideoId, isLoading, fallBackToNativePreview]);

  // Watchdog de PROGRESSO: ao trocar de faixa, o efeito acima reativa o YouTube (tenta YT
  // primeiro em cada faixa). Mas o YT pode reportar "ready"/"playing" SEM realmente avançar
  // (autoplay barrado na navegação, embed que carrega o iframe mas nunca toca) — aí isLoading
  // zera e o watchdog acima não dispara, deixando a PRÓXIMA faixa presa em 0:00. Se o tempo
  // não passar de ~0 em poucos segundos com a prévia "tocando", caímos para o <audio> nativo.
  useEffect(() => {
    if (!ytPreview || !previewVideoId) return;
    const t = setTimeout(() => {
      if (currentTimeRef.current < 0.5) fallBackToNativePreview();
    }, 3500);
    return () => clearTimeout(t);
  }, [ytPreview, previewVideoId, fallBackToNativePreview]);

  // Sincronizar WaveSurfer com progresso do áudio nativo (melhorado)
  useEffect(() => {
    if (!wavesurferRef.current || !isWaveReady || duration === 0) return;
    
    // Não sincronizar se estamos fazendo seek ou arrastando
    if (isSeekingRef.current || isDraggingRef.current) return;
    
    try {
      const percentage = currentTime / duration;
      
      // Verificar diferença atual
      const currentWavePos = wavesurferRef.current.getCurrentTime() || 0;
      const waveDuration = wavesurferRef.current.getDuration() || duration;
      const currentWavePercentage = waveDuration > 0 ? currentWavePos / waveDuration : 0;
      
      // Sincronizar com threshold menor para melhor precisão visual
      const percentageDiff = Math.abs(percentage - currentWavePercentage);
      const timeDiff = Math.abs(currentTime - currentWavePos);
      
      if (percentageDiff > 0.005 || timeDiff > 0.2) {
        wavesurferRef.current.seekTo(percentage);
      }
    } catch (error) {
      logger.warn('Erro ao sincronizar WaveSurfer:', error);
    }
  }, [currentTime, duration, isWaveReady]);

    // Inicializar WaveSurfer otimizado
  useEffect(() => {
    if (!currentFile || !isClient) return;

    // Prévia: sem waveform — o áudio vem de um iframe cross-origin do YouTube, que o
    // WebAudio não consegue decodificar. (E carregar a waveform reabriria o caminho lento.)
    if (isPreview) {
      if (wavesurferRef.current) {
        try { wavesurferRef.current.destroy(); } catch { /* ignore */ }
        wavesurferRef.current = null;
        setIsWaveReady(false);
        lastInitializedFile.current = null;
      }
      return;
    }

    // Não inicializar WaveSurfer se o player estiver minimizado (desktop)
    if (!isMobile && playerMinimized) {
      // Destruir WaveSurfer se existir quando minimizar
      if (wavesurferRef.current) {
        try {
          wavesurferRef.current.destroy();
          wavesurferRef.current = null;
          setIsWaveReady(false);
          lastInitializedFile.current = null;
        } catch (e) {
          logger.warn('Erro ao destruir WaveSurfer ao minimizar:', e);
        }
      }
      lastPlayerMinimizedRef.current = playerMinimized;
      return;
    }

    // Verificar se o player acabou de ser maximizado
    const wasMinimized = lastPlayerMinimizedRef.current === true;
    const justMaximized = wasMinimized && !playerMinimized;
    
    // Se acabou de ser maximizado, forçar reinicialização mesmo que o arquivo seja o mesmo
    if (justMaximized && wavesurferRef.current) {
      logger.debug('🔄 Player acabou de ser maximizado - destruindo WaveSurfer para reinicializar');
      try {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
        setIsWaveReady(false);
        lastInitializedFile.current = null;
      } catch (e) {
        logger.warn('Erro ao destruir WaveSurfer ao maximizar:', e);
      }
    }

    // Atualizar ref do estado de minimização
    lastPlayerMinimizedRef.current = playerMinimized;

    // Delay fixo para garantir que o container está visível
    // Delay maior quando o player é maximizado para garantir renderização completa
    let isCancelled = false;
    let timeoutId: NodeJS.Timeout | null = null;
    const delay = justMaximized ? 800 : 500;

    timeoutId = setTimeout(() => {
      if (isCancelled) return;

      // Evitar re-inicialização desnecessária apenas se o arquivo não mudou e não acabou de ser maximizado
      if (lastInitializedFile.current === currentFile.name && wavesurferRef.current && !justMaximized) {
        logger.debug('⚠️ WaveSurfer já inicializado para:', currentFile.name);
        return;
      }

      // Evitar múltiplas inicializações simultâneas (guarda própria da wave)
      if (isWaveInitializing.current) {
        logger.debug('⚠️ WaveSurfer já está sendo inicializado, cancelando nova tentativa');
        return;
      }

      isWaveInitializing.current = true;

      const initWaveSurfer = async () => {
        const containerRef = isMobile ? waveformMobileRef.current : waveformDesktopRef.current;
        if (!containerRef) {
          logger.warn('❌ Container do WaveSurfer não encontrado');
          isWaveInitializing.current = false;
          return;
        }
        if (containerRef.offsetWidth === 0 || containerRef.offsetHeight === 0) {
          logger.warn('❌ Container do WaveSurfer não tem dimensões válidas');
          isWaveInitializing.current = false;
          return;
        }

        // Verificar se o container tem dimensões válidas
        const rect = containerRef.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          logger.warn('❌ Container do WaveSurfer não está visível');
          return;
        }

        try {
          // Só limpar se já não estiver vazio
          if (containerRef.children.length > 0) {
            containerRef.innerHTML = '';
          }
          
          // Obter cores do tema - verificar configuração primeiro
          let waveColor = 'rgba(16, 185, 129, 0.4)';
          let progressColor = 'rgba(16, 185, 129, 0.8)';
          let cursorColor = 'rgba(16, 185, 129, 0.6)';
          
          // Só extrair cores se não estiver desabilitado
          if (!settings.disableDynamicColors) {
            try {
              const colorData = await getCachedDominantColor(thumbnailUrl);
              waveColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.4)`;
              progressColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.8)`;
              cursorColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, 0.6)`;
            } catch (error) {
              logger.warn('Usando cores padrão para WaveSurfer');
            }
          }

          if (isCancelled) return;

          logger.debug('🎨 Configurando WaveSurfer com cores:', { waveColor, progressColor, cursorColor });
          
          const wavesurfer = WaveSurfer.create({
            container: containerRef,
            waveColor,
            progressColor,
            cursorColor,
            height: isMobile ? 80 : 70,
            barWidth: 2,
            barGap: 1,
            barRadius: 1,
            normalize: true,
            interact: false,
            fillParent: true,
            hideScrollbar: false,
            backend: 'WebAudio',
            mediaControls: false,
            autoplay: false
          });
          
          logger.debug('✅ WaveSurfer criado:', wavesurfer);

          if (isCancelled) {
            wavesurfer.destroy();
            return;
          }

          wavesurfer.on('ready', () => {
            if (!isCancelled) {
              const duration = wavesurfer.getDuration();
              logger.debug('✅ WaveSurfer pronto - duração:', duration?.toFixed(2) + 's');
              logger.debug('✅ WaveSurfer container:', containerRef);
              logger.debug('✅ WaveSurfer canvas:', containerRef.querySelector('canvas'));
              setIsWaveReady(true);
              lastInitializedFile.current = currentFile.name;
              isWaveInitializing.current = false;
              
              // Sincronizar com posição atual se necessário
              if (currentTime > 0 && duration > 0) {
                const initialPercentage = currentTime / duration;
                try {
                  wavesurfer.seekTo(initialPercentage);
                  logger.debug('✅ WaveSurfer sincronizado com posição:', initialPercentage);
                } catch (e) {
                  logger.warn('Erro na sincronização inicial do WaveSurfer:', e);
                }
              }
            }
          });

          wavesurfer.on('loading', (progress) => {
            if (!isCancelled) {
              logger.debug('📊 WaveSurfer carregando:', progress + '%');
            }
          });

          wavesurfer.on('decode', () => {
            if (!isCancelled) {
              logger.debug('🔍 WaveSurfer decodificando áudio...');
            }
          });

          wavesurfer.on('error', (err) => {
            if (!isCancelled) {
              logger.warn('⚠️ WaveSurfer erro:', err);
              logger.warn('⚠️ Detalhes do erro:', {
                message: err.message,
                stack: err.stack,
                container: containerRef,
                audioUrl
              });
              // Mesmo com erro, marcar como pronto para não travar a UI
              setIsWaveReady(true);
              isWaveInitializing.current = false;
            }
          });

          // Desabilitar eventos que podem interferir com o playback
          wavesurfer.on('play', () => {
            // Não fazer nada - deixar o áudio nativo controlar
          });

          wavesurfer.on('pause', () => {
            // Não fazer nada - deixar o áudio nativo controlar
          });

          // Evitar que o WaveSurfer controle o playback
          if (wavesurfer.getMediaElement) {
            try {
              const mediaElement = wavesurfer.getMediaElement();
              if (mediaElement) {
                mediaElement.pause();
                // Desabilitar eventos de time update do media element para evitar conflitos
                mediaElement.removeAttribute('controls');
                mediaElement.muted = true;
              }
            } catch (e) {
              // Ignorar se não conseguir acessar o media element
            }
          }

          wavesurferRef.current = wavesurfer;
          
        } catch (error) {
          if (!isCancelled) {
            logger.warn('⚠️ Erro ao inicializar WaveSurfer:', error);
            setIsWaveReady(true); // Marcar como pronto mesmo com erro
            isWaveInitializing.current = false; // Finalizar inicialização mesmo com erro
          }
        }

        // Cancelar carregamento pendente se houver
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }

        // Carregar áudio no WaveSurfer usando URL string
        // IMPORTANTE: Sempre usar URL string, nunca passar HTMLAudioElement diretamente
        const audioUrl = (currentFile as any).streamUrl
          || `/api/downloads/${encodeURIComponent(currentFile.name)}`;
        
        logger.debug('📡 Preparando carregamento do WaveSurfer para:', currentFile.name);
        logger.debug('📡 URL do áudio:', audioUrl);
        
        // Carregar áudio imediatamente após criar o WaveSurfer
        try {
          logger.debug('🎵 Carregando WaveSurfer:', currentFile.name);
          logger.debug('🎵 WaveSurfer instance:', wavesurferRef.current);
          logger.debug('🎵 Container atual:', containerRef);
          logger.debug('🎵 URL do áudio:', audioUrl);
          
          // Verificar se o container ainda está válido
          if (containerRef && containerRef.offsetWidth > 0 && containerRef.offsetHeight > 0 && wavesurferRef.current) {
            // Sempre usar URL string para evitar erro [object HTMLAudioElement]
            wavesurferRef.current.load(audioUrl);
            logger.debug('🎵 Comando load enviado para WaveSurfer via URL');
            
            // Não precisamos de timeout aqui, já temos o timeout de fallback global
            
          } else {
            logger.warn('⚠️ Container inválido no momento do carregamento');
            setIsWaveReady(true);
            isWaveInitializing.current = false;
          }
        } catch (error) {
          logger.warn('Erro ao carregar WaveSurfer:', error);
          if (!isCancelled) {
            setIsWaveReady(true);
            isWaveInitializing.current = false;
          }
        }
        
                  // Não precisamos mais do loadingTimeoutRef aqui
      };

      initWaveSurfer();
    }, delay);

    return () => {
      isCancelled = true;
      isWaveInitializing.current = false; // Resetar flag de inicialização da wave
      logger.debug('🔄 Destruindo WaveSurfer para:', currentFile?.name);
      
      // Cancelar timeouts pendentes
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      
      setIsWaveReady(false);
      lastInitializedFile.current = null;
      
      if (wavesurferRef.current) {
        try {
          wavesurferRef.current.destroy();
        } catch (e) {
          logger.warn('Erro ao destruir WaveSurfer:', e);
        }
        wavesurferRef.current = null;
      }
    };
  }, [currentFile?.name, isMobile, isClient, playerMinimized, isPreview]); // Adicionado playerMinimized para reinicializar quando maximizar

  // Timeout de fallback para evitar loading infinito da wave
  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;
    
    if (!isWaveReady && currentFile) {
      logger.debug('⏰ Iniciando timeout de fallback para wave (30s)');
      timeout = setTimeout(() => {
        logger.warn('⚠️ Timeout da wave - forçando isWaveReady para true');
        setIsWaveReady(true);
      }, 30000); // 30 segundos para FLAC
    }
    
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [isWaveReady, currentFile?.name]);

  // Handlers otimizados
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [isPlaying, pause, resume]);

  // Ref para controlar volume durante arrasto sem causar re-renders
  const isDraggingVolumeRef = useRef(false);
  const volumeUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastContextVolumeRef = useRef(playerState.volume);
  const lastContextMutedRef = useRef(playerState.isMuted);

  // Sincronizar estado local com contexto quando contexto mudar externamente
  // Mas não durante arrasto para evitar conflitos
  useEffect(() => {
    if (!isDraggingVolumeRef.current) {
      // Só sincronizar se não estiver arrastando e se realmente mudou
      const volumeChanged = Math.abs(lastContextVolumeRef.current - playerState.volume) > 0.01;
      const mutedChanged = lastContextMutedRef.current !== playerState.isMuted;
      
      if (volumeChanged || mutedChanged) {
        // Atualizar refs primeiro
        lastContextVolumeRef.current = playerState.volume;
        lastContextMutedRef.current = playerState.isMuted;
        
        // Atualizar estado local usando função de atualização para evitar dependências
        if (volumeChanged) {
          setLocalVolume(prev => {
            // Só atualizar se realmente mudou
            if (Math.abs(prev - playerState.volume) > 0.01) {
              return playerState.volume;
            }
            return prev;
          });
        }
        if (mutedChanged) {
          setLocalIsMuted(prev => {
            // Só atualizar se realmente mudou
            if (prev !== playerState.isMuted) {
              return playerState.isMuted;
            }
            return prev;
          });
        }
      }
    }
  }, [playerState.volume, playerState.isMuted]);

  // Ref para os elementos de input do volume para atualização direta do DOM
  const volumeSliderVerticalRef = useRef<HTMLInputElement | null>(null);
  const volumeSliderHorizontalRef = useRef<HTMLInputElement | null>(null);
  const volumeProgressFillRef = useRef<HTMLDivElement | null>(null);

  // Cores do tema baseadas na cor dominante - mais claras e visíveis
  const themeColors = useMemo(() => {
    const baseColor = playerDominantColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (baseColor) {
      const [, r, g, b] = baseColor;
      return {
        primary: `rgb(${r}, ${g}, ${b})`,
        primaryLight: `rgba(${r}, ${g}, ${b}, 0.9)`,
        primaryDark: `rgba(${r}, ${g}, ${b}, 0.7)`,
        background: `rgba(${r}, ${g}, ${b}, 0.15)`,
        border: `rgba(${r}, ${g}, ${b}, 0.4)`
      };
    }
    return {
      primary: 'rgb(16, 185, 129)',
      primaryLight: 'rgba(16, 185, 129, 0.9)',
      primaryDark: 'rgba(16, 185, 129, 0.7)',
      background: 'rgba(16, 185, 129, 0.15)',
      border: 'rgba(16, 185, 129, 0.4)'
    };
  }, [playerDominantColor]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    const newIsMuted = newVolume === 0;
    
    // Atualizar áudio imediatamente para feedback instantâneo (sem esperar re-render)
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    
    // Atualizar estado local imediatamente (isso atualiza o input e o useEffect de volume)
    setLocalVolume(newVolume);
    setLocalIsMuted(newIsMuted);
    
    // Durante arrasto, atualizar DOM diretamente também (para performance visual)
    if (isDraggingVolumeRef.current) {
      // Atualizar barra de progresso visual diretamente
      if (volumeProgressFillRef.current) {
        volumeProgressFillRef.current.style.height = `${newVolume * 100}%`;
        volumeProgressFillRef.current.style.transition = 'none';
      }
      // Atualizar background do slider horizontal diretamente
      if (volumeSliderHorizontalRef.current) {
        const primaryColor = themeColors.primary;
        volumeSliderHorizontalRef.current.style.background = 
          `linear-gradient(to right, ${primaryColor} 0%, ${primaryColor} ${newVolume * 100}%, rgb(63, 63, 70) ${newVolume * 100}%, rgb(63, 63, 70) 100%)`;
        volumeSliderHorizontalRef.current.style.transition = 'none';
      }
      
      // Limpar timeout anterior
      if (volumeUpdateTimeoutRef.current) {
        clearTimeout(volumeUpdateTimeoutRef.current);
      }
      
      // Atualizar contexto apenas com debounce durante arrasto (evita re-renders do contexto)
      volumeUpdateTimeoutRef.current = setTimeout(() => {
        if (!isDraggingVolumeRef.current) {
          // Só atualizar se não estiver mais arrastando
          setVolume(newVolume);
          setIsMuted(newIsMuted);
          lastContextVolumeRef.current = newVolume;
          lastContextMutedRef.current = newIsMuted;
        }
      }, 300); // Debounce aumentado para 300ms durante arrasto
    } else {
      // Quando não está arrastando, atualizar contexto imediatamente
      // Limpar timeout anterior se existir
      if (volumeUpdateTimeoutRef.current) {
        clearTimeout(volumeUpdateTimeoutRef.current);
        volumeUpdateTimeoutRef.current = null;
      }
      
      // Atualizar contexto (isso pode causar re-render, mas é aceitável quando não está arrastando)
      setVolume(newVolume);
      setIsMuted(newIsMuted);
      lastContextVolumeRef.current = newVolume;
      lastContextMutedRef.current = newIsMuted;
    }
  }, [setVolume, setIsMuted, themeColors.primary]);

  const handleVolumeMouseDown = useCallback(() => {
    isDraggingVolumeRef.current = true;
  }, []);

  const handleVolumeMouseUp = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    isDraggingVolumeRef.current = false;
    
    const finalVolume = parseFloat((e.target as HTMLInputElement).value);
    const finalIsMuted = finalVolume === 0;
    
    // Limpar timeout pendente
    if (volumeUpdateTimeoutRef.current) {
      clearTimeout(volumeUpdateTimeoutRef.current);
      volumeUpdateTimeoutRef.current = null;
    }
    
    // Restaurar transições CSS
    if (volumeProgressFillRef.current) {
      volumeProgressFillRef.current.style.transition = 'height 0.1s ease';
    }
    if (volumeSliderHorizontalRef.current) {
      volumeSliderHorizontalRef.current.style.transition = 'background 0.1s ease';
    }
    
    // Garantir que estado local está sincronizado (já deve estar, mas garantir)
    setLocalVolume(finalVolume);
    setLocalIsMuted(finalIsMuted);
    
    // Atualizar contexto imediatamente quando soltar (sem debounce)
    setVolume(finalVolume);
    setIsMuted(finalIsMuted);
    lastContextVolumeRef.current = finalVolume;
    lastContextMutedRef.current = finalIsMuted;
  }, [setVolume, setIsMuted]);

  const toggleMute = useCallback(() => {
    const newMuted = !localIsMuted;
    
    // Atualizar estado local primeiro
    setLocalIsMuted(newMuted);
    
    // Atualizar áudio diretamente para feedback instantâneo
    if (audioRef.current) {
      audioRef.current.volume = newMuted ? 0 : localVolumeRef.current;
    }
    
    // Atualizar contexto (pode causar re-render, mas é aceitável para toggle)
    setIsMuted(newMuted);
    lastContextMutedRef.current = newMuted;
  }, [localIsMuted, setIsMuted]);

  const seekToPosition = useCallback((clientX: number, element: HTMLElement) => {
    // Prévia via YouTube: buscar no player do YouTube (no fallback nativo segue o <audio>).
    if (ytPreview) {
      const p = ytPlayerRef.current;
      if (!p || !ytReadyRef.current || duration === 0) return;
      const rect = element.getBoundingClientRect();
      const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newTime = percentage * duration;
      if (isNaN(newTime)) return;
      isSeekingRef.current = true;
      try { p.seekTo(newTime, true); } catch { /* ignore */ }
      setPlayerState(prev => ({ ...prev, currentTime: newTime }));
      setTimeout(() => { isSeekingRef.current = false; }, 150);
      return;
    }

    logger.debug('🎯 seekToPosition called', {
      hasAudioRef: !!audioRef.current,
      duration,
      isReady,
      audioReadyState: audioRef.current?.readyState
    });

    if (!audioRef.current || duration === 0) {
      logger.warn('⚠️ seekToPosition: No audio ref or duration is 0');
      return;
    }
    
    const audio = audioRef.current;
    if (!isReady || audio.readyState < 1) {
      logger.warn('⚠️ seekToPosition: Audio not ready', { isReady, readyState: audio.readyState });
      return;
    }
    
    const rect = element.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * duration;
    
    if (isNaN(newTime) || newTime < 0 || newTime > duration) {
      logger.warn('⚠️ seekToPosition: Invalid time', { newTime, duration });
      return;
    }
    
    logger.debug('✅ seekToPosition: Applying seek', { newTime, percentage, clickX, rectWidth: rect.width });
    
    // Bloquear updates durante o seek
    isSeekingRef.current = true;
    
    try {
      // Aplicar o seek diretamente
      audio.currentTime = newTime;
      
      // Atualizar estado imediatamente
      setPlayerState(prev => ({ ...prev, currentTime: newTime }));
      
      // Sincronizar WaveSurfer se disponível
      if (wavesurferRef.current && isWaveReady && duration > 0) {
        try {
          const wavePercentage = newTime / duration;
          wavesurferRef.current.seekTo(wavePercentage);
        } catch (waveError) {
          logger.warn('Erro ao sincronizar WaveSurfer:', waveError);
        }
      }
      
    } catch (e) {
      logger.error('Erro no seek:', e);
    }
    
    // Liberar bloqueio após um tempo mínimo
    setTimeout(() => {
      isSeekingRef.current = false;
    }, 100);
    
  }, [duration, setPlayerState, isWaveReady, isReady, ytPreview]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
            // Progress bar clicked
    
    // Aplicar seek imediatamente sem delay
    seekToPosition(e.clientX, e.currentTarget);
  }, [seekToPosition]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
            // Iniciando drag do progresso
    isDraggingRef.current = true;
    isSeekingRef.current = true; // Marcar seeking também durante drag
    
    const progressElement = e.currentTarget;
    seekToPosition(e.clientX, progressElement);

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      seekToPosition(e.clientX, progressElement);
    };

    const handleMouseUp = (e: MouseEvent) => {
              // Finalizando drag do progresso
      e.preventDefault();
      
      isDraggingRef.current = false;
      
      // Fazer um último seek para garantir posição final
      seekToPosition(e.clientX, progressElement);
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Aguardar o mesmo tempo que o seek simples para consistência
      setTimeout(() => {
        isSeekingRef.current = false;
        // DRAG FINALIZADO - liberando handleTimeUpdate
      }, 300);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [seekToPosition]);

  const formatTime = useCallback((time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const handleAlbumClick = useCallback(() => {
    setShowAlbumModal(true);
  }, []);

  const handleMusicStudyClick = useCallback(() => {
    setShowMusicStudyModal(true);
  }, []);

  // Clique no nome do artista → aba Novidades focada no artista, abrindo o álbum atual.
  const handleArtistClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    focusArtistInFeed(currentFile?.artist, (currentFile as any)?.album);
  }, [currentFile]);

  const handleAddToPlaylist = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentFile) return;
    
    toggleTrack({
      name: currentFile.name,
      title: currentFile.title || currentFile.displayName,
      artist: currentFile.artist,
      path: currentFile.path,
      thumbnail: thumbnailUrl
    });
  }, [currentFile, toggleTrack]);

  const getAlbumData = useCallback(() => {
    if (!currentFile) return null;
    
    // Função auxiliar para formatar tamanho do arquivo
    const formatFileSize = (bytes: number) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Função auxiliar para formatar data
    const formatDate = (dateString: string) => {
      try {
        return new Date(dateString).toLocaleDateString('pt-BR');
      } catch {
        return dateString;
      }
    };
    
    return {
      title: currentFile.title || currentFile.displayName,
      artist: currentFile.artist || 'Artista Desconhecido',
      artwork: thumbnailUrl,
      year: (currentFile as any).year,
      genre: (currentFile as any).genre,
      label: currentFile.label,
      bpm: currentFile.bpm?.toString(),
      key: currentFile.key,
      duration: formatTime(duration),
      filename: currentFile.name,
      
      // Informações técnicas do arquivo
      fileSize: (currentFile as any).fileSize ? formatFileSize((currentFile as any).fileSize) : undefined,
      format: currentFile.name.split('.').pop()?.toLowerCase(),
      bitrate: (currentFile as any).bitrate ? `${(currentFile as any).bitrate} kbps` : undefined,
      sampleRate: (currentFile as any).sampleRate ? `${(currentFile as any).sampleRate} Hz` : undefined,
      channels: (currentFile as any).channels ? 
        ((currentFile as any).channels === 2 ? 'Estéreo' : 
         (currentFile as any).channels === 1 ? 'Mono' : 
         `${(currentFile as any).channels} canais`) : undefined,
      encoder: (currentFile as any).encoder,
      
      // Metadados adicionais
      album: (currentFile as any).album,
      track: (currentFile as any).track ? `${(currentFile as any).track}` : undefined,
      disc: (currentFile as any).disc ? `${(currentFile as any).disc}` : undefined,
      composer: (currentFile as any).composer,
      publisher: (currentFile as any).publisher,
      isrc: (currentFile as any).isrc,
      catalog: (currentFile as any).catalogNumber || (currentFile as any).catalog,
      
      // Informações de uso
      dateAdded: (currentFile as any).dateAdded ? formatDate((currentFile as any).dateAdded) : undefined,
      lastPlayed: (currentFile as any).lastPlayed ? formatDate((currentFile as any).lastPlayed) : undefined,
      playCount: (currentFile as any).playCount || 0
    };
  }, [currentFile, duration, formatTime]);

  // Não renderizar no servidor
  if (!isClient) return null;
  
  // Mostrar skeleton quando carregando ou sem arquivo
  if (!currentFile || isLoading) {
    return <SkeletonAudioPlayer variant={isMobile ? 'mobile' : 'desktop'} />;
  }

  // Renderizar erro
  if (error) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-red-900 border-t border-red-700 px-4 py-3">
        <div className="text-red-100 text-center">{error}</div>
      </div>
    );
  }

  // Não renderizar o player grande quando está minimizado
  if (playerMinimized) {
    // Renderizar apenas o player minimizado
    return (
      <>
        {/* Minimized Player */}
        {currentFile && (
          <div 
            className="fixed bottom-6 right-6 z-[100] rounded-xl shadow-2xl flex flex-col backdrop-blur-xl"
            style={{
              background: `linear-gradient(135deg, 
                ${playerDominantColor.replace('0.2', '0.4')} 0%, 
                rgba(0, 0, 0, 0.7) 70%, 
                rgba(15, 23, 42, 0.8) 100%
              )`,
              boxShadow: `0 8px 32px ${themeColors.background}, 0 2px 8px rgba(0, 0, 0, 0.3)`,
              minWidth: 260,
              pointerEvents: 'auto'
            }}
          >
            {/* Main Content */}
            <div className="flex items-center gap-3 px-3 pt-2">
              {/* Foto */}
              <div className="flex-shrink-0">
                <button onClick={handleAlbumClick} className="hover:scale-105 transition-transform duration-200">
                  {imageError ? (
                    <div className="w-[82px] h-[82px] flex items-center justify-center bg-zinc-800 rounded-lg shadow-md" style={{ marginTop: '12px' }}>
                      <svg className="w-10 h-10 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    </div>
                  ) : (
                    <ThumbnailImage
                      key={`thumbnail-minimized-${currentFile.name}`}
                      src={thumbnailUrl}
                      alt={currentFile.title || currentFile.displayName}
                      className="object-cover bg-zinc-800 rounded-lg cursor-pointer shadow-md"
                      style={{ width: 82, height: 82, marginTop: '12px' }}
                      onError={handleImageError}
                      onLoad={handleImageLoad}
                    />
                  )}
                </button>
              </div>
              
              {/* Informações */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="text-white font-bold text-sm truncate leading-tight">
                  {currentFile.title || currentFile.displayName}
                </div>
                <div className="text-xs truncate font-medium mt-0.5 flex items-center gap-2" style={{ color: themeColors.primary }}>
                  {currentFile.artist ? (
                    <button
                      type="button"
                      onClick={handleArtistClick}
                      className="truncate text-left hover:underline transition-opacity hover:opacity-80 cursor-pointer"
                      title={`Ver ${currentFile.artist} em Novidades`}
                    >
                      {currentFile.artist}
                    </button>
                  ) : '-'}
                </div>
              </div>
              
              {/* Controles */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handlePrev}
                  className="text-white player-button hover:scale-110 transition-transform duration-200"
                  style={{ color: themeColors.primaryLight }}
                  title="Música anterior"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                  </svg>
                </button>
                <button 
                  onClick={togglePlay} 
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white player-button hover:scale-110 transition-transform duration-200 shadow-md"
                  style={{ backgroundColor: themeColors.primary }}
                >
                  {isPlaying ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>
                <button
                  onClick={handleNext}
                  className="text-white player-button hover:scale-110 transition-transform duration-200"
                  style={{ color: themeColors.primaryLight }}
                  title="Próxima música"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                  </svg>
                </button>
                <button 
                  onClick={handleAddToPlaylist}
                  className="w-8 h-8 flex items-center justify-center transition-all duration-200 hover:scale-105 backdrop-blur-md hover:shadow-lg rounded-xl"
                  style={{ 
                    background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                    color: themeColors.primary,
                    border: `1px solid ${themeColors.border}`,
                    boxShadow: `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                    e.currentTarget.style.boxShadow = `0 8px 24px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`;
                  }}
                  title={isInPlaylist(currentFile.name) ? 'Remover da playlist' : 'Adicionar à playlist'}
                >
                  {isInPlaylist(currentFile.name) ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                </button>
                <div 
                  className="relative flex items-center"
                  onMouseEnter={() => setShowVolumeSlider(true)}
                  onMouseLeave={() => setShowVolumeSlider(false)}
                >
                  <button 
                    onClick={toggleMute} 
                    className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
                    style={{ color: isMuted ? 'rgb(239, 68, 68)' : themeColors.primaryLight }}
                    title={isMuted ? 'Desmutar' : 'Mutar'}
                  >
                    {isMuted || volume === 0 ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                      </svg>
                    )}
                  </button>
                  {showVolumeSlider && (
                    <div 
                      className="absolute bottom-full left-1/2 px-1 py-3 rounded-lg backdrop-blur-xl shadow-lg border flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, 
                          ${playerDominantColor.replace('0.2', '0.3')} 0%, 
                          rgba(0, 0, 0, 0.4) 70%, 
                          rgba(15, 23, 42, 0.5) 100%
                        )`,
                        borderColor: themeColors.border,
                        height: '120px',
                        transform: 'translateX(-50%)',
                        zIndex: 1000,
                        marginBottom: '0px',
                        boxShadow: `0 4px 16px ${themeColors.background}, 0 2px 8px rgba(0, 0, 0, 0.2)`,
                        pointerEvents: 'auto'
                      }}
                      onMouseEnter={() => setShowVolumeSlider(true)}
                      onMouseLeave={() => setShowVolumeSlider(false)}
                    >
                      <div className="relative flex items-center justify-center" style={{ height: '100px', width: '16px' }}>
                        {/* Background track */}
                        <div 
                          className="absolute"
                          style={{
                            width: '2px',
                            height: '100px',
                            backgroundColor: 'rgb(63, 63, 70)',
                            borderRadius: '1px',
                            left: '50%',
                            transform: 'translateX(-50%)'
                          }}
                        />
                        {/* Progress fill */}
                        <div 
                          ref={volumeProgressFillRef}
                          className="absolute bottom-0"
                          style={{
                            width: '2px',
                            height: `${(isMuted ? 0 : volume) * 100}%`,
                            backgroundColor: themeColors.primary,
                            borderRadius: '1px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            transition: isDraggingVolumeRef.current ? 'none' : 'height 0.1s ease'
                          }}
                        />
                        {/* Slider input */}
                        <div 
                          className="absolute"
                          style={{
                            width: '100px',
                            height: '2px',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%) rotate(-90deg)',
                            transformOrigin: 'center center',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <input
                            ref={volumeSliderVerticalRef}
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={isMuted ? 0 : volume}
                            onChange={handleVolumeChange}
                            onMouseDown={handleVolumeMouseDown}
                            onMouseUp={handleVolumeMouseUp}
                            className="volume-slider-vertical"
                            style={{
                              width: '100%',
                              height: '100%',
                              color: themeColors.primary, // Verde Legolas
                              margin: 0,
                              padding: 0,
                              display: 'block',
                              accentColor: themeColors.primary // Para navegadores modernos
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => setPlayerMinimized(false)} 
                  className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
                  style={{ color: themeColors.primaryLight }}
                  title="Expandir player"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="px-3 pt-1 pb-2">
              <div 
                className="w-full h-3 cursor-pointer relative shadow-md rounded-full overflow-hidden"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  logger.debug('🎯 Progress bar clicked (minimized)', { clientX: e.clientX, duration, currentTime, isReady });
                  handleProgressClick(e);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  logger.debug('🎯 Progress bar mouse down (minimized)', { clientX: e.clientX, duration, currentTime, isReady });
                  handleProgressMouseDown(e);
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  isDraggingRef.current = true;
                  isSeekingRef.current = true;
                  
                  const touch = e.touches[0];
                  const progressElement = e.currentTarget;
                  seekToPosition(touch.clientX, progressElement);
                  
                  const handleTouchMove = (e: TouchEvent) => {
                    if (!isDraggingRef.current || e.touches.length === 0) return;
                    e.preventDefault();
                    const touch = e.touches[0];
                    seekToPosition(touch.clientX, progressElement);
                  };
                  
                  const handleTouchEnd = (e: TouchEvent) => {
                    e.preventDefault();
                    
                    isDraggingRef.current = false;
                    
                    document.removeEventListener('touchmove', handleTouchMove);
                    document.removeEventListener('touchend', handleTouchEnd);
                    
                    setTimeout(() => {
                      isSeekingRef.current = false;
                    }, 300);
                  };
                  
                  document.addEventListener('touchmove', handleTouchMove, { passive: false });
                  document.addEventListener('touchend', handleTouchEnd);
                }}
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.4)',
                  zIndex: 10
                }}
              >
                <div 
                  className="h-full transition-all duration-100 relative pointer-events-none"
                  style={{ 
                    width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                    backgroundColor: themeColors.primary,
                    boxShadow: `inset 0 1px 1px rgba(0,0,0,0.2)`
                  }}
                >
                  {/* Progress Thumb */}
                  <div
                    className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow-lg transition-all duration-100 border border-white/30 pointer-events-none"
                    style={{
                      backgroundColor: themeColors.primary,
                      opacity: duration > 0 ? 1 : 0,
                      boxShadow: `0 1px 4px rgba(0,0,0,0.4), 0 0 0 1px ${themeColors.primary}60`
                    }}
                  />
                </div>
              </div>
              {/* Tempo da música */}
              <div className="flex justify-between items-center mt-1 text-zinc-300 text-[11px] font-medium tabular-nums">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Album Modal */}
        {showAlbumModal && getAlbumData() && (
          <AlbumModal
            isOpen={showAlbumModal}
            onClose={() => setShowAlbumModal(false)}
            albumData={getAlbumData()!}
            themeColors={themeColors}
            currentFile={currentFile}
            onSave={() => {
              // Recarregar dados após salvar
              // O contexto de arquivos será atualizado automaticamente quando necessário
            }}
          />
        )}

        {/* Music Study Modal */}
        <MusicStudyModal
          isOpen={showMusicStudyModal}
          onClose={() => setShowMusicStudyModal(false)}
        />
      </>
    );
  }

  return (
    <>
      <div 
        className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl transition-all duration-300"
        style={{
          background: currentFile 
            ? `linear-gradient(135deg, 
                ${playerDominantColor.replace('0.2', '0.4')} 0%, 
                rgba(0, 0, 0, 0.7) 70%, 
                rgba(15, 23, 42, 0.8) 100%
              )`
            : `linear-gradient(135deg, 
                rgba(0, 0, 0, 0.3) 0%, 
                rgba(0, 0, 0, 0.5) 100%
              )`,
        }}
      >
        {/* Desktop Layout */}
        <div className="hidden sm:flex flex-col px-6 py-3 relative" style={{ height: 90 }}>
          <div 
            className="absolute inset-0 rounded-lg overflow-hidden backdrop-blur-md flex items-center justify-center" 
            style={{ 
              background: `rgba(0, 0, 0, 0.2)`,
              boxShadow: `0 4px 16px ${themeColors.background}, inset 0 1px 0 rgba(255, 255, 255, 0.05)`
            }}
          >
            <div ref={waveformDesktopRef} className="w-full" style={{ height: 70, minHeight: 70, minWidth: 100 }} />
            {!isWaveReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <LoadingSpinner size="lg" themeColors={themeColors} isLoading={!isWaveReady} />
              </div>
            )}
            
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 rounded-lg backdrop-blur-sm">
                <LoadingSpinner size="md" themeColors={themeColors} isLoading={isLoading} />
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="absolute left-0 right-0 z-30" style={{ top: '-8px' }}>
            <div 
              className="w-full h-4 cursor-pointer relative shadow-lg backdrop-blur-sm py-1"
              onClick={handleProgressClick}
              onMouseDown={handleProgressMouseDown}
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                borderColor: 'rgba(255, 255, 255, 0.2)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 3px rgba(0, 0, 0, 0.4)'
              }}
            >
              <div 
                className="h-full transition-all duration-100 relative shadow-inner"
                style={{ 
                  width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                  backgroundColor: themeColors.primary,
                  boxShadow: `inset 0 1px 2px rgba(0,0,0,0.3), 0 1px 2px ${themeColors.primary}30`
                }}
              >
                {/* Progress Thumb */}
                <div  
                  className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full shadow-lg transition-all duration-100 border-2 border-white/20"
                  style={{ 
                    backgroundColor: themeColors.primary,
                    opacity: duration > 0 ? 1 : 0,
                    boxShadow: `0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px ${themeColors.primary}80`
                  }}
                />
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-center px-4 py-2" style={{ height: 90 }}>
            <div className="w-full max-w-7xl flex items-center">
            {/* Foto do álbum */}
            <div className="flex-shrink-0">
              <button onClick={handleAlbumClick} className="hover:scale-105 transition-transform duration-200">
                {imageError ? (
                  <div className="w-[82px] h-[82px] flex items-center justify-center bg-zinc-800 rounded-lg shadow-lg" style={{ marginTop: '12px' }}>
                    <svg className="w-10 h-10 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                ) : (
                  <ThumbnailImage
                    key={`thumbnail-desktop-main-${currentFile.name}`}
                    src={thumbnailUrl}
                    alt={currentFile.title || currentFile.displayName}
                    className="object-cover bg-zinc-800 rounded-lg cursor-pointer shadow-lg"
                    style={{ width: 82, height: 82, marginTop: '12px' }}
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                  />
                )}
              </button>
            </div>

            {/* Informações da música */}
            <div className="flex-1 px-4 min-w-0 flex flex-col justify-center">
              <div className="text-white font-bold text-lg leading-tight truncate">
                {currentFile.title || currentFile.displayName}
              </div>
              <div className="text-base truncate font-medium mt-0.5 flex items-center gap-2" style={{ color: themeColors.primary }}>
                {currentFile.artist ? (
                  <button
                    type="button"
                    onClick={handleArtistClick}
                    className="truncate text-left hover:underline transition-opacity hover:opacity-80 cursor-pointer"
                    title={`Ver ${currentFile.artist} em Novidades`}
                  >
                    {currentFile.artist}
                  </button>
                ) : '-'}
              </div>
              <div className="flex items-center gap-3 mt-1">
                {currentFile.bpm && (
                  <span 
                    className="px-2 py-0.5 rounded text-xs font-bold border"
                    style={{ 
                      backgroundColor: themeColors.background,
                      color: themeColors.primary,
                      borderColor: themeColors.border
                    }}
                  >
                    {currentFile.bpm} bpm
                  </span>
                )}
                {currentFile.key && (
                  <span 
                    className="px-2 py-0.5 rounded text-xs font-bold border"
                    style={{ 
                      backgroundColor: themeColors.background,
                      color: themeColors.primary,
                      borderColor: themeColors.border
                    }}
                  >
                    {currentFile.key}
                  </span>
                )}
                <div className="flex gap-1 text-zinc-100 text-sm font-semibold">
                  <span>{formatTime(currentTime)}</span>
                  <span>/</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>

            {/* Controles de reprodução */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                onClick={handlePrev}
                className="text-white player-button hover:scale-110 transition-transform duration-200"
                style={{ color: themeColors.primaryLight }}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
              </button>

              <button 
                onClick={togglePlay} 
                className="w-12 h-12 rounded-full flex items-center justify-center text-white player-button hover:scale-110 transition-transform duration-200 shadow-lg"
                style={{ backgroundColor: themeColors.primary }}
              >
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                ) : (
                  <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>

              <button
                onClick={handleNext}
                className="text-white player-button hover:scale-110 transition-transform duration-200"
                style={{ color: themeColors.primaryLight }}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </button>
            </div>

            {/* Controles de volume */}
            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
              <button 
                onClick={toggleMute} 
                className="text-zinc-400 player-button hover:scale-110 transition-transform duration-200"
                style={{ color: isMuted ? 'rgb(239, 68, 68)' : themeColors.primaryLight }}
              >
                {isMuted || volume === 0 ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                )}
              </button>
              <input
                ref={volumeSliderHorizontalRef}
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                onMouseDown={handleVolumeMouseDown}
                onMouseUp={handleVolumeMouseUp}
                className="w-20 audio-slider"
                style={{
                  color: themeColors.primary,
                  background: `linear-gradient(to right, ${themeColors.primary} 0%, ${themeColors.primary} ${(isMuted ? 0 : volume) * 100}%, rgb(63, 63, 70) ${(isMuted ? 0 : volume) * 100}%, rgb(63, 63, 70) 100%)`,
                  transition: isDraggingVolumeRef.current ? 'none' : 'background 0.1s ease'
                }}
              />
            </div>

            {/* Botão adicionar à playlist */}
            <div className="flex-shrink-0 ml-3">
              <button 
                onClick={handleAddToPlaylist}
                className="w-8 h-8 flex items-center justify-center transition-all duration-200 hover:scale-105 backdrop-blur-md hover:shadow-lg rounded-xl"
                style={{ 
                  background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                  color: themeColors.primary,
                  border: `1px solid ${themeColors.border}`,
                  boxShadow: `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                  e.currentTarget.style.boxShadow = `0 8px 24px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`;
                }}
                title={isInPlaylist(currentFile.name) ? 'Remover da playlist' : 'Adicionar à playlist'}
              >
                {isInPlaylist(currentFile.name) ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
              </button>
            </div>

            {/* Botão análise de música */}
            <div className="flex-shrink-0 ml-3">
              <button 
                onClick={handleMusicStudyClick}
                className="w-8 h-8 flex items-center justify-center transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
                style={{ 
                  color: themeColors.primaryLight,
                  backgroundColor: 'transparent'
                }}
                title="Análise de Música Eletrônica"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>
            </div>

            {/* Botão minimizar */}
            <div className="flex-shrink-0 ml-3">
              <button 
                onClick={() => setPlayerMinimized(true)} 
                className="w-8 h-8 flex items-center justify-center transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
                style={{ color: themeColors.primaryLight }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="5" y="17" width="14" height="2" rx="1" fill="currentColor" />
                </svg>
              </button>
            </div>
            </div>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="flex sm:hidden justify-center p-3">
          <div className="w-full max-w-7xl flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <button onClick={handleAlbumClick} className="hover:scale-105 transition-transform duration-200">
                {imageError ? (
                  <div className="w-[82px] h-[82px] flex items-center justify-center bg-zinc-800 rounded-lg shadow-lg" style={{ marginTop: '12px' }}>
                    <svg className="w-10 h-10 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                ) : (
                  <ThumbnailImage
                    key={`thumbnail-mobile-${currentFile.name}`}
                    src={thumbnailUrl}
                    alt={currentFile.title || currentFile.displayName}
                    className="object-cover bg-zinc-800 rounded-lg cursor-pointer shadow-lg"
                    style={{ width: 82, height: 82, marginTop: '12px' }}
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                  />
                )}
              </button>
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="text-white font-bold text-base leading-tight truncate">
                {currentFile.title || currentFile.displayName}
              </div>
              <div className="text-sm truncate font-medium mt-0.5 flex items-center gap-2" style={{ color: themeColors.primary }}>
                {currentFile.artist ? (
                  <button
                    type="button"
                    onClick={handleArtistClick}
                    className="truncate text-left hover:underline transition-opacity hover:opacity-80 cursor-pointer"
                    title={`Ver ${currentFile.artist} em Novidades`}
                  >
                    {currentFile.artist}
                  </button>
                ) : '-'}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {currentFile.bpm && (
                  <span 
                    className="px-1.5 py-0.5 rounded-md text-xs font-bold border"
                    style={{ 
                      backgroundColor: themeColors.background,
                      color: themeColors.primary,
                      borderColor: themeColors.border
                    }}
                  >
                    {currentFile.bpm} bpm
                  </span>
                )}
                {currentFile.key && (
                  <span 
                    className="px-1.5 py-0.5 rounded-md text-xs font-bold border"
                    style={{ 
                      backgroundColor: themeColors.background,
                      color: themeColors.primary,
                      borderColor: themeColors.border
                    }}
                  >
                    {currentFile.key}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col">
            <div 
              className="w-full rounded-xl overflow-hidden relative backdrop-blur-sm shadow-lg" 
              style={{ 
                height: 80, 
                minHeight: 80,
                background: `rgba(0, 0, 0, 0.2)`
              }}
            >
              <div ref={waveformMobileRef} className="w-full h-full" style={{ minHeight: 80, minWidth: 100 }} />
              {!isWaveReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <LoadingSpinner size="lg" themeColors={themeColors} isLoading={!isWaveReady} />
                </div>
              )}
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10 rounded-xl backdrop-blur-sm">
                  <LoadingSpinner size="md" themeColors={themeColors} isLoading={isLoading} />
                </div>
              )}
              
              {/* Mobile Progress Overlay */}
              <div className="absolute bottom-3 left-3 right-3 z-30">
                <div 
                  className="w-full h-6 cursor-pointer rounded-full relative shadow-lg backdrop-blur-sm border-2 py-2"
                  onClick={handleProgressClick}
                  onMouseDown={handleProgressMouseDown}
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 3px rgba(0, 0, 0, 0.4)'
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                                          // Touch start no progresso
                    
                    isDraggingRef.current = true;
                    isSeekingRef.current = true;
                    
                    const touch = e.touches[0];
                    const progressElement = e.currentTarget;
                    seekToPosition(touch.clientX, progressElement);
                    
                    const handleTouchMove = (e: TouchEvent) => {
                      if (!isDraggingRef.current || e.touches.length === 0) return;
                      e.preventDefault();
                      const touch = e.touches[0];
                      seekToPosition(touch.clientX, progressElement);
                    };
                    
                    const handleTouchEnd = (e: TouchEvent) => {
                                              // Touch end no progresso
                      e.preventDefault();
                      
                      isDraggingRef.current = false;
                      
                      document.removeEventListener('touchmove', handleTouchMove);
                      document.removeEventListener('touchend', handleTouchEnd);
                      
                      setTimeout(() => {
                        isSeekingRef.current = false;
                        // TOUCH FINALIZADO - liberando handleTimeUpdate
                      }, 300);
                    };
                    
                    document.addEventListener('touchmove', handleTouchMove, { passive: false });
                    document.addEventListener('touchend', handleTouchEnd);
                  }}
                >
                  <div 
                    className="h-full rounded-full transition-all duration-100 relative shadow-inner"
                    style={{ 
                      width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                      backgroundColor: themeColors.primary,
                      boxShadow: `inset 0 1px 2px rgba(0,0,0,0.3), 0 1px 2px ${themeColors.primary}30`
                    }}
                  >
                    {/* Mobile Progress Thumb */}
                    <div 
                      className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-lg transition-all duration-100 border-2 border-white/20"
                      style={{ 
                        backgroundColor: themeColors.primary,
                        opacity: duration > 0 ? 1 : 0,
                        boxShadow: `0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px ${themeColors.primary}80`
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-between w-full text-xs text-zinc-100 mt-2 font-semibold">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            {/* Controles de reprodução */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                className="text-white player-button hover:scale-110 transition-transform duration-200"
                style={{ color: themeColors.primaryLight }}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
              </button>

              <button 
                onClick={togglePlay} 
                className="w-12 h-12 rounded-full flex items-center justify-center text-white player-button hover:scale-110 transition-transform duration-200 shadow-lg mx-2"
                style={{ backgroundColor: themeColors.primary }}
              >
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                ) : (
                  <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>

              <button
                onClick={handleNext}
                className="text-white player-button hover:scale-110 transition-transform duration-200"
                style={{ color: themeColors.primaryLight }}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </button>
            </div>

            {/* Botão adicionar à playlist */}
            <button 
              onClick={handleAddToPlaylist}
              className="w-9 h-9 flex items-center justify-center transition-all duration-200 hover:scale-105 backdrop-blur-md hover:shadow-lg rounded-xl"
              style={{ 
                background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
                color: themeColors.primary,
                border: `1px solid ${themeColors.border}`,
                boxShadow: `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                e.currentTarget.style.boxShadow = `0 8px 24px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`;
              }}
              title={isInPlaylist(currentFile.name) ? 'Remover da playlist' : 'Adicionar à playlist'}
            >
              {isInPlaylist(currentFile.name) ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )}
            </button>

            {/* Botão análise de música */}
            <button 
              onClick={handleMusicStudyClick}
              className="w-9 h-9 flex items-center justify-center transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
              style={{ 
                color: themeColors.primaryLight,
                backgroundColor: 'transparent'
              }}
              title="Análise de Música Eletrônica"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>

            {/* Botão minimizar */}
            <button 
              onClick={() => setPlayerMinimized(true)} 
              className="w-9 h-9 flex items-center justify-center transition-colors rounded-full hover:bg-zinc-800/50 hover:scale-110 duration-200"
              style={{ color: themeColors.primaryLight }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="5" y="17" width="14" height="2" rx="1" fill="currentColor" />
              </svg>
            </button>
          </div>
          </div>
        </div>
      </div>

      {/* Album Modal */}
      {showAlbumModal && getAlbumData() && (
        <AlbumModal
          isOpen={showAlbumModal}
          onClose={() => setShowAlbumModal(false)}
          albumData={getAlbumData()!}
          themeColors={themeColors}
          currentFile={currentFile}
          onSave={() => {
            // Recarregar dados após salvar
            // O contexto de arquivos será atualizado automaticamente quando necessário
          }}
        />
      )}

      {/* Music Study Modal */}
      <MusicStudyModal
        isOpen={showMusicStudyModal}
        onClose={() => setShowMusicStudyModal(false)}
      />
    </>
  );
} 