import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { Artwork as Art, Song } from '@vybe/shared';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { artUrl } from '../../lib/color';
import { usePlayer } from '../../stores/player';
import { useUI } from '../../stores/ui';
import { useLibrary } from '../../stores/library';
import { menuFor, openMenuAt } from '../actions';
import { Marquee, Scrubber, useIsMobile, VolumeRow } from './controls';
import { PlayPauseIcon } from './PlayerChrome';
import { LyricsView } from './LyricsView';
import { QueuePanel } from './QueuePanel';
import { albumHref, artistHref } from '../../lib/imports';
import s from './NowPlaying.module.css';

const P = () => usePlayer.getState();
const close = () => useUI.getState().setNowPlayingOpen(false);
const OPEN_MS = 560;
const CLOSE_MS = 420;

/** Full-screen Now Playing sheet (spring slide-up; drag down / chevron / Esc to close). */
export function NowPlaying() {
  const open = useUI((u) => u.nowPlayingOpen);
  const hasSong = usePlayer((p) => !!p.current);
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let r2 = 0;
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShown(true)); });
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), CLOSE_MS + 40);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => { if (open && !hasSong) close(); }, [open, hasSong]);

  if (!mounted || !hasSong) return null;
  return <Sheet shown={shown} />;
}

