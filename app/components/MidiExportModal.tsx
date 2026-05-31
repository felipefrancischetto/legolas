'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import BaseModal from './BaseModal';
import LoadingSpinner from './LoadingSpinner';
import {
  generateMidiClip,
  downloadMidi,
  setMidiDragTransfer,
  setAllMidiDragTransfer,
  saveMidiWithPicker,
  downloadAllMidisAsZip,
  getMidiFilename,
  type MidiClip,
  type MidiGenerationContext,
} from '../utils/midiGenerator';
import {
  alignClipToArrangement,
  buildMidiGenerationContext,
  collectMidiElementsFromAnalysis,
  analysisCacheKey,
  getExtractedNotesForElement,
  hasValidMidiExtraction,
  mapAnalysisFromApi,
  type MusicAnalysisForMidi,
} from '../utils/midiFromAnalysis';
import { safeGetItem, safeSetItem } from '../utils/localStorage';

interface FileInfo {
  name: string;
  title?: string;
  displayName?: string;
  artist?: string;
  bpm?: number;
  key?: string;
  genre?: string;
}

interface MidiExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: FileInfo | null;
}

interface StemMidiEntry {
  id: string;
  element: string;
  category: string;
  role: string;
  intensity: number;
  clip: MidiClip;
  filename: string;
  fromAudio: boolean;
  noteCount: number;
}

