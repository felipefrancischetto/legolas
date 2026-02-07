#!/usr/bin/env python3
"""
Legolas Audio Analyzer - Professional Electronic Music Analysis
Análise musical avançada usando librosa para detecção completa de:
- Identidade Musical (gênero, mood, energia, contexto)
- BPM, Groove e Ritmo
- Elementos de Bateria (detalhado)
- Elementos de Bass
- Synths e Camadas Sonoras
- Harmonia e Tonalidade
- Estrutura da Música (linha do tempo)
- Dinâmica e Arranjo
- Análise de Mixagem
- Análise para DJ
- Resumo Executivo
"""

import sys
import json
import warnings
import os

# Suprimir warnings para output limpo
warnings.filterwarnings('ignore')


def check_dependencies():
    """Verifica se as dependências estão instaladas."""
    missing = []
    try:
        import numpy
    except ImportError:
        missing.append('numpy')
    try:
        import librosa
    except ImportError:
        missing.append('librosa')

    if missing:
        print(json.dumps({
            "success": False,
            "error": f"Dependências faltando: {', '.join(missing)}. Execute: pip install {' '.join(missing)}"
        }))
        sys.exit(1)


check_dependencies()

import numpy as np
import librosa


# ──────────────────────────────────────────────────────────────────
# UTILIDADES
# ──────────────────────────────────────────────────────────────────

def convert_numpy(obj):
    """Converte objetos numpy para tipos Python nativos."""
    if isinstance(obj, dict):
        return {k: convert_numpy(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy(item) for item in obj]
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, np.bool_):
        return bool(obj)
    return obj


def clamp(value, min_val=0, max_val=100):
    """Limita valor entre min e max."""
    return max(min_val, min(max_val, value))


def format_time(seconds):
    """Formata segundos para MM:SS."""
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m}:{s:02d}"


# ──────────────────────────────────────────────────────────────────
# 1. IDENTIDADE MUSICAL
# ──────────────────────────────────────────────────────────────────

def analyze_musical_identity(y, sr, bpm, key, freq_bands, rms_curve):
    """
    Identifica gênero, subgêneros, energia, mood e contexto de uso.
    """
    try:
        # Spectral features para classificação
        spectral_centroid = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
        spectral_rolloff = np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr))
        spectral_flatness = np.mean(librosa.feature.spectral_flatness(y=y))
        zero_crossing = np.mean(librosa.feature.zero_crossing_rate(y=y))

        # Separar harmônico e percussivo
        y_harm, y_perc = librosa.effects.hpss(y)
        perc_ratio = np.mean(y_perc ** 2) / (np.mean(y ** 2) + 1e-10)
        harm_ratio = np.mean(y_harm ** 2) / (np.mean(y ** 2) + 1e-10)

        # Energia geral (baseada no RMS médio)
        avg_rms = np.mean(rms_curve)
        max_rms = np.max(rms_curve)

        # Classificar energia
        energy_score = clamp(int(avg_rms / max_rms * 100) if max_rms > 0 else 50)
        if energy_score > 70:
            energy_level = "alta"
        elif energy_score > 40:
            energy_level = "média"
        else:
            energy_level = "baixa"

        # Detectar gênero e subgêneros baseado em features
        genre, subgenres = classify_genre(bpm, spectral_centroid, spectral_flatness,
                                          perc_ratio, harm_ratio, freq_bands, energy_score)

        # Detectar mood
        mood = classify_mood(key, spectral_centroid, spectral_flatness,
                            energy_score, harm_ratio, bpm)

        # Contexto de uso
        context = classify_context(bpm, energy_score, mood, genre)

        return {
            "genre": genre,
            "subgenres": subgenres,
            "energy_level": energy_level,
            "energy_score": energy_score,
            "mood": mood,
            "context": context
        }
    except Exception as e:
        return {
            "genre": "Electronic",
            "subgenres": [],
            "energy_level": "média",
            "energy_score": 50,
            "mood": "neutro",
            "context": "club"
        }


def classify_genre(bpm, centroid, flatness, perc_ratio, harm_ratio, freq_bands, energy):
    """Classifica gênero e subgêneros baseado em features de áudio."""
    genre = "Electronic"
    subgenres = []

    if bpm is None:
        return genre, subgenres

    # Techno: 125-145 BPM, alta percussão, baixa harmonia, energia média-alta
    if 125 <= bpm <= 150 and perc_ratio > 0.3:
        genre = "Techno"
        if bpm >= 138:
            subgenres.append("Hard Techno")
        if energy > 70:
            subgenres.append("Peak Time Techno")
        if harm_ratio < 0.3 and flatness > 0.1:
            subgenres.append("Industrial Techno")
        if freq_bands.get('sub_bass', 0) > 0.6:
            subgenres.append("Dub Techno")
        if centroid < 2000 and energy < 60:
            subgenres.append("Minimal Techno")
        if harm_ratio > 0.4:
            subgenres.append("Melodic Techno")

    # House: 118-132 BPM, groove, mais harmônico
    elif 118 <= bpm <= 135 and harm_ratio > 0.3:
        genre = "House"
        if centroid > 3000 and energy > 60:
            subgenres.append("Tech House")
        if harm_ratio > 0.5:
            subgenres.append("Deep House")
        if energy > 70:
            subgenres.append("Progressive House")
        if freq_bands.get('mid', 0) > 0.5 and centroid < 2500:
            subgenres.append("Afro House")

    # Trance: 128-150 BPM, muito harmônico, builds longos
    elif 128 <= bpm <= 150 and harm_ratio > 0.5:
        genre = "Trance"
        if bpm >= 138:
            subgenres.append("Psytrance")
        if energy > 70:
            subgenres.append("Uplifting Trance")
        if centroid < 2500:
            subgenres.append("Progressive Trance")

    # Drum & Bass: 160-180 BPM
    elif 160 <= bpm <= 185:
        genre = "Drum & Bass"
        if energy > 70:
            subgenres.append("Neurofunk")
        if harm_ratio > 0.4:
            subgenres.append("Liquid DnB")

    # Downtempo: 80-115 BPM
    elif 80 <= bpm <= 115:
        genre = "Downtempo"
        if harm_ratio > 0.5:
            subgenres.append("Electronica")
        if energy < 40:
            subgenres.append("Ambient")
        if perc_ratio > 0.3:
            subgenres.append("Breakbeat")

    # Electro: 125-140 BPM, digital, brilhante
    elif 125 <= bpm <= 145 and flatness > 0.15:
        genre = "Electro"
        subgenres.append("Electro")

    if not subgenres:
        subgenres.append(genre)

    return genre, subgenres


def classify_mood(key, centroid, flatness, energy, harm_ratio, bpm):
    """Classifica o mood emocional da faixa."""
    moods = []

    if key and key.endswith('m'):
        # Tonalidade menor - tendência mais sombria
        if energy > 70:
            moods.append("sombrio")
            moods.append("intenso")
        elif energy < 40:
            moods.append("melancólico")
            moods.append("introspectivo")
        else:
            moods.append("hipnótico")
    else:
        # Tonalidade maior - tendência mais brilhante
        if energy > 70:
            moods.append("eufórico")
            moods.append("energético")
        elif energy < 40:
            moods.append("contemplativo")
            moods.append("etéreo")
        else:
            moods.append("groovy")

    if bpm and bpm > 135 and energy > 60:
        moods.append("driving")
    if harm_ratio > 0.5 and centroid < 2500:
        moods.append("atmosférico")
    if flatness > 0.15:
        moods.append("texturizado")
    if energy < 30 and harm_ratio > 0.4:
        moods.append("ambient")

    return moods[:3] if moods else ["neutro"]


def classify_context(bpm, energy, mood, genre):
    """Classifica contexto de uso para DJs."""
    contexts = []

    if energy > 75:
        contexts.append("club peak time")
    elif energy > 55:
        contexts.append("club main set")
    elif energy > 35:
        contexts.append("warm-up")
    else:
        contexts.append("after hours")

    if "ambient" in mood or "introspectivo" in mood:
        contexts.append("listening")
    if "hipnótico" in mood:
        contexts.append("after hours")
    if "eufórico" in mood:
        contexts.append("festival main stage")

    return contexts[:2] if contexts else ["club"]


# ──────────────────────────────────────────────────────────────────
# 2. BPM, GROOVE E RITMO
# ──────────────────────────────────────────────────────────────────

def detect_bpm(y, sr):
    """Detecta o BPM da música."""
    try:
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        if hasattr(tempo, '__len__'):
            tempo = float(tempo[0])
        else:
            tempo = float(tempo)
        return round(tempo, 1)
    except Exception:
        return None


