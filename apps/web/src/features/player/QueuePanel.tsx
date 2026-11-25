import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { formatDuration } from '@vybe/shared';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { Equalizer } from '../../components/TrackList';
import { usePlayer, type PlayContext, type QueueItem } from '../../stores/player';
import { useUI } from '../../stores/ui';
import s from './QueuePanel.module.css';

const P = () => usePlayer.getState();

const contextHref = (c: PlayContext | null) => {
  if (!c?.id || c.id.startsWith('seed:')) return null;
  switch (c.type) {
    case 'album': return `/album/${c.id}`;
    case 'playlist': return `/playlist/${c.id}`;
    case 'artist': return `/artist/${c.id}`;
    case 'station': return `/station/${c.id}`;
    default: return null;
  }
};

export function QueuePanel({ variant }: { variant: 'panel' | 'full' }) {
  const current = usePlayer((p) => p.current);
  const context = usePlayer((p) => p.context);
  const history = usePlayer((p) => p.history);
  const userQueue = usePlayer((p) => p.userQueue);
  const contextQueue = usePlayer((p) => p.contextQueue);
  const autoplay = usePlayer((p) => p.autoplay);
  const autoplayEnabled = usePlayer((p) => p.autoplayEnabled);
  const shuffle = usePlayer((p) => p.shuffle);
  const repeat = usePlayer((p) => p.repeat);
  const isPlaying = usePlayer((p) => p.isPlaying);
  const [showHistory, setShowHistory] = useState(false);
  const isStation = context?.type === 'station';
  const inJam = context?.id === 'jam'; // shared queue: no shuffle, repeat or autoplay
  const href = contextHref(context);
  const closeNP = () => useUI.getState().setNowPlayingOpen(false);
  const upcomingCount = userQueue.length + contextQueue.length;

  // Keyboard reorder keeps focus on the moved row.
  const pendingFocus = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    root.current?.querySelector<HTMLElement>(`[data-uid="${pendingFocus.current}"]`)?.focus();
    pendingFocus.current = null;
  });

  if (!current) {
    return (
      <div className={clsx(s.wrap, s[variant])}>
        <div className={s.empty}>
          <Icon name="queue" size={34} />
          <p className={s.emptyTitle}>Nothing in the Queue</p>
          <p className={s.emptyBody}>Songs you play, and songs you add with Play Next or Play Last, show up here.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={root} className={clsx(s.wrap, s[variant])}>
      <div className={s.scroll} data-scroll>
        <header className={s.head}>
          <div className={s.headText}>
            <span className={s.eyebrow}>Playing From</span>
            {href ? <Link to={href} className={clsx(s.ctxTitle, 'clamp-1')} onClick={closeNP}>{context?.title || 'Queue'}</Link>
              : <span className={clsx(s.ctxTitle, 'clamp-1')}>{context?.title || (context?.type === 'queue' ? 'Your Queue' : 'Library')}</span>}
          </div>
          <div className={s.toggles}>
            <button className={clsx(s.toggle, shuffle && s.toggleOn)} aria-pressed={shuffle} aria-label="Shuffle" title="Shuffle" disabled={isStation || inJam} onClick={() => P().toggleShuffle()}><Icon name="shuffle" size={16} /></button>
            <button className={clsx(s.toggle, repeat !== 'off' && s.toggleOn)} aria-pressed={repeat !== 'off'} disabled={isStation || inJam}
              aria-label={repeat === 'one' ? 'Repeat One' : repeat === 'all' ? 'Repeat All' : 'Repeat Off'} title="Repeat" onClick={() => P().cycleRepeat()}>
              <Icon name={repeat === 'one' ? 'repeat-one' : 'repeat'} size={16} />
            </button>
          </div>
        </header>

        {history.length > 0 && (
          <section className={s.section} aria-label="History">
            <button className={s.historyBtn} aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
              <span>History</span>
              <span className={s.count}>{history.length}</span>
              <Icon name="chevron-down" size={14} className={clsx(s.chev, showHistory && s.chevOpen)} />
            </button>
            {showHistory && (
              <ul className={s.list}>
                {history.map((q) => <Row key={q.uid} item={q} past />)}
              </ul>
            )}
          </section>
        )}

        <section className={s.section} aria-label="Now Playing">
          <h3 className={s.sectionTitle}>Now Playing</h3>
          <ul className={s.list}><Row item={current} now playing={isPlaying} /></ul>
        </section>

        <section className={s.section} aria-label="Playing Next">
          <div className={s.sectionHead}>
            <h3 className={s.sectionTitle}>Playing Next</h3>
            {upcomingCount > 0 && <button className={s.clear} onClick={() => P().clearQueue()}>Clear</button>}
          </div>
          {upcomingCount === 0 && <p className={s.none}>{isStation ? 'Loading more from the station…' : 'No upcoming songs.'}</p>}
          {userQueue.length > 0 && (
            <DragList items={userQueue} label="Your queue" onMove={(a, b) => P().moveInUserQueue(a, b)} pendingFocus={pendingFocus} />
          )}
          {contextQueue.length > 0 && (
            <>
              {userQueue.length > 0 && <p className={s.subhead}>{isStation ? `From ${context?.title ?? 'Station'}` : `Continue Playing from ${context?.title ?? 'Queue'}`}</p>}
              <DragList items={contextQueue} label={context?.title ?? 'Up next'} onMove={(a, b) => P().moveInContextQueue(a, b)} pendingFocus={pendingFocus} />
            </>
          )}
        </section>

        {!isStation && !inJam && (
          <section className={s.section} aria-label="Autoplay">
            <div className={s.sectionHead}>
              <div>
                <h3 className={s.sectionTitle}>Autoplay</h3>
                <p className={s.autoplayHint}>{autoplayEnabled ? 'Similar music plays when your queue ends.' : 'Turn on to keep the music going with similar songs.'}</p>
              </div>
              <button className={clsx(s.infinity, autoplayEnabled && s.infinityOn)} aria-pressed={autoplayEnabled} aria-label="Autoplay" title={autoplayEnabled ? 'Turn Off Autoplay' : 'Turn On Autoplay'}
                onClick={() => P().setAutoplayEnabled(!autoplayEnabled)}>
                <Icon name="infinity" size={20} />
              </button>
            </div>
            {autoplayEnabled && autoplay.length > 0 && <ul className={clsx(s.list, s.autoplayList)}>{autoplay.map((q) => <Row key={q.uid} item={q} />)}</ul>}
          </section>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
const Row = memo(function Row({ item, now, playing, past, dragProps, style, className, onKeyDown }: {
  item: QueueItem; now?: boolean; playing?: boolean; past?: boolean;
  dragProps?: React.HTMLAttributes<HTMLButtonElement>; style?: React.CSSProperties; className?: string; onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const { song } = item;
  const skip = () => { if (!now) P().skipToQueueItem(item.uid); else P().togglePlay(); };
  return (
    <li className={clsx(s.row, now && s.rowNow, past && s.rowPast, className)} style={style} tabIndex={0} data-uid={item.uid}
      aria-label={`${song.title}, ${song.artist.name}${now ? ', now playing' : ''}`}
      onDoubleClick={skip}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') { e.preventDefault(); skip(); return; }
        if ((e.key === 'Delete' || e.key === 'Backspace') && !now && !past) { e.preventDefault(); P().removeFromQueue(item.uid); return; }
        onKeyDown?.(e);
      }}>
      <div className={s.art}>
        <Artwork artwork={song.artwork} size={80} rounded="xs" />
        {now ? <span className={s.artOverlay}><Equalizer playing={!!playing} /></span>
          : <button className={clsx(s.artOverlay, s.artPlay)} tabIndex={-1} aria-label={`Play ${song.title}`} onClick={skip}><Icon name="play" size={14} /></button>}
      </div>
      <div className={s.text}>
        <span className={clsx(s.title, 'clamp-1')}>{song.title}</span>
        <span className={clsx(s.artist, 'clamp-1')}>{song.artist.name}</span>
      </div>
      <span className={s.dur}>{formatDuration(song.durationMs)}</span>
      {!now && !past && (
        <button className={s.remove} aria-label={`Remove ${song.title} from queue`} title="Remove" onClick={() => P().removeFromQueue(item.uid)}>
          <Icon name="close" size={12} />
        </button>
      )}
      {dragProps && <button className={s.grip} aria-label={`Reorder ${song.title}`} title="Drag to reorder (Alt+↑/↓)" tabIndex={-1} {...dragProps}><Icon name="grip" size={18} /></button>}
    </li>
  );
});

// ---------------------------------------------------------------------------------------------
/**
 * Pointer-based reorderable list (mouse + touch). The dragged row follows the pointer; the other
 * rows slide (transform) to open an animated placeholder where it will land. Alt+↑/↓ also reorders.
 */
function DragList({ items, label, onMove, pendingFocus }: {
  items: QueueItem[]; label: string; onMove: (from: number, to: number) => void; pendingFocus: React.RefObject<string | null>;
}) {
  const [drag, setDrag] = useState<{ from: number; over: number; dy: number; h: number } | null>(null);
  const [settling, setSettling] = useState(false);
  const st = useRef<{ from: number; startY: number; startScroll: number; h: number; scroller: HTMLElement | null; y: number; raf: number; pointerId: number; over: number } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => { if (!settling) return; const r = requestAnimationFrame(() => setSettling(false)); return () => cancelAnimationFrame(r); }, [settling]);

  const update = () => {
    const d = st.current;
    if (!d) return;
    const scrollDelta = (d.scroller?.scrollTop ?? 0) - d.startScroll;
    const minDy = -d.from * d.h - 8, maxDy = (items.length - 1 - d.from) * d.h + 8;
    const dy = Math.max(minDy, Math.min(maxDy, d.y - d.startY + scrollDelta));
    const over = Math.max(0, Math.min(items.length - 1, d.from + Math.round(dy / d.h)));
    d.over = over;
    setDrag({ from: d.from, over, dy, h: d.h });
  };
  // Auto-scroll the container while dragging near its edges.
  const autoScroll = () => {
    const d = st.current;
    if (!d) return;
    if (d.scroller) {
      const r = d.scroller.getBoundingClientRect();
      const edge = 56;
      const v = d.y < r.top + edge ? -(r.top + edge - d.y) / 4 : d.y > r.bottom - edge - 70 ? (d.y - (r.bottom - edge - 70)) / 4 : 0;
      if (v) { d.scroller.scrollTop += Math.max(-14, Math.min(14, v)); update(); }
    }
    d.raf = requestAnimationFrame(autoScroll);
  };

  const begin = (i: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rowEl = (e.currentTarget as HTMLElement).closest('li')!;
    e.currentTarget.setPointerCapture(e.pointerId);
    const scroller = rowEl.closest<HTMLElement>('[data-scroll]');
    st.current = { from: i, startY: e.clientY, startScroll: scroller?.scrollTop ?? 0, h: rowEl.offsetHeight, scroller, y: e.clientY, raf: 0, pointerId: e.pointerId, over: i };
    st.current.raf = requestAnimationFrame(autoScroll);
    setDrag({ from: i, over: i, dy: 0, h: rowEl.offsetHeight });
  };
  const move = (e: React.PointerEvent) => { if (st.current && e.pointerId === st.current.pointerId) { st.current.y = e.clientY; update(); } };
  const end = () => {
    const d = st.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    st.current = null;
    setDrag(null);
    if (d.over !== d.from) { setSettling(true); onMove(d.from, d.over); }
  };

  const onKey = (i: number) => (e: React.KeyboardEvent) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const to = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= items.length) return;
    pendingFocus.current = items[i].uid;
    setSettling(true);
    onMove(i, to);
  };

  return (
    <ul ref={listRef} className={clsx(s.list, drag && s.dragging, settling && s.settling)} aria-label={label}>
      {items.map((q, i) => {
        let style: React.CSSProperties | undefined;
        let cls: string | undefined;
        if (drag) {
          if (i === drag.from) { style = { transform: `translate3d(0, ${drag.dy}px, 0)` }; cls = s.lifted; }
          else if (drag.from < i && i <= drag.over) style = { transform: `translate3d(0, ${-drag.h}px, 0)` };
          else if (drag.over <= i && i < drag.from) style = { transform: `translate3d(0, ${drag.h}px, 0)` };
        }
        return (
          <Row key={q.uid} item={q} style={style} className={cls} onKeyDown={onKey(i)}
            dragProps={{ onPointerDown: begin(i), onPointerMove: move, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end } as React.HTMLAttributes<HTMLButtonElement>} />
        );
      })}
    </ul>
  );
}
