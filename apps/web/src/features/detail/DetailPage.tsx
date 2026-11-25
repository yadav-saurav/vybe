import { useEffect, type ReactNode, type Ref } from 'react';
import clsx from 'clsx';
import type { Artwork as Art } from '@vybe/shared';
import { formatLongDuration } from '@vybe/shared';
import { ApiError } from '../../lib/api';
import { tintVars } from '../../lib/color';
import { useUI } from '../../stores/ui';
import { formatLongDate, pluralSongs } from './format';
import s from './DetailPage.module.css';

/**
 * Page wrapper for album and playlist pages. The tinted background covers the full width of the
 * scroll region; the inner .page keeps the content gutter and max width.
 */
export function DetailPage({ artwork, children, pageRef }: { artwork?: Art; children: ReactNode; pageRef?: Ref<HTMLDivElement> }) {
  usePageTint(artwork);
  return (
    <div ref={pageRef} className={clsx(artwork && 'tinted', s.wrap)} style={tintVars(artwork)}>
      <div className="page">{children}</div>
    </div>
  );
}

/** Footer meta block under the track list: release date, length, copyright and label. */
export function DetailFooter({ releaseDate, trackCount, durationMs, copyright, recordLabel }: {
  releaseDate?: string; trackCount: number; durationMs: number; copyright?: string; recordLabel?: string;
}) {
  return (
    <footer className={s.footer}>
      <p>{releaseDate && `${formatLongDate(releaseDate)} · `}{pluralSongs(trackCount)}, {formatLongDuration(durationMs)}</p>
      {copyright && <p>{copyright}</p>}
      {recordLabel && <p>{recordLabel}</p>}
    </footer>
  );
}

/** Loading placeholder shaped like a detail header and a short track list. */
export function DetailSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <div className={s.skelHeader}>
        <div className={clsx(s.skel, s.skelArt)} />
        <div className={s.skelText}>
          <div className={clsx(s.skel, s.skelLine, s.w60)} />
          <div className={clsx(s.skel, s.skelLine, s.w40)} />
          <div className={clsx(s.skel, s.skelLine, s.w25)} />
          <div className={clsx(s.skel, s.skelBlock)} />
          <div className={clsx(s.skel, s.skelPill)} />
        </div>
      </div>
      <div className={s.skelRows}>
        {Array.from({ length: 8 }, (_, i) => <div key={i} className={clsx(s.skel, s.skelRow)} />)}
      </div>
    </div>
  );
}

/** 404 state, or a retryable error for everything else. */
export function DetailError({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className={clsx('page', s.state)}>
        <h1 className="t-title-1">{"This content isn't available."}</h1>
        <p className="t-2">The link may be broken or the content has been removed.</p>
      </div>
    );
  }
  return (
    <div className={clsx('page', s.state)} role="alert">
      <h1 className="t-title-1">Something went wrong</h1>
      <p className="t-2">We couldn't load this page.</p>
      {onRetry && <button className={s.retry} onClick={onRetry}>Try again</button>}
    </div>
  );
}

/** Tint the app shell (sidebar, mobile header, player chrome) with this page's artwork palette while mounted. */
export function usePageTint(artwork?: Art) {
  const setPageTint = useUI((u) => u.setPageTint);
  useEffect(() => { setPageTint(artwork ?? null); }, [artwork, setPageTint]);
  useEffect(() => () => setPageTint(null), [setPageTint]);
}
