// ============================================================
// MIDI Generator for Ableton Live
// Generates valid Standard MIDI Files (.mid) from stem analysis
// Compatible with drag-and-drop import into Ableton Live
// ============================================================

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

export interface MidiNote {
  note: string;           // e.g., "C1", "F#2"
  midi: number;           // MIDI note number (0-127)
  start_beat: number;     // position in beats from 0
  duration_beats: number; // duration in beats
  velocity: number;       // 0-127
}

export interface MidiClip {
  stem: string;
  bpm: number;
  time_signature: string;
  bars: number;
  notes: MidiNote[];
}

export interface MidiGenerationContext {
  element: string;        // e.g., "Kick", "Bassline", "Pad Synth"
  category: string;       // "Drums", "Bass", "Synths"
  role: string;           // "base", "groove", "textura", "impacto"
  intensity: number;      // 0-100
  bpm: number;
  key?: string;           // e.g., "F minor", "A major"
  genre?: string;         // e.g., "Techno", "House"
  timeSignature?: string; // e.g., "4/4"
}

type StemType =
  | 'kick' | 'snare_clap' | 'hihat' | 'cymbal' | 'percussion' | 'fill'
  | 'sub_bass' | 'mid_bass' | 'bassline'
  | 'pad' | 'lead' | 'arp' | 'fx' | 'texture';

// ──────────────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────────────

const PPQ = 480; // Pulses per quarter note (industry standard)

const NOTE_OFFSETS: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1,
  'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4,
  'F': 5, 'F#': 6, 'Gb': 6,
  'G': 7, 'G#': 8, 'Ab': 8,
  'A': 9, 'A#': 10, 'Bb': 10,
  'B': 11
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

// GM Drum Map (Ableton convention: C1 = 36)
const GM_DRUM = {
  KICK: 36,        // C1
  RIM: 37,         // C#1
  SNARE: 38,       // D1
  CLAP: 39,        // D#1
  CLOSED_HH: 42,   // F#1
  PEDAL_HH: 44,    // G#1
  OPEN_HH: 46,     // A#1
  LOW_TOM: 45,     // A1
  MID_TOM: 47,     // B1
  HIGH_TOM: 50,    // D2
  CRASH: 49,       // C#2
  RIDE: 51,        // D#2
  TAMBOURINE: 54,  // F#2
  COWBELL: 56,     // G#2
  CONGA_H: 62,     // D3
  CONGA_L: 64,     // E3
  SHAKER: 70,      // A#3
} as const;

// ──────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ──────────────────────────────────────────────────────────────

/** Converts note name (e.g., "C1", "F#2") to MIDI number.
 *  Ableton convention: C-2 = 0, C1 = 36, C3 = 60 (middle C) */
