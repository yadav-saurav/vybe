import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import type { Album, ArtistPage, Song } from '@vybe/shared';
import { api } from '../../lib/api';
import { artUrl } from '../../lib/color';
import { useAsync } from '../../lib/useAsync';
import { Artwork } from '../../components/Artwork';
import { ExplicitBadge } from '../../components/Buttons';
import { Icon } from '../../components/Icon';
import { Lockup } from '../../components/Lockup';
import { Shelf } from '../../components/Shelf';
import { menuFor, openMenuAt, playFromList } from '../../features/actions';
import { DetailError, formatCompact, formatShortDate, useDocumentTitle, yearOf } from '../../features/detail';
import { useLibrary } from '../../stores/library';
import { usePlayer, type PlayContext } from '../../stores/player';
import s from './Artist.module.css';

/** Artist page: full-bleed hero, Latest Release + Top Songs, shelves, About, and a slim sticky bar once the hero scrolls away. */
export default function ArtistPageView() {
  const { id = '' } = useParams();
  const { data, error, reload } = useAsync(`artist:${id}`, (signal) => api.artist(id, signal));
  const page = data && data.artist.id === id ? data : undefined;
  useDocumentTitle(page?.artist.name);

  if (!page) return error ? <DetailError error={error} onRetry={reload} /> : <ArtistSkeleton />;
  return <ArtistView key={id} page={page} />;
}

