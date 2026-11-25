import { useRef, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { Artwork as Art, Song } from '@vybe/shared';
import type { WorldArtist, WorldShelf } from '../../lib/api';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { usePlayer } from '../../stores/player';
import { menuFor, openMenuAt } from '../actions';
import { PlayPauseIcon } from '../player/PlayerChrome';
import { ArtGlow } from './Ambient';
import s from './WorldShelves.module.css';

type OnLight = (a: Art) => void;
const playList = (songs: Song[], i: number, title: string) => {
  const p = usePlayer.getState();
  if (p.current?.song.id === songs[i].id) { p.togglePlay(); return; }
  p.playSongs(songs, i, { type: 'queue', title });
};

/** A horizontally scrolling row with arrow buttons (desktop) and swipe (touch). */
function Row({ title, subtitle, children, label }: { title: string; subtitle?: string; children: React.ReactNode; label: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const update = () => {
    const el = track.current; if (!el) return;
    setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  };
  useEffect(() => { update(); }, [children]);
  const page = (dir: 1 | -1) => { const el = track.current; if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' }); };
  return (
    <section className={s.shelf} aria-label={label}>
      <div className={s.head}>
        <div>
          <h2 className={s.title}>{title}</h2>
          {subtitle && <p className={s.subtitle}>{subtitle}</p>}
        </div>
        <div className={s.arrows}>
          <button aria-label={`Scroll ${title} back`} disabled={edge.start} onClick={() => page(-1)}><Icon name="chevron-left" size={18} /></button>
          <button aria-label={`Scroll ${title} forward`} disabled={edge.end} onClick={() => page(1)}><Icon name="chevron-right" size={18} /></button>
        </div>
      </div>
      <div ref={track} className={s.track} onScroll={update}>{children}</div>
    </section>
  );
}

export function SongCard({ song, songs, index, listTitle, onLight }: { song: Song; songs: Song[]; index: number; listTitle: string; onLight?: OnLight }) {
  const navigate = useNavigate();
  const isCurrent = usePlayer((p) => p.current?.song.id === song.id);
  const playing = usePlayer((p) => p.isPlaying);
  const menu = (e: React.MouseEvent) => openMenuAt(e, menuFor({ type: 'song', data: song }, { navigate }));
  return (
    <div className={clsx(s.card, isCurrent && s.cardOn)} onMouseEnter={() => onLight?.(song.artwork)} onFocus={() => onLight?.(song.artwork)} onContextMenu={menu}>
      <div className={s.art}>
        <ArtGlow artwork={song.artwork} />
        <div className={s.artInner}><Artwork artwork={song.artwork} size={300} rounded="sm" /></div>
        <button className={clsx(s.play, isCurrent && s.playOn)} onClick={() => playList(songs, index, listTitle)}
          aria-label={isCurrent && playing ? `Pause ${song.title}` : `Play ${song.title} by ${song.artist.name}`}>
          {isCurrent ? <PlayPauseIcon size={20} /> : <Icon name="play" size={20} />}
        </button>
      </div>
      <button className={s.cardText} onClick={() => playList(songs, index, listTitle)} tabIndex={-1}>
        <span className={clsx(s.cardTitle, 'clamp-1')}>{song.title}</span>
        <span className={clsx(s.cardSub, 'clamp-2')}>{song.artist.name}</span>
      </button>
      <button className={s.cardMore} aria-label={`More for ${song.title}`} onClick={menu}><Icon name="more" size={16} /></button>
    </div>
  );
}

export function ArtistCard({ artist, onLight }: { artist: WorldArtist; onLight?: OnLight }) {
  const to = `/world/artist/${artist.id}?c=${artist.country}`;
  return (
    <Link to={to} className={s.artist} onMouseEnter={() => artist.artwork && onLight?.(artist.artwork)} onFocus={() => artist.artwork && onLight?.(artist.artwork)}>
      <div className={clsx(s.art, s.artRound)}>
        {artist.artwork && <ArtGlow artwork={artist.artwork} round />}
        <div className={s.artInner}>{artist.artwork ? <Artwork artwork={artist.artwork} size={300} rounded="circle" /> : <span className={s.noArt}><Icon name="artist" size={40} /></span>}</div>
      </div>
      <span className={clsx(s.cardTitle, 'clamp-1')}>{artist.name}</span>
      <span className={s.cardSub}>Artist{artist.genre ? ` · ${artist.genre}` : ''}</span>
    </Link>
  );
}

/** Featured: the #1 song big, the next four beside it. */
function Hero({ shelf, onLight }: { shelf: WorldShelf; onLight?: OnLight }) {
  const [first, ...rest] = shelf.songs;
  const isCurrent = usePlayer((p) => p.current?.song.id === first?.id);
  const playing = usePlayer((p) => p.isPlaying);
  if (!first) return null;
  return (
    <section className={s.hero} aria-label={shelf.title}>
      <div className={s.heroMain} onMouseEnter={() => onLight?.(first.artwork)}>
        <div className={s.heroArt}><ArtGlow artwork={first.artwork} /><div className={s.artInner}><Artwork artwork={first.artwork} size={600} rounded="md" eager /></div></div>
        <div className={s.heroText}>
          <p className={s.eyebrow}>{shelf.title} · #1</p>
          <h2 className={clsx(s.heroTitle, 'clamp-2')}>{first.title}</h2>
          <p className={clsx(s.heroSub, 'clamp-1')}>{first.artist.name}</p>
          <div className={s.heroActions}>
            <button className={s.heroPlay} onClick={() => playList(shelf.songs, 0, shelf.title)}>
              {isCurrent ? <PlayPauseIcon size={18} /> : <Icon name="play" size={18} />}{isCurrent && playing ? 'Pause' : 'Play'}
            </button>
            <span className={s.previewNote}>30-second preview</span>
          </div>
        </div>
      </div>
      <ol className={s.heroList}>
        {rest.map((song, i) => (
          <li key={song.id}>
            <button className={s.heroItem} onMouseEnter={() => onLight?.(song.artwork)} onClick={() => playList(shelf.songs, i + 1, shelf.title)} aria-label={`Play ${song.title} by ${song.artist.name}`}>
              <span className={s.heroRank}>{i + 2}</span>
              <span className={s.heroItemArt}><Artwork artwork={song.artwork} size={120} rounded="xs" /></span>
              <span className={s.heroItemText}><span className="clamp-1">{song.title}</span><span className={clsx(s.cardSub, 'clamp-1')}>{song.artist.name}</span></span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function WorldShelfView({ shelf, onLight }: { shelf: WorldShelf; onLight?: OnLight }) {
  if (shelf.kind === 'hero') return <Hero shelf={shelf} onLight={onLight} />;
  if (shelf.kind === 'artists') {
    return (
      <Row title={shelf.title} subtitle={shelf.subtitle} label={shelf.title}>
        {shelf.artists.map((a) => <ArtistCard key={a.id} artist={a} onLight={onLight} />)}
      </Row>
    );
  }
  return (
    <Row title={shelf.title} subtitle={shelf.subtitle} label={shelf.title}>
      {shelf.songs.map((song, i) => <SongCard key={song.id} song={song} songs={shelf.songs} index={i} listTitle={shelf.title} onLight={onLight} />)}
    </Row>
  );
}

export function ShelfSkeleton({ round }: { round?: boolean }) {
  return (
    <section className={s.shelf} aria-hidden>
      <div className={s.head}><span className={clsx(s.skTitle, s.sk)} /></div>
      <div className={s.track}>{Array.from({ length: 7 }, (_, i) => <div key={i} className={s.card}><div className={clsx(s.art, s.sk, round && s.artRound)} /><span className={clsx(s.skLine, s.sk)} /></div>)}</div>
    </section>
  );
}
