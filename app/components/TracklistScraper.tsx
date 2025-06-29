'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrapingResult, ScrapingOptions, ScrapeResponse, Track } from '@/lib/types';

interface TracklistScraperProps {
  onResult?: (result: ScrapingResult) => void;
}

export default function TracklistScraper({ onResult }: TracklistScraperProps) {
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrapingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Partial<ScrapingOptions>>({
    method: 'auto',
    useCache: true,
    validateLinks: true,
    includeMetadata: true
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [cached, setCached] = useState(false);

  // Ensure client-side rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleScrape = useCallback(async () => {
    if (!url.trim()) {
      setError('Please enter a valid URL');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setProcessingTime(null);
    setCached(false);

    try {
      const response = await fetch('/api/scrape-tracklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url.trim(),
          options
        }),
      });

      const data: ScrapeResponse = await response.json();
      
      if (data.success && data.data) {
        setResult(data.data);
        setProcessingTime(data.processingTime || null);
        setCached(data.cached || false);
        onResult?.(data.data);
      } else {
        setError(data.error || 'Unknown error occurred');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error occurred');
    } finally {
      setLoading(false);
    }
  }, [url, options, onResult]);

  const handleExport = useCallback((format: 'json' | 'csv') => {
    if (!result || !mounted) return;

    let content: string;
    let mimeType: string;
    let filename: string;
    const timestamp = new Date().getTime();

    if (format === 'json') {
      content = JSON.stringify(result, null, 2);
      mimeType = 'application/json';
      filename = `tracklist-${timestamp}.json`;
    } else {
      // CSV format
      const headers = ['Position', 'Title', 'Artist', 'Time', 'Spotify', 'YouTube', 'SoundCloud', 'Beatport', 'Apple Music'];
      const rows = result.tracks.map(track => [
        track.position || '',
        track.title || '',
        track.artist || '',
        track.time || '',
        track.links.find(l => l.platform === 'Spotify')?.url || '',
        track.links.find(l => l.platform === 'YouTube')?.url || '',
        track.links.find(l => l.platform === 'SoundCloud')?.url || '',
        track.links.find(l => l.platform === 'Beatport')?.url || '',
        track.links.find(l => l.platform === 'Apple Music')?.url || ''
      ]);
      
      content = [headers, ...rows].map(row => 
        row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(',')
      ).join('\n');
      
      mimeType = 'text/csv';
      filename = `tracklist-${timestamp}.csv`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result, mounted]);

  const getPlatformIcon = (platform: string) => {
    const icons: Record<string, string> = {
      'Spotify': '🎵',
      'YouTube': '📺',
      'SoundCloud': '☁️',
      'Beatport': '🎛️',
      'Apple Music': '🍎',
      'Tidal': '🌊',
      'Deezer': '🎧'
    };
    return icons[platform] || '🔗';
  };

  const getPlatformColor = (platform: string) => {
    const colors: Record<string, string> = {
      'Spotify': 'bg-green-500',
      'YouTube': 'bg-red-500',
      'SoundCloud': 'bg-orange-500',
      'Beatport': 'bg-purple-500',
      'Apple Music': 'bg-gray-800',
      'Tidal': 'bg-blue-500',
      'Deezer': 'bg-pink-500'
    };
    return colors[platform] || 'bg-gray-400';
  };

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-8 sm:max-w-full sm:p-4 sm:space-y-6">
        <div className="text-center space-y-4 sm:space-y-3">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent sm:text-2xl">
            🎵 Tracklist Scraper POTÊNCIA MÁXIMA
          </h1>
          <p className="text-gray-600 text-lg sm:text-sm">
            Extraia tracklists de qualquer fonte com links para múltiplas plataformas!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 sm:max-w-full sm:p-4 sm:space-y-6">
      <div className="text-center space-y-4 sm:space-y-3">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent sm:text-2xl">
          🎵 Tracklist Scraper POTÊNCIA MÁXIMA
        </h1>
        <p className="text-gray-600 text-lg sm:text-sm">
          Extraia tracklists de qualquer fonte com links para múltiplas plataformas!
        </p>
      </div>

      {/* Formulário de entrada */}
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 sm:p-4">
        <div className="space-y-4 sm:space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 sm:text-xs sm:mb-1">
              URL ou Texto da Tracklist
            </label>
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Cole aqui a URL ou texto da tracklist..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 sm:px-3 sm:py-2 sm:text-sm"
                disabled={loading}
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 sm:right-2">
                {loading && (
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin sm:w-4 sm:h-4"></div>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleScrape}
            disabled={loading || !url.trim()}
            className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] sm:px-4 sm:py-2 sm:text-sm"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin sm:w-4 sm:h-4"></div>
                <span>Processando...</span>
              </div>
            ) : (
              '🚀 Extrair Tracklist'
            )}
          </button>
        </div>
      </div>

      {/* Seção de erro */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-red-50 border border-red-200 rounded-lg p-4 sm:p-3"
          >
            <div className="flex items-center space-x-2">
              <span className="text-red-500">❌</span>
              <span className="text-red-700 font-medium sm:text-sm">Error:</span>
              <span className="text-red-600 sm:text-sm">{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seção de resultados */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="space-y-6 sm:space-y-4"
          >
            {/* Estatísticas */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-200 sm:p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:grid-cols-2 sm:gap-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600 sm:text-xl">{result.tracks.length}</div>
                  <div className="text-sm text-gray-600 sm:text-xs">Total Tracks</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 sm:text-xl">{result.stats.tracksWithLinks}</div>
                  <div className="text-sm text-gray-600 sm:text-xs">With Links</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600 sm:text-xl">{result.stats.uniquePlatforms.length}</div>
                  <div className="text-sm text-gray-600 sm:text-xs">Platforms</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600 sm:text-xl">
                    {processingTime ? `${(processingTime / 1000).toFixed(1)}s` : `${(result.stats.scrapingTime / 1000).toFixed(1)}s`}
                  </div>
                  <div className="text-sm text-gray-600 sm:text-xs">
                    {cached ? '💾 Cached' : '⚡ Processing Time'}
                  </div>
                </div>
              </div>
            </div>

            {/* Informações da playlist */}
            {result.playlistInfo && (
              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 sm:p-4">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2 sm:text-lg sm:mb-3">
                  <span>📋</span>
                  Playlist Info
                </h3>
                <div className="grid md:grid-cols-2 gap-4 sm:grid-cols-1 sm:gap-3">
                  <div>
                    <span className="font-semibold text-gray-700 sm:text-sm">Title:</span>
                    <p className="text-gray-600 sm:text-sm">{result.playlistInfo.title}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700 sm:text-sm">Source:</span>
                    <p className="text-gray-600 sm:text-sm">{result.playlistInfo.source}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Lista de faixas */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200 sm:p-4">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2 sm:text-lg">
                  <span>🎶</span>
                  Tracks ({result.tracks.length})
                </h3>
              </div>
              <div className="max-h-96 overflow-y-auto custom-scroll sm:max-h-80">
                <div className="space-y-1 p-4 sm:p-2 sm:space-y-0.5">
                  {result.tracks.map((track, index) => (
                    <TrackItem key={index} track={track} index={index} />
                  ))}
                </div>
              </div>
            </div>

            {/* Botão de download */}
            <div className="text-center">
              <button
                onClick={() => onResult?.(result)}
                className="px-8 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold rounded-lg hover:from-green-700 hover:to-blue-700 transition-all duration-200 transform hover:scale-105 shadow-lg sm:px-6 sm:py-2 sm:text-sm"
              >
                📥 Usar esta Tracklist
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Track Item Component
function TrackItem({ track, index }: { track: Track; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="border-b border-gray-100 last:border-b-0 p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-500 w-8">
                {track.position || index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-900 truncate">
                  {track.title}
                </h4>
                {track.artist && (
                  <p className="text-sm text-gray-600 truncate">
                    {track.artist}
                  </p>
                )}
              </div>
              {track.time && (
                <span className="text-xs text-gray-500 font-mono">
                  {track.time}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors duration-200"
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-500 w-8">
                {track.position || index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-900 truncate">
                  {track.title}
                </h4>
                {track.artist && (
                  <p className="text-sm text-gray-600 truncate">
                    {track.artist}
                  </p>
                )}
              </div>
              {track.time && (
                <span className="text-xs text-gray-500 font-mono">
                  {track.time}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-2 ml-4">
            {/* Platform Links */}
            <div className="flex space-x-1">
              {track.links.slice(0, 3).map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                    link.platform === 'Spotify' ? 'bg-green-500 hover:bg-green-600' :
                    link.platform === 'YouTube' ? 'bg-red-500 hover:bg-red-600' :
                    link.platform === 'SoundCloud' ? 'bg-orange-500 hover:bg-orange-600' :
                    'bg-gray-500 hover:bg-gray-600'
                  } transition-colors duration-200`}
                  title={`Open on ${link.platform}`}
                >
                  {link.platform === 'Spotify' ? '🎵' :
                   link.platform === 'YouTube' ? '📺' :
                   link.platform === 'SoundCloud' ? '☁️' : '🔗'}
                </a>
              ))}
              
              {track.links.length > 3 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="w-8 h-8 rounded-full bg-gray-300 hover:bg-gray-400 flex items-center justify-center text-xs font-bold transition-colors duration-200"
                >
                  +{track.links.length - 3}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Expanded Links */}
        <AnimatePresence>
          {expanded && track.links.length > 3 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3 pt-3 border-t border-gray-200 overflow-hidden"
            >
              <div className="flex flex-wrap gap-2">
                {track.links.slice(3).map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs font-medium text-gray-700 transition-colors duration-200"
                  >
                    {link.platform === 'Spotify' ? '🎵' :
                     link.platform === 'YouTube' ? '📺' :
                     link.platform === 'SoundCloud' ? '☁️' :
                     link.platform === 'Beatport' ? '🎛️' :
                     link.platform === 'Apple Music' ? '🍎' : '🔗'} {link.platform}
                  </a>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
} 