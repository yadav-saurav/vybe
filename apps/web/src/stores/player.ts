import { create } from 'zustand';
import type { ContentType, Song } from '@vybe/shared';

/**
 * Playback model (mirrors the reference's queue semantics):
 *
 *   history      ← songs already played (most recent last)
 *   current      ← now playing
 *   userQueue    ← "Playing Next" items added via Play Next / Play Later (always play before context)
 *   contextQueue ← remaining songs from the album/playlist/station that started playback
 *   autoplay     ← similar songs appended when context runs out (if autoplayEnabled)
 *
 * Play Next  → unshift into userQueue.   Play Later → push into userQueue.
 * Shuffle    → shuffles contextQueue (original order kept in contextOriginal to restore).
 * Repeat     → 'off' | 'all' (wraps context) | 'one' (repeats current).
 *
 * The audio element lives in features/player/engine.ts (driven by <PlayerEngine/>) which subscribes to this store;
 * this store never touches the DOM so it is unit-testable.
 */

export type RepeatMode = 'off' | 'all' | 'one';
export interface PlayContext { type: ContentType | 'library' | 'search' | 'queue'; id?: string; title?: string }
export interface QueueItem { uid: string; song: Song; source: 'context' | 'user' | 'autoplay' | 'station' }

export interface PlayerState {
  current: QueueItem | null;
  context: PlayContext | null;
  history: QueueItem[];
  userQueue: QueueItem[];
  contextQueue: QueueItem[];
  contextOriginal: QueueItem[]; // full original ordered context (for unshuffle / repeat all)
  autoplay: QueueItem[];

  isPlaying: boolean;
  isBuffering: boolean;
  positionMs: number;
  durationMs: number;
  bufferedMs: number;
  volume: number; // 0..1
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  autoplayEnabled: boolean;
  /** Increments whenever the engine must (re)load `current` from position `seekRequest`. */
  loadToken: number;
  seekRequest: { ms: number; token: number } | null;
  error: string | null;

  // ---- commands ----
  playSongs: (songs: Song[], startIndex?: number, context?: PlayContext, opts?: { shuffle?: boolean }) => void;
  playStation: (stationId: string, title: string, firstBatch: Song[]) => void;
  appendStation: (songs: Song[]) => void;
  playNext: (songs: Song[]) => void;
  playLater: (songs: Song[]) => void;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (ms: number) => void;
  skipToQueueItem: (uid: string) => void;
  removeFromQueue: (uid: string) => void;
  moveInUserQueue: (from: number, to: number) => void;
  moveInContextQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setAutoplayEnabled: (v: boolean) => void;
  setAutoplaySongs: (songs: Song[]) => void;
  /** Extend the autoplay continuation (keeps existing items and their uids). */
  appendAutoplaySongs: (songs: Song[]) => void;

  // ---- engine callbacks ----
  _onTime: (positionMs: number, durationMs: number, bufferedMs: number) => void;
  _onPlaying: (playing: boolean) => void;
  _onBuffering: (b: boolean) => void;
  _onEnded: () => void;
  _onError: (msg: string) => void;
}

// uids must stay unique across reloads (persisted queues keep their uids), so prefix with a per-session salt.
const uidSalt = Math.random().toString(36).slice(2, 7);
let uidCounter = 0;
const toItem = (song: Song, source: QueueItem['source']): QueueItem => ({ uid: `q${uidSalt}${++uidCounter}_${song.id}`, song, source });
// Monotonic token so two seeks within the same millisecond are still distinct requests.
let seekToken = 1;
const seekTo = (ms: number) => ({ ms, token: ++seekToken });
export const shuffleArray = <T,>(arr: T[]): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const move = <T,>(arr: T[], from: number, to: number) => { const a = arr.slice(); const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; };

const PREV_RESTART_THRESHOLD_MS = 3000;
const HISTORY_LIMIT = 100;
const PERSIST_KEY = 'vybe:player:v1';

const persisted = (() => {
  try { return JSON.parse(localStorage.getItem(PERSIST_KEY) || 'null') as Partial<PlayerState> | null; } catch { return null; }
})();

