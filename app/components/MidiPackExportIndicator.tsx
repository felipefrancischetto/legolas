'use client';

import { useMidiPackExport } from '../contexts/MidiPackExportContext';
import LoadingSpinner from './LoadingSpinner';

const themeColors = {
  primary: 'rgb(16, 185, 129)',
  primaryLight: 'rgba(16, 185, 129, 0.9)',
  background: 'rgba(16, 185, 129, 0.15)',
  border: 'rgba(16, 185, 129, 0.4)',
};

export default function MidiPackExportIndicator() {
  const { activeJob, cancelPackExport, dismissJob } = useMidiPackExport();

  if (!activeJob) return null;

  const { progress, status, scopeLabel, trackCount } = activeJob;
  const pct =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : status === 'completed'
        ? 100
        : 0;

  const isRunning = status === 'running';

  return (
    <div
      className="fixed z-[55] right-4 bottom-28 md:bottom-24 max-w-sm w-[calc(100%-2rem)] rounded-xl border shadow-lg backdrop-blur-md"
      style={{
        borderColor: themeColors.border,
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(24, 24, 27, 0.95) 100%)',
      }}
      role="status"
      aria-live="polite"
    >
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          {isRunning && (
            <LoadingSpinner size="sm" themeColors={themeColors} isLoading />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {status === 'completed'
                ? 'Pack MIDI concluído'
                : status === 'error'
                  ? 'Pack MIDI — erro'
                  : status === 'cancelled'
                    ? 'Pack MIDI cancelado'
                    : 'Pack MIDI em segundo plano'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {scopeLabel} · {trackCount}{' '}
              {trackCount === 1 ? 'música' : 'músicas'}
              {progress && isRunning
                ? ` · ${progress.current}/${progress.total}`
                : ''}
            </p>
            {isRunning && progress?.trackLabel && (
              <p className="text-xs text-gray-400 truncate mt-0.5">
                {progress.phase === 'packaging'
                  ? 'Montando ZIP...'
                  : progress.trackLabel}
              </p>
            )}
            {status === 'completed' && activeJob.packName && (
              <p className="text-xs text-emerald-400/90 mt-0.5">
                {activeJob.packName}.zip · {activeJob.midiFileCount} MIDIs
              </p>
            )}
            {status === 'error' && activeJob.error && (
              <p className="text-xs text-red-400/90 mt-0.5 line-clamp-2">{activeJob.error}</p>
            )}
          </div>
          <button
            type="button"
            onClick={dismissJob}
            className="text-gray-500 hover:text-white p-1 shrink-0"
            aria-label="Fechar painel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {(isRunning || status === 'completed') && (
          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, backgroundColor: themeColors.primary }}
            />
          </div>
        )}

        <div className="flex gap-2">
          {isRunning && (
            <button
              type="button"
              onClick={cancelPackExport}
              className="flex-1 py-1.5 rounded-lg text-xs border text-red-400/90 hover:bg-red-500/10"
              style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}
            >
              Cancelar
            </button>
          )}
          {!isRunning && (
            <button
              type="button"
              onClick={dismissJob}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium text-emerald-300 bg-emerald-500/20 hover:bg-emerald-500/30"
            >
              Ok
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
