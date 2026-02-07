#!/bin/bash

echo "🍪 [Extract YouTube Cookies] Extraindo cookies do YouTube..."
echo ""

# Verificar se yt-dlp está instalado
if ! command -v yt-dlp &> /dev/null; then
    echo "❌ yt-dlp não encontrado. Instale com: pip install yt-dlp"
    exit 1
fi

# Lista de browsers para tentar (em ordem de prioridade)
browsers=("chrome" "chromium" "firefox" "brave" "opera" "edge")

for browser in "${browsers[@]}"; do
    echo "🔄 Tentando extrair cookies do $browser..."
    
    # Tentar extrair cookies
    if yt-dlp --cookies-from-browser "$browser" --cookies "cookies.txt" --skip-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 2>/dev/null; then
        # Verificar se o arquivo foi criado e tem conteúdo
        if [ -f "cookies.txt" ] && [ -s "cookies.txt" ]; then
            echo "✅ Cookies extraídos do $browser com sucesso!"
            echo "📄 Arquivo cookies.txt criado/atualizado"
            exit 0
        fi
    fi
done

echo "❌ Não foi possível extrair cookies de nenhum browser"
echo ""
echo "💡 INSTRUÇÕES MANUAIS:"
echo "1. Abra o Chrome/Chromium e acesse: https://www.youtube.com"
echo "2. Faça login na sua conta YouTube (se não estiver logado)"
echo "3. Reproduza algumas músicas para 'aquecer' a sessão"
echo "4. Execute: yt-dlp --cookies-from-browser chrome --cookies cookies.txt \"https://www.youtube.com/watch?v=dQw4w9WgXcQ\""
echo ""
exit 1
