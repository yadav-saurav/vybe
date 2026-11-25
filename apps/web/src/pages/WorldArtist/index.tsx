import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError, type WorldArtist } from '../../lib/api';
import type { Song } from '@vybe/shared';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { usePlayer } from '../../stores/player';
import { AmbientGlow, ArtGlow } from '../../features/world/Ambient';
import { WorldRows, WorldSkeleton } from '../../features/world/WorldRows';
import { worldDefaultCountry, WORLD_PATH } from '../../lib/world';
import s from './WorldArtist.module.css';

/** A famous artist from anywhere: their best-known songs as previews, under their cover's glow. */
export default function WorldArtistPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const country = params.get('c') ?? worldDefaultCountry();
  const [data, setData] = useState<{ artist: WorldArtist; songs: Song[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    setData(null); setError(null);
    api.worldArtist(id, country, ctl.signal).then(setData).catch((e) => {
      if (!ctl.signal.aborted) setError(e instanceof ApiError ? e.message : 'Couldn’t reach worldwide music right now.');
    });
    return () => ctl.abort();
  }, [id, country, retry]);

  const play = (shuffle?: boolean) => data?.songs.length && usePlayer.getState().playSongs(data.songs, 0, { type: 'queue', title: data.artist.name }, { shuffle });
  const a = data?.artist;
  return (
    <div className={`page ${s.page}`}>
      <AmbientGlow artwork={a?.artwork} />
      <Link to={WORLD_PATH} className={s.back}><Icon name="chevron-left" size={16} />Worldwide</Link>
      <header className={s.header}>
        <div className={s.photo}>
          {a?.artwork ? <><ArtGlow artwork={a.artwork} round /><div className={s.photoInner}><Artwork artwork={a.artwork} size={600} rounded="circle" eager /></div></>
            : <div className={`${s.photoInner} ${s.sk}`} />}
        </div>
        <div className={s.meta}>
          <p className={s.eyebrow}>Artist{a?.genre ? ` · ${a.genre}` : ''}</p>
          <h1 className={s.name}>{a?.name ?? ' '}</h1>
          {data && <p className={s.sub}>{data.songs.length} popular songs</p>}
          {data && data.songs.length > 0 && (
            <div className={s.actions}>
              <button className={s.play} onClick={() => play()}><Icon name="play" size={18} />Play</button>
              <button className={s.shuffle} onClick={() => play(true)}><Icon name="shuffle" size={16} />Shuffle</button>
            </div>
          )}
        </div>
      </header>
      <section aria-labelledby="popular-title" className={s.list}>
        <h2 id="popular-title" className={s.sectionTitle}>Popular</h2>
        {error ? <div className={s.state}><p>{error}</p><button className={s.shuffle} onClick={() => setRetry((n) => n + 1)}>Try Again</button></div>
          : data ? <WorldRows songs={data.songs} ranked title={data.artist.name} /> : <WorldSkeleton />}
      </section>
    </div>
  );
}
