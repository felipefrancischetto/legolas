interface ColorData {
  r: number;
  g: number;
  b: number;
  hex: string;
  rgba: (alpha: number) => string;
}

export async function extractDominantColor(imageUrl: string): Promise<ColorData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        // Redimensiona para análise mais rápida
        const size = 50;
        canvas.width = size;
        canvas.height = size;
        
        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        
        // Conta as cores mais frequentes
        const colorCount: { [key: string]: number } = {};
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const alpha = data[i + 3];
          
          // Ignora pixels muito transparentes ou muito escuros/claros
          if (alpha < 128 || (r + g + b) < 50 || (r + g + b) > 650) continue;
          
          // Agrupa cores similares (reduz precisão para agrupar)
          const rGroup = Math.floor(r / 32) * 32;
          const gGroup = Math.floor(g / 32) * 32;
          const bGroup = Math.floor(b / 32) * 32;
          
          const colorKey = `${rGroup},${gGroup},${bGroup}`;
          colorCount[colorKey] = (colorCount[colorKey] || 0) + 1;
        }
        
        // Encontra a cor mais frequente
        let maxCount = 0;
        let dominantColor = '128,128,128'; // fallback
        
        for (const [color, count] of Object.entries(colorCount)) {
          if (count > maxCount) {
            maxCount = count;
            dominantColor = color;
          }
        }
        
        const [r, g, b] = dominantColor.split(',').map(Number);
        
        // Ajusta a saturação e brilho para melhor visual
        const adjusted = adjustColorForUI(r, g, b);
        
        resolve({
          r: adjusted.r,
          g: adjusted.g,
          b: adjusted.b,
          hex: `#${adjusted.r.toString(16).padStart(2, '0')}${adjusted.g.toString(16).padStart(2, '0')}${adjusted.b.toString(16).padStart(2, '0')}`,
          rgba: (alpha: number) => `rgba(${adjusted.r}, ${adjusted.g}, ${adjusted.b}, ${alpha})`
        });
        
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      // Fallback para cor neutra
      resolve({
        r: 75,
        g: 85,
        b: 99,
        hex: '#4b5563',
        rgba: (alpha: number) => `rgba(75, 85, 99, ${alpha})`
      });
    };
    
    img.src = imageUrl;
  });
}

function adjustColorForUI(r: number, g: number, b: number) {
  // Converte RGB para HSL para ajustar saturação e brilho
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const diff = max - min;
  
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
    
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / diff + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / diff + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / diff + 4;
        break;
    }
    h /= 6;
  }
  
  // Ajusta saturação e brilho para melhor contraste
  const adjustedS = Math.min(s * 1.2, 0.8); // Aumenta saturação mas limita
  const adjustedL = Math.max(0.3, Math.min(l, 0.7)); // Garante contraste adequado
  
  // Converte HSL de volta para RGB
  const hslToRgb = (h: number, s: number, l: number) => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = l - c / 2;
    
    let rPrime = 0, gPrime = 0, bPrime = 0;
    
    if (h >= 0 && h < 1/6) {
      rPrime = c; gPrime = x; bPrime = 0;
    } else if (h >= 1/6 && h < 2/6) {
      rPrime = x; gPrime = c; bPrime = 0;
    } else if (h >= 2/6 && h < 3/6) {
      rPrime = 0; gPrime = c; bPrime = x;
    } else if (h >= 3/6 && h < 4/6) {
      rPrime = 0; gPrime = x; bPrime = c;
    } else if (h >= 4/6 && h < 5/6) {
      rPrime = x; gPrime = 0; bPrime = c;
    } else {
      rPrime = c; gPrime = 0; bPrime = x;
    }
    
    return {
      r: Math.round((rPrime + m) * 255),
      g: Math.round((gPrime + m) * 255),
      b: Math.round((bPrime + m) * 255)
    };
  };
  
  return hslToRgb(h, adjustedS, adjustedL);
}

// Cache para evitar reprocessamento
const colorCache = new Map<string, ColorData>();

export async function getCachedDominantColor(imageUrl: string): Promise<ColorData> {
  if (colorCache.has(imageUrl)) {
    return colorCache.get(imageUrl)!;
  }
  
  try {
    const color = await extractDominantColor(imageUrl);
    colorCache.set(imageUrl, color);
    return color;
  } catch (error) {
    console.warn('Erro ao extrair cor:', error);
    const fallback = {
      r: 75,
      g: 85,
      b: 99,
      hex: '#4b5563',
      rgba: (alpha: number) => `rgba(75, 85, 99, ${alpha})`
    };
    colorCache.set(imageUrl, fallback);
    return fallback;
  }
} 