function noteNameToMidi(name: string): number {
  const match = name.match(/^([A-G][#b]?)(-?\d+)$/);
  if (!match) return 60;
  const [, noteName, octaveStr] = match;
  const offset = NOTE_OFFSETS[noteName] ?? 0;
  const octave = parseInt(octaveStr);
  return (octave + 2) * 12 + offset;
}

/** Converts MIDI number to note name (Ableton convention) */
function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 2;
  const note = NOTE_NAMES[midi % 12];
  return `${note}${octave}`;
}

/** Parses key string like "F minor" → root semitone + scale */
function parseKey(keyStr?: string): { root: number; isMinor: boolean } {
  if (!keyStr) return { root: 0, isMinor: true }; // default C minor
  const match = keyStr.match(/^([A-G][#b]?)\s*(major|minor|maj|min)?/i);
  if (!match) return { root: 0, isMinor: true };
  const root = NOTE_OFFSETS[match[1]] ?? 0;
  const isMinor = !match[2] || match[2].toLowerCase().startsWith('min');
  return { root, isMinor };
}

/** Gets a scale note at the given degree (0-indexed) and octave */
function getScaleNote(root: number, isMinor: boolean, degree: number, octave: number): number {
  const scale = isMinor ? MINOR_SCALE : MAJOR_SCALE;
  const octaveShift = Math.floor(degree / scale.length);
  const scaleDegree = ((degree % scale.length) + scale.length) % scale.length;
  return (octave + 2) * 12 + root + scale[scaleDegree] + octaveShift * 12;
}

/** Creates a MidiNote helper */
function n(midi: number, startBeat: number, durationBeats: number, velocity: number): MidiNote {
  return {
    note: midiToNoteName(midi),
    midi: Math.max(0, Math.min(127, midi)),
    start_beat: startBeat,
    duration_beats: durationBeats,
    velocity: Math.max(1, Math.min(127, Math.round(velocity))),
  };
}

/** Variable Length Quantity encoding for MIDI binary */
function writeVLQ(value: number): number[] {
  if (value < 0) value = 0;
  if (value <= 0x7F) return [value];
  const bytes: number[] = [];
  bytes.push(value & 0x7F);
  value >>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7F) | 0x80);
    value >>= 7;
  }
  return bytes;
}

/** Identifies the stem type from element name and category */
function identifyStemType(element: string, category: string): StemType {
  const el = element.toLowerCase();
  if (el.includes('kick')) return 'kick';
  if (el.includes('snare') || el.includes('clap')) return 'snare_clap';
  if (el.includes('hi-hat') || el.includes('hihat') || el.includes('hat')) return 'hihat';
  if (el.includes('cymbal') || el.includes('ride')) return 'cymbal';
  if (el.includes('fill') || el.includes('trans')) return 'fill';
  if (el.includes('perc') || el.includes('shaker') || el.includes('tamb')) return 'percussion';
  if (el.includes('sub')) return 'sub_bass';
  if (el.includes('mid bass') || el.includes('midbass')) return 'mid_bass';
  if (el.includes('bassline') || el.includes('bass line')) return 'bassline';
  if (el.includes('pad') || el.includes('chord') || el.includes('drone')) return 'pad';
  if (el.includes('lead') || el.includes('melody') || el.includes('hook')) return 'lead';
  if (el.includes('arp')) return 'arp';
  if (el.includes('fx') || el.includes('effect') || el.includes('riser') || el.includes('sweep')) return 'fx';
  if (el.includes('texture') || el.includes('atmo') || el.includes('ambient')) return 'texture';
  // Fallback by category
  if (category === 'Drums') return 'percussion';
  if (category === 'Bass') return 'bassline';
  return 'pad';
}

// ──────────────────────────────────────────────────────────────
// PATTERN GENERATORS
// ──────────────────────────────────────────────────────────────

function generateKickPattern(ctx: MidiGenerationContext): MidiNote[] {
  const notes: MidiNote[] = [];
  const bars = ctx.intensity >= 70 ? 1 : 2;
  const totalBeats = bars * 4;
  const vel = Math.min(127, 95 + Math.round(ctx.intensity * 0.2));

  if (ctx.intensity >= 60) {
    // 4-on-the-floor
    for (let beat = 0; beat < totalBeats; beat++) {
      notes.push(n(GM_DRUM.KICK, beat, 0.25, beat % 2 === 0 ? vel : vel - 8));
    }
    // Extra offbeat kicks for high intensity
    if (ctx.intensity >= 85) {
      for (let beat = 0; beat < totalBeats; beat += 2) {
        notes.push(n(GM_DRUM.KICK, beat + 0.5, 0.15, vel - 30));
      }
    }
  } else if (ctx.intensity >= 30) {
    // Half-time feel
    for (let bar = 0; bar < bars; bar++) {
      const offset = bar * 4;
      notes.push(n(GM_DRUM.KICK, offset, 0.25, vel));
      notes.push(n(GM_DRUM.KICK, offset + 2, 0.25, vel - 10));
    }
  } else {
    // Sparse kick (intro/outro)
    for (let bar = 0; bar < bars; bar++) {
      notes.push(n(GM_DRUM.KICK, bar * 4, 0.25, vel - 15));
    }
  }

  return notes;
}

function generateSnarePattern(ctx: MidiGenerationContext): MidiNote[] {
  const notes: MidiNote[] = [];
  const bars = 2;
  const totalBeats = bars * 4;
  const vel = Math.min(127, 90 + Math.round(ctx.intensity * 0.2));
  const useClap = ctx.element.toLowerCase().includes('clap');
  const mainNote = useClap ? GM_DRUM.CLAP : GM_DRUM.SNARE;

  // Backbeat (beats 2 and 4)
  for (let bar = 0; bar < bars; bar++) {
    const offset = bar * 4;
    notes.push(n(mainNote, offset + 1, 0.25, vel));
    notes.push(n(mainNote, offset + 3, 0.25, vel));
  }

  // Ghost notes for higher intensity
  if (ctx.intensity >= 60) {
    for (let bar = 0; bar < bars; bar++) {
      const offset = bar * 4;
      notes.push(n(GM_DRUM.SNARE, offset + 0.75, 0.125, 30));
      notes.push(n(GM_DRUM.SNARE, offset + 2.75, 0.125, 28));
    }
  }

  if (ctx.intensity >= 80) {
    // Extra ghost notes (16th-note embellishments)
    for (let bar = 0; bar < bars; bar++) {
      const offset = bar * 4;
      notes.push(n(GM_DRUM.SNARE, offset + 1.5, 0.125, 25));
      notes.push(n(GM_DRUM.SNARE, offset + 3.5, 0.125, 22));
    }
  }

  return notes;
}

function generateHiHatPattern(ctx: MidiGenerationContext): MidiNote[] {
  const notes: MidiNote[] = [];
  const bars = 1;
  const totalBeats = bars * 4;

  // Velocity pattern for groove
  const velCycle16 = [100, 45, 65, 45, 85, 45, 65, 45, 95, 45, 65, 45, 85, 45, 65, 45];
  const velCycle8 = [100, 55, 85, 55, 95, 55, 85, 55];

  if (ctx.intensity >= 60) {
    // 1/16 pattern
    const stepSize = 0.25;
    const steps = totalBeats / stepSize;
    for (let i = 0; i < steps; i++) {
      const beat = i * stepSize;
      const vel = Math.round(velCycle16[i % 16] * (0.6 + ctx.intensity / 250));
      // Open hi-hat on the "and" of beat 4
      const isOpen = (i === 14); // beat 3.5
      notes.push(n(
        isOpen ? GM_DRUM.OPEN_HH : GM_DRUM.CLOSED_HH,
        beat,
        isOpen ? 0.375 : 0.2,
        Math.min(127, vel)
      ));
    }
  } else {
    // 1/8 pattern
    const stepSize = 0.5;
    const steps = totalBeats / stepSize;
    for (let i = 0; i < steps; i++) {
      const beat = i * stepSize;
      const vel = Math.round(velCycle8[i % 8] * (0.6 + ctx.intensity / 250));
      const isOpen = (i === 7); // last 8th note
      notes.push(n(
        isOpen ? GM_DRUM.OPEN_HH : GM_DRUM.CLOSED_HH,
        beat,
        isOpen ? 0.5 : 0.3,
        Math.min(127, vel)
      ));
    }
  }

  return notes;
}

function generateCymbalPattern(ctx: MidiGenerationContext): MidiNote[] {
  const notes: MidiNote[] = [];
  const bars = 2;
  const isRide = ctx.element.toLowerCase().includes('ride');
  const mainNote = isRide ? GM_DRUM.RIDE : GM_DRUM.CRASH;
  const vel = Math.min(127, 70 + Math.round(ctx.intensity * 0.3));

  if (isRide) {
    // Ride pattern: 8th notes with bell hits
    for (let bar = 0; bar < bars; bar++) {
      const offset = bar * 4;
      for (let i = 0; i < 8; i++) {
        notes.push(n(GM_DRUM.RIDE, offset + i * 0.5, 0.3, i % 2 === 0 ? vel : vel - 20));
      }
    }
  } else {
    // Crash: every 4 or 8 beats
    for (let bar = 0; bar < bars; bar++) {
      notes.push(n(GM_DRUM.CRASH, bar * 4, 1.0, vel));
    }
  }

  return notes;
}

function generatePercussionPattern(ctx: MidiGenerationContext): MidiNote[] {
  const notes: MidiNote[] = [];
  const bars = 2;
  const vel = Math.min(127, 65 + Math.round(ctx.intensity * 0.3));

  // Syncopated pattern with various percussion sounds
  const percNotes = [GM_DRUM.CONGA_H, GM_DRUM.CONGA_L, GM_DRUM.TAMBOURINE, GM_DRUM.COWBELL];

  // Bar 1: basic syncopation
  notes.push(n(percNotes[0], 0.5, 0.2, vel));
  notes.push(n(percNotes[1], 1.25, 0.2, vel - 10));
  notes.push(n(percNotes[0], 2.5, 0.2, vel + 5));
  notes.push(n(percNotes[1], 3.75, 0.2, vel - 15));

  // Bar 2: variation
  notes.push(n(percNotes[0], 4.25, 0.2, vel - 5));
  notes.push(n(percNotes[1], 5.5, 0.2, vel));
  notes.push(n(percNotes[0], 6.75, 0.2, vel + 5));
  notes.push(n(percNotes[1], 7.25, 0.2, vel - 10));

  // Add shaker/tamb for high intensity
  if (ctx.intensity >= 60) {
    for (let bar = 0; bar < bars; bar++) {
      const offset = bar * 4;
      for (let i = 0; i < 16; i++) {
        if (i % 4 !== 0) { // skip downbeats
          notes.push(n(GM_DRUM.SHAKER, offset + i * 0.25, 0.15, 30 + Math.round(Math.random() * 20)));
        }
      }
    }
  }

  return notes;
}

function generateFillPattern(ctx: MidiGenerationContext): MidiNote[] {
  const notes: MidiNote[] = [];
  const vel = Math.min(127, 75 + Math.round(ctx.intensity * 0.3));

  // 1 bar fill leading into next section
  // Snare roll building up
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const beat = i * 0.25;
    const buildVel = Math.min(127, Math.round(vel * (0.4 + (i / steps) * 0.7)));
    // Alternate between snare and toms
    let drumNote: number;
    if (i < 4) drumNote = GM_DRUM.LOW_TOM;
    else if (i < 8) drumNote = GM_DRUM.MID_TOM;
    else if (i < 12) drumNote = GM_DRUM.HIGH_TOM;
    else drumNote = GM_DRUM.SNARE;

    notes.push(n(drumNote, beat, 0.2, buildVel));
  }

  // Crash on beat 1 of next bar (at the very end)
  notes.push(n(GM_DRUM.CRASH, 3.75, 0.5, vel + 10));

  return notes;
}

function generateSubBassPattern(ctx: MidiGenerationContext): MidiNote[] {
  const notes: MidiNote[] = [];
  const bars = 2;
  const { root, isMinor } = parseKey(ctx.key);
  const vel = Math.min(127, 90 + Math.round(ctx.intensity * 0.2));

  // Sub bass: sustained root note, slightly offset for sidechain compatibility
  const rootMidi = getScaleNote(root, isMinor, 0, 1); // octave 1

  for (let bar = 0; bar < bars; bar++) {
    const offset = bar * 4;
    // Starts slightly after the kick (1/32 note offset)
    notes.push(n(rootMidi, offset + 0.0625, 3.875, vel));
  }

  return notes;
}

function generateMidBassPattern(ctx: MidiGenerationContext): MidiNote[] {
  const notes: MidiNote[] = [];
  const bars = 2;
  const { root, isMinor } = parseKey(ctx.key);
  const vel = Math.min(127, 85 + Math.round(ctx.intensity * 0.2));

  const rootMidi = getScaleNote(root, isMinor, 0, 2); // octave 2
  const fifthMidi = getScaleNote(root, isMinor, 4, 2); // 5th degree

  for (let bar = 0; bar < bars; bar++) {
    const offset = bar * 4;
    notes.push(n(rootMidi, offset + 0.0625, 0.75, vel));
    notes.push(n(rootMidi, offset + 1.0, 0.5, vel - 10));
    notes.push(n(fifthMidi, offset + 2.0625, 0.75, vel - 5));
    notes.push(n(rootMidi, offset + 3.0, 0.5, vel - 15));
  }

  return notes;
}

function generateBasslinePattern(ctx: MidiGenerationContext): MidiNote[] {
  const notes: MidiNote[] = [];
  const bars = 2;
  const { root, isMinor } = parseKey(ctx.key);
  const vel = Math.min(127, 90 + Math.round(ctx.intensity * 0.15));

  // Get scale notes in octave 1-2 range
  const rootMidi = getScaleNote(root, isMinor, 0, 1);
  const thirdMidi = getScaleNote(root, isMinor, 2, 1);
  const fourthMidi = getScaleNote(root, isMinor, 3, 1);
  const fifthMidi = getScaleNote(root, isMinor, 4, 1);
  const seventhMidi = getScaleNote(root, isMinor, 6, 1);

  if (ctx.intensity >= 60) {
    // Groovy bassline (more movement)
    // Bar 1
    notes.push(n(rootMidi, 0, 0.75, vel));
    notes.push(n(rootMidi, 1.0, 0.25, vel - 15));
    notes.push(n(thirdMidi, 1.5, 0.5, vel - 10));
    notes.push(n(rootMidi, 2.0, 0.75, vel - 5));
    notes.push(n(fifthMidi, 3.0, 0.375, vel - 10));
    notes.push(n(fourthMidi, 3.5, 0.5, vel - 15));

    // Bar 2
    notes.push(n(rootMidi, 4.0, 0.75, vel));
    notes.push(n(seventhMidi, 5.0, 0.5, vel - 10));
    notes.push(n(rootMidi, 5.5, 0.25, vel - 15));
    notes.push(n(rootMidi, 6.0, 0.75, vel - 5));
    notes.push(n(fifthMidi, 7.0, 0.25, vel - 10));
    notes.push(n(rootMidi, 7.5, 0.5, vel - 5));
  } else {
    // Simple bassline (less movement, longer notes)
    // Bar 1
    notes.push(n(rootMidi, 0, 1.5, vel));
    notes.push(n(fifthMidi, 2.0, 1.0, vel - 10));
    notes.push(n(fourthMidi, 3.0, 1.0, vel - 15));

    // Bar 2
    notes.push(n(rootMidi, 4.0, 2.0, vel));
    notes.push(n(thirdMidi, 6.0, 1.0, vel - 10));
    notes.push(n(rootMidi, 7.0, 1.0, vel - 5));
  }

  return notes;
}

function generatePadPattern(ctx: MidiGenerationContext): MidiNote[] {
  const notes: MidiNote[] = [];
  const bars = 4;
  const { root, isMinor } = parseKey(ctx.key);
  const vel = Math.min(127, 70 + Math.round(ctx.intensity * 0.2));

  // Build chords from scale
  // I chord (root position)
  const chord1 = [
    getScaleNote(root, isMinor, 0, 3), // root
    getScaleNote(root, isMinor, 2, 3), // 3rd
    getScaleNote(root, isMinor, 4, 3), // 5th
  ];

  // IV chord (or vi in minor)
  const chord2 = [
    getScaleNote(root, isMinor, 3, 3), // 4th
    getScaleNote(root, isMinor, 5, 3), // 6th
    getScaleNote(root, isMinor, 0, 4), // octave root
  ];

  // V chord (or VII in minor)
  const chord3 = [
    getScaleNote(root, isMinor, 4, 3), // 5th
    getScaleNote(root, isMinor, 6, 3), // 7th
    getScaleNote(root, isMinor, 1, 4), // 2nd (up)
  ];

  // vi chord (or III in minor)
  const chord4 = [
    getScaleNote(root, isMinor, 5, 3), // 6th
    getScaleNote(root, isMinor, 0, 4), // root (up)
    getScaleNote(root, isMinor, 2, 4), // 3rd (up)
  ];

  const chordProgression = [chord1, chord2, chord3, chord4];

  for (let bar = 0; bar < bars; bar++) {
    const chord = chordProgression[bar % chordProgression.length];
    const offset = bar * 4;

    for (const midiNote of chord) {
      notes.push(n(midiNote, offset, 3.9, vel - (bar % 2 === 1 ? 5 : 0)));
    }
  }

  return notes;
}

function generateLeadPattern(ctx: MidiGenerationContext): MidiNote[] {
  const notes: MidiNote[] = [];
  const bars = 2;
  const { root, isMinor } = parseKey(ctx.key);
  const vel = Math.min(127, 80 + Math.round(ctx.intensity * 0.25));

  // Simple melodic phrase using scale notes in octave 4
  // Bar 1: ascending phrase
  notes.push(n(getScaleNote(root, isMinor, 0, 4), 0, 0.75, vel));
  notes.push(n(getScaleNote(root, isMinor, 2, 4), 1.0, 0.5, vel - 5));
  notes.push(n(getScaleNote(root, isMinor, 4, 4), 1.5, 1.0, vel));
  notes.push(n(getScaleNote(root, isMinor, 3, 4), 2.5, 0.5, vel - 10));
  notes.push(n(getScaleNote(root, isMinor, 2, 4), 3.0, 0.5, vel - 5));
  notes.push(n(getScaleNote(root, isMinor, 0, 4), 3.5, 0.5, vel - 15));

  // Bar 2: descending/resolution
  notes.push(n(getScaleNote(root, isMinor, 4, 4), 4.0, 0.75, vel));
  notes.push(n(getScaleNote(root, isMinor, 3, 4), 4.75, 0.5, vel - 5));
  notes.push(n(getScaleNote(root, isMinor, 2, 4), 5.5, 0.5, vel - 10));
  notes.push(n(getScaleNote(root, isMinor, 1, 4), 6.0, 1.0, vel));
  notes.push(n(getScaleNote(root, isMinor, 0, 4), 7.0, 1.0, vel + 5));

  return notes;
}

function generateArpPattern(ctx: MidiGenerationContext): MidiNote[] {
  const notes: MidiNote[] = [];
  const bars = 2;
  const { root, isMinor } = parseKey(ctx.key);
  const vel = Math.min(127, 75 + Math.round(ctx.intensity * 0.2));

  // Arpeggiated chord tones in 16th notes
  const chordTones = [
    getScaleNote(root, isMinor, 0, 3), // root
    getScaleNote(root, isMinor, 2, 3), // 3rd
    getScaleNote(root, isMinor, 4, 3), // 5th
    getScaleNote(root, isMinor, 0, 4), // octave
  ];

  const totalSteps = bars * 16; // 16th notes
  const stepDuration = 0.25;

  for (let i = 0; i < totalSteps; i++) {
    const beat = i * stepDuration;
    const toneIdx = i % chordTones.length;
    const noteVel = Math.min(127, vel + (toneIdx === 0 ? 10 : toneIdx === 3 ? 5 : -5));

    notes.push(n(chordTones[toneIdx], beat, 0.2, noteVel));
  }

  return notes;
}

function generateFXPattern(ctx: MidiGenerationContext): MidiNote[] {
  const notes: MidiNote[] = [];
  const bars = 2;
  const { root, isMinor } = parseKey(ctx.key);
  const vel = Math.min(127, 60 + Math.round(ctx.intensity * 0.3));

  // FX: sparse, atmospheric hits
  const rootMidi = getScaleNote(root, isMinor, 0, 4);
  const fifthMidi = getScaleNote(root, isMinor, 4, 4);

  // Sparse hits with long release
  notes.push(n(rootMidi, 0, 2.0, vel));
  notes.push(n(fifthMidi, 3.0, 1.5, vel - 10));
  notes.push(n(rootMidi + 12, 5.5, 2.0, vel - 15));
  notes.push(n(fifthMidi, 7.0, 1.0, vel - 5));

  return notes;
}

function generateTexturePattern(ctx: MidiGenerationContext): MidiNote[] {
  const notes: MidiNote[] = [];
  const bars = 4;
  const { root, isMinor } = parseKey(ctx.key);
  const vel = Math.min(127, 50 + Math.round(ctx.intensity * 0.2));

  // Texture: long evolving notes, drone-like
  const rootMidi = getScaleNote(root, isMinor, 0, 3);
  const fifthMidi = getScaleNote(root, isMinor, 4, 3);

  // Full 4-bar drone
  notes.push(n(rootMidi, 0, bars * 4 - 0.1, vel));
  notes.push(n(fifthMidi, 0, bars * 4 - 0.1, vel - 15));

  return notes;
}

// ──────────────────────────────────────────────────────────────
// MAIN CLIP GENERATOR
// ──────────────────────────────────────────────────────────────

export function generateMidiClip(ctx: MidiGenerationContext): MidiClip {
  const stemType = identifyStemType(ctx.element, ctx.category);
  const timeSignature = ctx.timeSignature || '4/4';
  const bpm = ctx.bpm || 128;

  let midiNotes: MidiNote[];
  let bars: number;

  switch (stemType) {
    case 'kick':
      midiNotes = generateKickPattern(ctx);
      bars = ctx.intensity >= 70 ? 1 : 2;
      break;
    case 'snare_clap':
      midiNotes = generateSnarePattern(ctx);
      bars = 2;
      break;
    case 'hihat':
      midiNotes = generateHiHatPattern(ctx);
      bars = 1;
      break;
    case 'cymbal':
      midiNotes = generateCymbalPattern(ctx);
      bars = 2;
      break;
    case 'percussion':
      midiNotes = generatePercussionPattern(ctx);
      bars = 2;
      break;
    case 'fill':
      midiNotes = generateFillPattern(ctx);
      bars = 1;
      break;
    case 'sub_bass':
      midiNotes = generateSubBassPattern(ctx);
      bars = 2;
      break;
    case 'mid_bass':
      midiNotes = generateMidBassPattern(ctx);
      bars = 2;
      break;
    case 'bassline':
      midiNotes = generateBasslinePattern(ctx);
      bars = 2;
      break;
    case 'pad':
      midiNotes = generatePadPattern(ctx);
      bars = 4;
      break;
    case 'lead':
      midiNotes = generateLeadPattern(ctx);
      bars = 2;
      break;
    case 'arp':
      midiNotes = generateArpPattern(ctx);
      bars = 2;
      break;
    case 'fx':
      midiNotes = generateFXPattern(ctx);
      bars = 2;
      break;
    case 'texture':
      midiNotes = generateTexturePattern(ctx);
      bars = 4;
      break;
    default:
      midiNotes = generatePadPattern(ctx);
      bars = 4;
  }

  return {
    stem: ctx.element,
    bpm,
    time_signature: timeSignature,
    bars,
    notes: midiNotes,
  };
}

// ──────────────────────────────────────────────────────────────
// SMF (Standard MIDI File) BINARY BUILDER
// ──────────────────────────────────────────────────────────────

export function midiClipToBytes(clip: MidiClip): Uint8Array {
  const microsecondsPerBeat = Math.round(60_000_000 / clip.bpm);

  // Build track events
  const trackEvents: Array<{ tick: number; data: number[]; priority: number }> = [];

  // Tempo meta event at tick 0
  trackEvents.push({
    tick: 0,
    priority: 0,
    data: [
      0xFF, 0x51, 0x03,
      (microsecondsPerBeat >> 16) & 0xFF,
      (microsecondsPerBeat >> 8) & 0xFF,
      microsecondsPerBeat & 0xFF,
    ],
  });

  // Time signature at tick 0
  const [num, den] = clip.time_signature.split('/').map(Number);
  const denPow = Math.round(Math.log2(den || 4));
  trackEvents.push({
    tick: 0,
    priority: 1,
    data: [0xFF, 0x58, 0x04, num || 4, denPow, 24, 8],
  });

  // Note events
  for (const note of clip.notes) {
    const startTick = Math.round(note.start_beat * PPQ);
    const durationTicks = Math.max(1, Math.round(note.duration_beats * PPQ));
    const midiNote = Math.max(0, Math.min(127, note.midi));
    const vel = Math.max(1, Math.min(127, note.velocity));

    // Note On (channel 0)
    trackEvents.push({
      tick: startTick,
      priority: 10,
      data: [0x90, midiNote, vel],
    });

    // Note Off (channel 0)
    trackEvents.push({
      tick: startTick + durationTicks,
      priority: 5, // note-off before note-on at same tick
      data: [0x80, midiNote, 0],
    });
  }

  // Sort events: by tick, then note-off before note-on (lower priority first)
  trackEvents.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    return a.priority - b.priority;
  });

  // End of Track at exact loop boundary
  const beatsPerBar = parseInt(clip.time_signature.split('/')[0]) || 4;
  const lastTick = clip.bars * beatsPerBar * PPQ;
  trackEvents.push({
    tick: lastTick,
    priority: 100,
    data: [0xFF, 0x2F, 0x00],
  });

  // Convert to delta-time based byte stream
  const trackBytes: number[] = [];
  let prevTick = 0;

  for (const event of trackEvents) {
    const delta = Math.max(0, event.tick - prevTick);
    trackBytes.push(...writeVLQ(delta));
    trackBytes.push(...event.data);
    prevTick = event.tick;
  }

  // Header chunk: "MThd" + length(6) + format(0) + tracks(1) + PPQ
  const headerChunk = [
    0x4D, 0x54, 0x68, 0x64, // "MThd"
    0x00, 0x00, 0x00, 0x06, // chunk length = 6
    0x00, 0x00,             // format 0 (single track)
    0x00, 0x01,             // 1 track
    (PPQ >> 8) & 0xFF, PPQ & 0xFF, // time division (480 PPQ)
  ];

  // Track chunk: "MTrk" + length + data
  const trackLength = trackBytes.length;
  const trackHeader = [
    0x4D, 0x54, 0x72, 0x6B, // "MTrk"
    (trackLength >> 24) & 0xFF,
    (trackLength >> 16) & 0xFF,
    (trackLength >> 8) & 0xFF,
    trackLength & 0xFF,
  ];

  return new Uint8Array([...headerChunk, ...trackHeader, ...trackBytes]);
}

