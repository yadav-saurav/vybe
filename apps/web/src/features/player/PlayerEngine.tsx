import { useEffect } from 'react';
import type { ContentType } from '@vybe/shared';
import { api } from '../../lib/api';
import { artUrl } from '../../lib/color';
import { usePlayer, type PlayerState } from '../../stores/player';
import { useUI } from '../../stores/ui';
import { useAuth } from '../../stores/auth';
import { isWorld } from '../../lib/world';
import { getAudioTime, getDurationMs, setTimeHook, startEngine } from './engine';

const P = () => usePlayer.getState();
const CONTENT_TYPES: ContentType[] = ['song', 'album', 'playlist', 'artist', 'station'];

/** Headless: owns the audio engine and every global player side effect. Rendered once in Layout. */
export function PlayerEngine() {
  useEffect(() => startEngine(), []);
  usePlayHistory();
  useQueueTopUp();
  useMediaSession();
  useDocumentTitle();
  useKeyboardShortcuts();
  return null;
}

// ---------------------------------------------------------------------------------------------
/** Log a play once per load when ≥30s or ≥50% has actually been heard (signed-in users only). */
function usePlayHistory() {
  useEffect(() => {
    let loggedUid: string | undefined;
    setTimeHook((_pos, dur, heard) => {
      const s = P();
      const item = s.current;
      if (!item || loggedUid === item.uid) return;
      const total = dur || item.song.durationMs;
      if (heard < 30_000 && !(total > 0 && heard >= total * 0.5)) return;
      loggedUid = item.uid;
      if (!useAuth.getState().user || isWorld(item.song)) return; // previews aren't Vybe plays
      const ctx = s.context;
      const contextType = ctx?.type && (CONTENT_TYPES as string[]).includes(ctx.type) ? (ctx.type as ContentType) : undefined;
      const contextId = contextType && ctx?.id && !ctx.id.startsWith('seed:') ? ctx.id : undefined;
      api.logPlay(item.song.id, Math.round(heard), contextType, contextId).catch(() => { /* 401 / offline: ignore */ });
    });
    // A new load of the same uid (repeat one restarts don't reload) should be able to log again.
    const unsub = usePlayer.subscribe((s, prev) => { if (s.loadToken !== prev.loadToken) loggedUid = undefined; });
    return () => { setTimeHook(null); unsub(); };
  }, []);
}

// ---------------------------------------------------------------------------------------------
/** Keeps the queue flowing: station batches and similar-song autoplay when the context runs low. */
function useQueueTopUp() {
  useEffect(() => {
    let inflight = false;
    let lastKey = '';
    const knownIds = (s: PlayerState) => {
      const set = new Set<string>();
      [...s.history.slice(-50), ...(s.current ? [s.current] : []), ...s.userQueue, ...s.contextQueue, ...s.autoplay].forEach((q) => set.add(q.song.id));
      return [...set];
    };
    const check = () => {
      const s = P();
      if (!s.current || inflight) return;
      const ctx = s.context;
      const isStation = ctx?.type === 'station';
      let key: string;
      let run: () => Promise<void>;
      if (isStation && ctx?.id) {
        if (s.contextQueue.length >= 3) return;
        const last = s.contextQueue.at(-1)?.song ?? s.current.song;
        key = `st:${ctx.id}:${last.id}`;
        const exclude = knownIds(s).slice(-60);
        const id = ctx.id;
        run = async () => {
          if (id.startsWith('seed:')) {
            // "Create Station" from a song: endless continuation via recommendations.
            const { songs } = await api.autoplay(last.id, exclude, 10);
            if (P().context?.id === id) P().appendStation(songs);
          } else {
            const { tracks } = await api.stationNext(id, exclude, 10);
            if (P().context?.id === id) P().appendStation(tracks);
          }
        };
      } else {
        if (!s.autoplayEnabled || s.repeat === 'all') return;
        if (s.contextQueue.length >= 3 || s.autoplay.length >= 3) return;
        if (s.contextQueue.length > 0 && s.autoplay.length > 0) return;
        const last = s.autoplay.at(-1)?.song ?? s.contextQueue.at(-1)?.song ?? s.current.song;
        if (isWorld(last)) return; // Vybe's recommendations only know its own catalog
        key = `ap:${last.id}:${s.autoplay.length}`;
        const exclude = knownIds(s).slice(-60);
        const ctxRef = s.context;
        const extend = s.autoplay.length > 0;
        run = async () => {
          const { songs } = await api.autoplay(last.id, exclude, 10);
          if (P().context !== ctxRef) return;
          const have = new Set(knownIds(P()));
          const fresh = songs.filter((x) => !have.has(x.id));
          if (!fresh.length) return;
          if (extend) P().appendAutoplaySongs(fresh); else P().setAutoplaySongs(fresh);
        };
      }
      if (key === lastKey) return;
      lastKey = key;
      inflight = true;
      run().catch(() => { /* offline: try again on the next queue change */ lastKey = ''; }).finally(() => { inflight = false; });
    };
    check();
    const unsub = usePlayer.subscribe((s, prev) => {
      if (s.current !== prev.current || s.contextQueue.length !== prev.contextQueue.length || s.autoplay.length !== prev.autoplay.length
        || s.autoplayEnabled !== prev.autoplayEnabled || s.repeat !== prev.repeat || s.context !== prev.context) check();
    });
    return unsub;
  }, []);
}

