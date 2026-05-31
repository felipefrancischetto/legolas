'use client';

import { useCallback, useMemo, useState } from 'react';
import BaseModal from './BaseModal';
import {
  pickBestTracksForMidiPack,
  type MidiPackTrackInput,
} from '../utils/midiPackExport';
import { useMidiPackExport } from '../contexts/MidiPackExportContext';

interface MidiPackExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  allTracks: MidiPackTrackInput[];
  filteredTracks: MidiPackTrackInput[];
}

type ExportScope = 'library' | 'filtered';

export default function MidiPackExportModal({
  isOpen,
  onClose,
  allTracks,
  filteredTracks,
}: MidiPackExportModalProps) {
  const [scope, setScope] = useState<ExportScope>('library');
  const { activeJob, startPackExport } = useMidiPackExport();

  const bestAll = useMemo(() => pickBestTracksForMidiPack(allTracks), [allTracks]);
  const bestFiltered = useMemo(() => pickBestTracksForMidiPack(filteredTracks), [filteredTracks]);

  const tracksToExport = scope === 'filtered' ? bestFiltered : bestAll;
  const hasFilter = bestFiltered.length !== bestAll.length;
  const exportRunning = activeJob?.status === 'running';

  const themeColors = {
    primary: 'rgb(16, 185, 129)',
    primaryLight: 'rgba(16, 185, 129, 0.9)',
    primaryDark: 'rgba(16, 185, 129, 0.7)',
    background: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)',
  };

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleStart = useCallback(() => {
    if (tracksToExport.length === 0 || exportRunning) return;

    const scopeLabel =
      scope === 'filtered' ? 'Busca filtrada' : 'Biblioteca inteira';

    const started = startPackExport(tracksToExport, scopeLabel);
    if (started) {
      onClose();
    }
  }, [tracksToExport, exportRunning, scope, startPackExport, onClose]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Pack MIDI da biblioteca"
      maxWidth="max-w-lg"
      themeColors={themeColors}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          Gera um ZIP com pastas organizadas: cada música vira uma pasta com subpastas{' '}
          <span className="text-gray-300">Drums</span>, <span className="text-gray-300">Bass</span>,{' '}
          <span className="text-gray-300">Synths</span>, etc. Pronto para extrair e usar no Ableton.
        </p>

        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium">Escopo</p>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="radio"
              name="midi-pack-scope"
              checked={scope === 'library'}
              onChange={() => setScope('library')}
              className="accent-emerald-500"
            />
            Biblioteca inteira ({bestAll.length}{' '}
            {bestAll.length === 1 ? 'música' : 'músicas'})
          </label>
          {hasFilter && (
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="radio"
                name="midi-pack-scope"
                checked={scope === 'filtered'}
                onChange={() => setScope('filtered')}
                className="accent-emerald-500"
              />
              Só resultado da busca ({bestFiltered.length}{' '}
              {bestFiltered.length === 1 ? 'música' : 'músicas'})
            </label>
          )}
        </div>

        <div
          className="text-xs text-gray-500 rounded-lg border px-3 py-2 space-y-1"
          style={{ borderColor: themeColors.border, backgroundColor: 'rgba(0,0,0,0.2)' }}
        >
          <p className="text-gray-400 font-medium">Estrutura do pack (após extrair o ZIP):</p>
          <pre className="font-mono text-[10px] text-gray-500 leading-relaxed whitespace-pre-wrap">
{`Legolas_MIDI_Pack_AAAA-MM-DD/
  Artista - Titulo/
    Drums/Kick_128bpm_1bar.mid
    Bass/Bassline_128bpm_2bar.mid
    Synths/Lead_128bpm_2bar.mid
    track-info.json
  README.txt`}
          </pre>
        </div>

        <div className="text-xs text-emerald-500/90 space-y-1 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2">
          <p>
            <span className="font-medium text-emerald-400">Melhor versão:</span> usa FLAC quando
            existir e MIDIs extraídos do áudio (não só templates).
          </p>
          <p>
            <span className="font-medium text-emerald-400">Segundo plano:</span> pode fechar este
            painel e usar o resto da plataforma; o progresso aparece no canto inferior.
          </p>
        </div>

        {exportRunning && (
          <p className="text-sm text-amber-400/90">
            Já há um pack em andamento. Veja o indicador no canto da tela ou aguarde terminar.
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleStart}
            disabled={tracksToExport.length === 0 || exportRunning}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            Iniciar pack em segundo plano
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2.5 rounded-lg text-sm border text-gray-400 hover:text-white transition-colors"
            style={{ borderColor: themeColors.border }}
          >
            Fechar
          </button>
        </div>
      </div>
    </BaseModal>
  );
}
