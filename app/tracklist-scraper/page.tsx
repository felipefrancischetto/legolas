import { Metadata } from 'next';
import TracklistScraper from '@/components/TracklistScraper';

export const metadata: Metadata = {
  title: 'Tracklist Scraper POTÊNCIA MÁXIMA | Extract Music Links',
  description: 'Advanced tracklist scraper for 1001tracklists.com. Extract Spotify, YouTube, SoundCloud, and other platform links with powerful scraping technology.',
  keywords: ['tracklist', 'scraper', '1001tracklists', 'music', 'spotify', 'youtube', 'soundcloud', 'dj', 'playlist'],
  openGraph: {
    title: 'Tracklist Scraper POTÊNCIA MÁXIMA',
    description: 'Extract music links from 1001tracklists.com with advanced scraping technology',
    type: 'website',
    url: '/tracklist-scraper',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tracklist Scraper POTÊNCIA MÁXIMA',
    description: 'Extract music links from 1001tracklists.com with advanced scraping technology',
  },
};

export default function TracklistScraperPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <TracklistScraper />
    </div>
  );
} 