export default function MidiExportModal({ isOpen, onClose, file }: MidiExportModalProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<MusicAnalysisForMidi | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exportIds, setExportIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [zipDone, setZipDone] = useState(false);
  const [canSavePicker] = useState(
    () => typeof window !== 'undefined' && 'showSaveFilePicker' in window
  );

  const themeColors = {
    primary: 'rgb(16, 185, 129)',
    primaryLight: 'rgba(16, 185, 129, 0.9)',
    primaryDark: 'rgba(16, 185, 129, 0.7)',
    background: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)',
  };

  const trackLabel = file?.title || file?.displayName || file?.name || 'Faixa';

  const stemEntries = useMemo((): StemMidiEntry[] => {
    if (!analysis || !file) return [];

    const bpm = analysis.bpm || file.bpm || 128;
    const key = analysis.key || analysis.harmony?.key || file.key || undefined;
    const genre = analysis.musicalIdentity?.genre || file.genre;

    const elements = collectMidiElementsFromAnalysis(analysis);

    return elements.map((el, index) => {
      const ctx: MidiGenerationContext = buildMidiGenerationContext(analysis, el, {
        bpm,
        key: key ?? undefined,
        genre,
      });
      const clip = generateMidiClip(ctx);
      const id = `${el.category}-${el.element}-${index}`.replace(/\s+/g, '_');

      const fromAudio = !!getExtractedNotesForElement(analysis, el.element, el.category);

      return {
        id,
        element: el.element,
        category: el.category,
        role: el.role,
        intensity: el.intensity,
        clip,
        filename: getMidiFilename(clip, trackLabel),
        fromAudio,
        noteCount: clip.notes.length,
      };
    });
  }, [analysis, file, trackLabel]);

  const stemIdsKey = stemEntries.map((s) => s.id).join('|');

  useEffect(() => {
    if (stemEntries.length === 0) {
      setExportIds(new Set());
      return;
    }
    setExportIds(new Set(stemEntries.map((s) => s.id)));
  }, [stemIdsKey]);

  const selectedStem = stemEntries.find((s) => s.id === selectedId) ?? stemEntries[0] ?? null;
  const exportSelection = stemEntries.filter((s) => exportIds.has(s.id));

  const exportClipsAligned = useMemo((): MidiClip[] => {
    if (!analysis) return [];
    return stemEntries
      .filter((s) => exportIds.has(s.id))
      .map((entry) =>
        alignClipToArrangement(
          entry.clip,
          analysis,
          entry.element,
          entry.category,
          entry.fromAudio
        )
      );
  }, [analysis, stemEntries, exportIds]);
  const fullTrackBars = analysis?.midiExtraction?.bars;
  const fullTrackCoverage = analysis?.midiExtraction?.coverage === 'full';

  useEffect(() => {
    if (!isOpen || !file) {
      setAnalysis(null);
      setAnalysisError(null);
      setSelectedId(null);
      setExportIds(new Set());
      setFeedback(null);
      setZipDone(false);
      return;
    }

    const cacheKey = analysisCacheKey(file.name);
    const cached = safeGetItem<MusicAnalysisForMidi>(cacheKey);
    if (cached && hasValidMidiExtraction(cached)) {
      setAnalysis(cached);
      setIsAnalyzing(false);
      return;
    }

    const abortController = new AbortController();

    const run = async () => {
      try {
        setIsAnalyzing(true);
        setAnalysisError(null);
        setAnalysis(null);

        const response = await fetch('/api/analyze-music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => null);
          const msg = err?.error || `HTTP ${response.status}`;
          const hint = err?.hint ? ` — ${err.hint}` : '';
          throw new Error(`${msg}${hint}`);
        }

        const data = await response.json();
        if (!data.success || !data.analysis) {
          throw new Error(data.error || 'Análise falhou');
        }

        const analysisData = mapAnalysisFromApi(data.analysis);

        setAnalysis(analysisData);
        safeSetItem(cacheKey, analysisData, {
          maxSize: 6 * 1024 * 1024,
          onError: () => {},
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setAnalysisError(error instanceof Error ? error.message : 'Erro na análise');
      } finally {
        if (!abortController.signal.aborted) {
          setIsAnalyzing(false);
        }
      }
    };

    run();
    return () => abortController.abort();
  }, [isOpen, file?.name]);

  useEffect(() => {
    if (stemEntries.length > 0 && !selectedId) {
      setSelectedId(stemEntries[0].id);
    }
  }, [stemEntries, selectedId]);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  const handleDownload = useCallback(
    (entry: StemMidiEntry) => {
      downloadMidi(entry.clip, entry.filename, trackLabel);
      showFeedback(`Baixado: ${entry.filename} — arraste o arquivo para uma faixa MIDI no Ableton`);
    },
    [trackLabel, showFeedback]
  );

  const handleSavePicker = useCallback(
    async (entry: StemMidiEntry) => {
      const ok = await saveMidiWithPicker(entry.clip, trackLabel);
      if (ok) {
        showFeedback('Arquivo salvo. No Ableton: arraste o .mid da pasta para uma faixa MIDI.');
      } else {
        handleDownload(entry);
        showFeedback('Download iniciado (salvar no disco não disponível neste navegador)');
      }
    },
    [trackLabel, showFeedback, handleDownload]
  );

  const toggleExportId = useCallback((id: string, checked: boolean) => {
    setExportIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleDownloadZip = useCallback(() => {
    if (!analysis || !file || exportSelection.length === 0) return;
    const bpm = analysis.bpm || file.bpm || 128;
    const key = analysis.key || analysis.harmony?.key || file.key || undefined;
    const genre = analysis.musicalIdentity?.genre || file.genre;
    const elements = exportSelection.map((s) => ({
      element: s.element,
      category: s.category,
      role: s.role,
      intensity: s.intensity,
    }));
    const count = downloadAllMidisAsZip(
      elements,
      bpm,
      key ?? undefined,
      genre,
      trackLabel,
      (el) => buildMidiGenerationContext(analysis, el, { bpm, key: key ?? undefined, genre })
    );
    setZipDone(true);
    showFeedback(
      `${count} arquivo(s) .mid no ZIP (${fullTrackCoverage ? 'faixa inteira' : 'trecho'}). Extraia e arraste para o Ableton.`
    );
    setTimeout(() => setZipDone(false), 4000);
  }, [analysis, file, trackLabel, showFeedback, exportSelection, fullTrackCoverage]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="MIDIs para Ableton Live 12"
      maxWidth="max-w-3xl"
      themeColors={themeColors}
    >
      {!file ? (
        <p className="text-gray-400 text-center py-8">Nenhuma música selecionada</p>
      ) : (
        <div className="space-y-4">
          <div className="pb-3 border-b border-white/10">
            <h3 className="text-white font-semibold truncate">{trackLabel}</h3>
            <p className="text-sm text-gray-400 truncate">{file.artist || 'Artista desconhecido'}</p>
            {analysis && (
              <p className="text-xs mt-1" style={{ color: themeColors.primary }}>
                {analysis.bpm || file.bpm} BPM · {analysis.key || file.key || '—'} ·{' '}
                {stemEntries.length} stems
                {fullTrackBars ? (
                  <> · faixa inteira ({fullTrackBars} compassos)</>
                ) : null}
              </p>
            )}
          </div>

          <div
            className="rounded-lg border px-3 py-2.5 text-xs text-gray-400 space-y-1"
            style={{ backgroundColor: 'rgba(0,0,0,0.25)', borderColor: themeColors.border }}
          >
            <p className="text-gray-300 font-medium">Como usar no Ableton 12</p>
            <p>
              O Ableton <strong className="text-gray-200">não aceita Ctrl+V</strong> de MIDI vindo do
              navegador. Use um destes métodos:
            </p>
            <ol className="list-decimal list-inside space-y-0.5 text-gray-500">
              <li>
                <strong className="text-gray-400">Arrastar todos</strong> (área grande) para o Arrangement —
                uma faixa MIDI por stem, como no print do Live
              </li>
              <li>
                <strong className="text-gray-400">Arrastar um stem</strong> na área menor abaixo
              </li>
              <li>
                <strong className="text-gray-400">Baixar .mid / ZIP</strong> e arrastar da pasta Downloads
              </li>
              <li>
                No Ableton: criar faixa MIDI → menu do clip →{' '}
                <strong className="text-gray-400">Importar arquivo MIDI</strong>
              </li>
            </ol>
          </div>

          {isAnalyzing ? (
            <div className="flex flex-col items-center py-12">
              <LoadingSpinner size="lg" themeColors={themeColors} isLoading />
              <p className="text-gray-400 mt-4 text-sm">
              Analisando a faixa inteira e extraindo MIDI… pode levar alguns minutos.
            </p>
            </div>
          ) : analysisError ? (
            <div className="text-center py-8">
              <p className="text-red-400 text-sm">{analysisError}</p>
            </div>
          ) : stemEntries.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Nenhum elemento detectado na análise</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setExportIds(new Set(stemEntries.map((s) => s.id)))}
                    className="text-[10px] px-2 py-1 rounded border text-gray-400 hover:text-white transition-colors"
                    style={{ borderColor: themeColors.border }}
                  >
                    Marcar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportIds(new Set())}
                    className="text-[10px] px-2 py-1 rounded border text-gray-400 hover:text-white transition-colors"
                    style={{ borderColor: themeColors.border }}
                  >
                    Desmarcar
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setExportIds(new Set(stemEntries.filter((s) => s.fromAudio).map((s) => s.id)))
                    }
                    className="text-[10px] px-2 py-1 rounded border text-gray-400 hover:text-white transition-colors"
                    style={{ borderColor: themeColors.border }}
                  >
                    Só extraídos do áudio
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadZip}
                  disabled={zipDone || exportSelection.length === 0}
                  className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-all hover:brightness-110 disabled:opacity-50"
                  style={{
                    backgroundColor: themeColors.background,
                    borderColor: themeColors.border,
                    color: themeColors.primary,
                  }}
                >
                  {zipDone
                    ? 'ZIP baixado'
                    : `Baixar selecionados (.zip · ${exportSelection.length})`}
                </button>
              </div>

              {feedback && (
                <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                  {feedback}
                </div>
              )}

              <p className="text-[11px] text-gray-500">
                Marque os stems que quer exportar. Clique no nome para pré-visualizar e baixar um .mid
                individual.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-1 custom-scroll-square">
                {stemEntries.map((entry) => {
                  const isPreview = selectedStem?.id === entry.id;
                  const isChecked = exportIds.has(entry.id);
                  return (
                    <div
                      key={entry.id}
                      className={`flex gap-2 p-3 rounded-lg border transition-all ${
                        isPreview ? 'ring-1 ring-emerald-500/60' : 'opacity-90 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: themeColors.background,
                        borderColor: isPreview ? themeColors.primary : themeColors.border,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => toggleExportId(entry.id, e.target.checked)}
                        className="mt-1 accent-emerald-500 shrink-0"
                        aria-label={`Exportar ${entry.element}`}
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedId(entry.id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-sm font-medium text-white truncate">{entry.element}</span>
                          <div className="flex gap-1 shrink-0">
                            {entry.fromAudio && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{
                                  backgroundColor: 'rgba(16,185,129,0.25)',
                                  color: themeColors.primary,
                                }}
                                title="Notas extraídas do áudio"
                              >
                                áudio
                              </span>
                            )}
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: themeColors.border, color: themeColors.primary }}
                            >
                              {entry.category}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1 truncate" title={entry.filename}>
                          {entry.clip.bars} comp. · {entry.noteCount} notas
                        </p>
                      </button>
                    </div>
                  );
                })}
              </div>

              {exportClipsAligned.length > 0 && (
                <div
                  draggable
                  onDragStart={(e) => {
                    setAllMidiDragTransfer(e.nativeEvent, exportClipsAligned, trackLabel);
                    showFeedback(
                      `Arrastando ${exportClipsAligned.length} MIDIs — solte no Arrangement do Ableton (Chrome/Edge)`
                    );
                  }}
                  className="rounded-xl border-2 border-dashed px-4 py-5 text-center cursor-grab active:cursor-grabbing select-none transition-all hover:border-emerald-500/60 hover:bg-emerald-500/10 mb-3"
                  style={{ borderColor: 'rgba(16, 185, 129, 0.55)', backgroundColor: 'rgba(16, 185, 129, 0.08)' }}
                >
                  <p className="text-sm font-semibold text-white">
                    Arrastar {exportClipsAligned.length} stems para o Ableton
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Solte na vista Arrangement — o Live cria uma faixa por arquivo (.mid)
                  </p>
                </div>
              )}

              {selectedStem && (
                <div className="space-y-3 pt-2 border-t border-white/10">
                  <p className="text-[10px] text-gray-600 uppercase tracking-wider">Um stem</p>
                  <div
                    draggable
                    onDragStart={(e) => setMidiDragTransfer(e.nativeEvent, selectedStem.clip, trackLabel)}
                    className="rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-grab active:cursor-grabbing select-none transition-all hover:border-emerald-500/60 hover:bg-emerald-500/5"
                    style={{ borderColor: themeColors.border }}
                  >
                    <svg
                      className="w-8 h-8 mx-auto mb-2 opacity-70"
                      style={{ color: themeColors.primary }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                    <p className="text-sm font-medium text-white">Arraste para o Ableton</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Segure e arraste esta área para uma faixa MIDI no Live 12 (Chrome/Edge)
                    </p>
                    <p className="text-[10px] text-gray-600 mt-2 font-mono truncate">
                      {selectedStem.filename}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownload(selectedStem)}
                      className="flex-1 min-w-[160px] text-sm px-4 py-2.5 rounded-lg font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
                    >
                      Baixar .mid
                    </button>
                    {canSavePicker && (
                      <button
                        type="button"
                        onClick={() => handleSavePicker(selectedStem)}
                        className="text-sm px-4 py-2.5 rounded-lg border font-medium transition-all hover:brightness-110"
                        style={{
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border,
                          color: themeColors.primary,
                        }}
                      >
                        Salvar como…
                      </button>
                    )}
                  </div>

                  <p className="text-[10px] text-gray-600">
                    Bateria exporta no canal 10 (GM). Synths/bass no canal 1. Após importar, confira o
                    BPM ({selectedStem.clip.bpm}) no Live.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </BaseModal>
  );
}
