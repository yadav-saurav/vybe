import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import type { Song } from '@vybe/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { artUrl } from '../../lib/color';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { SearchSuggestions } from '../../features/search/SearchSuggestions';
import { clearRecent, loadRecent, saveRecent, type RecentEntry } from '../../features/search/recent';
import { WorldRows } from '../../features/world/WorldRows';
import { AlbumCard, ArtistCard } from '../../features/world/WorldShelves';
import { usePlayer } from '../../stores/player';
import type { WorldAlbum, WorldArtist } from '../../lib/api';
import { worldDefaultCountry } from '../../lib/world';
import { GENRES } from '../../lib/genres';
import s from './Search.module.css';

type Tab = 'top' | 'songs' | 'artists' | 'albums';
const TABS: { id: Tab; label: string }[] = [
  { id: 'top', label: 'Top Results' },
  { id: 'songs', label: 'Songs' },
  { id: 'artists', label: 'Artists' },
  { id: 'albums', label: 'Albums' },
];
type Found = { songs: Song[]; artists: WorldArtist[]; albums: WorldAlbum[] };
const DEBOUNCE_MS = 250;

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('term') ?? '';
  const q = raw.trim();
  const [debounced, setDebounced] = useState(q);
  const [tab, setTab] = useState<Tab>('top');
  const [result, setResult] = useState<{ term: string; data: Found } | null>(null);
  const [failedTerm, setFailedTerm] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!debounced) return;
    const ctrl = new AbortController();
    if (debounced.length < 2) return;
    api.worldSearchAll(debounced, worldDefaultCountry(), ctrl.signal).then(
      (data) => { if (ctrl.signal.aborted) return; setResult({ term: debounced, data }); setFailedTerm(null); },
      () => { if (!ctrl.signal.aborted) setFailedTerm(debounced); },
    );
    return () => ctrl.abort();
  }, [debounced]);

  useEffect(() => { setTab('top'); }, [debounced]);

  // Results only count when they belong to the term being shown (stale results stay hidden behind skeletons).
  const data = result && result.term === debounced ? result.data : null;
  const failed = failedTerm === debounced;

  const setTerm = (value: string, replace = true) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set('term', value); else next.delete('term');
      return next;
    }, { replace });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (q) saveRecent({ kind: 'term', term: q });
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <div className="page">
      <form role="search" className={s.mobileField} onSubmit={onSubmit}>
        <FieldWithSuggestions raw={raw} onChange={(v) => setTerm(v)} onPickTerm={(t) => setTerm(t, false)} />
      </form>

      {q ? (
        <div className={s.results}>
          <Results q={q} data={data} failed={failed} tab={tab} setTab={setTab} />
        </div>
      ) : (
        <Landing />
      )}
    </div>
  );
}

