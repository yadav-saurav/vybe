import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { formatLongDuration, type ContentItem, type Playlist, type Song } from '@vybe/shared';
import { api } from '../../lib/api';
import { useLibraryAsync } from '../../features/library/useLibraryAsync';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { Lockup } from '../../components/Lockup';
import { TrackList } from '../../components/TrackList';
import { PillButton } from '../../components/Buttons';
import { useAuth } from '../../stores/auth';
import { useUI } from '../../stores/ui';
import { usePlayer, type PlayContext } from '../../stores/player';
import { isWorld } from '../../lib/world';
import { albumHref, artistHref } from '../../lib/imports';
import s from './Library.module.css';

const SECTIONS: Record<string, string> = {
  'recently-added': 'Recently Added',
  artists: 'Artists',
  albums: 'Albums',
  songs: 'Songs',
  playlists: 'Playlists',
};

export default function LibraryPage() {
  const { section = '' } = useParams();
  const user = useAuth((a) => a.user);
  const ready = useAuth((a) => a.ready);
  if (!SECTIONS[section]) return <Navigate to="/library/recently-added" replace />;
  if (!ready) return <div className="page" aria-busy="true" />;
  if (!user) {
    return (
      <div className="page">
        <header className="page-header"><h1 className="t-large-title">{SECTIONS[section]}</h1></header>
        <SignedOut />
      </div>
    );
  }
  return (
    <div className="page">
      <header className="page-header"><h1 className="t-large-title">{SECTIONS[section]}</h1></header>
      <SectionView section={section} />
    </div>
  );
}

function SectionView({ section }: { section: string }) {
  switch (section) {
    case 'artists': return <ArtistsView />;
    case 'albums': return <AlbumsView />;
    case 'songs': return <SongsView />;
    case 'playlists': return <PlaylistsView />;
    default: return <RecentlyAddedView />;
  }
}

function SignedOut() {
  const importing = false;
  return (
    <div className={s.gate}>
      <span className={s.gateIcon}><Icon name={importing ? 'upload' : 'vybe-mark'} size={30} /></span>
      <h2 className={s.gateTitle}>{importing ? 'Import your own music' : 'Your library, everywhere'}</h2>
      <p className={s.gateText}>{importing
        ? 'Sign in to import songs you own from your computer. Files stay private to your account and play alongside the rest of Vybe.'
        : 'Sign in to save songs and see your albums, artists and playlists.'}</p>
      <PillButton variant="key" onClick={() => useUI.getState().openSignIn()}>Sign In</PillButton>
    </div>
  );
}

function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className={s.empty}>
      <p className={s.emptyTitle}>{title}</p>
      <p className={s.emptyText}>{text}</p>
      {children && <div className={s.emptyAction}>{children}</div>}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className={clsx(s.grid, s.pulse)} aria-busy="true">
      {Array.from({ length: 10 }, (_, i) => <div key={i}><div className={s.skel} /></div>)}
    </div>
  );
}

function LoadError() {
  return <Empty title="Couldn’t load this section" text="Check your connection and try again." />;
}

/* ---------------- Recently Added ---------------- */

function RecentlyAddedView() {
  const { data, error, loading } = useLibraryAsync('library:recent', (sig) => api.recentlyAdded(sig));
  if (error) return <LoadError />;
  if (loading && !data) return <GridSkeleton />;
  const items: ContentItem[] = data?.items ?? [];
  if (!items.length) return <Empty title="Nothing added yet" text="Albums, songs, artists and playlists you add will appear here." />;
  return <div className={s.grid}>{items.map((item) => <Lockup key={`${item.type}-${item.data.id}`} item={item} />)}</div>;
}

/* ---------------- Albums and Artists, worked out from the songs you saved ---------------- */

interface AlbumGroup { id: string; title: string; artist: string; artwork: Song['artwork']; href: string; songs: Song[]; at: number }
interface ArtistGroup { id: string; name: string; artwork: Song['artwork']; href: string; count: number; at: number }

function useSavedSongs() {
  return useLibraryAsync('library:songs', (sig) => api.librarySongs(sig));
}

function AlbumsView() {
  const { data, error, loading } = useSavedSongs();
  const albums = useMemo(() => {
    const map = new Map<string, AlbumGroup>();
    (data?.songs ?? []).forEach((song, i) => {
      let g = map.get(song.album.id);
      if (!g) {
        g = { id: song.album.id, title: song.album.title || song.title, artist: song.artist.name, artwork: song.artwork,
          href: isWorld(song) ? `/world/album/${song.album.id}` : albumHref(song), songs: [], at: i };
        map.set(song.album.id, g);
      }
      g.songs.push(song);
    });
    return [...map.values()].sort((x, y) => x.at - y.at);
  }, [data]);
  if (error) return <LoadError />;
  if (loading && !data) return <GridSkeleton />;
  if (!albums.length) return <Empty title="No albums yet" text="Albums of the songs you add to your library appear here." />;
  return (
    <div className={s.grid}>
      {albums.map((a) => (
        <Link key={a.id} to={a.href} className={s.tile}>
          <span className={s.tileArt}><Artwork artwork={a.artwork} size={300} rounded="sm" /></span>
          <span className={clsx(s.tileTitle, 'clamp-1')}>{a.title}</span>
          <span className={clsx(s.tileSub, 'clamp-1')}>{a.artist} · {a.songs.length} {a.songs.length === 1 ? 'song' : 'songs'}</span>
        </Link>
      ))}
    </div>
  );
}