function ArtistView({ page }: { page: ArtistPage }) {
  const { artist, latestRelease, topSongs, albums, singlesAndEps, appearsOn, playlists, similarArtists } = page;
  const sentinel = useRef<HTMLDivElement>(null);
  const [barOn, setBarOn] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setBarOn(!entry.isIntersecting), {
      root: document.getElementById('main'),
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const context: PlayContext = { type: 'artist', id: artist.id, title: artist.name };
  const isActive = usePlayer((st) => st.context?.type === 'artist' && st.context.id === artist.id);
  const isPlaying = usePlayer((st) => st.isPlaying) && isActive;
  const following = useLibrary((l) => (l.followedArtistIds ?? []).includes(artist.id));

  const playArtist = () => {
    const p = usePlayer.getState();
    if (isActive) p.togglePlay();
    else if (topSongs.length) p.playSongs(topSongs, 0, context);
  };

  return (
    <div className={s.artist}>
      <div className={clsx(s.bar, barOn && s.barOn)} aria-hidden={!barOn}>
        <span className={s.barName}>{artist.name}</span>
        <button className={s.barPlay} tabIndex={barOn ? 0 : -1} aria-label={isPlaying ? `Pause ${artist.name}` : `Play ${artist.name}`} onClick={playArtist}>
          <Icon name={isPlaying ? 'pause' : 'play'} size={14} />
        </button>
      </div>

      <section className={s.hero} style={{ backgroundColor: artist.heroArtwork.bgColor }}>
        <img className={s.heroImg} src={artUrl(artist.heroArtwork, 1000)} alt="" />
        <div className={s.heroShade} />
        <div className={s.heroContent}>
          <h1 className={s.name}>{artist.name}</h1>
          <div className={s.heroActions}>
            <button className={s.bigPlay} aria-label={isPlaying ? `Pause ${artist.name}` : `Play ${artist.name}`} onClick={playArtist}>
              <Icon name={isPlaying ? 'pause' : 'play'} size={isPlaying ? 28 : 30} />
            </button>
            <button className={clsx(s.follow, following && s.followOn)} aria-pressed={following} onClick={() => useLibrary.getState().toggle('artist', artist.id)}>
              <Icon name={following ? 'check' : 'plus'} size={14} />
              <span>{following ? 'Following' : 'Follow'}</span>
            </button>
          </div>
        </div>
        <div ref={sentinel} className={s.sentinel} aria-hidden="true" />
      </section>

      <div className={clsx('page', s.body)}>
        {(latestRelease || topSongs.length > 0) && (
          <div className={s.feature}>
            {latestRelease && <LatestRelease album={latestRelease} />}
            {topSongs.length > 0 && <TopSongs songs={topSongs.slice(0, 6)} context={context} />}
          </div>
        )}

        {albums.length > 0 && (
          <Shelf title="Albums">{albums.map((a) => <Lockup key={a.id} item={{ type: 'album', data: a }} />)}</Shelf>
        )}
        {singlesAndEps.length > 0 && (
          <Shelf title="Singles & EPs">{singlesAndEps.map((a) => <Lockup key={a.id} item={{ type: 'album', data: a }} />)}</Shelf>
        )}
        {appearsOn.length > 0 && (
          <Shelf title="Appears On">{appearsOn.map((a) => <Lockup key={a.id} item={{ type: 'album', data: a }} />)}</Shelf>
        )}
        {playlists.length > 0 && (
          <Shelf title="Featured On">{playlists.map((p) => <Lockup key={p.id} item={{ type: 'playlist', data: p }} />)}</Shelf>
        )}
        {similarArtists.length > 0 && (
          <Shelf title="Similar Artists">{similarArtists.map((a) => <Lockup key={a.id} item={{ type: 'artist', data: a }} />)}</Shelf>
        )}

        <section className={s.about} aria-labelledby="about-title">
          <h2 id="about-title" className={s.h2}>About {artist.name}</h2>
          <p className={s.bio}>{artist.bio}</p>
          <dl className={s.facts}>
            <div><dt>Origin</dt><dd>{artist.origin}</dd></div>
            <div><dt>Born or formed</dt><dd>{artist.bornOrFormed}</dd></div>
            <div><dt>Monthly listeners</dt><dd>{formatCompact(artist.monthlyListeners)}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}

function LatestRelease({ album }: { album: Album }) {
  const kind = album.type === 'single' ? 'Single' : album.type === 'ep' ? 'EP' : 'Album';
  return (
    <section className={s.latest} aria-labelledby="latest-title">
      <h2 id="latest-title" className={s.h2}>Latest Release</h2>
      <div className={s.latestCard}>
        <Link to={`/album/${album.id}`} className={s.latestArt} aria-label={album.title}>
          <Artwork artwork={album.artwork} size={300} />
        </Link>
        <div className={s.latestText}>
          <p className={s.eyebrow}>New release · {formatShortDate(album.releaseDate)}</p>
          <Link to={`/album/${album.id}`} className={s.latestTitle}>{album.title}</Link>
          <p className={s.latestMeta}>{kind} · {album.trackIds.length} songs · {yearOf(album.releaseDate)}</p>
        </div>
      </div>
    </section>
  );
}

function TopSongs({ songs, context }: { songs: Song[]; context: PlayContext }) {
  return (
    <section className={s.top} aria-labelledby="top-songs-title">
      <h2 id="top-songs-title" className={s.h2}>Top Songs</h2>
      <ol className={s.topGrid}>
        {songs.map((song, i) => <TopSongRow key={song.id} song={song} index={i} songs={songs} context={context} />)}
      </ol>
    </section>
  );
}

function TopSongRow({ song, index, songs, context }: { song: Song; index: number; songs: Song[]; context: PlayContext }) {
  const navigate = useNavigate();
  const isCurrent = usePlayer((st) => st.current?.song.id === song.id);
  const menu = (e: MouseEvent<HTMLElement>) => openMenuAt(e, menuFor({ type: 'song', data: song }, { navigate }));
  const play = () => {
    if (isCurrent) usePlayer.getState().togglePlay();
    else playFromList(songs, index, context);
  };
  return (
    <li className={clsx(s.topRow, isCurrent && s.topCurrent)} onContextMenu={menu}>
      <div role="button" tabIndex={0} className={s.topMain} aria-label={`Play ${song.title}`}
        onClick={play} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } }}>
        <Artwork artwork={song.artwork} size={80} rounded="xs" className={s.topArt} />
        <span className={s.topText}>
          <span className={clsx(s.topTitle, 'clamp-1')}>{song.title}{song.isExplicit && <ExplicitBadge />}</span>
          <span className={clsx(s.topSub, 'clamp-1')}>{song.album.title} · {yearOf(song.releaseDate)}</span>
        </span>
      </div>
      <button className={s.topMore} aria-label={`More options for ${song.title}`} onClick={menu}>
        <Icon name="more" size={18} />
      </button>
    </li>
  );
}

function ArtistSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className={s.artist}>
      <div className={s.skelHero} />
      <div className={clsx('page', s.skelBody)}>
        <div className={s.skelFeature}>
          <div className={clsx(s.skel, s.skelCard)} />
          <div className={s.skelRows}>{Array.from({ length: 6 }, (_, i) => <div key={i} className={clsx(s.skel, s.skelRow)} />)}</div>
        </div>
      </div>
    </div>
  );
}
