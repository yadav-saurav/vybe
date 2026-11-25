import { create } from 'zustand';

/** Playback preferences (per device, like the reference's local playback settings). */
export interface Settings {
  crossfadeSec: number;      // 0 = off, 1..12
  soundCheck: boolean;       // level loud tracks using Song.gainDb
  audioQuality: 'normal' | 'high';
  showLyricsTranslation: boolean;
  set: (patch: Partial<Omit<Settings, 'set'>>) => void;
}

const KEY = 'vybe:settings:v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Settings>; } catch { return {}; } })();

export const useSettings = create<Settings>((set, get) => ({
  crossfadeSec: 0,
  soundCheck: true,
  audioQuality: 'high',
  showLyricsTranslation: false,
  ...saved,
  set: (patch) => {
    set(patch);
    const { crossfadeSec, soundCheck, audioQuality, showLyricsTranslation } = get();
    try { localStorage.setItem(KEY, JSON.stringify({ crossfadeSec, soundCheck, audioQuality, showLyricsTranslation })); } catch { /* private mode */ }
  },
}));
