import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DownloadProvider } from './contexts/DownloadContext';
import { FileProvider } from './contexts/FileContext';
import { UIProvider } from './contexts/UIContext';
import { PlayerProvider } from './contexts/PlayerContext';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Legolas Downloader",
  description: "Baixe suas músicas favoritas",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <DownloadProvider>
          <FileProvider>
            <UIProvider>
              <PlayerProvider>
                {children}
              </PlayerProvider>
            </UIProvider>
          </FileProvider>
        </DownloadProvider>
      </body>
    </html>
  );
}
