import { type CSSProperties } from 'react';
import clsx from 'clsx';
import type { PageResponse, Shelf } from '@vybe/shared';
import { PillButton } from '../../components/Buttons';
import { ShelfRenderer } from './ShelfRenderer';
import { Track } from './Track';
import s from './PageBody.module.css';

/**
 * Body of a page built from a PageResponse: shelves, or a skeleton while loading, an error with "Try Again",
 * or an empty message when nothing is left after filtering.
 */
export function PageBody({ data, error, loading, onRetry, emptyMessage = 'Nothing to show yet.', pageKey }: {
  data?: PageResponse; error?: Error; loading: boolean; onRetry: () => void; emptyMessage?: string;
  /** Enables "See All" links: "home" | "new" | "radio" | "genre:<id>". */
  pageKey?: string;
}) {
  if (!data) return error && !loading ? <ErrorState onRetry={onRetry} /> : <PageSkeleton />;
  const shelves = data.shelves.filter((shelf) => shelf.items.length > 0 || (shelf.heroCards?.length ?? 0) > 0);
  if (!shelves.length) return <EmptyState message={emptyMessage} />;
  return (
    <div className={s.body} aria-busy={loading || undefined}>
      {shelves.map((shelf) => <ShelfRenderer key={shelf.id} shelf={pageKey ? withSeeAll(shelf, pageKey) : shelf} />)}
    </div>
  );
}

/** Grey shimmering block. Size and shape come from the caller's className. */
/** Items that fit in one visible row per layout; longer shelves get a "See All" link. */
const ROW_CAPACITY: Partial<Record<Shelf['layout'], number>> = { 'grid-lockups': 5, 'circle-artists': 6, 'song-list': 12, 'large-tiles': 3 };

function withSeeAll(shelf: Shelf, pageKey: string): Shelf {
  const cap = ROW_CAPACITY[shelf.layout];
  if (shelf.seeAllHref || !cap || shelf.items.length <= cap) return shelf;
  return { ...shelf, seeAllHref: `/see-all/${encodeURIComponent(pageKey)}/${encodeURIComponent(shelf.id)}` };
}

export function Skel({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" className={clsx(s.skel, className)} style={style} />;
}

export function ErrorState({ onRetry, title = "Couldn't load this page", message = 'Check your connection and try again.' }: {
  onRetry: () => void; title?: string; message?: string;
}) {
  return (
    <div className={s.error} role="alert">
      <p className={s.errorTitle}>{title}</p>
      <p className={s.errorText}>{message}</p>
      <PillButton variant="soft" onClick={onRetry}>Try Again</PillButton>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className={s.empty}>{message}</p>;
}

/** Layout-matched loading state: a hero row, two lockup shelves and a song chart. */
export function PageSkeleton() {
  return (
    <div className={s.body} role="status" aria-live="polite">
      <span className="visually-hidden">Loading</span>
      <Track columns={2} variant="hero">
        {[0, 1].map((i) => (
          <div key={i} className={s.heroCol}>
            <Skel className={s.heroEyebrow} />
            <Skel className={s.heroTitle} />
            <Skel className={s.heroArt} />
          </div>
        ))}
      </Track>
      <Skel className={s.head} />
      <Track columns={5}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={s.lockup}>
            <Skel className={s.square} />
            <Skel className={s.line} />
            <Skel className={s.line2} />
          </div>
        ))}
      </Track>
      <Skel className={s.head} />
      <Track columns={3} variant="chart">
        {Array.from({ length: 6 }, (_, c) => (
          <div key={c} className={s.chartCol}>
            {Array.from({ length: 4 }, (_, r) => (
              <div key={r} className={s.chartRow}>
                <Skel className={s.chartArt} />
                <div className={s.chartMeta}>
                  <Skel className={s.line} />
                  <Skel className={s.line2} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </Track>
    </div>
  );
}
