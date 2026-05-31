'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  buildMidiPackZip,
  pickBestTracksForMidiPack,
  type MidiPackExportProgress,
  type MidiPackTrackInput,
} from '../utils/midiPackExport';
import { downloadZipArchive } from '../utils/midiGenerator';
import { useDownload } from './DownloadContext';

export type MidiPackJobStatus = 'running' | 'completed' | 'error' | 'cancelled';

export interface MidiPackJob {
  id: string;
  status: MidiPackJobStatus;
  scopeLabel: string;
  trackCount: number;
  progress: MidiPackExportProgress | null;
  startedAt: number;
  finishedAt?: number;
  packName?: string;
  midiFileCount?: number;
  tracksSucceeded?: number;
  tracksFailed?: number;
  error?: string;
}

interface MidiPackExportContextType {
  activeJob: MidiPackJob | null;
  startPackExport: (tracks: MidiPackTrackInput[], scopeLabel: string) => string | null;
  cancelPackExport: () => void;
  dismissJob: () => void;
}

const MidiPackExportContext = createContext<MidiPackExportContextType | undefined>(undefined);

export function MidiPackExportProvider({ children }: { children: ReactNode }) {
  const { addToast } = useDownload();
  const [activeJob, setActiveJob] = useState<MidiPackJob | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancelPackExport = useCallback(() => {
    abortRef.current?.abort();
    setActiveJob((job) =>
      job?.status === 'running'
        ? {
            ...job,
            status: 'cancelled',
            finishedAt: Date.now(),
            progress: job.progress
              ? { ...job.progress, phase: 'cancelled' }
              : null,
          }
        : job
    );
  }, []);

  const dismissJob = useCallback(() => {
    if (activeJob?.status === 'running') {
      cancelPackExport();
    }
    setActiveJob(null);
    abortRef.current = null;
  }, [activeJob?.status, cancelPackExport]);

  const startPackExport = useCallback(
    (tracks: MidiPackTrackInput[], scopeLabel: string): string | null => {
      const bestTracks = pickBestTracksForMidiPack(tracks);
      if (bestTracks.length === 0) return null;

      if (activeJob?.status === 'running') {
        addToast({
          title: 'Já existe um Pack MIDI em andamento. Aguarde ou cancele o atual.',
        });
        return null;
      }

      const id = `midi-pack-${Date.now()}`;
      const controller = new AbortController();
      abortRef.current = controller;

      const job: MidiPackJob = {
        id,
        status: 'running',
        scopeLabel,
        trackCount: bestTracks.length,
        progress: {
          phase: 'analyzing',
          current: 0,
          total: bestTracks.length,
          trackLabel: '',
          midiFilesTotal: 0,
          tracksOk: 0,
          tracksFailed: 0,
        },
        startedAt: Date.now(),
      };

      setActiveJob(job);

      (async () => {
        try {
          const result = await buildMidiPackZip(bestTracks, {
            dedupeBestFormat: false,
            onProgress: (p) => {
              setActiveJob((prev) =>
                prev?.id === id ? { ...prev, progress: p } : prev
              );
            },
            signal: controller.signal,
          });

          const zipName = `${result.packFolderName}.zip`;
          downloadZipArchive(result.zipBytes, zipName);

          setActiveJob({
            id,
            status: 'completed',
            scopeLabel,
            trackCount: bestTracks.length,
            progress: {
              phase: 'done',
              current: bestTracks.length,
              total: bestTracks.length,
              trackLabel: 'Concluído',
              midiFilesTotal: result.midiFileCount,
              tracksOk: result.tracksSucceeded,
              tracksFailed: result.tracksFailed,
            },
            startedAt: job.startedAt,
            finishedAt: Date.now(),
            packName: result.packFolderName,
            midiFileCount: result.midiFileCount,
            tracksSucceeded: result.tracksSucceeded,
            tracksFailed: result.tracksFailed,
          });

          addToast({
            title: `Pack MIDI pronto: ${result.packFolderName}.zip (${result.midiFileCount} MIDIs)`,
          });
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            setActiveJob((prev) =>
              prev?.id === id
                ? {
                    ...prev,
                    status: 'cancelled',
                    finishedAt: Date.now(),
                    error: 'Exportação cancelada',
                  }
                : prev
            );
            return;
          }

          const message = err instanceof Error ? err.message : 'Erro ao gerar o pack';
          setActiveJob({
            id,
            status: 'error',
            scopeLabel,
            trackCount: bestTracks.length,
            progress: null,
            startedAt: job.startedAt,
            finishedAt: Date.now(),
            error: message,
          });
          addToast({ title: `Pack MIDI falhou: ${message}` });
        } finally {
          if (abortRef.current === controller) {
            abortRef.current = null;
          }
        }
      })();

      return id;
    },
    [activeJob?.status, addToast]
  );

  const value = useMemo(
    () => ({
      activeJob,
      startPackExport,
      cancelPackExport,
      dismissJob,
    }),
    [activeJob, startPackExport, cancelPackExport, dismissJob]
  );

  return (
    <MidiPackExportContext.Provider value={value}>
      {children}
    </MidiPackExportContext.Provider>
  );
}

export function useMidiPackExport() {
  const ctx = useContext(MidiPackExportContext);
  if (!ctx) {
    throw new Error('useMidiPackExport must be used within MidiPackExportProvider');
  }
  return ctx;
}