// ---------------------------------------------------------------------------------------------
function useMediaSession() {
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const abs = (u?: string) => (u ? new URL(u, location.href).href : '');
    const setMeta = (s: PlayerState) => {
      const song = s.current?.song;
      if (!song) { ms.metadata = null; return; }
      try {
        ms.metadata = new MediaMetadata({
          title: song.title,
          artist: [song.artist.name, ...song.featuring.map((f) => f.name)].join(', '),
          album: song.album.title,
          artwork: [96, 128, 192, 256, 384, 512].map((n) => ({ src: abs(artUrl(song.artwork, n)), sizes: `${n}x${n}` })),
        });
      } catch { /* unsupported */ }
    };
    let lastPos = 0;
    const setPos = () => {
      const dur = getDurationMs() / 1000;
      if (!dur || !Number.isFinite(dur)) return;
      try { ms.setPositionState({ duration: dur, position: Math.min(dur, Math.max(0, getAudioTime() / 1000)), playbackRate: 1 }); } catch { /* ignore */ }
    };
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => P().play()],
      ['pause', () => P().pause()],
      ['previoustrack', () => P().previous()],
      ['nexttrack', () => P().next()],
      ['seekto', (d) => { if (d.seekTime != null) P().seek(d.seekTime * 1000); }],
      ['seekbackward', (d) => P().seek(getAudioTime() - (d.seekOffset ?? 10) * 1000)],
      ['seekforward', (d) => P().seek(getAudioTime() + (d.seekOffset ?? 10) * 1000)],
      ['stop', () => P().pause()],
    ];
    for (const [a, h] of handlers) { try { ms.setActionHandler(a, h); } catch { /* action unsupported */ } }
    setMeta(P());
    const unsub = usePlayer.subscribe((s, prev) => {
      if (s.current?.song.id !== prev.current?.song.id) setMeta(s);
      if (s.isPlaying !== prev.isPlaying) { ms.playbackState = s.current ? (s.isPlaying ? 'playing' : 'paused') : 'none'; setPos(); }
      if (s.seekRequest !== prev.seekRequest || s.durationMs !== prev.durationMs) setPos();
      else if (Math.abs(s.positionMs - lastPos) > 5000) { lastPos = s.positionMs; setPos(); }
    });
    return () => { unsub(); for (const [a] of handlers) { try { ms.setActionHandler(a, null); } catch { /* ignore */ } } };
  }, []);
}

// ---------------------------------------------------------------------------------------------
/** "Song — Artist" while playing; restores whatever the page set when paused. */
function useDocumentTitle() {
  useEffect(() => {
    let pageTitle = document.title;
    let ours: string | null = null;
    const apply = () => {
      const s = P();
      const want = s.isPlaying && s.current ? `${s.current.song.title} — ${s.current.song.artist.name}` : null;
      if (want === ours) return;
      ours = want;
      document.title = want ?? pageTitle;
    };
    // Pages may set their own title while we're overriding it: remember it for later, then re-apply ours.
    const titleEl = document.querySelector('title') ?? document.head.appendChild(document.createElement('title'));
    const mo = new MutationObserver(() => {
      if (document.title === ours) return;
      pageTitle = document.title;
      if (ours) document.title = ours;
    });
    mo.observe(titleEl, { childList: true, characterData: true, subtree: true });
    apply();
    const unsub = usePlayer.subscribe((s, prev) => { if (s.isPlaying !== prev.isPlaying || s.current?.song.id !== prev.current?.song.id) apply(); });
    return () => { unsub(); mo.disconnect(); if (ours) document.title = pageTitle; };
  }, []);
}

// ---------------------------------------------------------------------------------------------
const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'range', 'submit'].includes(type);
  }
  return false;
};

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) return;
      const s = P();
      const ui = useUI.getState();
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      switch (e.key) {
        case ' ': case 'Spacebar': {
          // Let focused buttons/sliders/links handle Space natively.
          if (target?.closest('button, a, [role="slider"], [role="button"], [role="menuitem"], [role="option"]')) return;
          if (!s.current) return;
          e.preventDefault(); s.togglePlay(); return;
        }
        case 'ArrowRight': case 'ArrowLeft': {
          const dir = e.key === 'ArrowRight' ? 1 : -1;
          if (mod && !e.shiftKey && !e.altKey) { e.preventDefault(); if (dir > 0) s.next(); else s.previous(); return; }
          if (e.shiftKey && !mod && !e.altKey && s.current) { e.preventDefault(); s.seek(getAudioTime() + dir * 10_000); return; }
          return;
        }
        case 'ArrowUp': case 'ArrowDown': {
          if (!mod || e.altKey) return;
          e.preventDefault();
          s.setVolume((s.muted ? 0 : s.volume) + (e.key === 'ArrowUp' ? 0.1 : -0.1));
          return;
        }
        case 'Escape': {
          if (ui.menu) return; // context menu closes itself first
          if (ui.nowPlayingOpen) { e.preventDefault(); ui.setNowPlayingOpen(false); return; }
          if (ui.sidePanel) { ui.setSidePanel(null); }
          return;
        }
      }
      if (mod || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case 'm': e.preventDefault(); s.toggleMute(); return;
        case 'l': if (s.current?.song.hasLyrics || ui.sidePanel === 'lyrics') { e.preventDefault(); ui.setSidePanel(ui.sidePanel === 'lyrics' ? null : 'lyrics'); } return;
        case 'q': e.preventDefault(); ui.setSidePanel(ui.sidePanel === 'queue' ? null : 'queue'); return;
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}
