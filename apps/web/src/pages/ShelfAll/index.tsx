import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError, type WorldShelf } from '../../lib/api';
import { AlbumCard, ArtistCard, ChartCard, ShelfSkeleton, SongCard } from '../../features/world/WorldShelves';
import { CHARTS } from '../../features/world/charts';
import s from './ShelfAll.module.css';

/** "Show all" for a Home row: everything in it as a grid. */
export default function ShelfAllPage() {
  const { id = '' } = useParams();
  const [shelf, setShelf] = useState<WorldShelf | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === 'charts') return;
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (tries: number) => api.worldShelf(id, ctl.signal).then(setShelf).catch((e) => {
      if (ctl.signal.aborted) return;
      if (e instanceof ApiError && e.status === 503 && tries < 12) { timer = setTimeout(() => load(tries + 1), 5000); return; }
      setError(e instanceof ApiError ? e.message : 'Couldn’t load this right now.');
    });
    load(0);
    return () => { ctl.abort(); clearTimeout(timer); };
  }, [id]);

  if (id === 'charts') {
    return (
      <div className="page">
        <header className="page-header"><h1 className={s.title}>Featured Charts</h1></header>
        <div className={s.grid}>{CHARTS.map((c) => <ChartCard key={c.cc} chart={c} />)}</div>
      </div>
    );
  }
  return (
    <div className="page">
      <header className="page-header">
        <h1 className={s.title}>{shelf?.title ?? ' '}</h1>
        {shelf?.subtitle && <p className={s.sub}>{shelf.subtitle}</p>}
      </header>
      {error ? <p className={s.sub}>{error}</p> : !shelf ? <ShelfSkeleton /> : (
        <div className={s.grid}>
          {shelf.kind === 'artists' && shelf.artists.map((a) => <ArtistCard key={a.id} artist={a} />)}
          {shelf.kind === 'albums' && (shelf.albums ?? []).map((a) => <AlbumCard key={a.id} album={a} />)}
          {(shelf.kind === 'cards' || shelf.kind === 'hero') && shelf.songs.map((x, i) => <SongCard key={x.id} song={x} songs={shelf.songs} index={i} listTitle={shelf.title} />)}
        </div>
      )}
    </div>
  );
}
