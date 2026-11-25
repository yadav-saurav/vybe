import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import type { Artwork } from '@vybe/shared';
import { api, ApiError, type WorldHome, type WorldList } from '../../lib/api';
import { Icon } from '../../components/Icon';
import { usePlayer } from '../../stores/player';
import { WorldRows, WorldSkeleton } from '../../features/world/WorldRows';
import { WORLD_COUNTRIES as COUNTRIES, worldDefaultCountry as defaultCountry, rememberWorldCountry } from '../../lib/world';
import { AmbientGlow } from '../../features/world/Ambient';
import { ShelfSkeleton, WorldShelfView } from '../../features/world/WorldShelves';
import s from './World.module.css';

/** Scenes from around the world: each runs a worldwide search in the storefront where it's biggest. */
const SCENES: { label: string; term: string; c: string }[] = [
  { label: 'Bollywood', term: 'bollywood hits', c: 'in' }, { label: 'Punjabi', term: 'punjabi', c: 'in' },
  { label: 'K-Pop', term: 'k-pop', c: 'us' }, { label: 'J-Pop', term: 'j-pop', c: 'us' }, // English terms find nothing in the KR/JP stores
  { label: 'Latin', term: 'latin pop', c: 'mx' }, { label: 'Reggaeton', term: 'reggaeton', c: 'us' },
  { label: 'Afrobeats', term: 'afrobeats', c: 'ng' }, { label: 'Arabic', term: 'arabic pop', c: 'ae' },
  { label: 'Hip-Hop', term: 'hip hop', c: 'us' }, { label: 'Pop', term: 'pop hits', c: 'us' },
  { label: 'Rock', term: 'rock classics', c: 'gb' }, { label: 'EDM', term: 'edm', c: 'us' },
  { label: 'R&B', term: 'r&b', c: 'us' }, { label: 'Jazz', term: 'jazz', c: 'us' },
  { label: 'Classical', term: 'classical', c: 'de' }, { label: 'Country', term: 'country', c: 'us' },
];
/** Worldwide: famous songs from every country as 30-second previews (Apple's iTunes catalogue). */
export default function WorldPage() {
  const [params, setParams] = useSearchParams();
  const { cc } = useParams();
  const q = (params.get('q') ?? '').trim();
  const country = cc ?? params.get('c') ?? defaultCountry();
  // Home (shelves) until you search or pick a country; then a ranked list.
  const listMode = q.length >= 2 || params.has('c') || !!cc;
  const [home, setHome] = useState<WorldHome | null>(null);
  const [homeError, setHomeError] = useState(false);
  const [glow, setGlow] = useState<Artwork | null>(null);
  const [field, setField] = useState(q);
  const [data, setData] = useState<WorldList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { setField(q); }, [q]);
  // Home shelves: the server fills them in the background after a cold start, so poll until complete.
  useEffect(() => {
    if (listMode) return;
    const ctl = new AbortController();
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => api.worldHome(ctl.signal).then((h) => {
      setHome(h); setHomeError(false);
      if (!h.complete && ++tries < 24) timer = setTimeout(load, 5000);
    }).catch(() => { if (!ctl.signal.aborted) setHomeError(true); });
    load();
    return () => { ctl.abort(); clearTimeout(timer); };
  }, [listMode, retry]);
  const heroArt = home?.shelves.find((x) => x.kind === 'hero')?.songs[0]?.artwork ?? home?.shelves[0]?.songs[0]?.artwork ?? null;

  useEffect(() => {
    if (!listMode) return;
    const ctl = new AbortController();
    setLoading(true); setError(null);
    (q.length >= 2 ? api.worldSearch(q, country, ctl.signal) : api.worldChart(country, ctl.signal))
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => {
        if (ctl.signal.aborted) return;
        setError(e instanceof ApiError ? e.message : 'Couldn’t reach worldwide music. Check your connection.'); setLoading(false);
      });
    return () => ctl.abort();
  }, [q, country, retry, listMode]);

  const go = (next: { q?: string; c?: string }) => {
    const p = new URLSearchParams();
    const nq = next.q ?? q, nc = next.c ?? country;
    if (nq) p.set('q', nq);
    p.set('c', nc);
    setParams(p);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); go({ q: field.trim() }); input.current?.blur(); };
  const pickCountry = (c: string) => { rememberWorldCountry(c); go({ c }); };
  const countryName = COUNTRIES.find((c) => c.code === country)?.name ?? country.toUpperCase();
  const songs = data?.songs ?? [];
  const playAll = (shuffle?: boolean) => songs.length && usePlayer.getState().playSongs(songs, 0, { type: 'queue', title: data?.title ?? 'Worldwide' }, { shuffle });

  if (!listMode) return <Navigate to="/home" replace />; // the worldwide home is Home now
  return (
    <div className={`page ${s.page}`}>
      <AmbientGlow artwork={listMode ? songs[0]?.artwork : glow ?? heroArt} />
      <header className={`page-header ${s.header}`}>
        <p className={s.eyebrow}><Icon name="globe" size={14} />Worldwide</p>
        <h1 className={s.title}>Music from around the world</h1>
        <p className={s.sub}>Famous artists and top charts from every country.</p>
      </header>

      <form className={s.searchRow} role="search" onSubmit={submit}>
        <label className={s.field}>
          <Icon name="search" size={16} />
          <span className="visually-hidden">Search worldwide</span>
          <input ref={input} type="search" value={field} onChange={(e) => setField(e.target.value)} placeholder="Any artist or song in the world" enterKeyHint="search" />
        </label>
        <label className={s.country}>
          <span className="visually-hidden">Country</span>
          <select value={country} onChange={(e) => pickCountry(e.target.value)}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <Icon name="chevron-down" size={14} />
        </label>
      </form>

      <div className={s.scenes} role="list" aria-label="Scenes">
        {listMode && <button role="listitem" className={s.scene} onClick={() => setParams(new URLSearchParams())}><Icon name="close" size={12} />For You</button>}
        {SCENES.map((x) => (
          <button role="listitem" key={x.label} className={clsx(s.scene, q === x.term && s.sceneOn)} onClick={() => { go({ q: x.term, c: x.c }); }}>{x.label}</button>
        ))}
      </div>

      {!listMode && (
        <div className={s.shelves} aria-busy={!home?.complete}>
          {home?.shelves.map((sh) => <WorldShelfView key={sh.id} shelf={sh} onLight={setGlow} />)}
          {homeError && !home?.shelves.length ? (
            <div className={s.state}><p>Couldn’t reach worldwide music right now.</p><button className={s.secondary} onClick={() => setRetry((n) => n + 1)}>Try Again</button></div>
          ) : !home?.complete && (
            <>
              <ShelfSkeleton />
              {!home?.shelves.length && <ShelfSkeleton round />}
              <p className={s.loadingNote} role="status">{home?.shelves.length ? 'Loading more from around the world…' : 'Gathering the world’s hits… this takes a moment the first time.'}</p>
            </>
          )}
        </div>
      )}

      {listMode && <section aria-busy={loading} aria-labelledby="world-list-title">
        <div className={s.listHead}>
          <h2 id="world-list-title" className={s.listTitle}>{q ? `“${q}” in ${countryName}` : `Top Songs in ${countryName}`}</h2>
          {songs.length > 0 && (
            <div className={s.actions}>
              <button className={s.primary} onClick={() => playAll()}><Icon name="play" size={14} />Play</button>
              <button className={s.secondary} onClick={() => playAll(true)}><Icon name="shuffle" size={14} />Shuffle</button>
            </div>
          )}
        </div>
        {loading && !data ? <WorldSkeleton />
          : error ? (
            <div className={s.state}><p>{error}</p><button className={s.secondary} onClick={() => setRetry((n) => n + 1)}>Try Again</button></div>
          ) : songs.length === 0 ? (
            <div className={s.state}><p>{q ? `No songs found for “${q}” in ${countryName}. Try another spelling or country.` : 'No chart for this country right now.'}</p></div>
          ) : (
            <WorldRows songs={songs} ranked={!q} title={data?.title ?? 'Worldwide'} stale={loading} />
          )}
      </section>}
    </div>
  );
}
