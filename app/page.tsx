"use client";

import DownloadForm from './components/DownloadForm';
import FileList from './components/FileList';
import dynamic from 'next/dynamic';
import { safeSetItem, safeGetItem } from './utils/localStorage';

const AudioPlayer = dynamic(() => import('./components/AudioPlayer'), {
  ssr: false,
  loading: () => null
});
const ArtistFeed = dynamic(() => import('./components/ArtistFeed'), {
  ssr: false,
  loading: () => null
});
import BeatportModal from './components/BeatportModal';
import BeatportDownloaderModal from './components/BeatportDownloaderModal';
import SettingsModal from './components/SettingsModal';
import FloatingPlaylistButton from './components/FloatingPlaylistButton';
import ScrollToPlayingButton from './components/ScrollToPlayingButton';
import DownloadQueue from './components/DownloadQueue';
import MidiPackExportIndicator from './components/MidiPackExportIndicator';
import QuickPlaylistPanel from './components/QuickPlaylistPanel';
import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { useUI } from './contexts/UIContext';
import { FOCUS_ARTIST_EVENT } from './utils/focusArtist';

const STORAGE_KEY_PAGE_STATE = 'legolas-page-state';

// Encontra o elemento que realmente rola dentro de um wrapper de aba. Pode ser o
// próprio wrapper (caso de Novidades) ou um descendente com overflow — a Biblioteca,
// por exemplo, rola no seu #file-list-scroll-container interno, não no wrapper.
function findTabScroller(wrapper: HTMLElement | null): HTMLElement | null {
  if (!wrapper) return null;
  if (wrapper.scrollHeight > wrapper.clientHeight + 1) return wrapper;
  const candidates = wrapper.querySelectorAll<HTMLElement>('.overflow-y-auto');
  for (const el of Array.from(candidates)) {
    // Só o descendente visível que de fato rola (ignora dropdowns/listas pequenas).
    if (el.offsetParent !== null && el.scrollHeight > el.clientHeight + 1) return el;
  }
  return wrapper;
}

interface SavedPageState {
  downloadFormMinimized: boolean;
  showQueue: boolean;
  beatportModalOpen: boolean;
  beatportDownloaderModalOpen: boolean;
  settingsModalOpen: boolean;
}