function Sheet({ shown }: { shown: boolean }) {
  const song = usePlayer((p) => p.current!.song);
  const isPlaying = usePlayer((p) => p.isPlaying);
  const pane = useUI((u) => u.sidePanel);
  const isMobile = useIsMobile();
  const sheet = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  // Lyrics only when the song has them.
  const effectivePane = pane === 'lyrics' && !song.hasLyrics ? null : pane;
  // Keep pane content mounted while it fades out.
  const [paneShown, setPaneShown] = useState(effectivePane);
  useEffect(() => {
    if (effectivePane) { setPaneShown(effectivePane); return; }
    const t = setTimeout(() => setPaneShown(null), 450);
    return () => clearTimeout(t);
  }, [effectivePane]);
  const paneContent = effectivePane ?? paneShown;

  // Focus in, restore focus out.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // Focus the dialog itself (no ring on pointer opens); Tab then reaches the close button first.
    const t = setTimeout(() => sheet.current?.focus({ preventScroll: true }), 60);
    return () => { clearTimeout(t); if (prev && document.contains(prev)) prev.focus({ preventScroll: true }); };
  }, []);

  // Simple focus trap.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !sheet.current) return;
    const f = [...sheet.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]')].filter((el) => el.offsetParent !== null && !el.closest('[inert]'));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const drag = useSheetDrag(sheet, isMobile);

  const paneNode = paneContent === 'lyrics' ? <LyricsView variant="full" /> : paneContent === 'queue' ? <QueuePanel variant="full" /> : null;

  return (
    <div ref={sheet} className={clsx(s.np, shown && s.open, effectivePane && s.withPane, !isPlaying && s.paused, isMobile ? s.mobile : s.desktop)}
      tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Now Playing: ${song.title} by ${song.artist.name}`} onKeyDown={onKeyDown}
      style={{ '--np-bg': song.artwork.bgColor, '--open-ms': `${OPEN_MS}ms`, '--close-ms': `${CLOSE_MS}ms` } as React.CSSProperties} {...drag}>
      <Backdrop artwork={song.artwork} songId={song.id} />
      <div className={s.topBar}>
        <span className={s.grabber} aria-hidden />
        <button ref={closeBtn} className={s.close} onClick={close} aria-label="Close Now Playing" title="Close (Esc)"><Icon name="chevron-down" size={22} /></button>
      </div>

      {isMobile ? (
        <div className={s.m}>
          {effectivePane ? (
            <div className={s.mHeader}>
              <div className={s.mHeaderArt}><Artwork artwork={song.artwork} size={120} rounded="sm" eager /></div>
              <Meta song={song} compact />
            </div>
          ) : (
            <div className={s.mArt}><div className={s.artBox}><Artwork artwork={song.artwork} size={1000} rounded="lg" eager alt={`${song.album.title} artwork`} /></div></div>
          )}
          {effectivePane && <div className={s.mPane} key={effectivePane}>{paneNode}</div>}
          <div className={s.mControls}>
            {!effectivePane && <Meta song={song} />}
            <Scrubber variant="np" />
            <Transport />
            <VolumeRow className={s.volume} />
            <Toggles hasLyrics={song.hasLyrics} pane={effectivePane} />
            <SleepChip />
          </div>
        </div>
      ) : (
        <div className={s.stage}>
          <div className={s.col}>
            <div className={s.artSlot}><div className={s.artBox}><Artwork artwork={song.artwork} size={1000} rounded="lg" eager alt={`${song.album.title} artwork`} /></div></div>
            <Meta song={song} />
            <Scrubber variant="np" />
            <Transport />
            <VolumeRow className={s.volume} />
            <Toggles hasLyrics={song.hasLyrics} pane={effectivePane} />
            <SleepChip />
          </div>
          <div className={s.pane} inert={!effectivePane} aria-hidden={!effectivePane}>{paneNode}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function Meta({ song, compact }: { song: Song; compact?: boolean }) {
  const navigate = useNavigate();
  const loved = useLibrary((l) => l.lovedIds.includes(song.id));
  const go = (to: string) => { close(); navigate(to); };
  return (
    <div className={clsx(s.meta, compact && s.metaCompact)}>
      <div className={s.metaText}>
        <Marquee className={s.title} textKey={song.id}>{song.title}{song.isExplicit && <span className={s.explicit} aria-label="Explicit">E</span>}</Marquee>
        <div className={clsx(s.artist, 'clamp-1')}>
          <Link to={artistHref(song)} onClick={close}>{song.artist.name}</Link>
          {song.featuring.map((f) => <span key={f.id}> &amp; <Link to={`/artist/${f.id}`} onClick={close}>{f.name}</Link></span>)}
          {!compact && <span className={s.album}> — <Link to={albumHref(song)} onClick={close}>{song.album.title}</Link></span>}
        </div>
      </div>
      <button className={clsx(s.round, loved && s.loved)} aria-label={loved ? 'Undo Favorite' : 'Favorite'} aria-pressed={loved} title={loved ? 'Undo Favorite' : 'Favorite'}
        onClick={() => useLibrary.getState().toggleLove('song', song.id)}>
        <Icon name={loved ? 'heart-fill' : 'heart'} size={18} />
      </button>
      <button className={s.round} aria-label="More" title="More" onClick={(e) => openMenuAt(e, menuFor({ type: 'song', data: song }, { navigate: go, sleepTimer: true }))}>
        <Icon name="more" size={18} />
      </button>
    </div>
  );
}

/** Shows the active sleep timer (countdown or "after this song"); tap to change it. */
export function SleepChip() {
  const endsAt = usePlayer((p) => p.sleepEndsAt);
  const atEnd = usePlayer((p) => p.sleepAtEnd);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt && !atEnd) return null;
  const left = endsAt ? Math.max(0, endsAt - now) : 0;
  const label = atEnd ? 'Sleep after this song' : `Sleep in ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  return (
    <button className={s.sleepChip} onClick={() => useUI.getState().setSleepOpen(true)} aria-label={`${label}. Change sleep timer`}>
      <Icon name="clock" size={13} />{label}
    </button>
  );
}

function Transport() {
  const isPlaying = usePlayer((p) => p.isPlaying);
  const shuffle = usePlayer((p) => p.shuffle);
  const repeat = usePlayer((p) => p.repeat);
  const isStation = usePlayer((p) => p.context?.type === 'station');
  return (
    <div className={s.transport}>
      <button className={clsx(s.tSmall, shuffle && s.tOn)} aria-label="Shuffle" aria-pressed={shuffle} title="Shuffle" disabled={isStation} onClick={() => P().toggleShuffle()}><Icon name="shuffle" size={20} /></button>
      <button className={s.tBig} aria-label="Previous" title="Previous" onClick={() => P().previous()}><Icon name="previous" size={38} /></button>
      <button className={clsx(s.tBig, s.tPlay)} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause' : 'Play'} onClick={() => P().togglePlay()}><PlayPauseIcon size={46} /></button>
      <button className={s.tBig} aria-label="Next" title="Next" onClick={() => P().next()}><Icon name="next" size={38} /></button>
      <button className={clsx(s.tSmall, repeat !== 'off' && s.tOn)} disabled={isStation} aria-pressed={repeat !== 'off'}
        aria-label={repeat === 'one' ? 'Repeat One' : repeat === 'all' ? 'Repeat All' : 'Repeat Off'} title="Repeat" onClick={() => P().cycleRepeat()}>
        <Icon name={repeat === 'one' ? 'repeat-one' : 'repeat'} size={20} />
      </button>
    </div>
  );
}

