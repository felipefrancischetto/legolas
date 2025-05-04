import DownloadForm from './components/DownloadForm';
import FileList from './components/FileList';

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
              <span className="text-black font-bold text-xl">L</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Legolas Downloader
            </h1>
          </div>
          <p className="text-sm sm:text-base text-gray-400">Baixe suas músicas favoritas do YouTube em formato MP3</p>
        </div>
        <div className="space-y-6">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
            <DownloadForm />
          </div>
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
            <FileList />
          </div>
        </div>
      </div>
    </main>
  );
}
