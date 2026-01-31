'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useSettings } from '../hooks/useSettings';
import LoadingSpinner from './LoadingSpinner';

interface AlbumModalProps {
  isOpen: boolean;
  onClose: () => void;
  albumData: {
    title: string;
    artist: string;
    artwork?: string;
    year?: string;
    genre?: string;
    label?: string;
    bpm?: string;
    key?: string;
    duration?: string;
    filename?: string;
    fileSize?: string;
    format?: string;
    bitrate?: string;
    sampleRate?: string;
    channels?: string;
    encoder?: string;
    dateAdded?: string;
    lastPlayed?: string;
    playCount?: number;
    album?: string;
    track?: string;
    disc?: string;
    composer?: string;
    publisher?: string;
    isrc?: string;
    catalog?: string;
  };
  themeColors?: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    background: string;
    border: string;
  };
  currentFile?: {
    name: string;
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
    label?: string;
    bpm?: number;
    key?: string;
    duration?: string;
    ano?: string;
    catalogNumber?: string;
    catalog?: string;
  };
  onSave?: () => void;
}

export default function AlbumModal({ isOpen, onClose, albumData, themeColors, currentFile, onSave }: AlbumModalProps) {
  const { settings } = useSettings();
  const [activeMainTab, setActiveMainTab] = useState<'info' | 'edit'>('info');
  const [activeEditTab, setActiveEditTab] = useState<'edit' | 'beatport'>('edit');
  const [form, setForm] = useState({
    title: albumData.title || '',
    artist: albumData.artist || '',
    duration: albumData.duration || '',
    bpm: albumData.bpm || '',
    key: albumData.key || '',
    genre: albumData.genre || '',
    album: albumData.album || '',
    label: albumData.label || '',
    catalog: albumData.catalog || '',
    releaseDate: albumData.year || '',
  });
  const [formTouched, setFormTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [propagateToAlbum, setPropagateToAlbum] = useState(false);
  
  // Resetar formulário quando albumData mudar
  useEffect(() => {
    setForm({
      title: albumData.title || '',
      artist: albumData.artist || '',
      duration: albumData.duration || '',
      bpm: albumData.bpm || '',
      key: albumData.key || '',
      genre: albumData.genre || '',
      album: albumData.album || '',
      label: albumData.label || '',
      catalog: albumData.catalog || '',
      releaseDate: albumData.year || '',
    });
    setFormTouched(false);
    setActiveMainTab('info');
    setActiveEditTab('edit');
  }, [albumData.title, albumData.artist, albumData.filename]);
  
  if (!isOpen) return null;

  // Cores padrão caso não sejam fornecidas
  const defaultColors = {
    primary: 'rgb(16, 185, 129)',
    primaryLight: 'rgba(16, 185, 129, 0.9)',
    primaryDark: 'rgba(16, 185, 129, 0.7)',
    background: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)'
  };
  
  // Usar cores padrão se cores dinâmicas estiverem desabilitadas
  const colors = (settings.disableDynamicColors || !themeColors) ? defaultColors : themeColors;

  // Função utilitária para normalizar o valor inicial da data
  function getInitialReleaseDate(ano?: string) {
    if (!ano) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(ano)) return ano;
    if (/^\d{4}$/.test(ano)) return ano + '-01-01';
    return '';
  }

  // Máscara para data YYYY-MM-DD
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^\d-]/g, '');
    // Adiciona os traços automaticamente
    if (value.length > 4 && value[4] !== '-') value = value.slice(0, 4) + '-' + value.slice(4);
    if (value.length > 7 && value[7] !== '-') value = value.slice(0, 7) + '-' + value.slice(7);
    value = value.slice(0, 10);
    setFormTouched(true);
    setForm(f => ({ ...f, releaseDate: value }));
    setDateError(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormTouched(true);
    if (name === 'releaseDate') {
      handleDateChange(e);
    } else {
      setForm(f => ({ ...f, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFile) return;
    
    setSaving(true);
    setDateError(null);
    if (form.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.releaseDate)) {
      setDateError('A data deve estar no formato YYYY-MM-DD.');
      setSaving(false);
      return;
    }
    
    try {
      const payload = {
        operation: 'update',
        fileName: currentFile.name,
        title: form.title,
        artist: form.artist,
        album: form.album,
        year: form.releaseDate,
        genre: form.genre,
        label: form.label,
        bpm: form.bpm ? parseInt(form.bpm) : undefined,
        key: form.key,
        catalogNumber: form.catalog,
        duration: form.duration,
      };

      const response = await fetch('/api/metadata/unified', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({ error: 'Falha ao atualizar metadados.' }));
        throw new Error(errorResult.error || 'Falha ao atualizar metadados.');
      }

      // Se deve propagar para o álbum
      if (propagateToAlbum && form.album && currentFile) {
        // Buscar todas as músicas do mesmo álbum
        const filesResponse = await fetch('/api/files');
        if (filesResponse.ok) {
          const filesData = await filesResponse.json();
          const albumTracks = filesData.files?.filter((f: any) => f.album === form.album) || [];
          
          if (albumTracks.length > 0) {
            const albumUpdates = albumTracks.map((track: any) => ({
              operation: 'update',
              fileName: track.name,
              title: track.name === currentFile.name ? form.title : track.title,
              artist: track.name === currentFile.name ? form.artist : track.artist,
              album: form.album,
              year: form.releaseDate,
              genre: track.name === currentFile.name ? form.genre : track.genre,
              label: form.label,
              bpm: track.name === currentFile.name ? (form.bpm ? parseInt(form.bpm) : undefined) : track.bpm,
              key: track.name === currentFile.name ? form.key : track.key,
              catalogNumber: form.catalog,
              duration: track.name === currentFile.name ? form.duration : track.duration,
            }));

            for (const updatePayload of albumUpdates) {
              await fetch('/api/metadata/unified', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatePayload),
              });
            }
          }
        }
      }

      setFormTouched(false);
      setSaving(false);
      if (onSave) onSave();
      // Fechar modal ou mostrar mensagem de sucesso
      alert('✅ Metadados atualizados com sucesso!');
    } catch (error) {
      setSaving(false);
      alert(`❌ Erro ao atualizar metadados: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  };

  const handleClose = () => {
    if (formTouched) {
      if (window.confirm('Você tem alterações não salvas. Deseja realmente fechar sem salvar?')) {
        setFormTouched(false);
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-2 animate-fade-in"
      style={{
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(12px) saturate(180%)',
      }}
      onClick={handleBackdropClick}
    >
      <div 
        className="rounded-2xl backdrop-blur-2xl max-w-5xl w-full shadow-2xl relative border max-h-[90vh] overflow-y-auto custom-scroll animate-scale-in"
        style={{
          background: `linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(39, 39, 42, 0.25) 50%, rgba(24, 24, 27, 0.3) 100%)`,
          borderColor: `rgba(16, 185, 129, 0.3)`,
          boxShadow: `0 20px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(16, 185, 129, 0.1), inset 0 1px 0 rgba(16, 185, 129, 0.15)`
        }}
      >
        {/* Header */}
        <div 
          className="flex justify-between items-center p-8 border-b sm:p-6 backdrop-blur-sm"
          style={{
            background: `linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(39, 39, 42, 0.15) 100%)`,
            borderColor: `rgba(16, 185, 129, 0.2)`
          }}
        >
          <div className="flex items-center gap-3">
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colors.primary }}
            />
            <h2 
              className="text-2xl font-bold sm:text-xl"
              style={{ color: colors.primary }}
            >
              Informações da Música
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-300 hover:text-white transition-all duration-200 p-2 rounded-full hover:scale-110 hover:rotate-90 backdrop-blur-sm"
            style={{
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
            }}
          >
            <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Abas Principais */}
        <div className="flex border-b" style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
          <button
            onClick={() => setActiveMainTab('info')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 ${
              activeMainTab === 'info'
                ? 'border-b-2'
                : 'text-gray-400 hover:text-white'
            }`}
            style={{
              color: activeMainTab === 'info' ? colors.primary : undefined,
              borderBottomColor: activeMainTab === 'info' ? colors.primary : 'transparent',
            }}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Informações
            </div>
          </button>
          <button
            onClick={() => setActiveMainTab('edit')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 ${
              activeMainTab === 'edit'
                ? 'border-b-2'
                : 'text-gray-400 hover:text-white'
            }`}
            style={{
              color: activeMainTab === 'edit' ? colors.primary : undefined,
              borderBottomColor: activeMainTab === 'edit' ? colors.primary : 'transparent',
            }}
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Editar Metadados
            </div>
          </button>
        </div>
        
        {/* Content */}
        {activeMainTab === 'info' && (
          <div className="p-8 sm:p-6 backdrop-blur-sm">
            {/* Layout responsivo: desktop lado a lado, mobile empilhado */}
            <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
              {/* Album Artwork - Destacado */}
              <div className="flex-shrink-0 flex justify-center lg:justify-start animate-image-fade-in">
                <div 
                  className="relative w-80 h-80 lg:w-96 lg:h-96 rounded-2xl overflow-hidden group sm:w-72 sm:h-72"
                  style={{
                    filter: 'drop-shadow(0 25px 50px rgba(0, 0, 0, 0.6))',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {/* Glow effect baseado na cor primária - sempre visível mas mais intenso no hover */}
                  <div 
                    className="absolute -inset-2 rounded-2xl blur-2xl transition-opacity duration-500"
                    style={{
                      background: `radial-gradient(circle, ${colors.primary}30 0%, transparent 70%)`,
                      opacity: 0.6,
                    }}
                  />
                  <div 
                    className="absolute -inset-2 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      background: `radial-gradient(circle, ${colors.primary}50 0%, transparent 70%)`,
                    }}
                  />
                  
                  {/* Borda com brilho animado */}
                  <div 
                    className="absolute inset-0 rounded-2xl border-2 transition-all duration-300"
                    style={{
                      borderColor: `rgba(16, 185, 129, 0.4)`,
                      boxShadow: `inset 0 0 20px rgba(16, 185, 129, 0.2), 0 0 40px ${colors.primary}30, 0 0 80px ${colors.primary}15`,
                    }}
                  />
                  
                  {albumData.artwork ? (
                    <>
                      <Image
                        src={albumData.artwork}
                        alt={albumData.title}
                        fill
                        className="object-cover transition-all duration-500 group-hover:scale-110"
                        priority
                        style={{
                          filter: 'brightness(1.08) contrast(1.08) saturate(1.1)',
                        }}
                      />
                      {/* Overlay sutil para destacar */}
                      <div 
                        className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/15 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      />
                      {/* Brilho no canto superior */}
                      <div 
                        className="absolute top-0 left-0 w-1/2 h-1/2 bg-gradient-to-br from-white/25 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-500 rounded-tl-2xl"
                      />
                      {/* Brilho no canto inferior direito */}
                      <div 
                        className="absolute bottom-0 right-0 w-1/3 h-1/3 bg-gradient-to-tl from-white/10 to-transparent opacity-40 group-hover:opacity-80 transition-opacity duration-500 rounded-br-2xl"
                      />
                    </>
                  ) : (
                    <div 
                      className="w-full h-full flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${colors.primaryDark} 0%, ${colors.primary} 100%)`
                      }}
                    >
                      <svg className="w-32 h-32 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                      </svg>
                    </div>
                  )}
                  
                  {/* Sombra interna para profundidade */}
                  <div className="absolute inset-0 rounded-2xl shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)] pointer-events-none" />
                  
                  {/* Efeito de brilho animado na borda */}
                  <div 
                    className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      boxShadow: `0 0 60px ${colors.primary}40, inset 0 0 30px ${colors.primary}20`,
                    }}
                  />
                </div>
              </div>
              
              {/* Informações da música */}
              <div className="flex-1 min-w-0">
                {/* Title and Artist */}
                <div className="mb-8 text-center lg:text-left animate-slide-up">
                  <h3 className="text-3xl font-bold text-white mb-3 leading-tight sm:text-2xl drop-shadow-lg">{albumData.title}</h3>
                  <p 
                    className="font-semibold text-xl sm:text-lg transition-colors duration-300"
                    style={{ 
                      color: colors.primary,
                      textShadow: `0 2px 8px ${colors.primary}40`
                    }}
                  >
                    {albumData.artist}
                  </p>
                  {albumData.album && albumData.album !== albumData.title && (
                    <p className="text-gray-300 text-lg mt-2 sm:text-base opacity-90">Álbum: {albumData.album}</p>
                  )}
                </div>
                
                {/* Informações organizadas em seções */}
                <div className="space-y-8">
                
                {/* Seção: Informações Básicas */}
                <div className="backdrop-blur-sm rounded-xl p-4 border"
                  style={{
                    background: 'rgba(16, 185, 129, 0.05)',
                    borderColor: 'rgba(16, 185, 129, 0.15)'
                  }}
                >
                  <h4 
                    className="text-lg font-semibold mb-4 pb-2 border-b"
                    style={{ 
                      color: colors.primary,
                      borderColor: `rgba(16, 185, 129, 0.2)`
                    }}
                  >
                    Informações Básicas
                  </h4>
                  <div className="space-y-3">
                    {albumData.genre && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Gênero</span>
                        <span className="text-white font-medium text-base">{albumData.genre}</span>
                      </div>
                    )}
                    {albumData.year && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Ano</span>
                        <span className="text-white font-medium text-base">{albumData.year}</span>
                      </div>
                    )}
                    {albumData.label && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Gravadora</span>
                        <span className="text-white font-medium text-base">{albumData.label}</span>
                      </div>
                    )}
                    {albumData.duration && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Duração</span>
                        <span className="text-white font-medium text-base">{albumData.duration}</span>
                      </div>
                    )}
                    {albumData.track && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Faixa</span>
                        <span className="text-white font-medium text-base">{albumData.track}</span>
                      </div>
                    )}
                    {albumData.disc && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Disco</span>
                        <span className="text-white font-medium text-base">{albumData.disc}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Seção: Informações Técnicas de Áudio */}
                <div className="backdrop-blur-sm rounded-xl p-4 border"
                  style={{
                    background: 'rgba(16, 185, 129, 0.05)',
                    borderColor: 'rgba(16, 185, 129, 0.15)'
                  }}
                >
                  <h4 
                    className="text-lg font-semibold mb-4 pb-2 border-b"
                    style={{ 
                      color: colors.primary,
                      borderColor: `rgba(16, 185, 129, 0.2)`
                    }}
                  >
                    Especificações Técnicas
                  </h4>
                  <div className="space-y-3">
                    {albumData.bpm && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">BPM</span>
                        <span 
                          className="font-medium text-base"
                          style={{ color: colors.primaryLight }}
                        >
                          {albumData.bpm}
                        </span>
                      </div>
                    )}
                    {albumData.key && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Tonalidade</span>
                        <span 
                          className="font-medium text-base"
                          style={{ color: colors.primaryLight }}
                        >
                          {albumData.key}
                        </span>
                      </div>
                    )}
                    {albumData.format && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Formato</span>
                        <span className="text-white font-medium text-base">{albumData.format.toUpperCase()}</span>
                      </div>
                    )}
                    {albumData.bitrate && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Bitrate</span>
                        <span className="text-white font-medium text-base">{albumData.bitrate}</span>
                      </div>
                    )}
                    {albumData.sampleRate && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Sample Rate</span>
                        <span className="text-white font-medium text-base">{albumData.sampleRate}</span>
                      </div>
                    )}
                    {albumData.channels && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Canais</span>
                        <span className="text-white font-medium text-base">{albumData.channels}</span>
                      </div>
                    )}
                    {albumData.encoder && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Encoder</span>
                        <span className="text-white font-medium text-base">{albumData.encoder}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Seção: Metadados Adicionais */}
                {(albumData.composer || albumData.publisher || albumData.isrc || albumData.catalog) && (
                  <div className="backdrop-blur-sm rounded-xl p-4 border"
                    style={{
                      background: 'rgba(16, 185, 129, 0.05)',
                      borderColor: 'rgba(16, 185, 129, 0.15)'
                    }}
                  >
                    <h4 
                      className="text-lg font-semibold mb-4 pb-2 border-b"
                      style={{ 
                        color: colors.primary,
                        borderColor: `rgba(16, 185, 129, 0.2)`
                      }}
                    >
                      Metadados
                    </h4>
                    <div className="space-y-3">
                      {albumData.composer && (
                        <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                          <span className="text-gray-300 text-base">Compositor</span>
                          <span className="text-white font-medium text-base">{albumData.composer}</span>
                        </div>
                      )}
                      {albumData.publisher && (
                        <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                          <span className="text-gray-300 text-base">Editora</span>
                          <span className="text-white font-medium text-base">{albumData.publisher}</span>
                        </div>
                      )}
                      {albumData.isrc && (
                        <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                          <span className="text-gray-300 text-base">ISRC</span>
                          <span className="text-white font-medium text-base">{albumData.isrc}</span>
                        </div>
                      )}
                      {albumData.catalog && (
                        <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                          <span className="text-gray-300 text-base">Catálogo</span>
                          <span className="text-white font-medium text-base">{albumData.catalog}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Seção: Informações do Arquivo */}
                <div className="backdrop-blur-sm rounded-xl p-4 border"
                  style={{
                    background: 'rgba(16, 185, 129, 0.05)',
                    borderColor: 'rgba(16, 185, 129, 0.15)'
                  }}
                >
                    <h4 
                    className="text-lg font-semibold mb-4 pb-2 border-b"
                    style={{ 
                      color: colors.primary,
                      borderColor: `rgba(16, 185, 129, 0.2)`
                    }}
                  >
                    Arquivo
                  </h4>
                  <div className="space-y-3">
                    {albumData.filename && (
                      <div className="flex justify-between items-start py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Nome do Arquivo</span>
                        <span className="text-white font-medium text-sm text-right max-w-64 break-all">
                          {albumData.filename}
                        </span>
                      </div>
                    )}
                    {albumData.fileSize && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Tamanho</span>
                        <span className="text-white font-medium text-base">{albumData.fileSize}</span>
                      </div>
                    )}
                    {albumData.dateAdded && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Adicionado em</span>
                        <span className="text-white font-medium text-base">{albumData.dateAdded}</span>
                      </div>
                    )}
                    {albumData.lastPlayed && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Última reprodução</span>
                        <span className="text-white font-medium text-base">{albumData.lastPlayed}</span>
                      </div>
                    )}
                    {albumData.playCount !== undefined && (
                      <div className="flex justify-between items-center py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-200">
                        <span className="text-gray-300 text-base">Reproduções</span>
                        <span 
                          className="font-medium text-base"
                          style={{ color: colors.primaryLight }}
                        >
                          {albumData.playCount}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                </div>
              </div>
            </div>
          </div>
        )}

        {/* Aba de Edição */}
        {activeMainTab === 'edit' && (
          <div>
            {/* Sub-abas de edição */}
            <div className="flex border-b" style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
              <button
                onClick={() => setActiveEditTab('edit')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 ${
                  activeEditTab === 'edit'
                    ? 'border-b-2'
                    : 'text-gray-400 hover:text-white'
                }`}
                style={{
                  color: activeEditTab === 'edit' ? colors.primary : undefined,
                  borderBottomColor: activeEditTab === 'edit' ? colors.primary : 'transparent',
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edição Manual
                </div>
              </button>
              <button
                onClick={() => setActiveEditTab('beatport')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 ${
                  activeEditTab === 'beatport'
                    ? 'border-b-2'
                    : 'text-gray-400 hover:text-white'
                }`}
                style={{
                  color: activeEditTab === 'beatport' ? colors.primary : undefined,
                  borderBottomColor: activeEditTab === 'beatport' ? colors.primary : 'transparent',
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Beatport
                </div>
              </button>
            </div>

            {/* Conteúdo da aba Edição Manual */}
            {activeEditTab === 'edit' && (
              <div className="p-4">
                <form onSubmit={handleSubmit} className="space-y-3">
                  {/* Grid principal com 3 colunas em desktop */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {/* Título - ocupa 2 colunas */}
                    <div className="lg:col-span-2 space-y-1">
                      <label className="text-xs font-medium" style={{ color: colors.primary }}>Título</label>
                      <input 
                        name="title" 
                        value={form.title} 
                        onChange={handleChange} 
                        placeholder="Nome da música"
                        className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 text-sm"
                        style={{
                          background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                          borderColor: 'rgba(16, 185, 129, 0.2)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                          '--tw-ring-color': colors.primary + '80'
                        } as React.CSSProperties}
                      />
                    </div>

                    {/* Duração */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium" style={{ color: colors.primary }}>Duração</label>
                      <input 
                        name="duration" 
                        value={form.duration} 
                        onChange={handleChange} 
                        placeholder="0:00"
                        className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 text-sm"
                        style={{
                          background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                          borderColor: 'rgba(16, 185, 129, 0.2)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Segunda linha - Artista e BPM */}
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                    {/* Artista - ocupa 3 colunas */}
                    <div className="lg:col-span-3 space-y-1">
                      <label className="text-xs font-medium" style={{ color: colors.primary }}>Artista</label>
                      <input 
                        name="artist" 
                        value={form.artist} 
                        onChange={handleChange} 
                        placeholder="Nome do artista"
                        className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 text-sm"
                        style={{
                          background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                          borderColor: 'rgba(16, 185, 129, 0.2)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                        }}
                      />
                    </div>

                    {/* BPM */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium" style={{ color: colors.primary }}>BPM</label>
                      <input 
                        name="bpm" 
                        value={form.bpm} 
                        onChange={handleChange} 
                        placeholder="120"
                        className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 text-sm"
                        style={{
                          background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                          borderColor: 'rgba(16, 185, 129, 0.2)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Terceira linha - Key, Gênero, Data */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium" style={{ color: colors.primary }}>Key</label>
                      <input 
                        name="key" 
                        value={form.key} 
                        onChange={handleChange} 
                        placeholder="A Minor"
                        className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 text-sm"
                        style={{
                          background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                          borderColor: 'rgba(16, 185, 129, 0.2)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium" style={{ color: colors.primary }}>Gênero</label>
                      <input 
                        name="genre" 
                        value={form.genre} 
                        onChange={handleChange} 
                        placeholder="Deep House"
                        className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 text-sm"
                        style={{
                          background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                          borderColor: 'rgba(16, 185, 129, 0.2)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                        }}
                      />
                    </div>

                    <div className="space-y-1 md:col-span-2 lg:col-span-1">
                      <label className="text-xs font-medium" style={{ color: colors.primary }}>Data</label>
                      <input 
                        name="releaseDate" 
                        value={form.releaseDate} 
                        onChange={handleChange} 
                        placeholder="YYYY-MM-DD" 
                        maxLength={10}
                        className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 text-sm"
                        style={{
                          background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                          borderColor: 'rgba(16, 185, 129, 0.2)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Quarta linha - Álbum, Label e Catálogo */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium" style={{ color: colors.primary }}>Álbum</label>
                      <input 
                        name="album" 
                        value={form.album} 
                        onChange={handleChange} 
                        placeholder="Nome do álbum"
                        className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 text-sm"
                        style={{
                          background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                          borderColor: 'rgba(16, 185, 129, 0.2)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium" style={{ color: colors.primary }}>Label</label>
                      <input 
                        name="label" 
                        value={form.label} 
                        onChange={handleChange} 
                        placeholder="Gravadora"
                        className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 text-sm"
                        style={{
                          background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                          borderColor: 'rgba(16, 185, 129, 0.2)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium" style={{ color: colors.primary }}>Catálogo</label>
                      <input 
                        name="catalog" 
                        value={form.catalog} 
                        onChange={handleChange} 
                        placeholder="CAT001"
                        className="w-full px-3 py-2 rounded-lg backdrop-blur-xl border text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 text-sm"
                        style={{
                          background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(39, 39, 42, 0.4) 100%)',
                          borderColor: 'rgba(16, 185, 129, 0.2)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Checkbox para propagar informações do álbum */}
                  {form.album && (
                    <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 backdrop-blur-sm">
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <div className="relative flex-shrink-0 mt-0.5">
                          <input
                            type="checkbox"
                            checked={propagateToAlbum}
                            onChange={(e) => setPropagateToAlbum(e.target.checked)}
                            className="sr-only"
                          />
                          <div 
                            className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                              propagateToAlbum 
                                ? 'bg-blue-500 border-blue-500 shadow-lg shadow-blue-500/30' 
                                : 'border-blue-400/50 bg-transparent hover:border-blue-400 hover:bg-blue-500/10'
                            }`}
                          >
                            {propagateToAlbum && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <div className="flex-1">
                          <span className="text-sm font-semibold text-blue-300 group-hover:text-blue-200 transition-colors">
                            Aplicar informações do álbum para todas as músicas
                          </span>
                          <p className="text-xs text-blue-200/80 mt-1 leading-relaxed">
                            <strong>Label</strong>, <strong>Data</strong> e <strong>Catálogo</strong> serão atualizados em todas as músicas do álbum <span className="font-medium text-blue-100">"{form.album}"</span>
                          </p>
                        </div>
                      </label>
                    </div>
                  )}

                  {/* Erro de data */}
                  {dateError && (
                    <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {dateError}
                    </div>
                  )}

                  {/* Botão de salvar */}
                  <div className="pt-3 border-t" style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                    <button 
                      type="submit" 
                      disabled={saving}
                      className="w-full px-4 py-2.5 rounded-lg font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      style={{
                        background: saving 
                          ? `linear-gradient(135deg, ${colors.primaryDark} 0%, ${colors.primary} 100%)`
                          : `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
                        boxShadow: saving 
                          ? `0 4px 16px ${colors.background}` 
                          : `0 8px 32px ${colors.background}, inset 0 1px 0 rgba(255, 255, 255, 0.2)`
                      }}
                    >
                      {saving ? (
                        <div className="flex items-center justify-center gap-2">
                          <LoadingSpinner size="sm" color="white" isLoading={saving} />
                          Salvando...
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Salvar Alterações
                        </div>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Conteúdo da aba Beatport */}
            {activeEditTab === 'beatport' && (
              <div className="p-4">
                <div className="space-y-4">
                  {/* Informações da música atual */}
                  <div className="bg-zinc-800/30 rounded-lg p-3 border backdrop-blur-sm" style={{ borderColor: 'rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.08)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium" style={{ color: colors.primary }}>Música Atual</h3>
                    </div>
                    <div className="text-xs text-zinc-300">
                      <div><strong>Título:</strong> {albumData.title}</div>
                      <div><strong>Artista:</strong> {albumData.artist || 'Não informado'}</div>
                    </div>
                  </div>

                  {/* Iframe do Beatport */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium" style={{ color: colors.primary }}>Pesquisar no Beatport</h3>
                      <button
                        onClick={() => {
                          const query = `${albumData.artist || ''} ${albumData.title}`.trim();
                          const beatportUrl = `https://www.beatport.com/search?q=${encodeURIComponent(query)}`;
                          window.open(beatportUrl, '_blank', 'noopener,noreferrer');
                        }}
                        className="px-3 py-1 text-white text-xs rounded-md hover:opacity-80 transition-colors"
                        style={{ backgroundColor: colors.primary }}
                      >
                        🔗 Abrir no Beatport
                      </button>
                    </div>
                    
                    <div className="w-full rounded-lg border p-6 text-center" style={{ borderColor: 'rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.05)' }}>
                      <div className="mb-4">
                        <svg className="w-16 h-16 mx-auto text-zinc-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        <h3 className="text-lg font-medium text-zinc-300 mb-2">Beatport abrirá em nova aba</h3>
                        <p className="text-sm text-zinc-400 mb-4">
                          Por questões de segurança, o Beatport não permite integração via iframe.
                        </p>
                      </div>
                      
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
                        <h4 className="text-sm font-medium text-blue-300 mb-2">🎯 Informações para buscar:</h4>
                        <div className="text-sm space-y-1">
                          <div className="bg-zinc-700/50 rounded px-3 py-2">
                            <strong className="text-blue-300">Busca:</strong> 
                            <span className="ml-2 text-white">{`${albumData.artist || ''} ${albumData.title}`.trim()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-zinc-400">
                        Clique no botão acima para abrir o Beatport em uma nova aba com a busca automática.
                      </div>
                    </div>
                  </div>

                  {/* Instruções */}
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                    <h4 className="text-xs font-medium text-blue-300 mb-2">💡 Como usar:</h4>
                    <ol className="text-xs text-blue-200/80 space-y-1 list-decimal list-inside">
                      <li>Clique em "🔗 Abrir no Beatport" - abrirá uma nova aba com busca automática</li>
                      <li>Encontre a música desejada na página do Beatport</li>
                      <li>Copie as informações (BPM, Key, Label, etc.) da página do Beatport</li>
                      <li>Volte para esta aba e vá para "Edição Manual"</li>
                      <li>Cole os dados copiados nos campos correspondentes</li>
                      <li>Clique em "Salvar Alterações"</li>
                    </ol>
                  </div>

                  {/* Botões de ação */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setActiveEditTab('edit')}
                      className="flex-1 px-4 py-2 text-white rounded-md hover:opacity-80 transition-colors text-sm"
                      style={{ backgroundColor: colors.primary }}
                    >
                      ← Voltar para Edição
                    </button>
                    <button
                      onClick={handleClose}
                      className="px-4 py-2 bg-zinc-700 text-white rounded-md hover:bg-zinc-600 transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Footer */}
        <div 
          className="p-8 border-t sm:p-6 backdrop-blur-sm"
          style={{ 
            borderColor: 'rgba(16, 185, 129, 0.2)',
            background: 'rgba(16, 185, 129, 0.05)'
          }}
        >
          <button
            onClick={handleClose}
            className="w-full px-6 py-3 text-white rounded-xl transition-all duration-200 font-semibold text-lg shadow-lg hover:scale-105"
            style={{
              backgroundColor: colors.primary,
              border: `1px solid ${colors.border}`,
              boxShadow: `0 4px 16px ${colors.background}`
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
} 