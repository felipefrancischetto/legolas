import type { Metadata } from "next";
import { Inter, Barrio } from "next/font/google";
import "./globals.css";
import { DownloadProvider } from './contexts/DownloadContext';
import { FileProvider } from './contexts/FileContext';
import { UIProvider } from './contexts/UIContext';
import { PlayerProvider } from './contexts/PlayerContext';
import { QuickPlaylistProvider } from './contexts/QuickPlaylistContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import GlobalErrorHandler from './components/GlobalErrorHandler';

const inter = Inter({ subsets: ["latin"] });
const barrio = Barrio({ 
  weight: "400",
  subsets: ["latin"],
  variable: "--font-barrio"
});

export const metadata: Metadata = {
  title: "Legolas",
  description: "",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="bg-black" suppressHydrationWarning>
      <body className={`${inter.className} ${barrio.variable} bg-black overflow-x-hidden`} suppressHydrationWarning>
        <GlobalErrorHandler />
        <ErrorBoundary>
          <DownloadProvider>
            <FileProvider>
              <UIProvider>
                <PlayerProvider>
                  <QuickPlaylistProvider>
                    {children}
                  </QuickPlaylistProvider>
                </PlayerProvider>
              </UIProvider>
            </FileProvider>
          </DownloadProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
