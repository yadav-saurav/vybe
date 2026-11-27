import { useMemo, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import type { Playlist, Song } from '@vybe/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { useLibraryAsync } from '../../features/library/useLibraryAsync';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { Lockup } from '../../components/Lockup';
import { PillButton } from '../../components/Buttons';
import { useAuth } from '../../stores/auth';
import { useUI } from '../../stores/ui';
import { usePlayer } from '../../stores/player';
import { WorldRows } from '../../features/world/WorldRows';
import { artistHref } from '../../lib/imports';
import s from './Library.module.css';

const SECTIONS: Record<string, string> = {
  'liked-songs': 'Liked Songs',
  playlists: 'Playlists',
  artists: 'Artists',
};

export default function LibraryPage() {
  const { section = '' } = useParams();
  const user = useAuth((a) => a.user);
  const ready = useAuth((a) => a.ready);
  if (!SECTIONS[section]) return <Navigate to="/library/liked-songs" replace />;
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
    case 'playlists': return <PlaylistsView />;
    default: return <LikedView />;
  }
}

/* ---------------- Liked Songs (the songs you've hearted) ---------------- */

function LikedView() {
  const { data, error, loading } = useLibraryAsync('library:liked', (sig) => api.libraryLiked(sig));
  const songs = data?.songs ?? [];
  if (error) return <LoadError />;
  if (loading && !data) return <GridSkeleton />;
  if (!songs.length) return <Empty title="No liked songs yet" text="Tap the heart on any song and it will appear here." />;
  const play = (shuffle?: boolean) => usePlayer.getState().playSongs(songs, 0, { type: 'queue', title: 'Liked Songs' }, { shuffle });
  return (
    <>
      <div className={s.likedActions}>
        <span className={s.likedCount}>{songs.length} {songs.length === 1 ? 'song' : 'songs'}</span>
        <PillButton variant="key" onClick={() => play()}><Icon name="play" size={14} />Play</PillButton>
        <PillButton onClick={() => play(true)}><Icon name="shuffle" size={14} />Shuffle</PillButton>
      </div>
      <WorldRows songs={songs} title="Liked Songs" />
    </>
  );
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

/* ---------------- Albums and Artists, worked out from the songs you saved ---------------- */

interface ArtistGroup { id: string; name: string; artwork: Song['artwork']; href: string; count: number; at: number }

function useSavedSongs() {
  return useLibraryAsync('library:songs', (sig) => api.librarySongs(sig));
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
  // Their photos (a song's cover stays until a photo arrives, or if none exists).
  const names = artists.map((a) => a.name).join('|');
  const { data: photos } = useAsync(names ? `artist-photos:${names}` : null, (sig) => api.artistPhotos(artists.map((a) => a.name), sig));
  if (error) return <LoadError />;
  if (loading && !data) return <GridSkeleton />;
  if (!artists.length) return <Empty title="No artists yet" text="Artists of the songs you add to your library appear here." />;
  return (
    <div className={s.grid}>
      {artists.map((a) => (
        <Link key={a.id} to={a.href} className={clsx(s.tile, s.tileArtist)}>
          <span className={s.tileArt}><Artwork artwork={photos?.photos[a.name] ?? a.artwork} size={300} rounded="circle" /></span>
          <span className={clsx(s.tileTitle, 'clamp-1')}>{a.name}</span>
          <span className={s.tileSub}>{a.count} {a.count === 1 ? 'song' : 'songs'}</span>
        </Link>
      ))}
    </div>
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