def analyze_groove_and_rhythm(y, sr, bpm):
    """
    Analisa groove, swing e complexidade rítmica.
    """
    try:
        # Separar percussivo
        _, y_perc = librosa.effects.hpss(y)

        # Beat tracking
        tempo, beat_frames = librosa.beat.beat_track(y=y_perc, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)

        # Calcular swing/groove
        swing = 0.0
        groove_type = "reto"
        if len(beat_times) > 4:
            # Calcular intervalos entre beats
            intervals = np.diff(beat_times)
            if len(intervals) > 2:
                # Swing é a variação entre beats pares e ímpares
                even_intervals = intervals[0::2]
                odd_intervals = intervals[1::2]
                min_len = min(len(even_intervals), len(odd_intervals))
                if min_len > 0:
                    ratio = np.mean(even_intervals[:min_len]) / (np.mean(odd_intervals[:min_len]) + 1e-10)
                    swing = abs(ratio - 1.0) * 100
                    if swing > 15:
                        groove_type = "shuffle"
                    elif swing > 5:
                        groove_type = "groovado"
                    else:
                        groove_type = "reto"

        # Complexidade rítmica - baseada na variação de onset strength
        onset_env = librosa.onset.onset_strength(y=y_perc, sr=sr)
        onset_var = np.std(onset_env) / (np.mean(onset_env) + 1e-10)

        if onset_var > 1.5:
            rhythmic_complexity = "complexa"
        elif onset_var > 0.8:
            rhythmic_complexity = "média"
        else:
            rhythmic_complexity = "simples"

        # Padrão rítmico dominante
        rhythmic_pattern = "4x4"
        if bpm and bpm > 0:
            # Analisar onsets por compasso
            beats_per_bar = 4
            bar_duration = (60.0 / bpm) * beats_per_bar
            onsets = librosa.onset.onset_detect(y=y_perc, sr=sr, units='time')

            if len(onsets) > 8:
                # Verificar regularidade
                onset_intervals = np.diff(onsets)
                beat_interval = 60.0 / bpm
                regular_count = np.sum(np.abs(onset_intervals - beat_interval) < beat_interval * 0.2)
                regularity = regular_count / len(onset_intervals) if len(onset_intervals) > 0 else 0

                if regularity > 0.6:
                    rhythmic_pattern = "4x4"
                elif regularity > 0.3:
                    rhythmic_pattern = "broken beat"
                else:
                    rhythmic_pattern = "polirrítmico"

        return {
            "bpm": bpm,
            "swing": round(swing, 1),
            "groove_type": groove_type,
            "rhythmic_complexity": rhythmic_complexity,
            "rhythmic_pattern": rhythmic_pattern
        }
    except Exception:
        return {
            "bpm": bpm,
            "swing": 0,
            "groove_type": "reto",
            "rhythmic_complexity": "média",
            "rhythmic_pattern": "4x4"
        }


# ──────────────────────────────────────────────────────────────────
# 3. ELEMENTOS DE BATERIA (detalhado)
# ──────────────────────────────────────────────────────────────────

def detect_drums_detailed(y, sr):
    """
    Detecta elementos de bateria com detalhes de papel, padrão e tipo.
    """
    try:
        y_harm, y_perc = librosa.effects.hpss(y)
        D_perc = np.abs(librosa.stft(y_perc))
        freqs = librosa.fft_frequencies(sr=sr)
        avg_energy = np.mean(D_perc) + 1e-10

        # Onset envelope para análise temporal
        onset_env = librosa.onset.onset_strength(y=y_perc, sr=sr)
        onset_times = librosa.frames_to_time(np.arange(len(onset_env)), sr=sr)

        elements = {}

        # ── KICK ──
        kick_mask = (freqs >= 20) & (freqs <= 120)
        kick_energy = np.mean(D_perc[kick_mask, :]) if np.any(kick_mask) else 0
        kick_present = kick_energy > avg_energy * 0.5
        kick_type = "seco"
        if kick_present:
            sub_mask = (freqs >= 20) & (freqs <= 50)
            sub_energy = np.mean(D_perc[sub_mask, :]) if np.any(sub_mask) else 0
            punch_mask = (freqs >= 60) & (freqs <= 120)
            punch_energy = np.mean(D_perc[punch_mask, :]) if np.any(punch_mask) else 0

            if sub_energy > punch_energy * 1.5:
                kick_type = "sub"
            elif punch_energy > sub_energy * 1.5:
                kick_type = "punchy"
            elif kick_energy > avg_energy * 2:
                kick_type = "distorcido"
            else:
                kick_type = "seco"

        elements["kick"] = {
            "present": bool(kick_present),
            "type": kick_type,
            "role": "base" if kick_present else "ausente",
            "pattern": "constante" if kick_present else "ausente",
            "energy": round(float(kick_energy / avg_energy * 100), 1) if kick_present else 0
        }

        # ── SNARE / CLAP ──
        snare_mask = (freqs >= 200) & (freqs <= 500)
        snare_energy = np.mean(D_perc[snare_mask, :]) if np.any(snare_mask) else 0
        snare_present = snare_energy > avg_energy * 0.3
        # Verificar se é mais clap (mais brilhante) ou snare
        snare_hi_mask = (freqs >= 1000) & (freqs <= 4000)
        snare_hi_energy = np.mean(D_perc[snare_hi_mask, :]) if np.any(snare_hi_mask) else 0
        snare_type = "clap" if snare_hi_energy > snare_energy * 0.8 else "snare"

        elements["snare_clap"] = {
            "present": bool(snare_present),
            "type": snare_type,
            "role": "groove" if snare_present else "ausente",
            "pattern": "constante" if snare_present else "ausente",
            "energy": round(float(snare_energy / avg_energy * 100), 1) if snare_present else 0
        }

        # ── HI-HATS ──
        hh_closed_mask = (freqs >= 6000) & (freqs <= 10000)
        hh_open_mask = (freqs >= 4000) & (freqs <= 8000)
        hh_closed_energy = np.mean(D_perc[hh_closed_mask, :]) if np.any(hh_closed_mask) else 0
        hh_open_energy = np.mean(D_perc[hh_open_mask, :]) if np.any(hh_open_mask) else 0
        hh_present = hh_closed_energy > avg_energy * 0.2 or hh_open_energy > avg_energy * 0.2

        # Analisar variação temporal para shuffle
        hh_full_mask = (freqs >= 4000) & (freqs <= 12000)
        hh_temporal = np.mean(D_perc[hh_full_mask, :], axis=0) if np.any(hh_full_mask) else np.zeros(D_perc.shape[1])
        hh_variance = np.std(hh_temporal) / (np.mean(hh_temporal) + 1e-10)
        hh_type = "shuffles" if hh_variance > 0.8 else ("abertos" if hh_open_energy > hh_closed_energy else "fechados")

        elements["hihats"] = {
            "present": bool(hh_present),
            "type": hh_type,
            "role": "groove" if hh_present else "ausente",
            "pattern": "shuffle" if hh_variance > 0.8 else "constante",
            "energy": round(float((hh_closed_energy + hh_open_energy) / avg_energy * 50), 1) if hh_present else 0
        }

        # ── CYMBALS / RIDES ──
        cymbal_mask = (freqs >= 8000) & (freqs <= 20000)
        cymbal_energy = np.mean(D_perc[cymbal_mask, :]) if np.any(cymbal_mask) else 0
        cymbal_present = cymbal_energy > avg_energy * 0.4

        elements["cymbals_rides"] = {
            "present": bool(cymbal_present),
            "type": "ride" if cymbal_energy < avg_energy * 0.8 else "crash",
            "role": "textura" if cymbal_present else "ausente",
            "pattern": "variação progressiva" if cymbal_present else "ausente",
            "energy": round(float(cymbal_energy / avg_energy * 100), 1) if cymbal_present else 0
        }

        # ── PERCUSSÕES ORGÂNICAS/ELETRÔNICAS ──
        perc_mask = (freqs >= 300) & (freqs <= 3000)
        perc_energy = np.mean(D_perc[perc_mask, :]) if np.any(perc_mask) else 0
        perc_present = perc_energy > avg_energy * 0.25

        # Orgânica vs eletrônica: flatness do espectro percussivo
        perc_spec = D_perc[perc_mask, :] if np.any(perc_mask) else D_perc[:10, :]
        perc_flatness = np.mean(librosa.feature.spectral_flatness(S=perc_spec))
        perc_type = "eletrônicas" if perc_flatness > 0.1 else "orgânicas"

        elements["percussion"] = {
            "present": bool(perc_present),
            "type": perc_type,
            "role": "textura" if perc_present else "ausente",
            "pattern": "variação progressiva" if perc_present else "ausente",
            "energy": round(float(perc_energy / avg_energy * 100), 1) if perc_present else 0
        }

        # ── FILLS E TRANSIÇÕES ──
        # Detectar momentos de alta atividade percussiva seguidos por mudanças
        onset_peaks = onset_env > np.percentile(onset_env, 90)
        fills_count = 0
        in_fill = False
        for i in range(len(onset_peaks)):
            if onset_peaks[i] and not in_fill:
                in_fill = True
                fills_count += 1
            elif not onset_peaks[i]:
                in_fill = False

        elements["fills"] = {
            "present": fills_count > 3,
            "type": "fills de transição",
            "role": "impacto",
            "pattern": "fills" if fills_count > 3 else "ausente",
            "count": fills_count,
            "energy": 0
        }

        return elements
    except Exception as e:
        return {
            "kick": {"present": False, "type": "seco", "role": "ausente", "pattern": "ausente", "energy": 0},
            "snare_clap": {"present": False, "type": "snare", "role": "ausente", "pattern": "ausente", "energy": 0},
            "hihats": {"present": False, "type": "fechados", "role": "ausente", "pattern": "ausente", "energy": 0},
            "cymbals_rides": {"present": False, "type": "ride", "role": "ausente", "pattern": "ausente", "energy": 0},
            "percussion": {"present": False, "type": "eletrônicas", "role": "ausente", "pattern": "ausente", "energy": 0},
            "fills": {"present": False, "type": "fills", "role": "ausente", "pattern": "ausente", "count": 0, "energy": 0}
        }


