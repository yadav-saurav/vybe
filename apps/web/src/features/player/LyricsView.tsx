import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type { LyricLine } from '@vybe/shared';
import { api, ApiError } from '../../lib/api';
import { usePlayer } from '../../stores/player';
import { getAudioTime, onFrame } from './engine';
import s from './LyricsView.module.css';

// ---------------------------------------------------------------------------------------------
// Per-song cache: resolved lines, `null` = no lyrics. Failed requests are evicted so they can retry.
const cache = new Map<string, Promise<LyricLine[] | null>>();
function fetchLyrics(songId: string): Promise<LyricLine[] | null> {
  let p = cache.get(songId);
  if (!p) {
    p = api.lyrics(songId).then((r) => (r.lines?.length ? r.lines : null)).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      cache.delete(songId);
      throw e;
    });
    cache.set(songId, p);
  }
  return p;
}

/** Index of the line being sung at `t` (last line whose start ≤ t), or -1 before the first. */
function activeLineAt(lines: { startMs: number }[], t: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].startMs <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

const LEAD_MS = 180; // light anticipation so lines land on the beat
const FOCAL = 0.3; // active line sits 30% from the top
const FREE_MS = 3000; // manual scroll pauses auto-follow for 3s

type Load = { id: string; status: 'loading' | 'ready' | 'none' | 'error'; lines: LyricLine[] };

export function LyricsView({ variant }: { variant: 'panel' | 'full' }) {
  const song = usePlayer((p) => p.current?.song);
  const songId = song?.id;
  const hasLyrics = !!song?.hasLyrics;
  const [load, setLoad] = useState<Load | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!songId) { setLoad(null); return; }
    if (!hasLyrics) { setLoad({ id: songId, status: 'none', lines: [] }); return; }
    let alive = true;
    setLoad((l) => (l?.id === songId && l.status === 'ready' ? l : { id: songId, status: 'loading', lines: [] }));
    fetchLyrics(songId).then(
      (lines) => { if (alive) setLoad({ id: songId, status: lines ? 'ready' : 'none', lines: lines ?? [] }); },
      () => { if (alive) setLoad({ id: songId, status: 'error', lines: [] }); },
    );
    return () => { alive = false; };
  }, [songId, hasLyrics, retry]);

  if (!song) return <Message variant={variant} title="Nothing Playing" body="Play a song to see its lyrics here." />;
  if (!load || load.id !== songId || load.status === 'loading') return <div className={clsx(s.wrap, s[variant])}><div className={s.loading} aria-busy="true" aria-label="Loading lyrics"><i /><i /><i /></div></div>;
  if (load.status === 'none') return <Message variant={variant} title="Lyrics Not Available" body={`There are no lyrics for “${song.title}”.`} />;
  if (load.status === 'error') return <Message variant={variant} title="Couldn’t Load Lyrics" body="Check your connection and try again." action={{ label: 'Try Again', onClick: () => setRetry((n) => n + 1) }} />;
  return <Lines key={songId} lines={load.lines} variant={variant} />;
}

function Message({ title, body, variant, action }: { title: string; body: string; variant: 'panel' | 'full'; action?: { label: string; onClick: () => void } }) {
  return (
    <div className={clsx(s.wrap, s[variant])}>
      <div className={s.message} role="status">
        <p className={s.messageTitle}>{title}</p>
        <p className={s.messageBody}>{body}</p>
        {action && <button className={s.messageAction} onClick={action.onClick}>{action.label}</button>}
      </div>
    </div>
  );
}

function Lines({ lines: raw, variant }: { lines: LyricLine[]; variant: 'panel' | 'full' }) {
  // An intro longer than ~2.5s gets a leading instrumental gap, like the reference.
  const lines = useMemo(() => (raw[0] && raw[0].startMs > 2500 ? [{ startMs: 0, endMs: raw[0].startMs, text: '' }, ...raw] : raw), [raw]);
  const [active, setActive] = useState(() => activeLineAt(lines, getAudioTime() + LEAD_MS));
  const [free, setFree] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const lineEls = useRef<(HTMLElement | null)[]>([]);
  const freeUntil = useRef(0);
  const freeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const first = useRef(true);
  const [pad, setPad] = useState(0);
  const activeRef = useRef(active);
  activeRef.current = active;

  // Track the active line from the audio clock (rAF while playing, single ticks on seeks).
  useEffect(() => onFrame(() => {
    const i = activeLineAt(lines, getAudioTime() + LEAD_MS);
    setActive((prev) => (prev === i ? prev : i));
  }), [lines]);

  // Container height → top/bottom padding so any line can reach the focal point.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPad(el.clientHeight));
    ro.observe(el);
    setPad(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const follow = (instant: boolean) => {
    const el = scroller.current;
    if (!el) return;
    const line = lineEls.current[Math.max(0, activeRef.current)];
    if (!line) return;
    const top = line.offsetTop - el.clientHeight * FOCAL;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top, behavior: instant || reduce ? 'auto' : 'smooth' });
  };
  useLayoutEffect(() => {
    if (!pad) return;
    if (performance.now() < freeUntil.current) return;
    follow(first.current);
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pad]);

  // Manual scrolling (wheel / touch / keys) pauses auto-follow for 3s.
  const goFree = () => {
    freeUntil.current = performance.now() + FREE_MS;
    setFree(true);
    clearTimeout(freeTimer.current);
    freeTimer.current = setTimeout(() => { freeUntil.current = 0; setFree(false); follow(false); }, FREE_MS);
  };
  useEffect(() => () => clearTimeout(freeTimer.current), []);

  const seekTo = (ms: number) => {
    const p = usePlayer.getState();
    freeUntil.current = 0; setFree(false); clearTimeout(freeTimer.current);
    p.seek(ms);
    if (!p.isPlaying) p.play();
  };

  return (
    <div className={clsx(s.wrap, s[variant])}>
      <div ref={scroller} className={clsx(s.scroller, free && s.free)} data-scroll tabIndex={-1}
        onWheel={goFree} onTouchMove={goFree} onKeyDown={(e) => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) goFree(); }}
        aria-label="Lyrics" role="list">
        <div style={{ height: pad * FOCAL }} aria-hidden />
        {lines.map((l, i) => {
          const d = Math.abs(i - active);
          const state = i === active ? 'active' : i < active ? 'past' : 'future';
          const style = { '--d': Math.min(d, 5) } as React.CSSProperties;
          return l.text === '' ? (
            <div key={i} ref={(el) => { lineEls.current[i] = el; }} role="listitem" className={clsx(s.line, s.gap, s[state])} style={style} aria-label="Instrumental">
              <button className={s.lineBtn} tabIndex={-1} onClick={() => seekTo(l.startMs)} aria-label="Instrumental break">
                <span className={s.dots}><i /><i /><i /></span>
              </button>
            </div>
          ) : (
            <div key={i} ref={(el) => { lineEls.current[i] = el; }} role="listitem" className={clsx(s.line, s[state])} style={style} aria-current={i === active ? 'true' : undefined}>
              <button className={s.lineBtn} onClick={() => seekTo(l.startMs)}>{l.text}</button>
            </div>
          );
        })}
        <div style={{ height: pad * (1 - FOCAL) }} aria-hidden />
      </div>
    </div>
  );
}