// ──────────────────────────────────────────────────────────────
// DOWNLOAD / EXPORT
// ──────────────────────────────────────────────────────────────

/** Downloads the MIDI clip as a .mid file */
export function downloadMidi(clip: MidiClip, filename?: string): void {
  const bytes = midiClipToBytes(clip);
  const blob = new Blob([bytes], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);

  const safeStem = clip.stem.replace(/[^a-zA-Z0-9_-]/g, '_');
  const name = filename || `${safeStem}_${clip.bpm}bpm_${clip.bars}bar.mid`;

  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Generates the MIDI clip JSON (for clipboard or API use) */
export function getMidiClipJSON(clip: MidiClip): string {
  return JSON.stringify({
    midi_clip: {
      stem: clip.stem,
      bpm: clip.bpm,
      time_signature: clip.time_signature,
      bars: clip.bars,
      notes: clip.notes.map(n => ({
        note: n.note,
        start_beat: n.start_beat,
        duration_beats: n.duration_beats,
        velocity: n.velocity,
      })),
    },
  }, null, 2);
}

/** Copies MIDI clip JSON to clipboard */
export async function copyMidiClipJSON(clip: MidiClip): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(getMidiClipJSON(clip));
    return true;
  } catch {
    return false;
  }
}

/** Main convenience function: generates clip, downloads .mid, and copies JSON */
export function generateAndDownloadMidi(ctx: MidiGenerationContext): MidiClip {
  const clip = generateMidiClip(ctx);
  downloadMidi(clip);
  copyMidiClipJSON(clip);
  return clip;
}
