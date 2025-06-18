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
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            🎵 Tracklist Scraper POTÊNCIA MÁXIMA
          </h1>
          <p className="text-gray-600 text-lg">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <motion.h1 
          className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          🎵 Tracklist Scraper POTÊNCIA MÁXIMA
        </motion.h1>
        <motion.p 
          className="text-gray-600 text-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Extract music links from 1001tracklists.com with advanced scraping technology
        </motion.p>
      </div>

      {/* Input Section */}
      <motion.div 
        className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <div className="space-y-6">
          {/* URL Input */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              1001tracklists.com URL
            </label>
            <div className="relative">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.1001tracklists.com/tracklist/..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                disabled={loading}
              />
              {url && (
                <motion.div 
                  className="absolute right-3 top-3"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                >
                  {url.includes('1001tracklists.com') ? '✅' : '❌'}
                </motion.div>
              )}
            </div>
          </div>

          {/* Advanced Options Toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-blue-600 hover:text-blue-700 font-medium transition-colors duration-200"
            >
              {showAdvanced ? '🔽' : '▶️'} Advanced Options
            </button>
            
            <button
              onClick={handleScrape}
              disabled={loading || !url.trim()}
              className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 active:scale-95"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                  <span>Scraping...</span>
                </div>
              ) : (
                '🚀 Extract Tracks'
              )}
            </button>
          </div>

          {/* Advanced Options */}
          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Scraping Method
                    </label>
                    <select
                      value={options.method}
                      onChange={(e) => setOptions({...options, method: e.target.value as any})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      disabled={loading}
                    >
                      <option value="auto">🤖 Auto</option>
                      <option value="cheerio">⚡ Cheerio (Fast)</option>
                      <option value="puppeteer">🎭 Puppeteer (Robust)</option>
                      <option value="playwright">🎪 Playwright (Advanced)</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="useCache"
                      checked={options.useCache}
                      onChange={(e) => setOptions({...options, useCache: e.target.checked})}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      disabled={loading}
                    />
                    <label htmlFor="useCache" className="text-sm font-medium text-gray-700">
                      💾 Use Cache
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="validateLinks"
                      checked={options.validateLinks}
                      onChange={(e) => setOptions({...options, validateLinks: e.target.checked})}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      disabled={loading}
                    />
                    <label htmlFor="validateLinks" className="text-sm font-medium text-gray-700">
                      ✅ Validate Links
                    </label>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-red-50 border border-red-200 rounded-lg p-4"
          >
            <div className="flex items-center space-x-2">
              <span className="text-red-500">❌</span>
              <span className="text-red-700 font-medium">Error:</span>
              <span className="text-red-600">{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results Section */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            {/* Stats */}
            <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-6 border border-green-200">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{result.tracks.length}</div>
                  <div className="text-sm text-gray-600">Total Tracks</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{result.stats.tracksWithLinks}</div>
                  <div className="text-sm text-gray-600">With Links</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{result.stats.uniquePlatforms.length}</div>
                  <div className="text-sm text-gray-600">Platforms</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {processingTime ? `${(processingTime / 1000).toFixed(1)}s` : `${(result.stats.scrapingTime / 1000).toFixed(1)}s`}
                  </div>
                  <div className="text-sm text-gray-600">
                    {cached ? '💾 Cached' : '⚡ Processing Time'}
                  </div>
                </div>
              </div>
            </div>

            {/* Playlist Info */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">{result.metadata.title}</h2>
                  <p className="text-lg text-gray-600">by {result.metadata.artist}</p>
                  {result.metadata.venue && (
                    <p className="text-sm text-gray-500">📍 {result.metadata.venue}</p>
                  )}
                  {result.metadata.date && (
                    <p className="text-sm text-gray-500">📅 {result.metadata.date}</p>
                  )}
                </div>
                
                {/* Export Buttons */}
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleExport('json')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
                  >
                    📄 JSON
                  </button>
                  <button
                    onClick={() => handleExport('csv')}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200"
                  >
                    📊 CSV
                  </button>
                </div>
              </div>

              {/* Platform Summary */}
              <div className="flex flex-wrap gap-2 mb-4">
                {result.stats.uniquePlatforms.map(platform => (
                  <span
                    key={platform}
                    className={`px-3 py-1 rounded-full text-white text-sm font-medium ${getPlatformColor(platform)}`}
                  >
                    {getPlatformIcon(platform)} {platform}
                  </span>
                ))}
              </div>
            </div>

            {/* Tracks List */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h3 className="text-xl font-bold text-gray-800">🎵 Tracks</h3>
              </div>
              
              <div className="max-h-96 overflow-y-auto">
                {result.tracks.map((track, index) => (
                  <TrackItem key={track.id} track={track} index={index} />
                ))}
              </div>
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