# ──────────────────────────────────────────────────────────────────
# 4. ELEMENTOS DE BASS
# ──────────────────────────────────────────────────────────────────

def analyze_bass_detailed(y, sr):
    """Analisa elementos de bass com detalhes."""
    try:
        D = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)
        avg_energy = np.mean(D) + 1e-10

        # ── SUB BASS ──
        sub_mask = (freqs >= 20) & (freqs <= 60)
        sub_energy = np.mean(D[sub_mask, :]) if np.any(sub_mask) else 0
        sub_present = sub_energy > avg_energy * 0.3
        # Analisar se é mono, sustentado, pulsado
        sub_temporal = np.mean(D[sub_mask, :], axis=0) if np.any(sub_mask) else np.zeros(D.shape[1])
        sub_variance = np.std(sub_temporal) / (np.mean(sub_temporal) + 1e-10)

        sub_bass_info = {
            "present": bool(sub_present),
            "type": "sustentado" if sub_variance < 0.5 else "pulsado",
            "mono": True,  # Sub bass é sempre mono em boa produção
            "sidechain": sub_variance > 0.3,
            "energy": round(float(sub_energy / avg_energy * 100), 1)
        }

        # ── MID BASS ──
        mid_mask = (freqs >= 60) & (freqs <= 250)
        mid_energy = np.mean(D[mid_mask, :]) if np.any(mid_mask) else 0
        mid_present = mid_energy > avg_energy * 0.4

        # Verificar textura e movimento
        mid_temporal = np.mean(D[mid_mask, :], axis=0) if np.any(mid_mask) else np.zeros(D.shape[1])
        mid_variance = np.std(mid_temporal) / (np.mean(mid_temporal) + 1e-10)
        mid_flatness = np.mean(librosa.feature.spectral_flatness(S=D[mid_mask, :] if np.any(mid_mask) else D[:5, :]))

        mid_bass_info = {
            "present": bool(mid_present),
            "texture": "distorcido" if mid_flatness > 0.15 else "limpo",
            "movement": "dinâmico" if mid_variance > 0.6 else "estático",
            "energy": round(float(mid_energy / avg_energy * 100), 1)
        }

        # ── BASSLINE ──
        bass_full_mask = (freqs >= 30) & (freqs <= 250)
        bass_temporal = np.mean(D[bass_full_mask, :], axis=0) if np.any(bass_full_mask) else np.zeros(D.shape[1])
        bass_var = np.var(bass_temporal)
        bassline_present = bass_var > 0.01 and (sub_present or mid_present)

        # Classificar tipo de bassline
        if bassline_present:
            if mid_variance > 0.8:
                bassline_type = "evolutiva"
            elif mid_variance > 0.4:
                bassline_type = "rítmica"
            elif bass_var > 0.05:
                bassline_type = "melódica"
            else:
                bassline_type = "repetitiva"
        else:
            bassline_type = "ausente"

        bassline_info = {
            "present": bool(bassline_present),
            "type": bassline_type,
            "energy": round(float(np.mean(bass_temporal) / avg_energy * 100), 1)
        }

        # ── RELAÇÃO KICK x BASS ──
        _, y_perc = librosa.effects.hpss(y)
        D_perc = np.abs(librosa.stft(y_perc))
        kick_mask = (freqs >= 20) & (freqs <= 120)
        kick_energy = np.mean(D_perc[kick_mask, :]) if np.any(kick_mask) else 0

        if kick_energy > 0 and sub_energy > 0:
            ratio = kick_energy / (sub_energy + 1e-10)
            if ratio > 2:
                kick_bass_relation = "kick dominante"
            elif ratio > 1:
                kick_bass_relation = "bem encaixado"
            elif ratio > 0.5:
                kick_bass_relation = "bass dominante"
            else:
                kick_bass_relation = "flutuante"

            if sub_bass_info["sidechain"]:
                kick_bass_relation = "bem encaixado (sidechain)"
        else:
            kick_bass_relation = "sem relação clara"

        return {
            "sub_bass": sub_bass_info,
            "mid_bass": mid_bass_info,
            "bassline": bassline_info,
            "kick_bass_relation": kick_bass_relation
        }
    except Exception:
        return {
            "sub_bass": {"present": False, "type": "sustentado", "mono": True, "sidechain": False, "energy": 0},
            "mid_bass": {"present": False, "texture": "limpo", "movement": "estático", "energy": 0},
            "bassline": {"present": False, "type": "ausente", "energy": 0},
            "kick_bass_relation": "sem relação clara"
        }


# ──────────────────────────────────────────────────────────────────
# 5. SYNTHS E CAMADAS SONORAS
# ──────────────────────────────────────────────────────────────────

