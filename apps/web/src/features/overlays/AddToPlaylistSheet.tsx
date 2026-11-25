import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { addSongsToPlaylist } from '../actions';
import { Sheet } from './Sheet';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../stores/auth';
import { useUI } from '../../stores/ui';
import type { Song } from '@vybe/shared';
import f from './forms.module.css';
import s from './AddToPlaylistSheet.module.css';

/** Picks one of the user's own playlists for the songs in `addToPlaylist`, or starts a new one seeded with them. */
export function AddToPlaylistSheet() {
  const pending = useUI((u) => u.addToPlaylist);
  const close = useUI((u) => u.closeAddToPlaylist);
  const user = useAuth((a) => a.user);
  // Keep the last payload while the sheet animates out.
  const lastSongs = useRef<Song[]>([]);
  if (pending) lastSongs.current = pending.songs;
  const songs = lastSongs.current;
  const open = !!pending;
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync(open && user ? 'library:playlists' : null, (sig) => api.libraryPlaylists(sig));
  const me = useAuth((a) => a.user?.id);
  // Own playlists, plus other people's playlists they opened up to everyone.
  const mine = (data?.playlists ?? []).filter((p) => p.kind === 'user' && (p.ownerId === me || p.isCollaborative));
  const count = songs.length;

  const choose = async (id: string, name: string) => {
    setBusyId(id);
    try {
      await addSongsToPlaylist(id, songs, name);
      close();
    } catch {
      useUI.getState().toast('Something went wrong');
    } finally {
      setBusyId(null);
    }
  };

  const newPlaylist = () => {
    close();
    useUI.getState().openPlaylistEditor({ mode: 'create', seedSongs: songs });
  };

  return (
    <Sheet open={open} onClose={close} labelledBy="atp-title" className={s.panel}>
      <div className={f.body}>
        <header className={f.head}>
          <h2 id="atp-title" className={f.title}>Add to Playlist</h2>
          <button type="button" className={f.close} aria-label="Close" onClick={close}><Icon name="close" size={14} /></button>
        </header>
        <p className={f.sub}>{count === 1 ? '1 song' : `${count} songs`} selected</p>

        <ul className={s.list} aria-label="Your playlists">
          <li>
            <button type="button" className={s.row} onClick={newPlaylist} data-autofocus>
              <span className={s.newThumb}><Icon name="plus" size={20} /></span>
              <span className={s.text}><span className={s.name}>New Playlist…</span></span>
            </button>
          </li>

          {loading && !data && [0, 1, 2].map((i) => (
            <li key={i} aria-hidden><div className={s.skeleton} /></li>
          ))}

          {error && (
            <li className={s.note} role="alert">
              Couldn’t load your playlists. <button type="button" className={f.linkBtn} onClick={reload}>Try again</button>
            </li>
          )}

          {mine.map((p) => (
            <li key={p.id}>
              <button type="button" className={s.row} disabled={busyId !== null} onClick={() => choose(p.id, p.name)}>
                <span className={s.thumb}><Artwork artwork={p.artwork} size={120} rounded="sm" /></span>
                <span className={s.text}>
                  <span className={s.name + ' clamp-1'}>{p.name}</span>
                  <span className={s.meta}>{p.trackIds.length} {p.trackIds.length === 1 ? 'song' : 'songs'}</span>
                </span>
                {busyId === p.id && <span className={s.meta}>Adding…</span>}
              </button>
            </li>
          ))}

          {!loading && !error && data && mine.length === 0 && (
            <li className={s.note}>You don’t have any playlists yet. Start one above.</li>
          )}
        </ul>
      </div>
    </Sheet>
  );
}