export const usePlayer = create<PlayerState>((set, get) => {
  /** Advance to the next item. `auto` = triggered by track end (respects repeat-one). */
  const advance = (auto: boolean) => {
    const s = get();
    if (auto && s.repeat === 'one' && s.current) { set({ seekRequest: seekTo(0), isPlaying: true }); return; }
    const history = s.current ? [...s.history, s.current].slice(-HISTORY_LIMIT) : s.history;
    if (s.userQueue.length) { const [n, ...rest] = s.userQueue; set({ history, current: n, userQueue: rest, positionMs: 0, durationMs: n.song.durationMs, loadToken: s.loadToken + 1, isPlaying: true }); return; }
    if (s.contextQueue.length) { const [n, ...rest] = s.contextQueue; set({ history, current: n, contextQueue: rest, positionMs: 0, durationMs: n.song.durationMs, loadToken: s.loadToken + 1, isPlaying: true }); return; }
    if (s.repeat === 'all' && s.contextOriginal.length) {
      const order = s.shuffle ? shuffleArray(s.contextOriginal) : s.contextOriginal;
      const fresh = order.map((q) => toItem(q.song, 'context'));
      const [n, ...rest] = fresh;
      // Keep contextOriginal in sync with the fresh uids so un-shuffling still finds its place.
      const byId = new Map(fresh.map((q) => [q.song.id, q]));
      const original = s.shuffle ? s.contextOriginal.map((q) => byId.get(q.song.id) ?? toItem(q.song, 'context')) : fresh;
      set({ history, current: n, contextQueue: rest, contextOriginal: original, positionMs: 0, durationMs: n.song.durationMs, loadToken: s.loadToken + 1, isPlaying: true });
      return;
    }
    if (s.autoplayEnabled && s.autoplay.length) { const [n, ...rest] = s.autoplay; set({ history, current: n, autoplay: rest, positionMs: 0, durationMs: n.song.durationMs, loadToken: s.loadToken + 1, isPlaying: true }); return; }
    // End of everything: stop at start of last track (reference behaviour).
    set({ isPlaying: false, seekRequest: seekTo(0), positionMs: 0 });
  };

  return {
    current: persisted?.current ?? null,
    context: persisted?.context ?? null,
    history: persisted?.history ?? [],
    userQueue: persisted?.userQueue ?? [],
    contextQueue: persisted?.contextQueue ?? [],
    contextOriginal: persisted?.contextOriginal ?? [],
    autoplay: [],
    isPlaying: false,
    isBuffering: false,
    positionMs: persisted?.positionMs ?? 0,
    durationMs: persisted?.current?.song.durationMs ?? 0,
    bufferedMs: 0,
    volume: persisted?.volume ?? 0.8,
    muted: false,
    shuffle: persisted?.shuffle ?? false,
    repeat: persisted?.repeat ?? 'off',
    autoplayEnabled: persisted?.autoplayEnabled ?? true,
    loadToken: 0,
    seekRequest: persisted?.positionMs ? { ms: persisted.positionMs, token: 1 } : null, // restore point; engine applies it paused
    error: null,

    playSongs: (songs, startIndex = 0, context = null as unknown as PlayContext, opts) => {
      if (!songs.length) return;
      const s = get();
      const shuffle = opts?.shuffle ?? s.shuffle;
      const items = songs.map((x) => toItem(x, 'context'));
      let current: QueueItem, rest: QueueItem[];
      if (shuffle) {
        const start = opts?.shuffle ? Math.floor(Math.random() * items.length) : startIndex;
        current = items[start];
        rest = shuffleArray(items.filter((_, i) => i !== start));
      } else { current = items[startIndex]; rest = items.slice(startIndex + 1); }
      set({
        history: s.current ? [...s.history, s.current].slice(-HISTORY_LIMIT) : s.history,
        current, contextQueue: rest, contextOriginal: items, autoplay: [], context, shuffle,
        positionMs: 0, durationMs: current.song.durationMs, loadToken: s.loadToken + 1, isPlaying: true, error: null,
      });
    },
    playStation: (stationId, title, firstBatch) => {
      const s = get();
      const items = firstBatch.map((x) => toItem(x, 'station'));
      if (!items.length) return;
      set({
        history: s.current ? [...s.history, s.current].slice(-HISTORY_LIMIT) : s.history,
        current: items[0], contextQueue: items.slice(1), contextOriginal: [], userQueue: s.userQueue, autoplay: [],
        context: { type: 'station', id: stationId, title }, shuffle: false, repeat: 'off',
        positionMs: 0, durationMs: items[0].song.durationMs, loadToken: s.loadToken + 1, isPlaying: true, error: null,
      });
    },
    appendStation: (songs) => set({ contextQueue: [...get().contextQueue, ...songs.map((x) => toItem(x, 'station'))] }),
    playNext: (songs) => {
      const s = get();
      if (!s.current) { s.playSongs(songs, 0, { type: 'queue' }); return; }
      set({ userQueue: [...songs.map((x) => toItem(x, 'user')), ...s.userQueue] });
    },
    playLater: (songs) => {
      const s = get();
      if (!s.current) { s.playSongs(songs, 0, { type: 'queue' }); return; }
      set({ userQueue: [...s.userQueue, ...songs.map((x) => toItem(x, 'user'))] });
    },
    togglePlay: () => { const s = get(); if (s.current) set({ isPlaying: !s.isPlaying }); },
    play: () => { if (get().current) set({ isPlaying: true }); },
    pause: () => set({ isPlaying: false }),
    next: () => advance(false),
    previous: () => {
      const s = get();
      if (!s.current) return;
      if (s.positionMs > PREV_RESTART_THRESHOLD_MS || !s.history.length) { set({ seekRequest: seekTo(0), positionMs: 0 }); return; }
      const prev = s.history[s.history.length - 1];
      const back = s.current.source === 'user' ? { userQueue: [s.current, ...s.userQueue] }
        : s.current.source === 'autoplay' ? { autoplay: [s.current, ...s.autoplay] }
        : { contextQueue: [s.current, ...s.contextQueue] };
      set({ ...back, history: s.history.slice(0, -1), current: prev, positionMs: 0, durationMs: prev.song.durationMs, loadToken: s.loadToken + 1, isPlaying: true });
    },
    seek: (ms) => { const d = get().durationMs || Infinity; const c = Math.max(0, Math.min(ms, d)); set({ positionMs: c, seekRequest: seekTo(c) }); },
    skipToQueueItem: (uid) => {
      const s = get();
      const dur = (q?: QueueItem) => ({ durationMs: q?.song.durationMs ?? 0 });
      const history = s.current ? [...s.history, s.current] : [...s.history];
      let i = s.userQueue.findIndex((q) => q.uid === uid);
      if (i >= 0) { set({ history: [...history, ...s.userQueue.slice(0, i)].slice(-HISTORY_LIMIT), current: s.userQueue[i], ...dur(s.userQueue[i]), userQueue: s.userQueue.slice(i + 1), positionMs: 0, loadToken: s.loadToken + 1, isPlaying: true }); return; }
      i = s.contextQueue.findIndex((q) => q.uid === uid);
      if (i >= 0) { set({ history: [...history, ...s.userQueue, ...s.contextQueue.slice(0, i)].slice(-HISTORY_LIMIT), current: s.contextQueue[i], ...dur(s.contextQueue[i]), userQueue: [], contextQueue: s.contextQueue.slice(i + 1), positionMs: 0, loadToken: s.loadToken + 1, isPlaying: true }); return; }
      i = s.autoplay.findIndex((q) => q.uid === uid);
      if (i >= 0) { set({ history: [...history, ...s.userQueue, ...s.contextQueue, ...s.autoplay.slice(0, i)].slice(-HISTORY_LIMIT), current: s.autoplay[i], ...dur(s.autoplay[i]), userQueue: [], contextQueue: [], autoplay: s.autoplay.slice(i + 1), positionMs: 0, loadToken: s.loadToken + 1, isPlaying: true }); return; }
      i = s.history.findIndex((q) => q.uid === uid);
      if (i >= 0) {
        const item = s.history[i];
        set({ current: toItem(item.song, item.source), ...dur(item), positionMs: 0, loadToken: s.loadToken + 1, isPlaying: true, history: [...s.history, ...(s.current ? [s.current] : [])].slice(-HISTORY_LIMIT) });
      }
    },
    removeFromQueue: (uid) => {
      const s = get();
      const keep = (q: QueueItem) => q.uid !== uid;
      set({ userQueue: s.userQueue.filter(keep), contextQueue: s.contextQueue.filter(keep), contextOriginal: s.contextOriginal.filter(keep), autoplay: s.autoplay.filter(keep) });
    },
    moveInUserQueue: (from, to) => set({ userQueue: move(get().userQueue, from, to) }),
    moveInContextQueue: (from, to) => set({ contextQueue: move(get().contextQueue, from, to) }),
    clearQueue: () => set({ userQueue: [], contextQueue: [], autoplay: [] }),
    toggleShuffle: () => {
      const s = get();
      if (!s.shuffle) set({ shuffle: true, contextQueue: shuffleArray(s.contextQueue) });
      else {
        // Restore the original order, continuing after the context track that is (or was last) playing;
        // remaining songs that came before it follow (rotation), so nothing still queued is lost.
        const remainingUids = new Set(s.contextQueue.map((q) => q.uid));
        const anchorUid = [s.current, ...s.history.slice().reverse()].find((q) => q && q.source === 'context' && s.contextOriginal.some((o) => o.uid === q.uid))?.uid;
        const curIdx = anchorUid ? s.contextOriginal.findIndex((q) => q.uid === anchorUid) : -1;
        const rotated = curIdx >= 0 ? [...s.contextOriginal.slice(curIdx + 1), ...s.contextOriginal.slice(0, curIdx)] : s.contextOriginal;
        const restored = rotated.filter((q) => remainingUids.has(q.uid));
        const known = new Set(restored.map((q) => q.uid));
        set({ shuffle: false, contextQueue: [...restored, ...s.contextQueue.filter((q) => !known.has(q.uid))] });
      }
    },
    cycleRepeat: () => set({ repeat: ({ off: 'all', all: 'one', one: 'off' } as const)[get().repeat] }),
    setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)), muted: v <= 0 }),
    toggleMute: () => { const s = get(); if (s.muted && s.volume <= 0) set({ muted: false, volume: 0.5 }); else set({ muted: !s.muted }); },
    setAutoplayEnabled: (autoplayEnabled) => set({ autoplayEnabled }),
    setAutoplaySongs: (songs) => set({ autoplay: songs.map((x) => toItem(x, 'autoplay')) }),
    appendAutoplaySongs: (songs) => set({ autoplay: [...get().autoplay, ...songs.map((x) => toItem(x, 'autoplay'))] }),

    _onTime: (positionMs, durationMs, bufferedMs) => set({ positionMs, durationMs: durationMs || get().durationMs, bufferedMs }),
    _onPlaying: (isPlaying) => {
      const s = get();
      if (s.isPlaying !== isPlaying || (isPlaying && s.error)) set(isPlaying ? { isPlaying, error: null } : { isPlaying });
    },
    _onBuffering: (isBuffering) => set({ isBuffering }),
    _onEnded: () => advance(true),
    _onError: (error) => set({ error, isPlaying: false, isBuffering: false }),
  };
});

/** Upcoming items in play order (what the Queue pane renders under "Playing Next"). */
export const selectUpcoming = (s: PlayerState) => [...s.userQueue, ...s.contextQueue, ...(s.autoplayEnabled ? s.autoplay : [])];

// Persist queue + settings so a reload resumes where the user left off. Throttled (not debounced:
// time updates arrive continuously while playing, which would starve a debounce), plus a final
// flush when the page is hidden/unloaded.
let persistTimer: ReturnType<typeof setTimeout> | undefined;
const persistNow = () => {
  clearTimeout(persistTimer);
  persistTimer = undefined;
  try {
    const { current, context, history, userQueue, contextQueue, contextOriginal, volume, shuffle, repeat, autoplayEnabled, positionMs } = usePlayer.getState();
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ current, context, history: history.slice(-30), userQueue, contextQueue: contextQueue.slice(0, 200), contextOriginal: contextOriginal.slice(0, 200), volume, shuffle, repeat, autoplayEnabled, positionMs }));
  } catch { /* quota / private mode */ }
};
usePlayer.subscribe(() => { if (persistTimer === undefined) persistTimer = setTimeout(persistNow, 1000); });
if (typeof window !== 'undefined') {
  addEventListener('pagehide', persistNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistNow(); });
}
