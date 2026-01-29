'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePlayer } from '../contexts/PlayerContext';
import { useUI } from '../contexts/UIContext';
import SoundWave from './SoundWave';

export default function ScrollToPlayingButton() {
  const { playerState } = usePlayer();
  const { playerMinimized } = useUI();
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
    
    console.log('🎯 Botão clicado!');
    
    if (!playerState.currentFile) {
      console.warn('❌ Nenhuma música atual');
      return;
    }

    const currentFileName = playerState.currentFile.name;
    console.log('🎵 Música atual:', currentFileName);
    
    // Função para encontrar o container scrollável correto
    // O scroll real está em um div com overflow-y-auto dentro do FileList
    const findScrollContainer = (element: HTMLElement): HTMLElement | null => {
      console.log('🔍 Buscando container scrollável para elemento:', {
        element,
        className: element.className,
        parent: element.parentElement?.className
      });
      
      // Estratégia 1: Procurar subindo na árvore DOM primeiro (mais confiável)
      let parent = element.parentElement;
      let depth = 0;
      const maxDepth = 20;
      
      while (parent && parent !== document.body && depth < maxDepth) {
        const htmlParent = parent as HTMLElement;
        const style = window.getComputedStyle(htmlParent);
        const overflowY = style.overflowY;
        const overflow = style.overflow;
        const hasScrollStyle = (overflowY === 'auto' || overflowY === 'scroll' || overflow === 'auto' || overflow === 'scroll');
        
        // Verificar se tem as classes esperadas OU se tem overflow scrollável
        const hasCustomScroll = htmlParent.classList.contains('custom-scroll-square');
        const hasOverflowAuto = htmlParent.classList.contains('overflow-y-auto');
        const hasFlex1 = htmlParent.classList.contains('flex-1');
        
        if (hasScrollStyle || hasCustomScroll || hasOverflowAuto) {
          const scrollHeight = htmlParent.scrollHeight;
          const clientHeight = htmlParent.clientHeight;
          const display = style.display;
          const visibility = style.visibility;
          const isVisible = display !== 'none' && visibility !== 'hidden';
          
          console.log(`🔍 Verificando parent nível ${depth}:`, {
            tagName: htmlParent.tagName,
            className: htmlParent.className,
            overflowY,
            overflow,
            scrollHeight,
            clientHeight,
            display,
            visibility,
            isVisible,
            isScrollable: scrollHeight > clientHeight + 5,
            hasCustomScroll,
            hasOverflowAuto,
            hasFlex1
          });
          
          // Aceitar container se:
          // 1. Tem scrollHeight maior que clientHeight (é scrollável)
          // 2. OU tem as classes corretas E está visível (pode ter scrollHeight 0 se ainda não renderizou)
          if (scrollHeight > clientHeight + 5) {
            console.log('✅ Container scrollável encontrado subindo na árvore:', {
              tagName: htmlParent.tagName,
              className: htmlParent.className,
              scrollHeight,
              clientHeight,
              scrollTop: htmlParent.scrollTop
            });
            return htmlParent;
          } else if ((hasCustomScroll && hasOverflowAuto) && isVisible && clientHeight > 0) {
            // Container tem as classes corretas e está visível, mesmo que scrollHeight seja 0
            // Pode ser que o conteúdo ainda não tenha sido medido
            console.log('✅ Container potencial encontrado (pode ter scrollHeight 0 temporariamente):', {
              tagName: htmlParent.tagName,
              className: htmlParent.className,
              scrollHeight,
              clientHeight
            });
            // Retornar mesmo assim - vamos tentar fazer scroll
            return htmlParent;
          }
        }
        
        parent = parent.parentElement;
        depth++;
      }
      
      // Estratégia 2: Buscar por seletor direto - verificar todos os divs com as classes
      console.log('🔍 Tentando busca por seletor direto...');
      
      // Buscar todos os divs que podem ser containers
      const allDivs = document.querySelectorAll('div');
      let bestContainer: HTMLElement | null = null;
      let bestScore = 0;
      
      for (const div of allDivs) {
        const htmlDiv = div as HTMLElement;
        const hasCustomScroll = htmlDiv.classList.contains('custom-scroll-square');
        const hasOverflowAuto = htmlDiv.classList.contains('overflow-y-auto');
        
        if ((hasCustomScroll && hasOverflowAuto) && htmlDiv.contains(element)) {
          const style = window.getComputedStyle(htmlDiv);
          const display = style.display;
          const visibility = style.visibility;
          const isVisible = display !== 'none' && visibility !== 'hidden';
          const scrollHeight = htmlDiv.scrollHeight;
          const clientHeight = htmlDiv.clientHeight;
          
          // Calcular score: preferir containers visíveis com scrollHeight maior
          let score = 0;
          if (isVisible) score += 100;
          if (scrollHeight > clientHeight + 5) score += 50;
          if (clientHeight > 0) score += 25;
          
          // Preferir desktop (hidden sm:block) ou mobile (block sm:hidden) baseado na visibilidade
          const className = htmlDiv.className;
          if (className.includes('hidden') && className.includes('sm:block')) {
            // Desktop container - só contar se estiver visível
            if (isVisible) score += 10;
          } else if (className.includes('block') && className.includes('sm:hidden')) {
            // Mobile container - só contar se estiver visível
            if (isVisible) score += 10;
          }
          
          console.log('🔍 Container candidato:', {
            className: htmlDiv.className,
            display,
            isVisible,
            scrollHeight,
            clientHeight,
            score,
            containsElement: htmlDiv.contains(element)
          });
          
          if (score > bestScore) {
            bestScore = score;
            bestContainer = htmlDiv;
          }
        }
      }
      
      if (bestContainer) {
        const style = window.getComputedStyle(bestContainer);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
        const scrollHeight = bestContainer.scrollHeight;
        const clientHeight = bestContainer.clientHeight;
        
        console.log('✅ Melhor container encontrado:', {
          className: bestContainer.className,
          isVisible,
          scrollHeight,
          clientHeight,
          score: bestScore
        });
        
        // Retornar mesmo se scrollHeight for baixo, desde que esteja visível
        if (isVisible && clientHeight > 0) {
          return bestContainer;
        }
      }
      
      console.warn('⚠️ Nenhum container scrollável encontrado após todas as tentativas');
      return null;
    };
    
    // Função para encontrar e fazer scroll
    const findAndScroll = (attempt = 0) => {
      const selector = `[data-file-name="${CSS.escape(currentFileName)}"]`;
      console.log(`🔍 Tentativa ${attempt + 1} - Procurando:`, selector);
      
      const playingElement = document.querySelector(selector) as HTMLElement;
      
      if (playingElement) {
        console.log('✅ Elemento encontrado! Fazendo scroll...', {
          element: playingElement,
          className: playingElement.className,
          offsetTop: playingElement.offsetTop,
          offsetParent: playingElement.offsetParent
        });
        
        const element = playingElement as HTMLElement;
        
        // Pequeno delay para garantir que o DOM está estável
        // Quanto maior o attempt, maior o delay
        const delay = attempt * 100;
        
        if (delay > 0) {
          setTimeout(() => {
            performScroll(element);
          }, delay);
        } else {
          // Primeira tentativa: aguardar um pouco para garantir renderização
          setTimeout(() => {
            performScroll(element);
          }, 100);
        }
        return true; // Sucesso
      } else {
        console.warn(`⚠️ Elemento não encontrado na tentativa ${attempt + 1}`);
        return false; // Não encontrado
      }
    };
    
    const performScroll = (element: HTMLElement) => {
        // Encontrar o container scrollável correto primeiro
        const scrollContainer = findScrollContainer(element);
        
        if (scrollContainer) {
          console.log('🚀 Usando scroll manual no container correto');
          
          const scrollHeight = scrollContainer.scrollHeight;
          const clientHeight = scrollContainer.clientHeight;
          
          // Se scrollHeight é muito pequeno ou 0, usar scrollIntoView dentro do container
          if (scrollHeight <= clientHeight + 10) {
            console.log('⚠️ Container tem scrollHeight muito pequeno, usando scrollIntoView no elemento');
            // Usar scrollIntoView mas garantir que está no container correto
            element.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
            
            // Verificar se o scroll aconteceu no container
            setTimeout(() => {
              const newScrollTop = scrollContainer.scrollTop;
              console.log('✅ ScrollIntoView executado, scrollTop do container:', newScrollTop);
            }, 500);
            return;
          }
          
          // Garantir que o elemento está visível antes de calcular
          const containerRect = scrollContainer.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          const elementHeight = elementRect.height || element.offsetHeight || 200;
          
          // Calcular posição relativa ao container usando offsetTop se necessário
          let elementTopInContainer: number;
          
          // Se o elemento está fora da viewport do container, usar offsetTop
          if (elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom) {
            // Calcular usando offsetTop
            let offsetTop = element.offsetTop;
            let parent = element.offsetParent as HTMLElement | null;
            while (parent && parent !== scrollContainer) {
              offsetTop += parent.offsetTop;
              parent = parent.offsetParent as HTMLElement | null;
            }
            elementTopInContainer = offsetTop;
            console.log('📍 Usando offsetTop para cálculo:', { offsetTop, elementTopInContainer });
          } else {
            // Usar cálculo relativo
            elementTopInContainer = elementRect.top - containerRect.top + scrollContainer.scrollTop;
            console.log('📍 Usando cálculo relativo:', { 
              elementRectTop: elementRect.top,
              containerRectTop: containerRect.top,
              scrollTop: scrollContainer.scrollTop,
              elementTopInContainer
            });
          }
          
          // Calcular scroll para centralizar (considerando altura do player)
          const playerHeight = playerMinimized ? 96 : 90;
          const availableHeight = clientHeight - playerHeight;
          const centerOffset = availableHeight / 2;
          
          const targetScroll = elementTopInContainer - centerOffset + (elementHeight / 2);
          const maxScroll = scrollHeight - clientHeight;
          const finalScroll = Math.max(0, Math.min(targetScroll, maxScroll));
          
          console.log('📊 Calculando scroll:', {
            currentScrollTop: scrollContainer.scrollTop,
            elementTopInContainer,
            elementHeight,
            containerHeight: clientHeight,
            availableHeight,
            centerOffset,
            targetScroll,
            maxScroll,
            finalScroll,
            scrollHeight
          });
          
          // Aplicar scroll suave
          scrollContainer.scrollTo({
            top: finalScroll,
            behavior: 'smooth'
          });
          
          // Verificar resultado após animação
          setTimeout(() => {
            const finalScrollTop = scrollContainer.scrollTop;
            console.log('✅ Resultado final do scroll:', {
              scrollTop: finalScrollTop,
              esperado: finalScroll,
              diferenca: Math.abs(finalScrollTop - finalScroll),
              sucesso: Math.abs(finalScrollTop - finalScroll) < 50 // Considerar sucesso se diferença < 50px
            });
          }, 500);
        } else {
          console.log('⚠️ Container não encontrado, tentando alternativas mais agressivas...');
          
          // Estratégia alternativa: buscar TODOS os divs com overflow e verificar qual contém o elemento
          const allDivs = document.querySelectorAll('div');
          let foundContainer: HTMLElement | null = null;
          
          for (const div of allDivs) {
            const htmlDiv = div as HTMLElement;
            const style = window.getComputedStyle(htmlDiv);
            const overflowY = style.overflowY;
            const overflow = style.overflow;
            
            // Verificar se tem overflow scrollável E contém o elemento
            if ((overflowY === 'auto' || overflowY === 'scroll' || overflow === 'auto' || overflow === 'scroll') &&
                htmlDiv.contains(element)) {
              const scrollHeight = htmlDiv.scrollHeight;
              const clientHeight = htmlDiv.clientHeight;
              
              if (scrollHeight > clientHeight + 10) {
                console.log('🔍 Container alternativo candidato:', {
                  className: htmlDiv.className,
                  scrollHeight,
                  clientHeight,
                  containsElement: htmlDiv.contains(element)
                });
                
                // Preferir containers com custom-scroll-square ou flex-1
                const hasCustomScroll = htmlDiv.classList.contains('custom-scroll-square');
                const hasFlex1 = htmlDiv.classList.contains('flex-1');
                
                if (hasCustomScroll || hasFlex1 || !foundContainer) {
                  foundContainer = htmlDiv;
                  if (hasCustomScroll && hasFlex1) {
                    // Este é provavelmente o container correto
                    break;
                  }
                }
              }
            }
          }
          
          if (foundContainer) {
            console.log('✅ Container alternativo encontrado, fazendo scroll manual:', {
              className: foundContainer.className,
              scrollHeight: foundContainer.scrollHeight,
              clientHeight: foundContainer.clientHeight
            });
            
            // Calcular posição usando offsetTop
            let offsetTop = element.offsetTop;
            let parent = element.offsetParent as HTMLElement | null;
            while (parent && parent !== foundContainer) {
              offsetTop += parent.offsetTop;
              parent = parent.offsetParent as HTMLElement | null;
            }
            
            const containerHeight = foundContainer.clientHeight;
            const playerHeight = playerMinimized ? 96 : 90;
            const availableHeight = containerHeight - playerHeight;
            const centerOffset = availableHeight / 2;
            const elementHeight = element.offsetHeight || element.getBoundingClientRect().height || 200;
            const targetScroll = offsetTop - centerOffset + (elementHeight / 2);
            const maxScroll = foundContainer.scrollHeight - containerHeight;
            const finalScroll = Math.max(0, Math.min(targetScroll, maxScroll));
            
            console.log('📊 Scroll alternativo calculado:', {
              offsetTop,
              targetScroll,
              finalScroll,
              currentScrollTop: foundContainer.scrollTop
            });
            
            foundContainer.scrollTo({
              top: finalScroll,
              behavior: 'smooth'
            });
            
            setTimeout(() => {
              console.log('✅ Resultado scroll alternativo:', {
                scrollTop: foundContainer!.scrollTop,
                esperado: finalScroll
              });
            }, 500);
          } else {
            console.log('⚠️ Nenhum container encontrado, usando scrollIntoView no elemento');
            // Último recurso: usar scrollIntoView no próprio elemento
            // Mas primeiro tentar garantir que está no container correto
            element.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          }
        }

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
    };

    // Tentar múltiplas vezes até encontrar
    if (findAndScroll(0)) return;
    setTimeout(() => { if (findAndScroll(1)) return; }, 100);
    setTimeout(() => { if (findAndScroll(2)) return; }, 300);
    setTimeout(() => { findAndScroll(3); }, 500);
  }, [playerState.currentFile, playerMinimized]);

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
