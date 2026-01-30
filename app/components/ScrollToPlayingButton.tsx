'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePlayer } from '../contexts/PlayerContext';
import { useUI } from '../contexts/UIContext';
import { useFile } from '../contexts/FileContext';
import SoundWave from './SoundWave';

export default function ScrollToPlayingButton() {
  const { playerState } = usePlayer();
  const { playerMinimized } = useUI();
  const { files } = useFile();
  const [isVisible, setIsVisible] = useState(false);

  // Verificar se o elemento atual está visível na viewport
  useEffect(() => {
    if (!playerState.currentFile) {
      setIsVisible(false);
      return;
    }

    let timeoutId: NodeJS.Timeout | null = null;
    let rafId: number | null = null;
    let initialCheck: NodeJS.Timeout | null = null;

    const checkVisibility = () => {
      const currentFileName = playerState.currentFile!.name;
      const playingElement = document.querySelector(`[data-file-name="${CSS.escape(currentFileName)}"]`);
      
      if (!playingElement) {
        setIsVisible(true); // Mostrar botão se elemento não existe (está fora da view)
        return;
      }

      const rect = playingElement.getBoundingClientRect();
      
      // Verificar se o elemento está visível na viewport do usuário
      // Considerar o espaço ocupado pelo player na parte inferior
      // Player completo: ~90px, Player minimizado: ~96px (72px altura + 24px bottom-6)
      const playerHeight = playerMinimized ? 96 : 90;
      const viewportTop = 0;
      const viewportBottom = window.innerHeight - playerHeight;
      
      // Verificar se o elemento está completamente dentro da viewport visível
      // Usar uma margem de segurança
      const margin = 100; // pixels de margem
      
      // Elemento está bem visível se está completamente dentro da área visível com margem
      const isWellVisible = 
        rect.top >= viewportTop + margin && 
        rect.bottom <= viewportBottom - margin &&
        rect.left >= margin &&
        rect.right <= window.innerWidth - margin;
      
      // Mostrar botão quando o elemento NÃO está bem visível
      // isVisible = true significa mostrar o botão (elemento não está bem visível)
      setIsVisible(!isWellVisible);
    };

    // Verificar imediatamente e depois com delays para garantir que o DOM foi atualizado
    checkVisibility(); // Verificação imediata
    
    initialCheck = setTimeout(() => {
      checkVisibility();
      // Verificar novamente após um pequeno delay para garantir
      setTimeout(() => {
        checkVisibility();
      }, 300);
    }, 200);
    
    // Verificar quando o scroll muda (com throttle usando requestAnimationFrame)
    const handleScroll = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        checkVisibility();
      });
    };

    // Verificar quando a janela é redimensionada
    const handleResize = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        checkVisibility();
      }, 150);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (initialCheck) {
        clearTimeout(initialCheck);
      }
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [playerState.currentFile?.name, playerMinimized, playerState.isPlaying]);

  const scrollToPlaying = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!playerState.currentFile) {
      return;
    }

    // Encontrar o container scrollável do FileList - precisa pegar o que está VISÍVEL
    // Existem dois containers com o mesmo ID (mobile e desktop), precisamos pegar o visível
    const allContainers = document.querySelectorAll('#file-list-scroll-container');
    let scrollContainer: HTMLElement | null = null;
    
    // Encontrar o container que está visível (tem altura > 0)
    for (const container of allContainers) {
      const htmlContainer = container as HTMLElement;
      const style = window.getComputedStyle(htmlContainer);
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
      
      if (isVisible && htmlContainer.clientHeight > 0 && htmlContainer.scrollHeight > 0) {
        scrollContainer = htmlContainer;
        break;
      }
    }
    
    if (!scrollContainer) {
      console.error('❌ Container scrollável visível não encontrado');
      return;
    }

    // TESTE: Forçar scrollTop para verificar se estamos no elemento correto
    // scrollContainer.scrollTop = 600;
    // console.log('🧪 Teste: scrollTop forçado para 0. Container:', scrollContainer);
    // console.log('📊 Container info:', {
    //   scrollHeight: scrollContainer.scrollHeight,
    //   clientHeight: scrollContainer.clientHeight,
    //   scrollTop: scrollContainer.scrollTop,
    //   className: scrollContainer.className
    // });

    // Encontrar o índice da música atual na lista
    const currentFileIndex = files.findIndex(file => file.name === playerState.currentFile?.name);
    if (currentFileIndex === -1) {
      return;
    }
    
    // Encontrar o elemento usando data-index
    const element = document.querySelector(`[data-index="${currentFileIndex}"]`) as HTMLElement;
    if (!element) {
      return;
    }
    
    const elementOffset = element.offsetTop;
    const elementHeight = element.offsetHeight || 168;

    const containerHeight = scrollContainer.clientHeight;
    const playerHeight = playerMinimized ? 96 : 90;

    // área realmente visível
    const visibleHeight = containerHeight - playerHeight;

    // centralizar dentro da área visível
    const targetScroll =
      elementOffset - (visibleHeight / 2) + (elementHeight / 2);

    // limite correto
    const maxScroll =
      scrollContainer.scrollHeight - visibleHeight;

    const finalScroll =
      Math.max(0, Math.min(targetScroll, maxScroll));

    scrollContainer.scrollTo({
      top: finalScroll,
      behavior: 'smooth'
    });
    
    // Highlight visual
    const originalOutline = element.style.outline;
    const originalOutlineOffset = element.style.outlineOffset;
    element.style.outline = '3px solid rgb(16, 185, 129)';
    element.style.outlineOffset = '4px';
    element.style.transition = 'outline 0.3s ease';
    
    setTimeout(() => {
      element.style.outline = originalOutline;
      element.style.outlineOffset = originalOutlineOffset;
    }, 2000);
  }, [playerState.currentFile, playerMinimized, files]);

  // Não mostrar se não há música tocando
  if (!playerState.currentFile) {
    return null;
  }

  // Mostrar botão quando a música não está visível pelo usuário
  // isVisible = true significa que o elemento NÃO está visível, então mostrar o botão
  if (!isVisible) {
    return null;
  }

  // Posicionamento baseado no estado do player
  // Player minimizado: bottom-6 right-6 (24px do bottom), altura aproximada ~72px
  //   Player está em: bottom-6 (24px) + altura (~72px) = até ~96px do bottom
  //   Botão (48px altura) precisa estar acima: 96px + 24px (espaço) = ~120px = bottom-30
  // Player completo: bottom-0, altura 90px no desktop
  //   Botão precisa estar acima: 90px + 16px (espaço) = ~106px = bottom-26
  // Usar bottom-32 (128px) para minimizado e bottom-28 (112px) para completo
  const bottomOffset = playerMinimized 
    ? 'bottom-32' // ~128px (8rem) - bem acima do player minimizado
    : 'bottom-28'; // ~112px (7rem) - acima do player completo

  // Cores do tema (emerald padrão)
  const themeColors = {
    primary: 'rgb(16, 185, 129)',
    primaryLight: 'rgba(16, 185, 129, 0.9)',
    primaryDark: 'rgba(16, 185, 129, 0.7)',
    background: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)'
  };

  const isLoading = playerState.isLoading;

  return (
    <button
      type="button"
      onClick={scrollToPlaying}
      className={`fixed ${bottomOffset} right-6 z-[101] w-12 h-12 rounded-xl flex items-center justify-center 
        transition-all duration-200 hover:scale-105 backdrop-blur-md hover:shadow-lg cursor-pointer
        md:right-6 sm:right-4`}
      style={{
        background: `linear-gradient(135deg, ${themeColors.background} 0%, ${themeColors.background.replace('0.15', '0.25')} 100%)`,
        color: themeColors.primary,
        border: `1px solid ${themeColors.border}`,
        boxShadow: `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`,
        pointerEvents: 'auto',
        zIndex: 101
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
        e.currentTarget.style.boxShadow = `0 8px 24px ${themeColors.primary}30, inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        e.currentTarget.style.boxShadow = `0 4px 12px ${themeColors.primary}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`;
      }}
      title="Rolar para a música atual"
      aria-label="Rolar para a música atual"
    >
      <div style={{ pointerEvents: 'none' }}>
        <SoundWave 
          color={themeColors.primary}
          size="small"
          isPlaying={true}
          isLoading={isLoading}
        />
      </div>
    </button>
  );
}
