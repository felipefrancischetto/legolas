export interface ThemeColors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  background: string;
  border: string;
}

export const DEFAULT_THEME_COLORS: ThemeColors = {
  primary: 'rgb(16, 185, 129)',
  primaryLight: 'rgba(16, 185, 129, 0.9)',
  primaryDark: 'rgba(16, 185, 129, 0.7)',
  background: 'rgba(16, 185, 129, 0.15)',
  border: 'rgba(16, 185, 129, 0.4)'
};

/**
 * Retorna as cores do tema, verificando as configurações do usuário
 * @param themeColors - Cores extraídas dinamicamente
 * @param disableDynamicColors - Configuração do usuário
 * @returns Cores finais a serem usadas
 */
export function getThemeColors(
  themeColors: ThemeColors | undefined,
  disableDynamicColors: boolean
): ThemeColors {
  if (disableDynamicColors || !themeColors) {
    return DEFAULT_THEME_COLORS;
  }
  return themeColors;
}

/**
 * Cria cores do tema a partir de uma cor dominante
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 * @returns Objeto com todas as variações da cor
 */
export function createThemeColors(r: number, g: number, b: number): ThemeColors {
  return {
    primary: `rgb(${r}, ${g}, ${b})`,
    primaryLight: `rgba(${r}, ${g}, ${b}, 0.9)`,
    primaryDark: `rgba(${r}, ${g}, ${b}, 0.7)`,
    background: `rgba(${r}, ${g}, ${b}, 0.15)`,
    border: `rgba(${r}, ${g}, ${b}, 0.4)`
  };
} 