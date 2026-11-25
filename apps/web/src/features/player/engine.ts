import { usePlayer, type PlayerState, type QueueItem } from '../../stores/player';
import { useSettings } from '../../stores/settings';
import { applyEq, resumeEq } from './eq';
import { useUI } from '../../stores/ui';

/**
 * Headless audio engine. Two HTMLAudioElements: the "active" one plays `current`, the "standby" one
 * preloads the next upcoming song. When the next song is exactly the preloaded one the two swap roles,
 * so track transitions start instantly from an already-buffered element.
 *
 * The store is the source of truth for intent (isPlaying, seekRequest, loadToken, volume); the engine
 * reports reality back through the store's `_on*` callbacks.
 */

type El = HTMLAudioElement & { _url?: string; _uid?: string; _quiet?: boolean };

let els: [El, El] | null = null;
let activeIdx = 0;
const frameSubs = new Set<() => void>();
let rafId = 0;
let lastReport = 0;
let started = false;

const P = () => usePlayer.getState();
export const active = (): El | null => (els ? els[activeIdx] : null);
const standby = (): El | null => (els ? els[1 - activeIdx] : null);

/** Current playback position in ms, interpolated straight from the audio clock (for 60fps UI). */
export function getAudioTime(): number {
  const a = active();
  const s = P();
  if (a && s.current && a._uid === s.current.uid && a.readyState > 0) return a.currentTime * 1000;
  return s.positionMs;
}
export function getDurationMs(): number {
  const a = active();
  const s = P();
  if (a && s.current && a._uid === s.current.uid && Number.isFinite(a.duration) && a.duration > 0) return a.duration * 1000;
  return s.durationMs || s.current?.song.durationMs || 0;
}
function bufferedMs(a: El): number {
  try {
    const t = a.currentTime;
    for (let i = 0; i < a.buffered.length; i++) if (a.buffered.start(i) <= t + 0.5 && a.buffered.end(i) >= t) return a.buffered.end(i) * 1000;
    return a.buffered.length ? a.buffered.end(a.buffered.length - 1) * 1000 : 0;
  } catch { return 0; }
}

/** Subscribe to animation-frame ticks while playing (and single ticks on seeks/loads while paused). */
export function onFrame(cb: () => void): () => void {
  frameSubs.add(cb);
  cb();
  return () => { frameSubs.delete(cb); };
}
const emitFrame = () => { frameSubs.forEach((cb) => cb()); };

// --------------------------------------------------------------------------------------------
// Time reporting / ticker

const listeners = { heard: 0, lastT: -1, logged: false };
type TimeHook = (posMs: number, durMs: number, heardMs: number) => void;
let timeHook: TimeHook | null = null;
export const setTimeHook = (h: TimeHook | null) => { timeHook = h; };

function report(force = false) {
  const a = active();
  if (!a) return;
  const now = performance.now();
  const fast = useUI.getState().nowPlayingOpen;
  if (!force && !fast && now - lastReport < 250) return;
  lastReport = now;
  const pos = a.currentTime * 1000;
  const dur = Number.isFinite(a.duration) ? a.duration * 1000 : 0;
  // Accumulate actually-heard time (ignores seeks) for play-history logging.
  if (!a.paused && listeners.lastT >= 0) {
    const d = pos - listeners.lastT;
    if (d > 0 && d < 1500) listeners.heard += d;
  }
  listeners.lastT = pos;
  P()._onTime(pos, dur, bufferedMs(a));
  timeHook?.(pos, dur, listeners.heard);
}

function tick() {
  rafId = 0;
  const a = active();
  if (!a || a.paused) return;
  report();
  emitFrame();
  maybeStartCrossfade(a);
  rafId = requestAnimationFrame(tick);
}

// --------------------------------------------------------------------------------------------
// Crossfade: start the preloaded next song early and overlap the two volumes.

let crossfadeArmed = false;   // next load() should fade instead of cutting
let fadeTimer: ReturnType<typeof setInterval> | undefined;

function maybeStartCrossfade(a: El) {
  const secs = useSettings.getState().crossfadeSec;
  if (P().sleepAtEnd) return; // let the song finish; the timer stops playback at its end
  if (!secs || crossfadeArmed || !Number.isFinite(a.duration) || a.duration < secs * 3) return;
  const remaining = a.duration - a.currentTime;
  if (remaining > secs || remaining < 0.3) return;
  const s = P();
  const next = nextUp(s);
  const sb = standby();
  if (!next || !sb || sb._url !== next.song.audioUrl || sb.readyState < 2) return; // only when preloaded
  crossfadeArmed = true;
  s.next();
}

// Sleep timer: ease the volume to zero over 3 s, then pause (volume is restored for next time).
let sleepFade: ReturnType<typeof setInterval> | undefined;
function fadeOutAndPause() {
  const a = active();
  if (!a || a.paused) return;
  clearInterval(sleepFade);
  const start = a.volume, t0 = performance.now();
  sleepFade = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / 3000);
    a.volume = Math.max(0, start * (1 - k));
    if (k >= 1) { clearInterval(sleepFade); P().pause(); applyVolume(P(), a); }
  }, 50);
}

