import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Song } from '@vybe/shared';
import { api, ApiError, type WorldAlbum } from '../../lib/api';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { usePlayer } from '../../stores/player';
import { useLibrary } from '../../stores/library';
import { useAuth } from '../../stores/auth';
import { useUI } from '../../stores/ui';
import { AmbientGlow, ArtGlow } from '../../features/world/Ambient';
import { WorldRows, WorldSkeleton } from '../../features/world/WorldRows';
import s from '../WorldArtist/WorldArtist.module.css';

/** An album or single: its songs as previews; "Add to Library" saves every track. */
export default function WorldAlbumPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<{ album: WorldAlbum; songs: Song[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const songIds = useLibrary((l) => l.songIds);

  useEffect(() => {
    const ctl = new AbortController();
    setData(null); setError(null);
    api.worldAlbum(id, ctl.signal).then(setData).catch((e) => {
      if (!ctl.signal.aborted) setError(e instanceof ApiError ? e.message : 'Couldn’t load this album right now.');
    });
    return () => ctl.abort();
  }, [id, retry]);

  const a = data?.album;
  const allSaved = !!data?.songs.length && data.songs.every((x) => songIds.includes(x.id));
  const play = (shuffle?: boolean) => data?.songs.length && usePlayer.getState().playSongs(data.songs, 0, { type: 'queue', title: a?.title }, { shuffle });
  const save = async () => {
    if (!useAuth.getState().user) { useUI.getState().openSignIn(); return; }
    const lib = useLibrary.getState();
    for (const x of data?.songs ?? []) if (!lib.has('song', x.id)) await lib.toggle('song', x.id);
    useUI.getState().toast('Added to Library');
  };
  return (
    <div className={`page ${s.page}`}>
      <AmbientGlow artwork={a?.artwork} />
      <header className={s.header}>
        <div className={s.photo} style={{ borderRadius: 12 }}>
          {a ? <><ArtGlow artwork={a.artwork} always /><div className={s.photoInner} style={{ borderRadius: 12 }}><Artwork artwork={a.artwork} size={600} rounded="md" eager /></div></>
            : <div className={`${s.photoInner} ${s.sk}`} style={{ borderRadius: 12 }} />}
        </div>
        <div className={s.meta}>
          <p className={s.eyebrow}>{data && data.songs.length <= 3 ? 'Single' : 'Album'}{a?.releaseDate ? ` · ${a.releaseDate.slice(0, 4)}` : ''}</p>
          <h1 className={s.name} style={{ fontSize: 'clamp(28px, 5vw, 52px)', lineHeight: 1.08 }}>{a?.title ?? ' '}</h1>
          {a && <p className={s.sub}><Link to={`/world/artist/${a.artistId}?c=${a.country}`}>{a.artistName}</Link>{data ? ` · ${data.songs.length} songs` : ''}</p>}
          {data && data.songs.length > 0 && (
            <div className={s.actions}>
              <button className={s.play} onClick={() => play()}><Icon name="play" size={18} />Play</button>
              <button className={s.shuffle} onClick={() => play(true)}><Icon name="shuffle" size={16} />Shuffle</button>
              <button className={s.shuffle} onClick={save} disabled={allSaved} aria-label={allSaved ? 'In your library' : 'Add album to library'}>
                <Icon name={allSaved ? 'check' : 'plus'} size={16} />{allSaved ? 'Added' : 'Add'}
              </button>
            </div>
          )}
        </div>
      </header>
      <section aria-label="Songs">
        {error ? <div className={s.state}><p>{error}</p><button className={s.shuffle} onClick={() => setRetry((n) => n + 1)}>Try Again</button></div>
          : data ? <WorldRows songs={data.songs} title={data.album.title} /> : <WorldSkeleton />}
      </section>
    </div>
  );
}
