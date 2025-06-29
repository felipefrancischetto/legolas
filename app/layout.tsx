import type { Metadata } from "next";
import { Inter, Barrio } from "next/font/google";
import "./globals.css";
import { DownloadProvider } from './contexts/DownloadContext';
import { FileProvider } from './contexts/FileContext';
import { UIProvider } from './contexts/UIContext';
import { PlayerProvider } from './contexts/PlayerContext';

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
    <html lang="pt-BR">
      <body className={`${inter.className} ${barrio.variable}`}>
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