/** Fade `from` out and `to` in over `ms`, then pause `from`. */
function crossfade(from: El, to: El, toTarget: number, ms: number) {
  clearInterval(fadeTimer);
  const fromStart = from.volume;
  const t0 = performance.now();
  to.volume = 0;
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    // Equal-power curve keeps the perceived loudness steady through the overlap.
    from.volume = Math.max(0, fromStart * Math.cos((k * Math.PI) / 2));
    to.volume = Math.min(1, toTarget * Math.sin((k * Math.PI) / 2));
    if (k >= 1) {
      clearInterval(fadeTimer);
      quietPause(from);
      from.volume = fromStart;
    }
  }, 50);
}
const startTicker = () => { if (!rafId) rafId = requestAnimationFrame(tick); };

// --------------------------------------------------------------------------------------------
// Element management

let errorTimer: ReturnType<typeof setTimeout> | undefined;

function makeEl(): El {
  const a = new Audio() as El;
  a.crossOrigin = 'anonymous'; // required for the equalizer when audio is served from object storage (CORS enabled)
  a.preload = 'auto';
  const isActive = () => a === active();
  a.addEventListener('playing', () => { if (!isActive()) return; P()._onBuffering(false); P()._onPlaying(true); startTicker(); });
  a.addEventListener('play', () => { if (isActive()) startTicker(); });
  a.addEventListener('pause', () => {
    if (a._quiet) { a._quiet = false; return; } // our own pause (track switch)
    if (!isActive() || a.ended) return; // `ended` is handled separately so repeat/next keep the intent
    report(true); emitFrame();
    if (P().isPlaying && !a.ended && a.src) P()._onPlaying(false); // paused externally (headset, OS)
  });
  a.addEventListener('waiting', () => { if (isActive() && !a.paused) P()._onBuffering(true); });
  a.addEventListener('canplay', () => { if (isActive()) P()._onBuffering(false); });
  a.addEventListener('timeupdate', () => { if (isActive() && a.paused) { report(true); emitFrame(); } });
  a.addEventListener('seeked', () => { if (isActive()) { listeners.lastT = a.currentTime * 1000; report(true); emitFrame(); } });
  a.addEventListener('durationchange', () => { if (isActive()) { report(true); emitFrame(); } });
  a.addEventListener('progress', () => { if (isActive() && a.paused) report(true); });
  a.addEventListener('ended', () => { if (!isActive()) return; report(true); P()._onEnded(); });
  a.addEventListener('error', () => {
    if (!isActive() || !a._url) return;
    const uid = a._uid;
    const title = P().current?.song.title;
    const wasPlaying = P().isPlaying;
    P()._onError(a.error?.message || 'Playback error');
    // A failure while restoring a paused session stays silent and must never start playback;
    // pressing Play retries the load (see the isPlaying branch in the store subscription).
    if (!wasPlaying) return;
    useUI.getState().toast(title ? `Couldn’t play “${title}”` : 'Couldn’t play this song');
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => {
      const s = P();
      if (s.current?.uid === uid && (s.userQueue.length || s.contextQueue.length || (s.autoplayEnabled && s.autoplay.length))) s.next();
    }, 2000);
  });
  return a;
}

/** Pause without the resulting 'pause' event being read as an external pause. */
function quietPause(a: El) { if (!a.paused) { a._quiet = true; a.pause(); } }

function playSafe(a: El) {
  const eqGains = useSettings.getState().eqGains;
  applyEq(els ?? [a], eqGains);
  void resumeEq();
  const p = a.play();
  if (p && typeof p.catch === 'function') {
    p.catch((err: DOMException) => {
      if (err?.name === 'AbortError') return; // superseded by a newer load/pause
      // Autoplay policy (NotAllowedError) or decode failure: reflect the real state, no noisy error.
      if (a === active()) { P()._onPlaying(false); P()._onBuffering(false); }
    });
  }
}

function load(s: PlayerState, opts: { autoplay: boolean; atMs: number }) {
  if (!els) return;
  clearTimeout(errorTimer);
  clearInterval(sleepFade);
  const item = s.current;
  const cur = active()!;
  if (!item) { quietPause(cur); cur.removeAttribute('src'); cur._url = undefined; cur._uid = undefined; cur.load(); emitFrame(); return; }
  const url = item.song.audioUrl;
  listeners.heard = 0; listeners.lastT = -1; listeners.logged = false;
  const sb = standby()!;
  const fading = crossfadeArmed;
  crossfadeArmed = false;
  if (sb._url === url && sb.readyState >= 1 && sb.error == null) {
    // Instant transition: the standby element already buffered this song.
    if (!fading) quietPause(cur);
    activeIdx = 1 - activeIdx;
    const a = active()!;
    a._uid = item.uid;
    applyVolume(s, a);
    a.muted = s.muted;
    try { a.currentTime = opts.atMs / 1000; } catch { /* not seekable yet */ }
    if (fading && !cur.paused) crossfade(cur, a, a.volume, useSettings.getState().crossfadeSec * 1000);
  } else {
    clearInterval(fadeTimer);
    quietPause(cur);
    cur._url = url; cur._uid = item.uid;
    cur.src = url;
    if (opts.atMs > 0) { try { cur.currentTime = opts.atMs / 1000; } catch { /* applied once metadata loads */ } }
    const at = opts.atMs;
    if (at > 0) cur.addEventListener('loadedmetadata', () => { if (cur._uid === item.uid && Math.abs(cur.currentTime * 1000 - at) > 500) cur.currentTime = at / 1000; }, { once: true });
  }
  const a = active()!;
  P()._onTime(opts.atMs, a.duration && Number.isFinite(a.duration) ? a.duration * 1000 : item.song.durationMs, 0);
  if (opts.autoplay) { P()._onBuffering(a.readyState < 3); playSafe(a); }
  emitFrame();
  schedulePreload();
}

