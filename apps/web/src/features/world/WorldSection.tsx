import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Artwork } from '@vybe/shared';
import { api, type WorldHome } from '../../lib/api';
import { Icon } from '../../components/Icon';
import { AmbientGlow } from './Ambient';
import { ShelfSkeleton, WorldShelfView } from './WorldShelves';
import { WORLD_PATH } from '../../lib/world';
import { useAuth } from '../../stores/auth';
import s from './WorldSection.module.css';

/**
 * Famous songs for any page: rows of worldwide shelves (with the ambient glow) above the page's own
 * content. `source` is 'home' or a section name ('new', 'radio', 'genre/pop'). Polls while the
 * server is still gathering shelves after a cold start. Renders nothing if Apple can't be reached.
 */
/** Last answer per source, so returning to a page paints immediately while it refreshes. */
const lastSeen = new Map<string, WorldHome>();

export function WorldSection({ source, only, more = true, glow: withGlow = true }: { source: string; only?: string[]; more?: boolean; glow?: boolean }) {
  const userId = useAuth((a) => a.user?.id ?? 'anon');
  const memoKey = `${source}:${userId}`; // Home differs for signed-in and signed-out listeners
  const [data, setData] = useState<WorldHome | null>(() => lastSeen.get(memoKey) ?? null);
  const [failed, setFailed] = useState(false);
  const [light, setLight] = useState<Artwork | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    setData(lastSeen.get(memoKey) ?? null); setFailed(false);
    const load = () => (source === 'home' ? api.worldHome(ctl.signal) : api.worldSection(source, ctl.signal)).then((h) => {
      setData(h);
      lastSeen.set(memoKey, h);
      const have = only ? only.filter((id) => h.shelves.some((x) => x.id === id)).length : h.shelves.length;
      if (!h.complete && (!only || have < only.length) && ++tries < 24) timer = setTimeout(load, 5000);
    }).catch(() => { if (!ctl.signal.aborted) setFailed(true); });
    load();
    return () => { ctl.abort(); clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, memoKey]);

  const shelves = (only ? only.map((id) => data?.shelves.find((x) => x.id === id)) : data?.shelves ?? []).filter((x) => !!x);
  if (failed && !shelves.length) return null; // the page's own content still works without Apple
  if (data?.complete && !shelves.length) return null;
  const firstArt = shelves[0]?.songs[0]?.artwork ?? shelves[0]?.stations?.[0]?.artwork ?? shelves[0]?.artists[0]?.artwork ?? null;

  return (
    <div className={s.world}>
      {withGlow && <AmbientGlow artwork={light ?? firstArt} />}
      {shelves.length === 0 ? (
        <>
          <ShelfSkeleton />
          <p className={s.note} role="status">Gathering the world’s hits… this takes a moment the first time.</p>
        </>
      ) : shelves.map((sh) => <WorldShelfView key={sh.id} shelf={sh} onLight={withGlow ? setLight : undefined} />)}
      {more && (
        <Link to={WORLD_PATH} className={s.more}>
          <Icon name="globe" size={18} />
          <span><b>More from around the world</b><span>Charts for 24 countries, South Indian hits, K-Pop and any artist on earth</span></span>
          <Icon name="chevron-right" size={18} />
        </Link>
      )}
    </div>
  );
}
