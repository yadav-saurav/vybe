import { useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { formatLongDuration, type Album, type ContentItem, type Playlist, type Song } from '@vybe/shared';
import { api } from '../../lib/api';
import { useLibraryAsync } from '../../features/library/useLibraryAsync';
import { openMenuAt } from '../../features/actions';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { Lockup } from '../../components/Lockup';
import { TrackList } from '../../components/TrackList';
import { PillButton } from '../../components/Buttons';
import { useAuth } from '../../stores/auth';
import { useUI } from '../../stores/ui';
import { usePlayer, type PlayContext } from '../../stores/player';
import { ImportedView } from './Imported';
import s from './Library.module.css';

const SECTIONS: Record<string, string> = {
  'recently-added': 'Recently Added',
  artists: 'Artists',
  albums: 'Albums',
  songs: 'Songs',
  imported: 'Imported',
  'made-for-you': 'Made for You',
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
        <SignedOut section={section} />
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
    case 'imported': return <ImportedView />;
    case 'made-for-you': return <MadeForYouView />;
    case 'playlists': return <PlaylistsView />;
    default: return <RecentlyAddedView />;
  }
}

function SignedOut({ section }: { section: string }) {
  const importing = section === 'imported';
  return (
    <div className={s.gate}>
      <span className={s.gateIcon}><Icon name={importing ? 'upload' : 'vybe-mark'} size={30} /></span>
      <h2 className={s.gateTitle}>{importing ? 'Import your own music' : 'Your library, everywhere'}</h2>
      <p className={s.gateText}>{importing
        ? 'Sign in to import songs you own from your computer. Files stay private to your account and play alongside the rest of Vybe.'
        : 'Sign in to see the songs, albums, artists and playlists you add, and the mixes made for you.'}</p>
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

/* ---------------- Artists (two panes; list navigates on mobile) ---------------- */

interface AlbumGroup { album: Song['album']; releaseDate: string; songs: Song[] }

function groupByAlbum(songs: Song[]): AlbumGroup[] {
  const map = new Map<string, AlbumGroup>();
  for (const song of songs) {
    let g = map.get(song.album.id);
    if (!g) { g = { album: song.album, releaseDate: song.releaseDate, songs: [] }; map.set(song.album.id, g); }
    g.songs.push(song);
  }
  return [...map.values()]
    .map((g) => ({ ...g, songs: [...g.songs].sort((a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber) }))
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
}

function ArtistsView() {
  const [params, setParams] = useSearchParams();
  const artistsQ = useLibraryAsync('library:artists', (sig) => api.libraryArtists(sig));
  const songsQ = useLibraryAsync('library:songs', (sig) => api.librarySongs(sig));
  const artists = artistsQ.data?.artists ?? [];
  const pickedId = params.get('artist');
  const selected = artists.find((a) => a.id === pickedId) ?? artists[0];
  const selectedId = selected?.id;

  const groups = useMemo(() => {
    if (!selected) return [];
    const mine = (songsQ.data?.songs ?? []).filter((x) => x.artist.id === selected.id || x.featuring.some((f) => f.id === selected.id));
    return groupByAlbum(mine);
  }, [songsQ.data, selected]);

  if (artistsQ.error) return <LoadError />;
  if (artistsQ.loading && !artistsQ.data) return <GridSkeleton />;
  if (!artists.length) return <Empty title="No artists yet" text="Artists whose songs or albums you add will appear here." />;

  const songCount = groups.reduce((n, g) => n + g.songs.length, 0);
  return (
    <div className={s.split} data-detail={pickedId ? 'true' : 'false'}>
      <div className={s.listPane}>
        <ul className={s.artistList} aria-label="Artists">
          {artists.map((a) => (
            <li key={a.id}>
              <button type="button" className={clsx(s.artistRow, a.id === selectedId && s.artistOn)}
                aria-current={a.id === selectedId ? 'true' : undefined}
                onClick={() => setParams({ artist: a.id })}>
                <span className={s.avatar}><Artwork artwork={a.artwork} rounded="circle" size={120} /></span>
                <span className={clsx(s.artistName, 'clamp-1')}>{a.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {selected && (
        <div className={s.detailPane}>
          <button type="button" className={s.back} onClick={() => setParams({})}>
            <Icon name="chevron-left" size={14} />Artists
          </button>
          <header className={s.artistHead}>
            <div className={s.bigAvatar}><Artwork artwork={selected.artwork} rounded="circle" size={300} /></div>
            <div>
              <h2 className="t-title-1">{selected.name}</h2>
              <p className={s.artistMeta}>{songCount} {songCount === 1 ? 'song' : 'songs'} in your library</p>
            </div>
          </header>
          {groups.length === 0 && <p className={s.none}>No songs by {selected.name} in your library yet.</p>}
          {groups.map((g) => (
            <section key={g.album.id} className={s.albumGroup} aria-label={g.album.title}>
              <header className={s.groupHead}>
                <Link to={`/album/${g.album.id}`} className={s.groupTitle}>{g.album.title}</Link>
                <span className={s.groupMeta}>{g.releaseDate.slice(0, 4)} · {g.songs.length} {g.songs.length === 1 ? 'song' : 'songs'}</span>
              </header>
              <TrackList songs={g.songs} variant="album" showHeader={false}
                context={{ type: 'library', id: `artist:${selected.id}:${g.album.id}`, title: g.album.title }} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Albums (sortable) ---------------- */

type AlbumSort = 'added' | 'title' | 'artist' | 'release';
const ALBUM_SORTS: { id: AlbumSort; label: string }[] = [
  { id: 'added', label: 'Recently Added' },
  { id: 'title', label: 'Title' },
  { id: 'artist', label: 'Artist' },
  { id: 'release', label: 'Release Date' },
];

function AlbumsView() {
  const { data, error, loading } = useLibraryAsync('library:albums', (sig) => api.libraryAlbums(sig));
  const [sort, setSort] = useState<AlbumSort>('added');
  const albums = data?.albums;

  const sorted = useMemo<Album[]>(() => {
    const list = [...(albums ?? [])];
    switch (sort) {
      case 'title': return list.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
      case 'artist': return list.sort((a, b) => a.artist.name.localeCompare(b.artist.name, undefined, { sensitivity: 'base' }) || a.title.localeCompare(b.title));
      case 'release': return list.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
      default: return list;
    }
  }, [albums, sort]);

  if (error) return <LoadError />;
  if (loading && !albums) return <GridSkeleton />;
  if (!sorted.length) return <Empty title="No albums yet" text="Albums you add will appear here." />;

  const sortLabel = ALBUM_SORTS.find((x) => x.id === sort)?.label ?? '';
  const openSort = (e: ReactMouseEvent) => openMenuAt(e, ALBUM_SORTS.map((x) => ({
    label: x.label,
    icon: x.id === sort ? 'check' : undefined,
    onSelect: () => setSort(x.id),
  })));

  return (
    <>
      <div className={s.toolbar}>
        <div className={s.toolbarLeft}>
          <button type="button" className={s.dropdown} aria-haspopup="menu" onClick={openSort}>
            Sort: {sortLabel}<Icon name="chevron-down" size={12} />
          </button>
          <span className={s.count}>{sorted.length} {sorted.length === 1 ? 'album' : 'albums'}</span>
        </div>
      </div>
      <div className={s.grid}>
        {sorted.map((album) => <Lockup key={album.id} item={{ type: 'album', data: album }} />)}
      </div>
    </>
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

/* ---------------- Made for You (personal mixes from the Home page) ---------------- */

function MadeForYouView() {
  const { data, error, loading } = useLibraryAsync('library:made-for-you', (sig) => api.page('home', sig));
  const mixes = useMemo(() => {
    const seen = new Set<string>();
    const out: Extract<ContentItem, { type: 'playlist' }>[] = [];
    for (const shelf of data?.shelves ?? []) {
      for (const item of shelf.items) {
        if (item.type === 'playlist' && item.data.kind === 'personal-mix' && !seen.has(item.data.id)) {
          seen.add(item.data.id);
          out.push(item);
        }
      }
    }
    return out;
  }, [data]);

  if (error) return <LoadError />;
  if (loading && !data) return <GridSkeleton />;
  if (!mixes.length) return <Empty title="No mixes yet" text="Your personal mixes appear here once Vybe has learned what you like." />;
  return <div className={s.grid}>{mixes.map((item) => <Lockup key={item.data.id} item={item} />)}</div>;
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