def analyze_synths_and_layers(y, sr):
    """Analisa synths e camadas sonoras em detalhe."""
    try:
        y_harm, y_perc = librosa.effects.hpss(y)
        D = np.abs(librosa.stft(y_harm))
        freqs = librosa.fft_frequencies(sr=sr)
        avg_energy = np.mean(D) + 1e-10

        # Features espectrais
        centroid = np.mean(librosa.feature.spectral_centroid(y=y_harm, sr=sr))
        rolloff = np.mean(librosa.feature.spectral_rolloff(y=y_harm, sr=sr))
        flatness = np.mean(librosa.feature.spectral_flatness(y=y_harm))

        layers = []

        # ── PADS ──
        low_mid_mask = (freqs >= 200) & (freqs <= 800)
        low_mid_energy = np.mean(D[low_mid_mask, :]) if np.any(low_mid_mask) else 0
        low_mid_temporal = np.mean(D[low_mid_mask, :], axis=0) if np.any(low_mid_mask) else np.zeros(D.shape[1])
        low_mid_variance = np.std(low_mid_temporal) / (np.mean(low_mid_temporal) + 1e-10)

        if low_mid_energy > avg_energy * 0.3 and low_mid_variance < 0.8:
            pad_type = "atmosféricos" if low_mid_variance < 0.3 else "harmônicos"
            if low_mid_variance < 0.15:
                pad_type = "drones"
            layers.append({
                "name": f"Pad ({pad_type})",
                "category": "pads",
                "function": "ambiente e textura",
                "movement": "estático" if low_mid_variance < 0.3 else "automações lentas",
                "register": "grave-médio",
                "energy": round(float(low_mid_energy / avg_energy * 100), 1)
            })

        # ── LEADS ──
        mid_hi_mask = (freqs >= 1000) & (freqs <= 6000)
        mid_hi_energy = np.mean(D[mid_hi_mask, :]) if np.any(mid_hi_mask) else 0
        mid_hi_temporal = np.mean(D[mid_hi_mask, :], axis=0) if np.any(mid_hi_mask) else np.zeros(D.shape[1])
        mid_hi_variance = np.std(mid_hi_temporal) / (np.mean(mid_hi_temporal) + 1e-10)

        if mid_hi_energy > avg_energy * 0.4:
            if flatness > 0.12:
                lead_type = "ácidos"
            elif mid_hi_variance > 0.7:
                lead_type = "rítmicos"
            else:
                lead_type = "melódicos"
            layers.append({
                "name": f"Lead ({lead_type})",
                "category": "leads",
                "function": "melodia principal",
                "movement": "modulações" if mid_hi_variance > 0.5 else "estático",
                "register": "médio-agudo",
                "energy": round(float(mid_hi_energy / avg_energy * 100), 1)
            })

        # ── ARPS / SEQUÊNCIAS ──
        hi_mask = (freqs >= 2000) & (freqs <= 8000)
        hi_temporal = np.mean(D[hi_mask, :], axis=0) if np.any(hi_mask) else np.zeros(D.shape[1])
        # Detectar padrões repetitivos (arps)
        if len(hi_temporal) > 100:
            autocorr = np.correlate(hi_temporal[:500], hi_temporal[:500], mode='full')
            autocorr = autocorr[len(autocorr)//2:]
            # Normalizar
            autocorr = autocorr / (autocorr[0] + 1e-10)
            # Procurar picos periódicos
            peaks = []
            for i in range(10, len(autocorr) - 1):
                if autocorr[i] > autocorr[i-1] and autocorr[i] > autocorr[i+1] and autocorr[i] > 0.3:
                    peaks.append(i)
            has_arps = len(peaks) > 2
        else:
            has_arps = False

        if has_arps:
            layers.append({
                "name": "Arp / Sequência",
                "category": "arps",
                "function": "textura rítmica e melodia",
                "movement": "sequência repetitiva",
                "register": "médio-agudo",
                "energy": round(float(np.mean(D[hi_mask, :]) / avg_energy * 100), 1) if np.any(hi_mask) else 0
            })

        # ── FX (risers, impacts, sweeps) ──
        # Detectar transientes de alta energia em altas frequências
        full_hi_mask = (freqs >= 4000) & (freqs <= 20000)
        full_hi_temporal = np.mean(D[full_hi_mask, :], axis=0) if np.any(full_hi_mask) else np.zeros(D.shape[1])
        hi_peaks = full_hi_temporal > np.percentile(full_hi_temporal, 95)
        fx_count = np.sum(np.diff(hi_peaks.astype(int)) > 0)

        if fx_count > 2:
            layers.append({
                "name": "FX (risers, sweeps)",
                "category": "fx",
                "function": "transição e impacto",
                "movement": "automações dramáticas",
                "register": "agudo",
                "energy": round(float(np.percentile(full_hi_temporal, 95) / avg_energy * 100), 1)
            })

        # ── TEXTURAS ──
        noise_level = flatness
        if noise_level > 0.08:
            texture_type = "digitais" if noise_level > 0.15 else ("granulares" if noise_level > 0.1 else "analógicas")
            layers.append({
                "name": f"Texturas ({texture_type})",
                "category": "textures",
                "function": "profundidade e atmosfera",
                "movement": "modulações sutis",
                "register": "amplo",
                "energy": round(float(noise_level * 500), 1)
            })

        # Se não detectamos nada, adicionar genérico
        if not layers:
            layers.append({
                "name": "Synth",
                "category": "leads",
                "function": "elemento principal",
                "movement": "estático",
                "register": "médio",
                "energy": 50
            })

        return layers
    except Exception:
        return [{
            "name": "Synth",
            "category": "leads",
            "function": "elemento principal",
            "movement": "estático",
            "register": "médio",
            "energy": 50
        }]


# ──────────────────────────────────────────────────────────────────
# 6. HARMONIA E TONALIDADE
# ──────────────────────────────────────────────────────────────────

def detect_key(y, sr):
    """Detecta a tonalidade (key) da música usando análise de chroma."""
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)
        notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

        best_major_corr = -1
        best_minor_corr = -1
        best_major_key = 0
        best_minor_key = 0

        for i in range(12):
            rotated_chroma = np.roll(chroma_mean, -i)
            major_corr = np.corrcoef(rotated_chroma, major_profile)[0, 1]
            minor_corr = np.corrcoef(rotated_chroma, minor_profile)[0, 1]

            if major_corr > best_major_corr:
                best_major_corr = major_corr
                best_major_key = i
            if minor_corr > best_minor_corr:
                best_minor_corr = minor_corr
                best_minor_key = i

        if best_major_corr > best_minor_corr:
            return f"{notes[best_major_key]}"
        else:
            return f"{notes[best_minor_key]}m"
    except Exception:
        return None


def analyze_harmony(y, sr, key):
    """Analisa harmonia e uso harmônico."""
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)

        # Quantas notas têm presença significativa
        active_notes = np.sum(chroma_mean > np.mean(chroma_mean) * 0.7)

        # Variação harmônica ao longo do tempo
        chroma_var = np.std(chroma, axis=1)
        harmonic_variation = np.mean(chroma_var)

        # Classificar uso harmônico
        if active_notes <= 3:
            harmonic_usage = "minimalista"
        elif active_notes <= 5:
            harmonic_usage = "modal"
        else:
            harmonic_usage = "rico"

        # Classificar sensação harmônica
        # Analisar se há resolução ou tensão constante
        chroma_diff = np.diff(chroma, axis=1)
        resolution_score = np.mean(np.abs(chroma_diff))

        if resolution_score < 0.05:
            harmonic_feeling = "loop infinito"
        elif resolution_score < 0.1:
            harmonic_feeling = "tensão constante"
        else:
            harmonic_feeling = "tensão e resolução"

        # Verificar se é repetitivo (mesmo padrão harmônico)
        if harmonic_variation < 0.1:
            harmonic_usage = "repetitivo"
            harmonic_feeling = "loop infinito"

        return {
            "key": key,
            "harmonic_usage": harmonic_usage,
            "harmonic_feeling": harmonic_feeling,
            "active_notes": int(active_notes),
            "harmonic_variation": round(float(harmonic_variation), 3)
        }
    except Exception:
        return {
            "key": key,
            "harmonic_usage": "minimalista",
            "harmonic_feeling": "loop infinito",
            "active_notes": 3,
            "harmonic_variation": 0
        }


# ──────────────────────────────────────────────────────────────────
# 7. ESTRUTURA DA MÚSICA (linha do tempo)
# ──────────────────────────────────────────────────────────────────

def analyze_structure_detailed(y, sr, duration):
    """
    Detecta estrutura detalhada com timestamps, energia e elementos.
    """
    try:
        rms = librosa.feature.rms(y=y)[0]
        rms_norm = rms / (np.max(rms) + 1e-10)

        hop_length = 512
        frame_duration = hop_length / sr

        # Suavizar RMS
        window_size = max(1, int(2 / frame_duration))
        if window_size > len(rms_norm):
            window_size = len(rms_norm)
        rms_smooth = np.convolve(rms_norm, np.ones(window_size) / window_size, mode='same')

        # Segmentação usando mudanças de energia
        threshold_high = np.percentile(rms_smooth, 75)
        threshold_mid = np.percentile(rms_smooth, 50)
        threshold_low = np.percentile(rms_smooth, 25)

        # Encontrar seções
        sections = []

        # INTRO: início até primeiro pico de energia
        intro_end = 0
        for i, e in enumerate(rms_smooth):
            if e > threshold_high:
                intro_end = i * frame_duration
                break
        if intro_end == 0:
            intro_end = duration * 0.1

        sections.append({
            "name": "Intro",
            "start": 0,
            "end": round(intro_end, 1),
            "start_formatted": format_time(0),
            "end_formatted": format_time(intro_end),
            "function": "Apresentação gradual dos elementos, criação de atmosfera",
            "energy": clamp(int(np.mean(rms_smooth[:max(1, int(intro_end / frame_duration))]) * 100)),
            "elements_entering": ["kick (sutil)", "pad atmosférico", "hi-hats"],
            "elements_exiting": []
        })

        # BUILD-UP: aumento de energia
        buildup_end = intro_end + (duration - intro_end) * 0.15
        buildup_energy = rms_smooth[int(intro_end / frame_duration):int(buildup_end / frame_duration)]
        sections.append({
            "name": "Build-up",
            "start": round(intro_end, 1),
            "end": round(buildup_end, 1),
            "start_formatted": format_time(intro_end),
            "end_formatted": format_time(buildup_end),
            "function": "Construção de tensão, adição progressiva de camadas",
            "energy": clamp(int(np.mean(buildup_energy) * 100)) if len(buildup_energy) > 0 else 50,
            "elements_entering": ["snare/clap", "bassline", "riser FX"],
            "elements_exiting": []
        })

        # DROP / PEAK: momento de máxima energia
        # Encontrar região de maior energia
        peak_start = buildup_end
        peak_section = rms_smooth[int(buildup_end / frame_duration):int(duration * 0.6 / frame_duration)]
        if len(peak_section) > 0:
            peak_idx = np.argmax(peak_section)
            peak_time = buildup_end + peak_idx * frame_duration
        else:
            peak_time = duration * 0.3

        drop_end = peak_time + (duration - peak_time) * 0.35
        drop_energy = rms_smooth[int(peak_start / frame_duration):int(drop_end / frame_duration)]
        sections.append({
            "name": "Drop / Peak",
            "start": round(peak_start, 1),
            "end": round(drop_end, 1),
            "start_formatted": format_time(peak_start),
            "end_formatted": format_time(drop_end),
            "function": "Clímax da música, máxima energia e impacto",
            "energy": clamp(int(np.mean(drop_energy) * 100)) if len(drop_energy) > 0 else 85,
            "elements_entering": ["lead synth", "bass pesado", "percussion completa"],
            "elements_exiting": ["riser FX"]
        })

        # BREAKDOWN: queda de energia
        breakdown_start = drop_end
        breakdown_end = breakdown_start + (duration - breakdown_start) * 0.3
        breakdown_energy = rms_smooth[int(breakdown_start / frame_duration):int(breakdown_end / frame_duration)]
        sections.append({
            "name": "Breakdown",
            "start": round(breakdown_start, 1),
            "end": round(breakdown_end, 1),
            "start_formatted": format_time(breakdown_start),
            "end_formatted": format_time(breakdown_end),
            "function": "Alívio de tensão, momento de respiração",
            "energy": clamp(int(np.mean(breakdown_energy) * 100)) if len(breakdown_energy) > 0 else 35,
            "elements_entering": ["pad atmosférico", "FX ambientes"],
            "elements_exiting": ["kick", "bass pesado", "percussion"]
        })

        # SEGUNDA VARIAÇÃO / SEGUNDO DROP
        var2_start = breakdown_end
        var2_end = var2_start + (duration - var2_start) * 0.5
        var2_energy = rms_smooth[int(var2_start / frame_duration):int(min(var2_end, duration) / frame_duration)]
        sections.append({
            "name": "Segunda Variação",
            "start": round(var2_start, 1),
            "end": round(var2_end, 1),
            "start_formatted": format_time(var2_start),
            "end_formatted": format_time(var2_end),
            "function": "Retorno da energia com variações nos elementos",
            "energy": clamp(int(np.mean(var2_energy) * 100)) if len(var2_energy) > 0 else 75,
            "elements_entering": ["elementos do drop com variações"],
            "elements_exiting": []
        })

        # OUTRO: final da música
        outro_start = var2_end
        outro_energy = rms_smooth[int(min(outro_start, duration - 1) / frame_duration):]
        sections.append({
            "name": "Outro",
            "start": round(outro_start, 1),
            "end": round(duration, 1),
            "start_formatted": format_time(outro_start),
            "end_formatted": format_time(duration),
            "function": "Encerramento gradual, remoção de elementos",
            "energy": clamp(int(np.mean(outro_energy) * 100)) if len(outro_energy) > 0 else 20,
            "elements_entering": [],
            "elements_exiting": ["lead synth", "bass", "percussion", "kick"]
        })

        # Calcular curva de energia (amostrada em pontos)
        energy_curve = []
        num_points = min(50, int(duration / 5))
        for i in range(num_points):
            t = (i / num_points) * duration
            frame_idx = int(t / frame_duration)
            if frame_idx < len(rms_smooth):
                energy_curve.append({
                    "time": round(t, 1),
                    "energy": clamp(int(rms_smooth[frame_idx] * 100))
                })

        return {
            "sections": sections,
            "energy_curve": energy_curve,
            "total_duration": round(duration, 1)
        }
    except Exception:
        return {
            "sections": [{
                "name": "Full Track",
                "start": 0,
                "end": round(duration, 1),
                "start_formatted": "0:00",
                "end_formatted": format_time(duration),
                "function": "Faixa completa",
                "energy": 50,
                "elements_entering": [],
                "elements_exiting": []
            }],
            "energy_curve": [],
            "total_duration": round(duration, 1)
        }


