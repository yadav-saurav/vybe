import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import type { ContentItem, SearchResults } from '@vybe/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { artUrl } from '../../lib/color';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { Lockup, titleOf } from '../../components/Lockup';
import { Shelf } from '../../components/Shelf';
import { TrackList } from '../../components/TrackList';
import { Highlight } from '../../features/search/Highlight';
import { SearchSuggestions } from '../../features/search/SearchSuggestions';
import { richSubtitle } from '../../features/search/labels';
import { clearRecent, loadRecent, saveRecent, type RecentEntry } from '../../features/search/recent';
import { ListenerList } from '../../features/social/ListenerList';
import s from './Search.module.css';

type Tab = 'top' | 'artists' | 'albums' | 'songs' | 'playlists' | 'stations' | 'listeners';
const TABS: { id: Tab; label: string }[] = [
  { id: 'top', label: 'Top Results' },
  { id: 'artists', label: 'Artists' },
  { id: 'albums', label: 'Albums' },
  { id: 'songs', label: 'Songs' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'stations', label: 'Stations' },
  { id: 'listeners', label: 'Listeners' },
];
const DEBOUNCE_MS = 250;

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('term') ?? '';
  const q = raw.trim();
  const [debounced, setDebounced] = useState(q);
  const [tab, setTab] = useState<Tab>('top');
  const [result, setResult] = useState<{ term: string; data: SearchResults } | null>(null);
  const [failedTerm, setFailedTerm] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!debounced) return;
    const ctrl = new AbortController();
    api.search(debounced, ctrl.signal).then(
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
  const { data: genres } = useAsync('search:genres', (sig) => api.browseCategories(sig));
  // Re-read on every mount: the landing unmounts while results are shown.
  const [recent, setRecent] = useState<RecentEntry[]>(() => loadRecent());

  return (
    <>
      <header className="page-header"><h1 className="t-large-title">Search</h1></header>

      <section aria-labelledby="browse-title">
        <h2 id="browse-title" className={s.sectionTitle}>Browse Categories</h2>
        <div className={s.categories}>
          {genres
            ? genres.genres.map((g) => (
              <Link key={g.id} to={`/genre/${g.id}`} className={s.tile} style={{ background: g.color }} aria-label={g.name}>
                <img className={s.tileArt} src={artUrl(g.artwork, 500)} alt="" loading="lazy" decoding="async" />
                <span className={s.tileTitle}>{g.name}</span>
              </Link>
            ))
            : Array.from({ length: 8 }, (_, i) => <span key={i} className={clsx(s.skelCategory, s.pulse)} />)}
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
  q: string; data: SearchResults | null; failed: boolean; tab: Tab; setTab: (t: Tab) => void;
}) {
  if (failed && !data) {
    return (
      <div className={s.empty} role="status">
        <p className={s.emptyTitle}>Search isn’t available right now</p>
        <p className={s.emptyText}>Try again in a moment.</p>
      </div>
    );
  }
  if (!data) return <Skeletons />;

  const total = data.top.length + data.songs.length + data.albums.length + data.artists.length + data.playlists.length + data.stations.length;
  if (total === 0) return <NoMusicResults q={q} />;

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
      {tab === 'top' ? <TopResults q={q} data={data} setTab={setTab} /> : tab === 'listeners' ? <ListenerResults q={q} /> : <TabResults q={q} data={data} tab={tab} />}
    </>
  );
}

const cardFor = (item: ContentItem, q: string, subtitle?: string) => (
  <Lockup key={`${item.type}-${item.data.id}`} item={item} subtitle={subtitle} titleNode={<Highlight text={titleOf(item)} term={q} />} />
);

