import type { ReactNode } from 'react';
import type { ContentItem } from '@vybe/shared';
import s from './shared.module.css';

/** A station is live when its kind is `live`; live stations get a LIVE pill on every shelf surface. */
export const isLive = (item: ContentItem) => item.type === 'station' && item.data.kind === 'live';

/** Secondary line for large tiles. */
export function descriptionOf(item: ContentItem): string {
  switch (item.type) {
    case 'playlist': return item.data.shortDescription || item.data.description;
    case 'album': return item.data.editorialNotes;
    case 'station': return item.data.tagline;
    case 'artist': return item.data.origin;
    case 'song': return item.data.artist.name;
  }
}

export const keyOf = (item: ContentItem, i: number) => `${item.type}:${item.data.id}:${i}`;

export function LiveBadge() {
  return <span className={s.live}>Live</span>;
}

/** Positions the LIVE pill over the top-left corner of a lockup or tile. */
export function LiveWrap({ item, children }: { item: ContentItem; children: ReactNode }) {
  if (!isLive(item)) return <>{children}</>;
  return <div className={s.wrap}>{children}<LiveBadge /></div>;
}