export default function Home() {
  // Inicializar estados com valores padrão (para evitar hydration mismatch)
  // Os valores salvos serão carregados no useEffect após montagem
  const [beatportModalOpen, setBeatportModalOpen] = useState(false);
  const [beatportDownloaderModalOpen, setBeatportDownloaderModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const { playerOpen, playerMinimized, setPlayerMinimized } = useUI();
  const [downloadFormMinimized, setDownloadFormMinimized] = useState(true);
  const [showQueue, setShowQueue] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [view, setView] = useState<'library' | 'feed'>('library');

  // O player segue a aba ativa: maximizado na Biblioteca (com waveform), minimizado em
  // Novidades (onde se toca apenas prévias). Roda só quando a aba muda, então um
  // minimizar/maximizar manual dentro da mesma aba continua sendo respeitado.
  useEffect(() => {
    setPlayerMinimized(view === 'feed');
  }, [view, setPlayerMinimized]);

  // Ao voltar para a aba Biblioteca, atualizar a lista com os últimos downloads.
  // A Biblioteca fica sempre montada (escondida via display:none), então sem isso ela
  // ficaria com um snapshot antigo. Dispara um refresh sem spinner (atualização
  // incremental). O carregamento inicial já é feito pelo FileContext, então pulamos
  // a primeira montagem para não buscar duas vezes.
  const didInitLibraryRefresh = useRef(false);
  useEffect(() => {
    if (view !== 'library') return;
    if (!didInitLibraryRefresh.current) {
      didInitLibraryRefresh.current = true;
      return;
    }
    window.dispatchEvent(new CustomEvent('refresh-files', { detail: { skipLoading: true } }));
  }, [view]);

  // Preservar a posição de scroll de cada aba ao alternar entre elas. Cada aba tem o
  // seu próprio container de scroll; salvamos o scrollTop ao sair e restauramos ao voltar.
  const libScrollRef = useRef<HTMLDivElement>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const scrollPos = useRef<{ library: number; feed: number }>({ library: 0, feed: 0 });
  // Novidades só monta na 1ª vez que é aberta (mantém o carregamento sob demanda);
  // depois fica montada (oculta via display) para preservar scroll e estado.
  const [feedMounted, setFeedMounted] = useState(false);
  useEffect(() => { if (view === 'feed') setFeedMounted(true); }, [view]);

  const switchView = useCallback((next: 'library' | 'feed') => {
    if (next === view) return;
    // Salva a posição do scroller real da aba que está saindo (enquanto visível).
    const cur = findTabScroller(view === 'library' ? libScrollRef.current : feedScrollRef.current);
    if (cur) scrollPos.current[view] = cur.scrollTop;
    setView(next);
  }, [view]);

  // Atalho "ver artista em Novidades" (disparado do player, da Biblioteca, etc.):
  // basta trazer a aba para Novidades — o ArtistFeed cuida do foco/álbum.
  useEffect(() => {
    const goToFeed = () => switchView('feed');
    window.addEventListener(FOCUS_ARTIST_EVENT, goToFeed);
    return () => window.removeEventListener(FOCUS_ARTIST_EVENT, goToFeed);
  }, [switchView]);

  // Restaura o scroll da aba recém-ativada (após o DOM atualizar, antes da pintura,
  // evitando o "pulo" visível). Um rAF como rede de segurança caso o navegador
  // zere o scrollTop do container interno ao reexibi-lo (display none -> block).
  useLayoutEffect(() => {
    const apply = () => {
      const el = findTabScroller(view === 'library' ? libScrollRef.current : feedScrollRef.current);
      if (el) el.scrollTop = scrollPos.current[view];
    };
    apply();
    const raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [view, feedMounted]);

  // Carregar estados salvos do localStorage após montagem (client-side only)
  useEffect(() => {
    const saved = safeGetItem<SavedPageState>(STORAGE_KEY_PAGE_STATE);
    if (saved) {
      setBeatportModalOpen(saved.beatportModalOpen);
      setBeatportDownloaderModalOpen(saved.beatportDownloaderModalOpen);
      setSettingsModalOpen(saved.settingsModalOpen);
      setDownloadFormMinimized(saved.downloadFormMinimized);
      setShowQueue(saved.showQueue);
    }
    setIsInitialized(true);
  }, []);

  // Salvar estados no localStorage quando mudarem (após inicialização)
  // Usar debounce para evitar salvamentos excessivos
  useEffect(() => {
    if (!isInitialized) return;
    
    const timeoutId = setTimeout(() => {
      try {
        const state: SavedPageState = {
          downloadFormMinimized,
          showQueue,
          beatportModalOpen,
          beatportDownloaderModalOpen,
          settingsModalOpen
        };
        safeSetItem(STORAGE_KEY_PAGE_STATE, state, {
          maxSize: 10 * 1024, // 10KB máximo
          onError: (err) => {
            console.warn('⚠️ Erro ao salvar estado da página:', err.message);
          }
        });
      } catch (err) {
        console.warn('Erro ao salvar estado da página:', err);
      }
    }, 300); // Debounce de 300ms
    
    return () => clearTimeout(timeoutId);
  }, [downloadFormMinimized, showQueue, beatportModalOpen, beatportDownloaderModalOpen, settingsModalOpen, isInitialized]);
  
  return (
    <>
      {/* Botão flutuante para rolar até a música atual */}
      <ScrollToPlayingButton />
      <div className="min-h-screen bg-black text-white overflow-hidden">
      <div className="flex flex-col h-screen">

        {/* Motor de busca/download - fixo no topo */}
        <div className="flex-shrink-0 mx-auto w-full">
          <DownloadForm 
            minimized={downloadFormMinimized} 
            setMinimized={setDownloadFormMinimized}
            showQueue={showQueue}
            setShowQueue={setShowQueue}
            setSettingsModalOpen={setSettingsModalOpen}
          />
        </div>

        {/* Abas: Biblioteca | Novidades */}
        <div className="flex-shrink-0 max-w-7xl mx-auto w-full px-6 md:px-4 sm:px-3">
          <div className="flex items-center gap-1 border-b border-white/10">
            {([
              { key: 'library', label: 'Biblioteca' },
              { key: 'feed', label: 'Novidades' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => switchView(tab.key)}
                className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                  view === tab.key
                    ? 'text-white border-emerald-500'
                    : 'text-zinc-400 border-transparent hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Container da lista - ocupa todo espaço disponível menos o player */}
        <div className="flex-1 min-h-0 max-w-7xl mx-auto w-full px-6 md:px-4 sm:px-3 overflow-hidden">
          <div
            ref={libScrollRef}
            className="h-full overflow-y-auto pb-[200px] sm:pb-[90px]"
            style={{ display: view === 'library' ? 'block' : 'none' }}
          >
            <FileList />
          </div>
          {feedMounted && (
            <div
              ref={feedScrollRef}
              className="h-full overflow-y-auto pb-[200px] sm:pb-[90px]"
              style={{ display: view === 'feed' ? 'block' : 'none' }}
            >
              <ArtistFeed />
            </div>
          )}
        </div>

        {/* Player de áudio - sempre visível (fixo na parte inferior) */}
        <AudioPlayer />
      </div>
      
      {/* Botão flutuante com melhor posicionamento */}
      <div className="fixed bottom-8 left-8 z-[60] md:bottom-6 md:left-6 sm:bottom-4 sm:left-4">
        <FloatingPlaylistButton />
      </div>

      {/* Fila de downloads */}
      {showQueue && <DownloadQueue onClose={() => setShowQueue(false)} />}

      <MidiPackExportIndicator />

      <BeatportModal isOpen={beatportModalOpen} onClose={() => setBeatportModalOpen(false)} />
      <BeatportDownloaderModal isOpen={beatportDownloaderModalOpen} onClose={() => setBeatportDownloaderModalOpen(false)} />
      <SettingsModal isOpen={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} />
    </div>
    </>
  );
}
