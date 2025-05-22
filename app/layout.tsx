import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DownloadProvider } from './contexts/DownloadContext';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Legolas Downloader",
  description: "Baixe suas músicas favoritas do YouTube em formato MP3.",
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
          {children}
        </DownloadProvider>
      </body>
    </html>
  );
}