function ArtistsView() {
  const { data, error, loading } = useSavedSongs();
  const artists = useMemo(() => {
    const map = new Map<string, ArtistGroup>();
    (data?.songs ?? []).forEach((song, i) => {
      const g = map.get(song.artist.id);
      if (g) { g.count++; return; }
      map.set(song.artist.id, { id: song.artist.id, name: song.artist.name, artwork: song.artwork, href: artistHref(song), count: 1, at: i });
    });
    return [...map.values()].sort((x, y) => x.at - y.at);
  }, [data]);
  if (error) return <LoadError />;
  if (loading && !data) return <GridSkeleton />;
  if (!artists.length) return <Empty title="No artists yet" text="Artists of the songs you add to your library appear here." />;
  return (
    <div className={s.grid}>
      {artists.map((a) => (
        <Link key={a.id} to={a.href} className={clsx(s.tile, s.tileArtist)}>
          <span className={s.tileArt}><Artwork artwork={a.artwork} size={300} rounded="circle" /></span>
          <span className={clsx(s.tileTitle, 'clamp-1')}>{a.name}</span>
          <span className={s.tileSub}>{a.count} {a.count === 1 ? 'song' : 'songs'}</span>
        </Link>
      ))}
    </div>
  );
}

/* ---------------- Songs (filter, sort, play) ---------------- */

type SongKey = 'title' | 'artist' | 'album' | 'time';

function SongsView() {
  const { data, error, loading } = useLibraryAsync('library:songs', (sig) => api.librarySongs(sig));
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<{ key: SongKey; dir: 1 | -1 } | null>(null);
  const songs = data?.songs;

  const visible = useMemo<Song[]>(() => {
    const f = filter.trim().toLowerCase();
    let list = songs ?? [];
    if (f) {
      list = list.filter((x) => [x.title, x.artist.name, x.album.title, ...x.featuring.map((a) => a.name)]
        .some((v) => v.toLowerCase().includes(f)));
    }
    if (!sort) return list;
    const { key, dir } = sort;
    const text = (x: Song) => (key === 'title' ? x.title : key === 'artist' ? x.artist.name : x.album.title);
    return [...list].sort((a, b) => dir * (key === 'time'
      ? a.durationMs - b.durationMs
      : text(a).localeCompare(text(b), undefined, { sensitivity: 'base', numeric: true })));
  }, [songs, filter, sort]);

  if (error) return <LoadError />;
  if (loading && !songs) return <GridSkeleton />;
  if (!songs?.length) return <Empty title="No songs yet" text="Songs you add will appear here." />;

  const ctx: PlayContext = { type: 'library', id: 'songs', title: 'Songs' };
  const total = visible.reduce((n, x) => n + x.durationMs, 0);
  const toggleSort = (key: SongKey) => setSort((cur) => (cur?.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  const colAria = (key: SongKey): 'ascending' | 'descending' | 'none' => (sort?.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none');
  const head = (key: SongKey, label: string, cls?: string) => (
    <div role="columnheader" aria-sort={colAria(key)} className={cls}>
      <button type="button" className={clsx(s.colBtn, sort?.key === key && s.colOn, sort?.key === key && sort.dir === -1 && s.colDesc)} onClick={() => toggleSort(key)}>
        {label}
        <span className={s.colArrow} aria-hidden={sort?.key !== key}>{sort?.key === key ? <Icon name="chevron-down" size={10} /> : null}</span>
      </button>
    </div>
  );

  return (
    <>
      <div className={s.toolbar}>
        <div className={s.toolbarLeft}>
          <PillButton icon="play" variant="key" onClick={() => usePlayer.getState().playSongs(visible, 0, ctx)} disabled={!visible.length}>Play</PillButton>
          <PillButton icon="shuffle" variant="soft" onClick={() => usePlayer.getState().playSongs(visible, 0, ctx, { shuffle: true })} disabled={!visible.length}>Shuffle</PillButton>
          <span className={s.count}>{visible.length} {visible.length === 1 ? 'song' : 'songs'}{visible.length ? `, ${formatLongDuration(total)}` : ''}</span>
        </div>
        <label className={s.filter}>
          <span className="visually-hidden">Filter songs</span>
          <Icon name="search" size={14} />
          <input type="search" value={filter} placeholder="Filter" autoComplete="off" spellCheck={false}
            onChange={(e) => setFilter(e.target.value)} />
        </label>
      </div>
      <div className={s.songHead} role="row">
        {head('title', 'Song', s.colTitle)}
        {head('artist', 'Artist')}
        {head('album', 'Album', s.colAlbum)}
        {head('time', 'Time', s.colTime)}
      </div>
      {visible.length
        ? <TrackList songs={visible} context={ctx} variant="playlist" showHeader={false} />
        : <p className={s.none}>No songs match “{filter}”.</p>}
    </>
  );
}

/* ---------------- Playlists ---------------- */

function PlaylistsView() {
  const { data, error, loading } = useLibraryAsync('library:playlists', (sig) => api.libraryPlaylists(sig));
  const playlists: Playlist[] = data?.playlists ?? [];
  if (error) return <LoadError />;
  if (loading && !data) return <GridSkeleton />;
  return (
    <div className={s.grid}>
      <button type="button" className={s.newTile} onClick={() => useUI.getState().openPlaylistEditor({ mode: 'create' })}>
        <span className={s.newArt}><Icon name="plus" size={36} /></span>
        <span className={s.newLabel}>New Playlist</span>
      </button>
      {playlists.map((p) => <Lockup key={p.id} item={{ type: 'playlist', data: p }} />)}
      {!playlists.length && (
        <p className={clsx(s.emptyText)} style={{ gridColumn: '2 / -1', alignSelf: 'center' }}>Playlists you create or add will appear here.</p>
      )}
    </div>
  );
}
