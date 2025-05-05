'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Track {
  title: string;
  link: string;
  youtube: string | null;
  soundcloud: string | null;
  spotify: string | null;
}

export default function PlaylistTracklistScrape() {
  const [setlistUrl, setSetlistUrl] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    setLoading(true);
    setError('');
    setResults([]);
    try {
      const res = await fetch('/api/tracklist-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: setlistUrl })
      });
      const data = await res.json();
      if (data.results) {
        setResults(data.results);
      } else {
        setError(data.error || 'Nenhum resultado encontrado.');
      }
    } catch {
      setError('Erro ao buscar o setlist.');
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-start py-8 px-4 animate-slide-up">
      <div className="w-full max-w-2xl bg-zinc-900 rounded-xl border border-zinc-800 p-6 shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-white">Importar setlist do 1001tracklists</h1>
          <Link href="/">
            <button className="px-4 py-2 bg-zinc-700 text-white rounded-md hover:bg-zinc-800 transition-all font-medium shadow">
              Voltar
            </button>
          </Link>
        </div>
        <input
          value={setlistUrl}
          onChange={e => setSetlistUrl(e.target.value)}
          placeholder="Cole aqui o link do setlist do 1001tracklists.com"
          className="w-full p-3 rounded-md bg-zinc-800 border border-zinc-700 text-white placeholder-gray-400 focus:border-zinc-600 focus:ring-zinc-600 transition-all duration-200 mb-4"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !setlistUrl.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all font-medium shadow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Buscando...' : 'Buscar playlist'}
        </button>
        {error && <div className="text-red-400 mt-4">{error}</div>}
        {results.length > 0 && (
          <div className="mt-6 space-y-4">
            <h2 className="text-lg font-semibold text-white mb-2">Faixas encontradas:</h2>
            {results.map((track, i) => (
              <div key={i} className="flex flex-col gap-1 bg-zinc-800 rounded p-3">
                <span className="text-gray-300 font-medium">{track.title}</span>
                <div className="flex gap-4 flex-wrap">
                  {track.youtube && (
                    <a
                      href={track.youtube}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 underline"
                    >
                      YouTube
                    </a>
                  )}
                  {track.soundcloud && (
                    <a
                      href={track.soundcloud}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-400 underline"
                    >
                      SoundCloud
                    </a>
                  )}
                  {track.spotify && (
                    <a
                      href={track.spotify}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-400 underline"
                    >
                      Spotify
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
} 