function TopResults({ q, data, setTab }: { q: string; data: SearchResults; setTab: (t: Tab) => void }) {
  const ctx = { type: 'search' as const, id: q, title: `Results for “${q}”` };
  const top = data.top.slice(0, 8);
  return (
    <>
      {top.length > 0 && (
        <section className={s.block} aria-label="Top Results">
          <h2 className={s.sectionTitle}>Top Results</h2>
          <div className={s.grid}>{top.map((item) => cardFor(item, q, richSubtitle(item)))}</div>
        </section>
      )}
      {data.songs.length > 0 && (
        <section className={s.block}>
          <div className={s.rowHead}>
            <h2 className={s.sectionTitle}>Songs</h2>
            <button type="button" className={s.seeAll} onClick={() => setTab('songs')}>See All</button>
          </div>
          <TrackList songs={data.songs.slice(0, 8)} context={ctx} variant="compact" />
        </section>
      )}
      {data.artists.length > 0 && (
        <Shelf title="Artists" columns={5} headerExtra={<button type="button" className={s.seeAll} onClick={() => setTab('artists')}>See All</button>}>
          {data.artists.map((a) => cardFor({ type: 'artist', data: a }, q))}
        </Shelf>
      )}
      {data.albums.length > 0 && (
        <Shelf title="Albums" columns={5} headerExtra={<button type="button" className={s.seeAll} onClick={() => setTab('albums')}>See All</button>}>
          {data.albums.map((a) => cardFor({ type: 'album', data: a }, q))}
        </Shelf>
      )}
      {data.playlists.length > 0 && (
        <Shelf title="Playlists" columns={5} headerExtra={<button type="button" className={s.seeAll} onClick={() => setTab('playlists')}>See All</button>}>
          {data.playlists.map((p) => cardFor({ type: 'playlist', data: p }, q))}
        </Shelf>
      )}
      {data.stations.length > 0 && (
        <Shelf title="Stations" columns={5} headerExtra={<button type="button" className={s.seeAll} onClick={() => setTab('stations')}>See All</button>}>
          {data.stations.map((st) => cardFor({ type: 'station', data: st }, q))}
        </Shelf>
      )}
      <ListenerPreview q={q} onSeeAll={() => setTab('listeners')} />
    </>
  );
}

/** No music matched: listeners may still match (people search by name), otherwise the usual empty state. */
function NoMusicResults({ q }: { q: string }) {
  const { data } = useAsync(q.length >= 2 ? `listeners:${q}` : null, (sig) => api.searchListeners(q, sig));
  if (data?.listeners.length) {
    return (
      <>
        <h1 className="visually-hidden">Search results for “{q}”</h1>
        <section className={s.block} aria-labelledby="listeners-only-title">
          <h2 id="listeners-only-title" className={s.sectionTitle}>Listeners</h2>
          <ListenerList listeners={data.listeners} empty="" />
        </section>
        <p className={s.emptyText}>No music matches “{q}”.</p>
      </>
    );
  }
  return (
    <div className={s.empty} role="status">
      <p className={s.emptyTitle}>No results for “{q}”</p>
      <p className={s.emptyText}>Check the spelling, or try a shorter or different search.</p>
    </div>
  );
}

/** People whose display name matches. Search is the one place to find listeners. */
function ListenerResults({ q }: { q: string }) {
  const { data, error } = useAsync(`listeners:${q}`, (sig) => api.searchListeners(q, sig));
  if (error) return <p className={s.none}>Couldn’t search listeners right now.</p>;
  if (!data) return <div className={s.skelRow} aria-busy="true" />;
  return <ListenerList listeners={data.listeners} empty={`No listeners match “${q}”.`} />;
}

function ListenerPreview({ q, onSeeAll }: { q: string; onSeeAll: () => void }) {
  const { data } = useAsync(q.length >= 2 ? `listeners:${q}` : null, (sig) => api.searchListeners(q, sig));
  if (!data?.listeners.length) return null;
  return (
    <section className={s.block} aria-labelledby="listeners-title">
      <div className={s.rowHead}>
        <h2 id="listeners-title" className={s.sectionTitle}>Listeners</h2>
        {data.listeners.length > 3 && <button type="button" className={s.seeAll} onClick={onSeeAll}>See All</button>}
      </div>
      <ListenerList listeners={data.listeners.slice(0, 3)} empty="" />
    </section>
  );
}

function TabResults({ q, data, tab }: { q: string; data: SearchResults; tab: Exclude<Tab, 'top'> }) {
  const ctx = { type: 'search' as const, id: q, title: `Results for “${q}”` };
  if (tab === 'songs') {
    if (!data.songs.length) return <p className={s.none}>No songs match “{q}”.</p>;
    return <TrackList songs={data.songs} context={ctx} variant="playlist" />;
  }
  const items: ContentItem[] =
    tab === 'artists' ? data.artists.map((a) => ({ type: 'artist' as const, data: a }))
      : tab === 'albums' ? data.albums.map((a) => ({ type: 'album' as const, data: a }))
        : tab === 'playlists' ? data.playlists.map((p) => ({ type: 'playlist' as const, data: p }))
          : data.stations.map((st) => ({ type: 'station' as const, data: st }));
  if (!items.length) return <p className={s.none}>No {TABS.find((t) => t.id === tab)?.label.toLowerCase()} match “{q}”.</p>;
  return <div className={s.grid}>{items.map((item) => cardFor(item, q))}</div>;
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
