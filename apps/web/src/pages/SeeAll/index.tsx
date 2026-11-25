import { useParams, Link } from 'react-router-dom';
import type { PageResponse, Song } from '@vybe/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { useAuth } from '../../stores/auth';
import { Lockup } from '../../components/Lockup';
import { TrackList } from '../../components/TrackList';
import { Icon } from '../../components/Icon';
import { ErrorState, Skel } from '../../features/shelves/PageBody';
import { useDocumentTitle } from '../../features/shelves/useDocumentTitle';
import { keyOf } from '../../features/shelves/shared';
import s from './SeeAll.module.css';

const PAGE_LABEL: Record<string, string> = { home: 'Home', new: 'New', radio: 'Radio' };

/** Loads the page a shelf belongs to: "home" | "new" | "radio" | "genre:<id>". */
const loadPage = (page: string, signal: AbortSignal): Promise<PageResponse> =>
  page.startsWith('genre:') ? api.genre(page.slice(6), signal) : api.page(page as 'home' | 'new' | 'radio', signal);

const backHref = (page: string) => (page.startsWith('genre:') ? `/genre/${page.slice(6)}` : `/${page}`);

/** "See All" for one shelf: the full list as a grid of lockups, or a track list for song charts. */
export default function SeeAllPage() {
  const { page = '', shelfId = '' } = useParams();
  const userId = useAuth((a) => a.user?.id ?? 'anon');
  const { data, error, reload } = useAsync(`seeall:${page}:${userId}`, (signal) => loadPage(page, signal));
  const shelf = data?.shelves.find((sh) => sh.id === shelfId);
  useDocumentTitle(shelf?.title ?? 'See All');

  const back = (
    <Link to={backHref(page)} className={s.back}>
      <Icon name="chevron-left" size={14} />{PAGE_LABEL[page] ?? data?.title ?? 'Back'}
    </Link>
  );

  if (error) return <div className="page"><header className="page-header">{back}</header><ErrorState onRetry={reload} /></div>;
  if (!data) {
    return (
      <div className="page" aria-busy="true">
        <header className="page-header"><Skel className={s.skelTitle} /></header>
        <div className={s.grid}>{Array.from({ length: 10 }, (_, i) => <Skel key={i} className={s.skelTile} />)}</div>
      </div>
    );
  }
  if (!shelf) {
    return <div className="page"><header className="page-header">{back}<h1 className="t-large-title">Not found</h1></header><p className="t-2">This section is no longer available.</p></div>;
  }

  const items = shelf.items;
  const songs = items.every((i) => i.type === 'song') ? items.map((i) => i.data as Song) : null;
  return (
    <div className="page">
      <header className="page-header">
        {back}
        <h1 className="t-large-title">{shelf.title}</h1>
        {shelf.subtitle && <p className="t-2">{shelf.subtitle}</p>}
      </header>
      {songs ? (
        <TrackList songs={songs} variant="playlist" context={{ type: 'queue', title: shelf.title }} />
      ) : (
        <div className={shelf.layout === 'circle-artists' ? s.circleGrid : s.grid}>
          {items.map((item, i) => <Lockup key={keyOf(item, i)} item={item} size="lg" />)}
        </div>
      )}
    </div>
  );
}