function applyVolume(s: Pick<PlayerState, 'volume' | 'muted' | 'current'>, a: El) {
  // Sound Check: per-song loudness correction (can only attenuate; element volume tops out at 1).
  const gain = useSettings.getState().soundCheck ? Math.min(1, 10 ** ((s.current?.song.gainDb ?? 0) / 20)) : 1;
  a.volume = Math.max(0, Math.min(1, s.volume * s.volume * gain)); // perceptual curve
  a.muted = s.muted;
}

// Preload the next upcoming song shortly after the current one starts (don't compete for bandwidth).
let preloadTimer: ReturnType<typeof setTimeout> | undefined;
export function nextUp(s: PlayerState): QueueItem | undefined {
  if (s.repeat === 'one') return undefined;
  return s.userQueue[0] ?? s.contextQueue[0] ?? (s.repeat === 'all' ? s.contextOriginal[0] : undefined) ?? (s.autoplayEnabled ? s.autoplay[0] : undefined);
}
function schedulePreload() {
  clearTimeout(preloadTimer);
  preloadTimer = setTimeout(() => {
    const sb = standby();
    const next = nextUp(P());
    if (!sb || !next || next.song.audioUrl === active()?._url) return;
    if (sb._url === next.song.audioUrl) return;
    quietPause(sb);
    sb._url = next.song.audioUrl; sb._uid = undefined;
    sb.src = next.song.audioUrl;
    sb.load();
  }, 1500);
}

// --------------------------------------------------------------------------------------------
// Store → element sync

export function startEngine() {
  if (started) return () => {};
  started = true;
  els = [makeEl(), makeEl()];
  activeIdx = 0;
  const s0 = P();
  applyVolume(s0, els[0]); applyVolume(s0, els[1]);
  // Restore the persisted session paused at its saved position. Never autoplay on startup.
  if (s0.current) {
    if (s0.isPlaying) usePlayer.setState({ isPlaying: false });
    load(P(), { autoplay: false, atMs: s0.seekRequest?.ms ?? s0.positionMs ?? 0 });
  }

  const unsub = usePlayer.subscribe((s, prev) => {
    const a = active();
    if (!a) return;
    if (s.loadToken !== prev.loadToken) {
      const seekAfter = s.seekRequest !== prev.seekRequest && s.seekRequest ? s.seekRequest.ms : 0;
      load(s, { autoplay: s.isPlaying, atMs: seekAfter });
    } else if (s.seekRequest && s.seekRequest !== prev.seekRequest) {
      if (a._uid !== s.current?.uid && s.current) load(s, { autoplay: s.isPlaying, atMs: s.seekRequest.ms });
      else {
        try { a.currentTime = s.seekRequest.ms / 1000; } catch { /* ignore */ }
        listeners.lastT = s.seekRequest.ms;
        emitFrame();
      }
    }
    if (s.isPlaying !== prev.isPlaying || (s.isPlaying && s.seekRequest !== prev.seekRequest)) {
      if (s.isPlaying && s.current) {
        if (a._uid !== s.current.uid || a.error) load(s, { autoplay: true, atMs: s.positionMs });
        else if (a.paused || a.ended) playSafe(a);
      } else if (!s.isPlaying && !a.paused) a.pause();
    }
    if (s.volume !== prev.volume || s.muted !== prev.muted) applyVolume(s, a);
    if (s.userQueue !== prev.userQueue || s.contextQueue !== prev.contextQueue || s.autoplay !== prev.autoplay || s.repeat !== prev.repeat) schedulePreload();
  });

  const sleepTimer = setInterval(() => { if (P()._sleepDue(Date.now())) fadeOutAndPause(); }, 1000);

  const unsubSettings = useSettings.subscribe((st, prev) => {
    if (st.soundCheck !== prev.soundCheck) { const a = active(); if (a) applyVolume(P(), a); }
    if (st.eqGains !== prev.eqGains && els) applyEq(els, st.eqGains);
  });

  return () => {
    unsub();
    unsubSettings();
    clearInterval(sleepTimer); clearInterval(sleepFade);
    clearInterval(fadeTimer);
    cancelAnimationFrame(rafId); rafId = 0;
    clearTimeout(preloadTimer); clearTimeout(errorTimer);
    els?.forEach((e) => { e.pause(); e.removeAttribute('src'); e.load(); });
    els = null;
    started = false;
  };
}

export const engineInternals = { listeners };