/** Page-level search field. Hidden on desktop (the sidebar field is used there), shown at ≤760px. */
function FieldWithSuggestions({ raw, onChange, onPickTerm }: { raw: string; onChange: (v: string) => void; onPickTerm: (t: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={s.field}>
      <Icon name="search" size={16} className={s.fieldIcon} />
      <input ref={ref} type="search" name="term" aria-label="Search" placeholder="Artists, songs, albums and more"
        autoComplete="off" autoCapitalize="none" spellCheck={false} value={raw}
        onChange={(e) => onChange(e.target.value)} />
      <SearchSuggestions inputRef={ref} term={raw} onPickTerm={onPickTerm} />
    </div>
  );
}

function Landing() {
  // Real album covers for each genre (the cards keep their own artwork until these arrive).
  const { data: covers } = useAsync('search:genre-covers', (sig) => api.worldGenreCovers(sig));
  // Re-read on every mount: the landing unmounts while results are shown.
  const [recent, setRecent] = useState<RecentEntry[]>(() => loadRecent());

  return (
    <>
      <header className="page-header"><h1 className="t-large-title">Search</h1></header>

      <section aria-labelledby="browse-title">
        <h2 id="browse-title" className={s.sectionTitle}>Browse Categories</h2>
        <div className={s.categories}>
          {GENRES.map((g) => (
              <Link key={g.id} to={`/genre/${g.id}`} className={s.tile} style={{ background: g.color }} aria-label={g.name}>
                {covers?.covers[g.id] && <img className={clsx(s.tileArt, s.tileCover)} src={artUrl(covers.covers[g.id], 500)} alt="" loading="lazy" decoding="async" />}
                <span className={s.tileTitle}>{g.name}</span>
              </Link>
            ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className={s.block} aria-labelledby="recent-title">
          <div className={s.rowHead}>
            <h2 id="recent-title" className={s.sectionTitle}>Recently Searched</h2>
            <button type="button" className={s.textBtn} onClick={() => { clearRecent(); setRecent([]); }}>Clear</button>
          </div>
          <ul className={s.recentList}>
            {recent.map((e) => (
              <li key={e.kind === 'term' ? `t:${e.term}` : `c:${e.key}`}>
                {e.kind === 'term' ? (
                  <Link to={`/search?term=${encodeURIComponent(e.term)}`} className={s.recentRow} onClick={() => saveRecent(e)}>
                    <span className={s.recentIcon}><Icon name="clock" size={18} /></span>
                    <span className={clsx(s.recentTitle, 'clamp-1')}>{e.term}</span>
                  </Link>
                ) : (
                  <Link to={e.href} className={s.recentRow} onClick={() => saveRecent(e)}>
                    <span className={s.recentThumb}><Artwork artwork={e.artwork} size={80} rounded={e.type === 'artist' ? 'circle' : 'xs'} /></span>
                    <span className={s.recentText}>
                      <span className={clsx(s.recentTitle, 'clamp-1')}>{e.title}</span>
                      <span className={clsx(s.recentSub, 'clamp-1')}>{e.subtitle}</span>
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Results({ q, data, failed, tab, setTab }: {
  q: string; data: Found | null; failed: boolean; tab: Tab; setTab: (t: Tab) => void;
}) {
  if (q.length < 2) return <p className={s.emptyText}>Keep typing…</p>;
  if (failed && !data) {
    return (
      <div className={s.empty} role="status">
        <p className={s.emptyTitle}>Search isn’t available right now</p>
        <p className={s.emptyText}>Try again in a moment.</p>
      </div>
    );
  }
  if (!data) return <Skeletons />;
  if (!data.songs.length) {
    return (
      <>
        <div className={s.empty} role="status">
          <p className={s.emptyTitle}>No results for “{q}”</p>
          <p className={s.emptyText}>Check the spelling, or try a shorter or different search.</p>
        </div>
      </>
    );
  }
  return (
    <>
      <h1 className="visually-hidden">Search results for “{q}”</h1>
      <div className={s.tabs} role="group" aria-label="Filter results">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tab === t.id} className={clsx(s.tab, tab === t.id && s.tabOn)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'top' && <TopResults q={q} data={data} setTab={setTab} />}
      {tab === 'songs' && <WorldRows songs={data.songs} title={`“${q}”`} />}
      {tab === 'artists' && <div className={s.cardGrid}>{data.artists.map((a) => <ArtistCard key={a.id} artist={a} />)}</div>}
      {tab === 'albums' && <div className={s.cardGrid}>{data.albums.map((a) => <AlbumCard key={a.id} album={a} />)}</div>}
    </>
  );
}

/** Top result (the best match, big), songs, artists, albums and people. */
function TopResults({ q, data, setTab }: { q: string; data: Found; setTab: (t: Tab) => void }) {
  const top = data.songs[0];
  const isCurrent = usePlayer((p) => p.current?.song.id === top.id);
  return (
    <>
      <div className={s.topGrid}>
        <section aria-labelledby="top-title">
          <h2 id="top-title" className={s.sectionTitle}>Top result</h2>
          <button className={clsx(s.topCard, isCurrent && s.topCardOn)} onClick={() => usePlayer.getState().playSongs(data.songs, 0, { type: 'queue', title: `“${q}”` })}>
            <span className={s.topArt}><Artwork artwork={top.artwork} size={300} rounded="sm" /></span>
            <span className={clsx(s.topTitle, 'clamp-2')}>{top.title}</span>
            <span className={s.topSub}>Song · {top.artist.name}</span>
            <span className={s.topPlay} aria-hidden><Icon name="play" size={20} /></span>
          </button>
        </section>
        <section aria-labelledby="songs-title">
          <div className={s.rowHead}>
            <h2 id="songs-title" className={s.sectionTitle}>Songs</h2>
            <button type="button" className={s.seeAll} onClick={() => setTab('songs')}>See All</button>
          </div>
          <WorldRows songs={data.songs.slice(0, 4)} title={`“${q}”`} />
        </section>
      </div>
      {data.artists.length > 0 && (
        <section className={s.block} aria-labelledby="artists-title">
          <div className={s.rowHead}><h2 id="artists-title" className={s.sectionTitle}>Artists</h2><button type="button" className={s.seeAll} onClick={() => setTab('artists')}>See All</button></div>
          <div className={s.cardRow}>{data.artists.slice(0, 6).map((a) => <ArtistCard key={a.id} artist={a} />)}</div>
        </section>
      )}
      {data.albums.length > 0 && (
        <section className={s.block} aria-labelledby="albums-title">
          <div className={s.rowHead}><h2 id="albums-title" className={s.sectionTitle}>Albums</h2><button type="button" className={s.seeAll} onClick={() => setTab('albums')}>See All</button></div>
          <div className={s.cardRow}>{data.albums.slice(0, 6).map((a) => <AlbumCard key={a.id} album={a} />)}</div>
        </section>
      )}
    </>
  );
}



function Skeletons() {
  return (
    <div className={clsx(s.pulse)} aria-busy="true" aria-label="Loading results">
      <div className={s.grid}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i}><div className={s.skelTile} /><div className={s.skelLine} /><div className={clsx(s.skelLine, s.short)} /></div>
        ))}
      </div>
      <div className={s.block} style={{ marginTop: 32 }}>
        {Array.from({ length: 5 }, (_, i) => <div key={i} className={s.skelRow} style={{ opacity: 1 - i * 0.12 }} />)}
      </div>
    </div>
  );
}