function Toggles({ hasLyrics, pane }: { hasLyrics: boolean; pane: 'lyrics' | 'queue' | null }) {
  const setPane = useUI((u) => u.setSidePanel);
  return (
    <div className={s.toggles}>
      <button className={clsx(s.toggle, pane === 'lyrics' && s.toggleOn)} aria-pressed={pane === 'lyrics'} aria-label="Lyrics" title={hasLyrics ? 'Lyrics' : 'Lyrics not available'}
        disabled={!hasLyrics} onClick={() => setPane(pane === 'lyrics' ? null : 'lyrics')}>
        <Icon name="lyrics" size={20} />
      </button>
      <button className={clsx(s.toggle, pane === 'queue' && s.toggleOn)} aria-pressed={pane === 'queue'} aria-label="Playing Next" title="Playing Next"
        onClick={() => setPane(pane === 'queue' ? null : 'queue')}>
        <Icon name="queue" size={20} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
/** Blurred, saturated, slowly drifting artwork background; cross-fades between songs. */
function Backdrop({ artwork, songId }: { artwork: Art; songId: string }) {
  const [layers, setLayers] = useState<{ id: string; art: Art }[]>([{ id: songId, art: artwork }]);
  useEffect(() => {
    setLayers((l) => (l[l.length - 1]?.id === songId ? l : [...l.slice(-1), { id: songId, art: artwork }]));
    const t = setTimeout(() => setLayers((l) => l.slice(-1)), 1400);
    return () => clearTimeout(t);
  }, [songId, artwork]);
  return (
    <div className={s.bg} aria-hidden>
      {layers.map((l) => {
        const src = artUrl(l.art, 400);
        return (
          <div key={l.id} className={s.bgLayer} style={{ backgroundColor: l.art.bgColor }}>
            <img className={clsx(s.blob, s.blobA)} src={src} alt="" draggable={false} />
            <img className={clsx(s.blob, s.blobB)} src={src} alt="" draggable={false} />
            <img className={clsx(s.blob, s.blobC)} src={src} alt="" draggable={false} />
          </div>
        );
      })}
      <div className={s.shade} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
/** Drag the sheet down to dismiss (touch, or any pointer on small screens). */
function useSheetDrag(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  const st = useRef<{ id: number; y0: number; x0: number; t0: number; dy: number; active: boolean; lastY: number; lastT: number; v: number } | null>(null);
  const suppressClick = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled && e.pointerType !== 'touch') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('[role="slider"], [data-scroll], input, textarea')) return;
    st.current = { id: e.pointerId, y0: e.clientY, x0: e.clientX, t0: performance.now(), dy: 0, active: false, lastY: e.clientY, lastT: performance.now(), v: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = st.current;
    const el = ref.current;
    if (!d || d.id !== e.pointerId || !el) return;
    const dy = e.clientY - d.y0, dx = e.clientX - d.x0;
    if (!d.active) {
      if (dy > 10 && dy > Math.abs(dx) * 1.2) { d.active = true; el.setPointerCapture(e.pointerId); el.classList.add(s.dragging); }
      else if (Math.abs(dx) > 10 || dy < -10) { st.current = null; return; }
      else return;
    }
    const now = performance.now();
    d.v = (e.clientY - d.lastY) / Math.max(1, now - d.lastT);
    d.lastY = e.clientY; d.lastT = now;
    d.dy = Math.max(0, dy);
    el.style.transform = `translate3d(0, ${d.dy}px, 0)`;
    el.style.setProperty('--drag', String(Math.min(1, d.dy / 400)));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = st.current;
    st.current = null;
    const el = ref.current;
    if (!d || !el || !d.active || d.id !== e.pointerId) return;
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    el.classList.remove(s.dragging);
    el.style.removeProperty('--drag');
    const dismiss = d.dy > Math.min(180, innerHeight * 0.22) || d.v > 0.6;
    el.style.transform = '';
    if (dismiss) close();
  };
  return {
    onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp,
    onClickCapture: (e: React.MouseEvent) => { if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); } },
  };
}
