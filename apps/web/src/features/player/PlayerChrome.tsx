import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { usePlayer } from '../../stores/player';
import { useUI } from '../../stores/ui';
import { Marquee, Scrubber, VolumeControl } from './controls';
import { LyricsView } from './LyricsView';
import { QueuePanel } from './QueuePanel';
import { JamChip } from '../jam/JamSheet';
import { useJam } from '../../stores/jam';
import s from './PlayerChrome.module.css';

const P = () => usePlayer.getState();
const openNowPlaying = () => { if (P().current) useUI.getState().setNowPlayingOpen(true); };

/** Desktop floating pill + mobile mini player + desktop lyrics/queue side panel. */
export function PlayerChrome() {
  const panel = useUI((u) => u.sidePanel);
  return (
    <>
      <SidePanel />
      <div className={clsx(s.pillDock, panel && s.pillDockShifted)}>
        <DesktopPill />
      </div>
      <MiniPlayer />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
export function PlayPauseIcon({ size }: { size: number }) {
  const isPlaying = usePlayer((p) => p.isPlaying);
  return (
    <span className={s.ppIcon} style={{ width: size, height: size }}>
      <Icon name="play" size={size} className={clsx(s.ppGlyph, isPlaying && s.ppHidden)} />
      <Icon name="pause" size={size} className={clsx(s.ppGlyph, !isPlaying && s.ppHidden)} />
    </span>
  );
}

function DesktopPill() {
  const current = usePlayer((p) => p.current);
  const isPlaying = usePlayer((p) => p.isPlaying);
  const isBuffering = usePlayer((p) => p.isBuffering);
  const shuffle = usePlayer((p) => p.shuffle);
  const repeat = usePlayer((p) => p.repeat);
  const isStation = usePlayer((p) => p.context?.type === 'station' || p.context?.id === 'jam'); // no shuffle/repeat for stations or Jams
  const panel = useUI((u) => u.sidePanel);
  const setPanel = useUI((u) => u.setSidePanel);
  const song = current?.song;
  const empty = !song;

  return (
    <div className={clsx(s.pill, empty && s.empty)} role="region" aria-label="Player">
      <div className={s.controls}>
        <button className={clsx(s.ctl, s.ctlSmall, shuffle && s.on)} aria-label="Shuffle" aria-pressed={shuffle} title="Shuffle" disabled={empty || isStation} onClick={() => P().toggleShuffle()}>
          <Icon name="shuffle" size={16} />
        </button>
        <button className={s.ctl} aria-label="Previous" title="Previous" disabled={empty} onClick={() => P().previous()}><Icon name="previous" size={22} /></button>
        <button className={clsx(s.ctl, s.ctlPlay)} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause' : 'Play'} disabled={empty} onClick={() => P().togglePlay()}>
          <PlayPauseIcon size={24} />
        </button>
        <button className={s.ctl} aria-label="Next" title="Next" disabled={empty} onClick={() => P().next()}><Icon name="next" size={22} /></button>
        <button className={clsx(s.ctl, s.ctlSmall, repeat !== 'off' && s.on)} disabled={empty || isStation}
          aria-label={repeat === 'one' ? 'Repeat One' : repeat === 'all' ? 'Repeat All' : 'Repeat Off'} title={repeat === 'one' ? 'Repeat One' : repeat === 'all' ? 'Repeat All' : 'Repeat'}
          aria-pressed={repeat !== 'off'} onClick={() => P().cycleRepeat()}>
          <Icon name={repeat === 'one' ? 'repeat-one' : 'repeat'} size={16} />
        </button>
      </div>

      <div className={s.lcd}>
        {song ? (
          <>
            <button className={s.lcdArt} onClick={openNowPlaying} aria-label={`Open Now Playing: ${song.title}`}>
              <Artwork artwork={song.artwork} size={88} rounded="none" eager />
              <span className={s.lcdArtHover}><Icon name="chevron-down" size={18} style={{ transform: 'rotate(180deg)' }} /></span>
            </button>
            <div className={s.lcdText}>
              <button className={s.lcdTitle} onClick={openNowPlaying} tabIndex={-1}>
                <Marquee textKey={song.id + song.title}>{song.title}{song.isExplicit && <span className={s.explicit} aria-label="Explicit">E</span>}</Marquee>
              </button>
              <Marquee className={s.lcdSub} textKey={song.id + 'sub'}>
                {song.artist.name}{song.featuring.length > 0 && ` & ${song.featuring.map((f) => f.name).join(' & ')}`} — {song.album.title}
              </Marquee>
              {isBuffering && isPlaying && <span className={s.buffering} aria-label="Loading" />}
            </div>
            <Scrubber variant="lcd" className={s.lcdScrub} />
          </>
        ) : (
          <div className={s.lcdEmpty}><Icon name="vybe-mark" size={26} /></div>
        )}
      </div>

      <div className={s.right}>
        <JamChip compact className={s.jamChip} />
        <button className={clsx(s.ctl, s.ctlSmall, panel === 'lyrics' && s.on)} aria-label="Lyrics" title={song && !song.hasLyrics ? 'Lyrics not available' : 'Lyrics'}
          aria-pressed={panel === 'lyrics'} disabled={empty || !song?.hasLyrics} onClick={() => setPanel(panel === 'lyrics' ? null : 'lyrics')}>
          <Icon name="lyrics" size={18} />
        </button>
        <button className={clsx(s.ctl, s.ctlSmall, panel === 'queue' && s.on)} aria-label="Playing Next" title="Playing Next" aria-pressed={panel === 'queue'}
          onClick={() => setPanel(panel === 'queue' ? null : 'queue')}>
          <Icon name="queue" size={18} />
        </button>
        <VolumeControl className={s.vol} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function MiniPlayer() {
  const song = usePlayer((p) => p.current?.song);
  const isPlaying = usePlayer((p) => p.isPlaying);
  const npOpen = useUI((u) => u.nowPlayingOpen);
  const inJam = useJam((j) => !!j.jam);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; id: number; moved: boolean } | null>(null);

  // Swipe up to open Now Playing (the bar follows the finger a little).
  const onPointerDown = (e: React.PointerEvent) => {
    if (!song || (e.target as HTMLElement).closest('[data-nodrag]')) return;
    drag.current = { y: e.clientY, id: e.pointerId, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !ref.current) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) > 6) { d.moved = true; ref.current.setPointerCapture(e.pointerId); }
    if (d.moved) ref.current.style.transform = `translateY(${Math.max(-60, Math.min(12, dy * 0.5))}px)`;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !ref.current) return;
    ref.current.style.transform = '';
    if (d.moved) {
      if (e.clientY - d.y < -36) openNowPlaying();
      e.preventDefault();
    }
  };

  return (
    <div ref={ref} className={clsx(s.mini, !song && s.empty, npOpen && s.miniHidden)} role="region" aria-label="Mini player"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <button className={s.miniMain} onClick={() => { if (!drag.current?.moved) openNowPlaying(); }} disabled={!song} aria-label={song ? `Open Now Playing: ${song.title} by ${song.artist.name}` : 'Nothing playing'}>
        <span className={s.miniArt}>{song ? <Artwork artwork={song.artwork} size={80} rounded="xs" eager /> : <Icon name="note" size={16} />}</span>
        <span className={s.miniText}>
          {song && <Marquee className={s.miniTitle} textKey={song.id}>{song.title}</Marquee>}
          {song && <span className={clsx(s.miniSub, 'clamp-1')}>{inJam && <span className={s.miniJam}>Jam · </span>}{song.artist.name}</span>}
        </span>
      </button>
      <button data-nodrag className={s.miniBtn} aria-label={isPlaying ? 'Pause' : 'Play'} disabled={!song} onClick={() => P().togglePlay()}><PlayPauseIcon size={24} /></button>
      <button data-nodrag className={s.miniBtn} aria-label="Next" disabled={!song} onClick={() => P().next()}><Icon name="next" size={26} /></button>
      {song && <Scrubber variant="mini" className={s.miniProgress} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function SidePanel() {
  const panel = useUI((u) => u.sidePanel);
  const setPanel = useUI((u) => u.setSidePanel);
  const hasLyrics = usePlayer((p) => !!p.current?.song.hasLyrics);
  // Keep the last content mounted during the slide-out.
  const [shown, setShown] = useState(panel);
  useEffect(() => {
    if (panel) { setShown(panel); return; }
    const t = setTimeout(() => setShown(null), 420);
    return () => clearTimeout(t);
  }, [panel]);
  const content = panel ?? shown;
  return (
    <aside className={clsx(s.panel, panel && s.panelOpen)} aria-label={content === 'lyrics' ? 'Lyrics' : 'Queue'} aria-hidden={!panel} inert={!panel}>
      <div className={s.panelHead}>
        <div className={s.seg} role="tablist" aria-label="Side panel">
          <button role="tab" aria-selected={content === 'lyrics'} className={clsx(s.segBtn, content === 'lyrics' && s.segOn)} disabled={!hasLyrics} onClick={() => setPanel('lyrics')}>Lyrics</button>
          <button role="tab" aria-selected={content === 'queue'} className={clsx(s.segBtn, content === 'queue' && s.segOn)} onClick={() => setPanel('queue')}>Playing Next</button>
        </div>
        <button className={s.panelClose} aria-label="Close panel" onClick={() => setPanel(null)}><Icon name="close" size={14} /></button>
      </div>
      <div className={s.panelBody}>
        {content === 'lyrics' && <LyricsView variant="panel" />}
        {content === 'queue' && <QueuePanel variant="panel" />}
      </div>
    </aside>
  );
}
