import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import clsx from 'clsx';
import { formatDuration } from '@vybe/shared';
import { Icon } from '../../components/Icon';
import { usePlayer } from '../../stores/player';
import { getAudioTime, getDurationMs, onFrame } from './engine';
import s from './controls.module.css';

const P = () => usePlayer.getState();

// ---------------------------------------------------------------------------------------------
export function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => { const m = matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => matchMedia(query).matches,
    () => false,
  );
}
export const useIsMobile = () => useMedia('(max-width: 760px)');
export const useReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------------------------------------
/** Pointer scrubbing shared by the progress bars and sliders (mouse, pen and touch). */
function usePointerFraction(onChange: (f: number) => void, onCommit: (f: number) => void, disabled?: boolean) {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const frac = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return r.width ? Math.max(0, Math.min(1, (clientX - r.left) / r.width)) : 0;
  };
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      // Focus for follow-up arrow keys, without a focus ring for pointer users.
      (e.currentTarget as HTMLElement).focus({ preventScroll: true, focusVisible: false } as FocusOptions);
      setActive(true);
      onChange(frac(e.clientX));
    },
    onPointerMove: (e: React.PointerEvent) => { if (active) onChange(frac(e.clientX)); },
    onPointerUp: (e: React.PointerEvent) => { if (!active) return; setActive(false); onCommit(frac(e.clientX)); },
    onPointerCancel: () => setActive(false),
    onLostPointerCapture: () => setActive(false),
  };
  return { ref, active, handlers, frac };
}

// ---------------------------------------------------------------------------------------------
/**
 * Playback progress bar. The fill is driven straight from the audio clock every animation frame
 * (transform only), so it moves at 60fps without re-rendering React.
 */
