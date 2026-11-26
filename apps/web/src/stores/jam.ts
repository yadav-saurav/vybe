import { create } from 'zustand';
import type { Song } from '@vybe/shared';
import { api, ApiError, type JamAction, type JamView } from '../lib/api';
import { isImported } from '../lib/imports';
import { usePlayer, type PlayerState, type QueueItem } from './player';
import { useUI } from './ui';
import { useAuth } from './auth';

/**
 * Jam: listen together. The server holds one shared queue and playhead; this store follows it over
 * Server-Sent Events and drives the local player to match. While a Jam is active the player's
 * commands (play, pause, skip, seek, queue) are routed to the server instead of changing local state,
 * so every surface (mini player, Now Playing, queue, ··· menus, keyboard, media keys) just works.
 */

/** Re-sync when the local playhead drifts this far from the shared one. */
const DRIFT_MS = 1500;
const CHECK_EVERY_MS = 2500;

interface JamState {
  jam: JamView | null;
  /** Server clock minus local clock, estimated from each update. */
  offsetMs: number;
  connected: boolean;
  busy: boolean;
  sheetOpen: boolean;
  setSheetOpen: (v: boolean) => void;
  /** Start a Jam from what's playing now. */
  start: () => Promise<void>;
  join: (code: string) => Promise<boolean>;
  /** Guests leave; the host ends the Jam for everyone. */
  leave: () => Promise<void>;
  setGuestsCanControl: (v: boolean) => Promise<void>;
  removeEntry: (entryId: string) => Promise<void>;
  /** Add songs to the end of the Jam queue (a playlist or a mood). */
  addSongs: (songs: Song[], label: string) => Promise<void>;
  /** Play a queued song now. */
  jumpTo: (index: number) => Promise<void>;
  /** Reconnect after a reload if the server says we're still in a Jam. */
  resume: () => Promise<void>;
  reset: () => void;
}

export const inviteLink = (code: string) => `${location.origin}/jam/${code}`;

/** The shared playhead right now, in local time. */
export function sharedPosition(view: JamView, offsetMs: number, now = Date.now()) {
  const elapsed = view.playing ? Math.max(0, now + offsetMs - view.serverTime) : 0;
  const dur = view.queue[view.index]?.song.durationMs ?? 0;
  return Math.min(view.positionMs + elapsed, dur || Infinity);
}

export const canControl = (view: JamView | null, userId?: string) =>
  !!view && (view.guestsCanControl || view.hostId === userId);

let source: EventSource | null = null;
let driftTimer: ReturnType<typeof setInterval> | undefined;
let saved: Partial<PlayerState> | null = null;
let seekToken = 1e9;

