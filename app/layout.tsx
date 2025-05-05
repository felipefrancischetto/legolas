'use client';

import { Inter } from "next/font/google";
import "./globals.css";
import { DownloadProvider } from './contexts/DownloadContext';
import DownloadQueue from './components/DownloadQueue';
import DownloadHistory from './components/DownloadHistory';

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} font-sans antialiased`}>
        <DownloadProvider>
          {children}
          <DownloadQueue />
          <DownloadHistory />
        </DownloadProvider>
      </body>
    </html>
  );
}
