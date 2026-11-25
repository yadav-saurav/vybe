import { create } from 'zustand';

/** Playback preferences (per device, like the reference's local playback settings). */
export interface Settings {
  crossfadeSec: number;      // 0 = off, 1..12
  soundCheck: boolean;       // level loud tracks using Song.gainDb
  audioQuality: 'normal' | 'high';
  showLyricsTranslation: boolean;
  eqPreset: string;          // key of EQ_PRESETS, or 'custom'
  eqGains: number[];         // dB for 60 Hz, 230 Hz, 910 Hz, 3.6 kHz, 14 kHz
  set: (patch: Partial<Omit<Settings, 'set'>>) => void;
}

const KEY = 'vybe:settings:v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Settings>; } catch { return {}; } })();

export const useSettings = create<Settings>((set, get) => ({
  crossfadeSec: 0,
  soundCheck: true,
  audioQuality: 'high',
  showLyricsTranslation: false,
  eqPreset: 'flat',
  eqGains: [0, 0, 0, 0, 0],
  ...saved,
  set: (patch) => {
    set(patch);
    const { crossfadeSec, soundCheck, audioQuality, showLyricsTranslation, eqPreset, eqGains } = get();
    try { localStorage.setItem(KEY, JSON.stringify({ crossfadeSec, soundCheck, audioQuality, showLyricsTranslation, eqPreset, eqGains })); } catch { /* private mode */ }
  },
}));