export const useJam = create<JamState>((set, get) => {
  const toast = (m: string) => useUI.getState().toast(m);
  const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');

  /** Follow a Jam's state: drive the player and keep it in step. */
  const apply = (view: JamView) => {
    const prev = get().jam;
    if (prev && prev.code === view.code && view.version < prev.version) return; // stale (out-of-order) reply
    if (view.ended) { stop(prev?.hostId === useAuth.getState().user?.id ? 'You ended the Jam' : 'The Jam has ended'); return; }
    // Assume half the round-trip has passed; good enough for music (drift checks fix the rest).
    set({ jam: view, offsetMs: view.serverTime - Date.now() });
    drive(view);
  };

  const drive = (view: JamView) => {
    const p = usePlayer.getState();
    const items: QueueItem[] = view.queue.map((e) => ({ uid: e.entryId, song: e.song, source: 'context' }));
    const cur = items[view.index];
    const base: Partial<PlayerState> = {
      history: items.slice(0, view.index), contextQueue: cur ? items.slice(view.index + 1) : [], contextOriginal: items,
      userQueue: [], autoplay: [], context: { type: 'queue', id: 'jam', title: `${view.hostName}’s Jam` },
      shuffle: false, repeat: 'off', isPlaying: view.playing && !!cur,
    };
    if (!cur) { usePlayer.setState({ ...base, current: null, positionMs: 0, durationMs: 0 }); return; }
    const at = sharedPosition(view, get().offsetMs);
    if (p.current?.uid !== cur.uid) {
      usePlayer.setState({ ...base, current: cur, positionMs: at, durationMs: cur.song.durationMs, loadToken: p.loadToken + 1, seekRequest: { ms: at, token: ++seekToken }, error: null });
    } else if (Math.abs(p.positionMs - at) > DRIFT_MS) {
      usePlayer.setState({ ...base, positionMs: at, seekRequest: { ms: at, token: ++seekToken } });
    } else {
      usePlayer.setState(base);
    }
  };

  const send = async (action: JamAction, extra: { positionMs?: number; index?: number } = {}) => {
    const j = get().jam;
    if (!j) return;
    if (action !== 'ended' && !canControl(j, useAuth.getState().user?.id)) { toast('The host has turned off controls for guests'); return; }
    try { apply(await api.jamControl(j.code, action, extra)); } catch (e) {
      fail(e);
      api.jam(j.code).then(apply).catch(() => {}); // undo an instant change the server didn't accept
    }
  };

  /**
   * Play/pause react on your screen at once (no wait for the server); the server confirms and tells
   * everyone else. Returns the position to anchor at, or null when you can't control playback.
   */
  const setPlayingNow = (playing: boolean): number | null => {
    const j = get().jam;
    if (!j || !j.queue[j.index]) return null;
    if (!canControl(j, useAuth.getState().user?.id)) { toast('The host has turned off controls for guests'); return null; }
    const at = Math.round(usePlayer.getState().positionMs);
    set({ jam: { ...j, playing, positionMs: at, serverTime: Date.now() + get().offsetMs } });
    usePlayer.setState({ isPlaying: playing });
    return at;
  };

  const add = async (songs: Song[], position: 'next' | 'last', label: string) => {
    const j = get().jam;
    if (!j) return;
    const ok = songs.filter((x) => !isImported(x));
    if (!ok.length) { toast('Imported songs are private, so they can’t play in a Jam'); return; }
    try {
      apply(await api.jamAdd(j.code, ok.map((x) => x.id), position));
      toast(ok.length < songs.length ? `${label} (imported songs skipped)` : label);
    } catch (e) { fail(e); }
  };

  /** Player commands while in a Jam. Anything without a shared meaning says so instead of silently diverging. */
  const overrides = (): Partial<PlayerState> => {
    const notInJam = () => toast('Not available during a Jam');
    const indexOf = (uid: string) => get().jam?.queue.findIndex((e) => e.entryId === uid) ?? -1;
    return {
      togglePlay: () => {
        const j = get().jam; if (!j) return;
        const want = !j.playing;
        const at = setPlayingNow(want);
        if (at !== null) void send(want ? 'play' : 'pause', { positionMs: at });
      },
      play: () => { const at = setPlayingNow(true); if (at !== null) void send('play', { positionMs: at }); },
      pause: () => { const at = setPlayingNow(false); if (at !== null) void send('pause', { positionMs: at }); },
      next: () => void send('next'),
      previous: () => void send('previous'),
      seek: (ms) => {
        const d = usePlayer.getState().durationMs || Infinity;
        const c = Math.max(0, Math.min(ms, d));
        if (!canControl(get().jam, useAuth.getState().user?.id)) { toast('The host has turned off controls for guests'); return; }
        usePlayer.setState({ positionMs: c, seekRequest: { ms: c, token: ++seekToken } }); // feels instant; the server confirms
        void send('seek', { positionMs: Math.round(c) });
      },
      skipToQueueItem: (uid) => { const i = indexOf(uid); if (i >= 0) void send('jump', { index: i }); },
      removeFromQueue: (uid) => void get().removeEntry(uid),
      playNext: (songs) => void add(songs, 'next', 'Playing Next in the Jam'),
      playLater: (songs) => void add(songs, 'last', 'Added to the Jam'),
      // Playing something new in a Jam queues it right after the current song and skips to it.
      playSongs: (songs, startIndex = 0) => {
        void (async () => {
          const before = get().jam;
          await add(songs.slice(startIndex), 'next', 'Playing in the Jam');
          const after = get().jam;
          if (before?.queue.length && after && after.queue.length > before.queue.length) await send('next');
        })();
      },
      playStation: (_id, _title, batch) => void add(batch, 'next', 'Playing in the Jam'),
      appendStation: () => {},
      toggleShuffle: notInJam,
      cycleRepeat: notInJam,
      clearQueue: notInJam,
      moveInUserQueue: notInJam,
      moveInContextQueue: notInJam,
      setAutoplayEnabled: notInJam,
      // Every listener reports the end; the server advances once (stale reports are ignored).
      _onEnded: () => { const j = get().jam; if (j) void send('ended', { index: j.index }); },
    };
  };

  const KEYS = ['togglePlay', 'play', 'pause', 'next', 'previous', 'seek', 'skipToQueueItem', 'removeFromQueue', 'playNext', 'playLater',
    'playSongs', 'playStation', 'appendStation', 'toggleShuffle', 'cycleRepeat', 'clearQueue', 'moveInUserQueue', 'moveInContextQueue',
    'setAutoplayEnabled', '_onEnded', 'autoplayEnabled', 'shuffle', 'repeat'] as const;

  const connect = (view: JamView) => {
    if (!saved) {
      const p = usePlayer.getState() as unknown as Record<string, unknown>;
      saved = Object.fromEntries(KEYS.map((k) => [k, p[k]])) as Partial<PlayerState>;
      usePlayer.setState({ ...overrides(), autoplayEnabled: false });
    }
    source?.close();
    source = new EventSource(api.jamEventsUrl(view.code), { withCredentials: true });
    source.addEventListener('jam', (ev) => { try { apply(JSON.parse((ev as MessageEvent).data) as JamView); set({ connected: true }); } catch { /* ignore */ } });
    source.onerror = () => {
      set({ connected: false });
      // EventSource retries on its own; find out whether the Jam is still there.
      const j = get().jam;
      if (j) api.jam(j.code).catch((e) => { if (e instanceof ApiError && e.status === 404) stop('The Jam has ended'); });
    };
    clearInterval(driftTimer);
    driftTimer = setInterval(() => {
      const j = get().jam, p = usePlayer.getState();
      if (!j || !p.current || p.isBuffering) return;
      if (Math.abs(p.positionMs - sharedPosition(j, get().offsetMs)) > DRIFT_MS) drive(j);
    }, CHECK_EVERY_MS);
    apply(view);
  };

  /** Back to solo listening: keep the song, pause, and give the player its own controls back. */
  const stop = (message?: string) => {
    source?.close(); source = null;
    clearInterval(driftTimer);
    if (saved) {
      const p = usePlayer.getState();
      usePlayer.setState({ ...saved, isPlaying: false, context: p.context ? { type: 'queue', title: 'Your Queue' } : null });
      saved = null;
    }
    set({ jam: null, connected: false, sheetOpen: false });
    if (message) toast(message);
  };

  return {
    jam: null,
    offsetMs: 0,
    connected: false,
    busy: false,
    sheetOpen: false,
    setSheetOpen: (sheetOpen) => set({ sheetOpen }),

    start: async () => {
      if (!useAuth.getState().user) { useUI.getState().openSignIn(); return; }
      // A Jam starts empty: the host and friends fill it with their own playlists and moods.
      usePlayer.getState().pause();
      set({ busy: true });
      try {
        const view = await api.startJam({ songIds: [] });
        connect(view);
        toast('Jam started. Invite your friends, then add a playlist or a mood.');
      } catch (e) { fail(e); } finally { set({ busy: false }); }
    },

    join: async (code) => {
      if (!useAuth.getState().user) { useUI.getState().openSignIn(); return false; }
      set({ busy: true });
      try {
        const view = await api.joinJam(code);
        connect(view);
        return true;
      } catch (e) { fail(e); return false; } finally { set({ busy: false }); }
    },

    leave: async () => {
      const j = get().jam;
      if (!j) return;
      const host = j.hostId === useAuth.getState().user?.id;
      try { await api.leaveJam(j.code); } catch { /* ended already */ }
      stop(host ? 'You ended the Jam' : 'You left the Jam');
    },

    setGuestsCanControl: async (v) => {
      const j = get().jam;
      if (!j) return;
      try { apply(await api.jamSettings(j.code, { guestsCanControl: v })); } catch (e) { fail(e); }
    },

    removeEntry: async (entryId) => {
      const j = get().jam;
      if (!j) return;
      try { apply(await api.jamRemove(j.code, entryId)); } catch (e) { fail(e); }
    },

    addSongs: (songs, label) => add(songs, 'last', label),

    jumpTo: (index) => send('jump', { index }),

    resume: async () => {
      if (get().jam) return;
      try { const { jam } = await api.myJam(); if (jam) connect(jam); } catch { /* not signed in / offline */ }
    },

    reset: () => stop(),
  };
});