export function Scrubber({ variant, className, label = 'Playback position' }: { variant: 'lcd' | 'np' | 'mini'; className?: string; label?: string }) {
  const hasSong = usePlayer((p) => !!p.current);
  const durationMs = usePlayer((p) => p.durationMs || p.current?.song.durationMs || 0);
  const sec = usePlayer((p) => Math.floor(p.positionMs / 1000));
  const buffered = usePlayer((p) => (p.durationMs ? Math.min(1, p.bufferedMs / p.durationMs) : 0));
  const [scrub, setScrub] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const scrubRef = useRef<number | null>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  const paint = useCallback((f: number) => {
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${f})`;
    if (knobRef.current) knobRef.current.style.transform = `translateX(${f * 100}%)`;
  }, []);
  useEffect(() => onFrame(() => {
    if (scrubRef.current != null) return;
    const d = getDurationMs();
    paint(d ? Math.max(0, Math.min(1, getAudioTime() / d)) : 0);
  }), [paint, hasSong]);

  const { ref, active, handlers, frac } = usePointerFraction(
    (f) => { scrubRef.current = f; setScrub(f); paint(f); },
    (f) => { scrubRef.current = null; setScrub(null); paint(f); P().seek(f * getDurationMs()); },
    !hasSong,
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (!hasSong) return;
    const t = getAudioTime();
    const map: Record<string, number> = { ArrowRight: t + 5000, ArrowUp: t + 5000, ArrowLeft: t - 5000, ArrowDown: t - 5000, PageUp: t + 30000, PageDown: t - 30000, Home: 0, End: getDurationMs() - 1000 };
    if (e.key in map && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); P().seek(map[e.key]); }
  };

  const shownMs = scrub != null ? scrub * durationMs : sec * 1000;
  const tipF = scrub ?? hover;
  return (
    <div className={clsx(s.scrubber, s[variant], active && s.scrubbing, !hasSong && s.disabled, className)}>
      <div ref={ref} className={s.hit} role="slider" tabIndex={hasSong ? 0 : -1} aria-label={label}
        aria-valuemin={0} aria-valuemax={Math.round(durationMs / 1000)} aria-valuenow={Math.round(shownMs / 1000)}
        aria-valuetext={`${formatDuration(shownMs)} of ${formatDuration(durationMs)}`} aria-disabled={!hasSong || undefined}
        onKeyDown={onKey} {...handlers}
        onPointerMove={(e) => { handlers.onPointerMove(e); if (e.pointerType === 'mouse' && hasSong) setHover(frac(e.clientX)); }}
        onPointerLeave={() => setHover(null)}>
        <div className={s.track}>
          <div className={s.buffer} style={{ transform: `scaleX(${hasSong ? buffered : 0})` }} />
          <div ref={fillRef} className={s.fill} />
        </div>
        <div ref={knobRef} className={s.knobLane}><span className={s.knob} /></div>
        {variant !== 'mini' && tipF != null && hasSong && (
          <div className={s.tipLane} style={{ transform: `translateX(${tipF * 100}%)` }} aria-hidden>
            <span className={s.tip}>{formatDuration(tipF * durationMs)}</span>
          </div>
        )}
      </div>
      {variant === 'np' && (
        <div className={s.times} aria-hidden>
          <span>{formatDuration(shownMs)}</span>
          <span>-{formatDuration(Math.max(0, durationMs - shownMs))}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
/** Generic horizontal slider (volume). */
export function Slider({ value, onChange, label, className, step = 0.05, valueText }: {
  value: number; onChange: (v: number) => void; label: string; className?: string; step?: number; valueText?: string;
}) {
  const { ref, active, handlers } = usePointerFraction(onChange, onChange);
  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowRight: value + step, ArrowUp: value + step, ArrowLeft: value - step, ArrowDown: value - step, PageUp: value + 0.2, PageDown: value - 0.2, Home: 0, End: 1 };
    if (e.key in map && !e.metaKey && !e.ctrlKey) { e.preventDefault(); e.stopPropagation(); onChange(Math.max(0, Math.min(1, map[e.key]))); }
  };
  return (
    <div ref={ref} className={clsx(s.slider, active && s.scrubbing, className)} role="slider" tabIndex={0} aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-valuetext={valueText ?? `${Math.round(value * 100)}%`}
      aria-orientation="horizontal" onKeyDown={onKey} {...handlers}>
      <div className={s.track}><div className={s.fill} style={{ transform: `scaleX(${value})` }} /></div>
      <div className={s.knobLane} style={{ transform: `translateX(${value * 100}%)` }}><span className={s.knob} /></div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function volumeIcon(volume: number, muted: boolean) {
  return muted || volume <= 0 ? 'volume-0' : volume < 0.5 ? 'volume-1' : 'volume-2';
}
const wheelVolume = (e: { deltaY: number; deltaX: number }) => {
  const st = P();
  const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? -e.deltaY : e.deltaX;
  st.setVolume((st.muted ? 0 : st.volume) + Math.max(-0.08, Math.min(0.08, d * 0.002)));
};

/** Speaker button with a hover popover holding a horizontal slider; the wheel adjusts volume. */
export function VolumeControl({ className, disabled }: { className?: string; disabled?: boolean }) {
  const volume = usePlayer((p) => p.volume);
  const muted = usePlayer((p) => p.muted);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const closeT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = () => { clearTimeout(closeT.current); if (!disabled) setOpen(true); };
  const hide = (delay = 250) => { clearTimeout(closeT.current); closeT.current = setTimeout(() => setOpen(false), delay); };
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { if (disabled) return; e.preventDefault(); show(); wheelVolume(e); hide(1200); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  const v = muted ? 0 : volume;
  return (
    <div ref={wrap} className={clsx(s.volume, className)} onPointerEnter={(e) => { if (e.pointerType === 'mouse') show(); }} onPointerLeave={() => hide()}
      onFocus={show} onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget as Node)) hide(0); }}
      onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}>
      <button className={s.iconBtn} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'} disabled={disabled}
        onClick={() => P().toggleMute()}>
        <Icon name={volumeIcon(volume, muted)} size={20} />
      </button>
      <div className={clsx(s.volPop, open && s.volPopOpen)} aria-hidden={!open}>
        <Icon name="volume-0" size={14} className={s.volEnd} />
        <Slider value={v} onChange={(x) => P().setVolume(x)} label="Volume" className={s.volSlider} />
        <Icon name="volume-2" size={14} className={s.volEnd} />
      </div>
    </div>
  );
}

/** Inline volume row (Now Playing). */
export function VolumeRow({ className }: { className?: string }) {
  const volume = usePlayer((p) => p.volume);
  const muted = usePlayer((p) => p.muted);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); wheelVolume(e); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return (
    <div ref={ref} className={clsx(s.volRow, className)}>
      <button className={s.iconBtn} aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => P().toggleMute()}><Icon name={muted || volume <= 0 ? 'volume-0' : 'volume-1'} size={18} /></button>
      <Slider value={muted ? 0 : volume} onChange={(x) => P().setVolume(x)} label="Volume" className={s.volRowSlider} />
      <button className={s.iconBtn} aria-label="Maximum volume" onClick={() => P().setVolume(1)}><Icon name="volume-2" size={18} /></button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
/** Single-line text that scrolls (marquee) only when it overflows. */
export function Marquee({ children, className, textKey }: { children: ReactNode; className?: string; textKey?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [dist, setDist] = useState(0);
  useLayoutEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const measure = () => { const over = i.scrollWidth - o.clientWidth; setDist(over > 2 ? i.scrollWidth + 40 : 0); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    return () => ro.disconnect();
  }, [textKey]);
  return (
    <div ref={outer} className={clsx(s.marquee, dist > 0 && s.marqueeOn, className)}
      style={dist ? ({ '--mq-dist': `${dist}px`, '--mq-dur': `${Math.max(8, dist / 28 + 4)}s` } as React.CSSProperties) : undefined}>
      <span className={s.marqueeTrack} key={textKey}>
        <span ref={inner} className={s.marqueeText}>{children}</span>
        {dist > 0 && <span className={s.marqueeText} aria-hidden>{children}</span>}
      </span>
    </div>
  );
}