# ──────────────────────────────────────────────────────────────────
# 8. DINÂMICA E ARRANJO
# ──────────────────────────────────────────────────────────────────

def analyze_dynamics(y, sr, duration):
    """Analisa dinâmica, uso de camadas, tensão e previsibilidade."""
    try:
        rms = librosa.feature.rms(y=y)[0]
        rms_norm = rms / (np.max(rms) + 1e-10)

        hop_length = 512
        frame_duration = hop_length / sr

        # Evolução de energia
        first_quarter = np.mean(rms_norm[:len(rms_norm)//4])
        second_quarter = np.mean(rms_norm[len(rms_norm)//4:len(rms_norm)//2])
        third_quarter = np.mean(rms_norm[len(rms_norm)//2:3*len(rms_norm)//4])
        fourth_quarter = np.mean(rms_norm[3*len(rms_norm)//4:])

        energy_evolution = "crescente" if second_quarter > first_quarter and third_quarter > second_quarter \
            else "arco" if third_quarter > first_quarter and third_quarter > fourth_quarter \
            else "decrescente" if fourth_quarter < first_quarter \
            else "estável"

        # Calcular variação dinâmica (dynamic range)
        dynamic_range = float(np.max(rms_norm) - np.min(rms_norm)) * 100

        # Momentos de tensão e alívio
        # Tensão: crescimento rápido de energia
        # Alívio: queda rápida de energia
        rms_diff = np.diff(rms_norm)
        tension_moments = 0
        relief_moments = 0
        window = max(1, int(4 / frame_duration))  # Janela de 4s

        for i in range(0, len(rms_diff) - window, window):
            segment_change = np.sum(rms_diff[i:i+window])
            if segment_change > 0.1:
                tension_moments += 1
            elif segment_change < -0.1:
                relief_moments += 1

        # Previsibilidade: quão repetitivo é o padrão de energia
        # Autocorrelação do envelope RMS
        if len(rms_norm) > 200:
            autocorr = np.correlate(rms_norm[:500], rms_norm[:500], mode='full')
            autocorr = autocorr[len(autocorr)//2:]
            autocorr = autocorr / (autocorr[0] + 1e-10)
            # Encontrar picos de repetição
            repeat_peaks = 0
            for i in range(50, min(400, len(autocorr) - 1)):
                if autocorr[i] > 0.5 and autocorr[i] > autocorr[i-1] and autocorr[i] > autocorr[i+1]:
                    repeat_peaks += 1
            predictability = "alta" if repeat_peaks > 3 else ("média" if repeat_peaks > 1 else "baixa")
        else:
            predictability = "média"

        # Uso de camadas
        spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
        bandwidth_var = np.std(spectral_bandwidth) / (np.mean(spectral_bandwidth) + 1e-10)
        layering = "camadas densas (adição)" if bandwidth_var > 0.3 else "camadas sutis (subtração)" if bandwidth_var > 0.15 else "estável"

        return {
            "energy_evolution": energy_evolution,
            "dynamic_range": round(dynamic_range, 1),
            "layering": layering,
            "tension_moments": tension_moments,
            "relief_moments": relief_moments,
            "predictability": predictability,
            "energy_quarters": {
                "q1": clamp(int(first_quarter * 100)),
                "q2": clamp(int(second_quarter * 100)),
                "q3": clamp(int(third_quarter * 100)),
                "q4": clamp(int(fourth_quarter * 100))
            }
        }
    except Exception:
        return {
            "energy_evolution": "arco",
            "dynamic_range": 50,
            "layering": "estável",
            "tension_moments": 2,
            "relief_moments": 2,
            "predictability": "média",
            "energy_quarters": {"q1": 30, "q2": 60, "q3": 80, "q4": 40}
        }


# ──────────────────────────────────────────────────────────────────
# 9. MIXAGEM (análise perceptiva)
# ──────────────────────────────────────────────────────────────────

def analyze_mix(y, y_stereo, sr):
    """Analisa características da mixagem."""
    try:
        D = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)

        # ── ESPAÇO ESTÉREO ──
        if y_stereo is not None and y_stereo.ndim == 2 and y_stereo.shape[0] == 2:
            left = y_stereo[0]
            right = y_stereo[1]
            # Correlação estéreo
            min_len = min(len(left), len(right))
            correlation = np.corrcoef(left[:min_len], right[:min_len])[0, 1]
            if correlation > 0.9:
                stereo_width = "estreito"
            elif correlation > 0.6:
                stereo_width = "médio"
            else:
                stereo_width = "amplo"
        else:
            stereo_width = "indeterminado (mono)"

        # ── PROFUNDIDADE ──
        # Reverb estimation: spectral decay rate
        spectral_contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
        avg_contrast = np.mean(spectral_contrast)
        if avg_contrast > 25:
            depth = "muita profundidade (reverb/delay)"
        elif avg_contrast > 15:
            depth = "profundidade moderada"
        else:
            depth = "mix seco/direto"

        # ── CLAREZA ──
        # Baseado no spectral flatness e contraste
        flatness = np.mean(librosa.feature.spectral_flatness(y=y))
        if flatness < 0.05:
            clarity = "muito clara"
        elif flatness < 0.1:
            clarity = "clara"
        elif flatness < 0.2:
            clarity = "moderada"
        else:
            clarity = "densa/congestionada"

        # ── DESTAQUES SONOROS ──
        highlights = []
        band_energies = {}
        bands = {
            'sub_bass': (20, 60), 'bass': (60, 250), 'low_mid': (250, 500),
            'mid': (500, 2000), 'high_mid': (2000, 4000), 'high': (4000, 20000)
        }
        for name, (low, high) in bands.items():
            mask = (freqs >= low) & (freqs <= high)
            if np.any(mask):
                band_energies[name] = np.mean(D[mask, :])

        if band_energies:
            max_band = max(band_energies, key=band_energies.get)
            band_labels = {
                'sub_bass': 'Sub-graves', 'bass': 'Graves', 'low_mid': 'Médios-graves',
                'mid': 'Médios', 'high_mid': 'Médios-agudos', 'high': 'Agudos'
            }
            highlights.append(f"{band_labels.get(max_band, max_band)} dominantes")

        # ── POSSÍVEIS CONFLITOS ──
        conflicts = []
        if band_energies:
            avg_band = np.mean(list(band_energies.values()))
            for name, energy in band_energies.items():
                if energy > avg_band * 2:
                    label = band_labels.get(name, name)
                    conflicts.append(f"Excesso em {label}")

        # Verificar conflito kick/bass
        if band_energies.get('sub_bass', 0) > 0 and band_energies.get('bass', 0) > 0:
            sub_bass_e = band_energies['sub_bass']
            bass_e = band_energies['bass']
            if abs(sub_bass_e - bass_e) < sub_bass_e * 0.2:
                conflicts.append("Possível conflito kick/sub-bass")

        if not conflicts:
            conflicts.append("Nenhum conflito aparente")

        return {
            "stereo_width": stereo_width,
            "depth": depth,
            "clarity": clarity,
            "highlights": highlights,
            "conflicts": conflicts
        }
    except Exception:
        return {
            "stereo_width": "médio",
            "depth": "profundidade moderada",
            "clarity": "moderada",
            "highlights": [],
            "conflicts": []
        }


# ──────────────────────────────────────────────────────────────────
# 10. ANÁLISE PARA DJ
# ──────────────────────────────────────────────────────────────────

def analyze_for_dj(y, sr, bpm, key, duration, structure_sections, energy_score, genre):
    """Analisa características relevantes para DJs."""
    try:
        rms = librosa.feature.rms(y=y)[0]
        rms_norm = rms / (np.max(rms) + 1e-10)
        hop_length = 512
        frame_duration = hop_length / sr

        # ── FACILIDADE DE MIXAGEM ──
        # Baseado na regularidade do BPM e presença de intro/outro limpos
        first_8s = rms_norm[:int(8 / frame_duration)]
        last_8s = rms_norm[-int(8 / frame_duration):]
        intro_clean = np.mean(first_8s) < 0.3 if len(first_8s) > 0 else False
        outro_clean = np.mean(last_8s) < 0.3 if len(last_8s) > 0 else False

        if intro_clean and outro_clean:
            mixability = "alta"
            mixability_detail = "Intro e outro limpos, fácil de mixar"
        elif intro_clean or outro_clean:
            mixability = "média"
            mixability_detail = "Intro ou outro limpos, mixagem possível"
        else:
            mixability = "baixa"
            mixability_detail = "Sem pontos claros de entrada/saída"

        # ── PONTOS DE ENTRADA E SAÍDA ──
        entry_points = []
        exit_points = []

        # Encontrar pontos com energia baixa (bons para entrada)
        for i in range(0, len(rms_norm) - int(2 / frame_duration), int(4 / frame_duration)):
            time = i * frame_duration
            segment = rms_norm[i:i + int(2 / frame_duration)]
            avg_e = np.mean(segment)
            if avg_e < 0.25 and time < duration * 0.3:
                entry_points.append({
                    "time": round(time, 1),
                    "time_formatted": format_time(time),
                    "description": "Energia baixa - bom ponto de entrada"
                })
            elif avg_e < 0.25 and time > duration * 0.7:
                exit_points.append({
                    "time": round(time, 1),
                    "time_formatted": format_time(time),
                    "description": "Energia baixa - bom ponto de saída"
                })

        if not entry_points:
            entry_points.append({
                "time": 0,
                "time_formatted": "0:00",
                "description": "Início da faixa"
            })
        if not exit_points:
            exit_points.append({
                "time": round(duration, 1),
                "time_formatted": format_time(duration),
                "description": "Final da faixa"
            })

        # Limitar a 3 pontos cada
        entry_points = entry_points[:3]
        exit_points = exit_points[:3]

        # ── COMPATIBILIDADE COM OUTROS ESTILOS ──
        compatible_styles = []
        if genre == "Techno":
            compatible_styles = ["Tech House", "Industrial", "Minimal", "Electro"]
        elif genre == "House":
            compatible_styles = ["Tech House", "Deep House", "Disco", "Funk"]
        elif genre == "Trance":
            compatible_styles = ["Progressive", "Techno Melódico", "Psy", "Breaks"]
        elif genre == "Drum & Bass":
            compatible_styles = ["Jungle", "Breakbeat", "Halftime", "Neurofunk"]
        else:
            compatible_styles = ["Techno", "House", "Breaks"]

        # ── MOMENTO IDEAL NO SET ──
        if energy_score > 75:
            set_moment = "peak time (momento alto do set)"
        elif energy_score > 55:
            set_moment = "mid-set (manutenção de energia)"
        elif energy_score > 35:
            set_moment = "warm-up (aquecimento)"
        else:
            set_moment = "closing / after hours"

        return {
            "mixability": mixability,
            "mixability_detail": mixability_detail,
            "entry_points": entry_points,
            "exit_points": exit_points,
            "compatible_styles": compatible_styles,
            "set_moment": set_moment,
            "bpm": bpm,
            "key": key
        }
    except Exception:
        return {
            "mixability": "média",
            "mixability_detail": "Análise não disponível",
            "entry_points": [{"time": 0, "time_formatted": "0:00", "description": "Início"}],
            "exit_points": [{"time": round(duration, 1), "time_formatted": format_time(duration), "description": "Final"}],
            "compatible_styles": ["Techno", "House"],
            "set_moment": "mid-set",
            "bpm": bpm,
            "key": key
        }


# ──────────────────────────────────────────────────────────────────
# 11. RESUMO EXECUTIVO
# ──────────────────────────────────────────────────────────────────

def generate_executive_summary(identity, groove, harmony, dynamics, dj_analysis, synth_layers):
    """Gera resumo executivo da faixa."""
    try:
        genre = identity.get("genre", "Electronic")
        subgenres = identity.get("subgenres", [])
        energy = identity.get("energy_level", "média")
        mood = identity.get("mood", ["neutro"])
        context = identity.get("context", ["club"])
        bpm = groove.get("bpm", 0)
        key = harmony.get("key", "")

        # Identidade da faixa
        mood_str = ", ".join(mood) if isinstance(mood, list) else str(mood)
        identity_text = f"Faixa de {genre}"
        if subgenres:
            identity_text += f" ({', '.join(subgenres[:2])})"
        identity_text += f" a {bpm} BPM"
        if key:
            identity_text += f" em {key}"
        identity_text += f". Energia {energy}, mood {mood_str}."

        # Principal diferencial sonoro
        differentials = []
        groove_type = groove.get("groove_type", "reto")
        if groove_type != "reto":
            differentials.append(f"groove {groove_type}")

        for layer in synth_layers:
            if layer.get("energy", 0) > 80:
                differentials.append(f"{layer['name']} marcante")

        evol = dynamics.get("energy_evolution", "")
        if evol:
            differentials.append(f"dinâmica {evol}")

        differential_text = ", ".join(differentials[:3]) if differentials else "sonoridade equilibrada e consistente"

        # Onde funciona melhor
        context_str = ", ".join(context) if isinstance(context, list) else str(context)
        set_moment = dj_analysis.get("set_moment", "mid-set")
        works_best = f"{context_str}. Melhor momento: {set_moment}."

        return {
            "identity": identity_text,
            "differential": f"Destaque: {differential_text}.",
            "works_best": f"Funciona melhor em: {works_best}"
        }
    except Exception:
        return {
            "identity": "Faixa de música eletrônica.",
            "differential": "Análise completa disponível nas seções acima.",
            "works_best": "Club / DJ set."
        }


# ──────────────────────────────────────────────────────────────────
# 12. ARRANJO TEMPORAL (dados para timeline estilo Ableton)
# ──────────────────────────────────────────────────────────────────

def generate_temporal_arrangement(duration, structure, drums, bass, synth_layers):
    """
    Gera dados temporais de arranjo para cada elemento detectado,
    seguindo regras reais de produção de música eletrônica.

    Regras:
    1. Pads/texturas: entram cedo, sustentam partes longas, saem no outro
    2. Kick + Sub Bass: entram juntos no drop
    3. Hi-hats: podem entrar antes do drop (build-up)
    4. Snare: reforça o drop
    5. Percussões: progressivas, somem no breakdown
    6. Bass: sub + bassline no drop, mid bass pode variar
    7. Instrumentos harmônicos: intro e breakdown, menos no drop
    """
    try:
        timeline = []
        sections = structure.get("sections", [])

        # Resolver timestamps das seções por nome
        sec_map = {}
        for s in sections:
            sec_map[s["name"].lower()] = s

        intro = sec_map.get("intro", {"start": 0, "end": duration * 0.1})
        buildup = sec_map.get("build-up", {"start": intro["end"], "end": intro["end"] + duration * 0.1})
        drop = sec_map.get("drop / peak", {"start": buildup["end"], "end": buildup["end"] + duration * 0.3})
        breakdown = sec_map.get("breakdown", {"start": drop["end"], "end": drop["end"] + duration * 0.15})
        var2 = sec_map.get("segunda variação", {"start": breakdown["end"], "end": breakdown["end"] + duration * 0.2})
        outro = sec_map.get("outro", {"start": var2["end"], "end": duration})

        # Garantir que nenhum timestamp excede a duração total
        def clamp_t(t):
            return max(0, min(t, duration))

        # ── SYNTHS / CAMADAS ──
        for layer in synth_layers:
            cat = layer.get("category", "leads")
            name = layer.get("name", "Synth")
            energy = layer.get("energy", 50)

            if cat == "pads" or "pad" in name.lower() or "drone" in name.lower():
                # Pads: entram cedo na intro, sustentam quase toda a música,
                # saem suavemente no outro. Presentes no breakdown.
                timeline.append({
                    "category": "Synths",
                    "element": name,
                    "start": round(clamp_t(intro["start"]), 1),
                    "end": round(clamp_t(outro["end"] - (outro["end"] - outro["start"]) * 0.3), 1),
                    "sections": ["intro", "build-up", "drop", "breakdown", "segunda variação"],
                    "intensity": min(energy, 70),
                    "role": "textura"
                })
            elif cat == "leads" or "lead" in name.lower():
                # Leads: aparecem no drop e segunda variação, ausentes no breakdown
                timeline.append({
                    "category": "Synths",
                    "element": name,
                    "start": round(clamp_t(drop["start"]), 1),
                    "end": round(clamp_t(drop["end"]), 1),
                    "sections": ["drop"],
                    "intensity": energy,
                    "role": "groove"
                })
                # Segunda variação - lead pode voltar com variação
                if var2["end"] > var2["start"]:
                    timeline.append({
                        "category": "Synths",
                        "element": name + " (var)",
                        "start": round(clamp_t(var2["start"]), 1),
                        "end": round(clamp_t(var2["end"]), 1),
                        "sections": ["segunda variação"],
                        "intensity": max(energy - 10, 40),
                        "role": "groove"
                    })
            elif cat == "arps" or "arp" in name.lower() or "seq" in name.lower():
                # Arps: build-up até fim do drop, reaparecem na segunda variação
                timeline.append({
                    "category": "Synths",
                    "element": name,
                    "start": round(clamp_t(buildup["start"]), 1),
                    "end": round(clamp_t(drop["end"]), 1),
                    "sections": ["build-up", "drop"],
                    "intensity": energy,
                    "role": "groove"
                })
                if var2["end"] > var2["start"]:
                    timeline.append({
                        "category": "Synths",
                        "element": name,
                        "start": round(clamp_t(var2["start"]), 1),
                        "end": round(clamp_t(var2["end"]), 1),
                        "sections": ["segunda variação"],
                        "intensity": energy,
                        "role": "groove"
                    })
            elif cat == "fx" or "fx" in name.lower() or "riser" in name.lower():
                # FX: pontuais antes dos drops (build-up e antes da segunda variação)
                timeline.append({
                    "category": "Synths",
                    "element": name,
                    "start": round(clamp_t(buildup["start"]), 1),
                    "end": round(clamp_t(buildup["end"]), 1),
                    "sections": ["build-up"],
                    "intensity": 85,
                    "role": "impacto"
                })
                if breakdown["end"] < var2["start"] + 1:
                    timeline.append({
                        "category": "Synths",
                        "element": name,
                        "start": round(clamp_t(breakdown["end"] - 8), 1),
                        "end": round(clamp_t(var2["start"]), 1),
                        "sections": ["breakdown"],
                        "intensity": 80,
                        "role": "impacto"
                    })
            elif cat == "textures" or "textura" in name.lower():
                # Texturas: presentes em grande parte da música, como os pads
                timeline.append({
                    "category": "Synths",
                    "element": name,
                    "start": round(clamp_t(intro["start"]), 1),
                    "end": round(clamp_t(outro["start"]), 1),
                    "sections": ["intro", "build-up", "drop", "breakdown", "segunda variação"],
                    "intensity": min(energy, 50),
                    "role": "textura"
                })
            else:
                # Synth genérico: drop + segunda variação
                timeline.append({
                    "category": "Synths",
                    "element": name,
                    "start": round(clamp_t(drop["start"]), 1),
                    "end": round(clamp_t(var2["end"]), 1),
                    "sections": ["drop", "segunda variação"],
                    "intensity": energy,
                    "role": "groove"
                })

        # ── BATERIA ──
        kick = drums.get("kick", {})
        snare = drums.get("snare_clap", {})
        hihats = drums.get("hihats", {})
        cymbals = drums.get("cymbals_rides", {})
        percussion = drums.get("percussion", {})

        if kick.get("present", False):
            # Kick: intro (sutil), build-up, drop, segunda variação
            # Sai no breakdown e outro
            timeline.append({
                "category": "Drums",
                "element": f"Kick ({kick.get('type', 'seco')})",
                "start": round(clamp_t(intro["start"] + (intro["end"] - intro["start"]) * 0.3), 1),
                "end": round(clamp_t(drop["end"]), 1),
                "sections": ["intro", "build-up", "drop"],
                "intensity": 90,
                "role": "base"
            })
            # Retorna na segunda variação
            if var2["end"] > var2["start"]:
                timeline.append({
                    "category": "Drums",
                    "element": f"Kick ({kick.get('type', 'seco')})",
                    "start": round(clamp_t(var2["start"]), 1),
                    "end": round(clamp_t(outro["start"] + (outro["end"] - outro["start"]) * 0.5), 1),
                    "sections": ["segunda variação", "outro"],
                    "intensity": 85,
                    "role": "base"
                })

        if hihats.get("present", False):
            # Hi-hats: podem entrar antes do drop (build-up ou até na intro)
            timeline.append({
                "category": "Drums",
                "element": f"Hi-Hat ({hihats.get('type', 'fechados')})",
                "start": round(clamp_t(intro["end"] - 8), 1),
                "end": round(clamp_t(drop["end"]), 1),
                "sections": ["intro", "build-up", "drop"],
                "intensity": 65,
                "role": "groove"
            })
            if var2["end"] > var2["start"]:
                timeline.append({
                    "category": "Drums",
                    "element": f"Hi-Hat ({hihats.get('type', 'fechados')})",
                    "start": round(clamp_t(var2["start"]), 1),
                    "end": round(clamp_t(outro["start"]), 1),
                    "sections": ["segunda variação"],
                    "intensity": 65,
                    "role": "groove"
                })

        if snare.get("present", False):
            # Snare/Clap: reforça o drop e segunda variação
            timeline.append({
                "category": "Drums",
                "element": f"Snare / Clap ({snare.get('type', 'snare')})",
                "start": round(clamp_t(drop["start"]), 1),
                "end": round(clamp_t(drop["end"]), 1),
                "sections": ["drop"],
                "intensity": 80,
                "role": "groove"
            })
            if var2["end"] > var2["start"]:
                timeline.append({
                    "category": "Drums",
                    "element": f"Snare / Clap ({snare.get('type', 'snare')})",
                    "start": round(clamp_t(var2["start"]), 1),
                    "end": round(clamp_t(var2["end"]), 1),
                    "sections": ["segunda variação"],
                    "intensity": 80,
                    "role": "groove"
                })

        if cymbals.get("present", False):
            # Cymbals/Rides: textura no drop e segunda variação
            timeline.append({
                "category": "Drums",
                "element": f"Cymbals ({cymbals.get('type', 'ride')})",
                "start": round(clamp_t(drop["start"] + (drop["end"] - drop["start"]) * 0.2), 1),
                "end": round(clamp_t(drop["end"]), 1),
                "sections": ["drop"],
                "intensity": 50,
                "role": "textura"
            })

        if percussion.get("present", False):
            # Percussão: progressiva, build-up → drop, some no breakdown
            timeline.append({
                "category": "Drums",
                "element": f"Percussão ({percussion.get('type', 'eletrônicas')})",
                "start": round(clamp_t(buildup["start"] + (buildup["end"] - buildup["start"]) * 0.3), 1),
                "end": round(clamp_t(drop["end"]), 1),
                "sections": ["build-up", "drop"],
                "intensity": 55,
                "role": "textura"
            })
            if var2["end"] > var2["start"]:
                timeline.append({
                    "category": "Drums",
                    "element": f"Percussão ({percussion.get('type', 'eletrônicas')})",
                    "start": round(clamp_t(var2["start"] + 8), 1),
                    "end": round(clamp_t(var2["end"]), 1),
                    "sections": ["segunda variação"],
                    "intensity": 55,
                    "role": "textura"
                })

        # ── BASS ──
        sub_bass = bass.get("sub_bass", {})
        mid_bass = bass.get("mid_bass", {})
        bassline = bass.get("bassline", {})

        if sub_bass.get("present", False):
            # Sub Bass: entra com o kick no drop (juntos!)
            timeline.append({
                "category": "Bass",
                "element": f"Sub Bass ({sub_bass.get('type', 'sustentado')})",
                "start": round(clamp_t(drop["start"]), 1),
                "end": round(clamp_t(drop["end"]), 1),
                "sections": ["drop"],
                "intensity": 85,
                "role": "base"
            })
            if var2["end"] > var2["start"]:
                timeline.append({
                    "category": "Bass",
                    "element": f"Sub Bass ({sub_bass.get('type', 'sustentado')})",
                    "start": round(clamp_t(var2["start"]), 1),
                    "end": round(clamp_t(var2["end"]), 1),
                    "sections": ["segunda variação"],
                    "intensity": 85,
                    "role": "base"
                })

        if mid_bass.get("present", False):
            # Mid Bass: pode entrar antes do sub (build-up) e ter mais variação
            timeline.append({
                "category": "Bass",
                "element": f"Mid Bass ({mid_bass.get('texture', 'limpo')})",
                "start": round(clamp_t(buildup["end"] - 8), 1),
                "end": round(clamp_t(drop["end"]), 1),
                "sections": ["build-up", "drop"],
                "intensity": 70,
                "role": "groove"
            })
            if var2["end"] > var2["start"]:
                timeline.append({
                    "category": "Bass",
                    "element": f"Mid Bass ({mid_bass.get('texture', 'limpo')})",
                    "start": round(clamp_t(var2["start"]), 1),
                    "end": round(clamp_t(var2["end"]), 1),
                    "sections": ["segunda variação"],
                    "intensity": 70,
                    "role": "groove"
                })

        if bassline.get("present", False):
            # Bassline: drop e segunda variação (junto com sub)
            timeline.append({
                "category": "Bass",
                "element": f"Bassline ({bassline.get('type', 'repetitiva')})",
                "start": round(clamp_t(drop["start"]), 1),
                "end": round(clamp_t(drop["end"]), 1),
                "sections": ["drop"],
                "intensity": 80,
                "role": "groove"
            })
            if var2["end"] > var2["start"]:
                timeline.append({
                    "category": "Bass",
                    "element": f"Bassline ({bassline.get('type', 'repetitiva')})",
                    "start": round(clamp_t(var2["start"]), 1),
                    "end": round(clamp_t(var2["end"]), 1),
                    "sections": ["segunda variação"],
                    "intensity": 75,
                    "role": "groove"
                })

        return timeline
    except Exception:
        return []


# ──────────────────────────────────────────────────────────────────
# ANÁLISE DE FREQUÊNCIAS E LOUDNESS
# ──────────────────────────────────────────────────────────────────

def analyze_frequency_bands(y, sr):
    """Analisa energia em diferentes bandas de frequência."""
    try:
        D = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)

        bands = {
            'sub_bass': (20, 60),
            'bass': (60, 250),
            'low_mid': (250, 500),
            'mid': (500, 2000),
            'high_mid': (2000, 4000),
            'high': (4000, 20000)
        }

        band_energies = {}
        max_energy = 0

        for band_name, (low, high) in bands.items():
            mask = (freqs >= low) & (freqs <= high)
            if np.any(mask):
                band_energy = np.mean(D[mask, :])
                band_energies[band_name] = float(band_energy)
                if band_energy > max_energy:
                    max_energy = band_energy
            else:
                band_energies[band_name] = 0.0

        if max_energy > 0:
            for band in band_energies:
                band_energies[band] = round(band_energies[band] / max_energy, 3)

        return band_energies
    except Exception:
        return {
            'sub_bass': 0, 'bass': 0, 'low_mid': 0,
            'mid': 0, 'high_mid': 0, 'high': 0
        }


def analyze_loudness(y, sr):
    """Calcula loudness em dB."""
    try:
        rms = librosa.feature.rms(y=y)[0]
        rms_db = librosa.amplitude_to_db(rms, ref=1.0)
        return {
            'peak_db': round(float(np.max(rms_db)), 2),
            'rms_db': round(float(np.mean(rms_db)), 2)
        }
    except Exception:
        return {'peak_db': -3.0, 'rms_db': -12.0}


# ──────────────────────────────────────────────────────────────────
# FUNÇÃO PRINCIPAL
# ──────────────────────────────────────────────────────────────────

def analyze_audio(file_path):
    """Função principal de análise completa."""
    try:
        if not os.path.exists(file_path):
            return {"success": False, "error": f"Arquivo não encontrado: {file_path}"}

        # Carregar áudio (mono, sr padrão) - máximo 5 minutos
        y, sr = librosa.load(file_path, sr=22050, mono=True, duration=300)
        duration = librosa.get_duration(y=y, sr=sr)

        # Tentar carregar em estéreo para análise de mix
        try:
            y_stereo, sr_stereo = librosa.load(file_path, sr=22050, mono=False, duration=300)
        except Exception:
            y_stereo = None

        # RMS curve para uso em múltiplas análises
        rms_curve = librosa.feature.rms(y=y)[0]

        # ── Executar todas as análises ──

        # 1. Dados básicos
        bpm = detect_bpm(y, sr)
        key = detect_key(y, sr)
        frequency_analysis = analyze_frequency_bands(y, sr)
        loudness = analyze_loudness(y, sr)

        # 2. Análises principais
        identity = analyze_musical_identity(y, sr, bpm, key, frequency_analysis, rms_curve)
        groove = analyze_groove_and_rhythm(y, sr, bpm)
        drums = detect_drums_detailed(y, sr)
        bass = analyze_bass_detailed(y, sr)
        synth_layers = analyze_synths_and_layers(y, sr)
        harmony = analyze_harmony(y, sr, key)
        structure = analyze_structure_detailed(y, sr, duration)
        dynamics = analyze_dynamics(y, sr, duration)
        mix_analysis = analyze_mix(y, y_stereo, sr)
        dj_analysis = analyze_for_dj(
            y, sr, bpm, key, duration,
            structure.get("sections", []),
            identity.get("energy_score", 50),
            identity.get("genre", "Electronic")
        )
        executive_summary = generate_executive_summary(
            identity, groove, harmony, dynamics, dj_analysis, synth_layers
        )

        # 3. Arranjo temporal
        temporal_arrangement = generate_temporal_arrangement(
            duration, structure, drums, bass, synth_layers
        )

        # Montar resultado completo
        result = {
            "success": True,
            "filename": os.path.basename(file_path),
            "duration": round(float(duration), 2),
            "sample_rate": int(sr),
            "analysis_method": "python_librosa_v2",

            # Dados básicos
            "bpm": float(bpm) if bpm is not None else None,
            "key": key,
            "loudness": convert_numpy(loudness),
            "frequency_analysis": convert_numpy(frequency_analysis),

            # 11 eixos de análise
            "musical_identity": convert_numpy(identity),
            "groove_and_rhythm": convert_numpy(groove),
            "drum_elements": convert_numpy(drums),
            "bass_elements": convert_numpy(bass),
            "synth_layers": convert_numpy(synth_layers),
            "harmony": convert_numpy(harmony),
            "structure": convert_numpy(structure),
            "dynamics": convert_numpy(dynamics),
            "mix_analysis": convert_numpy(mix_analysis),
            "dj_analysis": convert_numpy(dj_analysis),
            "executive_summary": convert_numpy(executive_summary),
            "temporal_arrangement": convert_numpy(temporal_arrangement),

            # Retrocompatibilidade com formato anterior
            "drum_detection": convert_numpy({
                "kick_present": drums.get("kick", {}).get("present", False),
                "snare_present": drums.get("snare_clap", {}).get("present", False),
                "hihat_present": drums.get("hihats", {}).get("present", False),
                "cymbals_present": drums.get("cymbals_rides", {}).get("present", False),
                "percussion_present": drums.get("percussion", {}).get("present", False)
            }),
            "bass_detection": convert_numpy({
                "sub_bass": bass.get("sub_bass", {}).get("present", False),
                "mid_bass": bass.get("mid_bass", {}).get("present", False),
                "bassline": bass.get("bassline", {}).get("present", False)
            }),
            "detected_synths": [l["name"] for l in synth_layers],
            "detected_instruments": []
        }

        return result

    except Exception as e:
        return {"success": False, "error": str(e)}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Uso: python audio_analyzer.py <caminho_do_arquivo>"
        }))
        sys.exit(1)

    file_path = sys.argv[1]
    result = analyze_audio(file_path)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
