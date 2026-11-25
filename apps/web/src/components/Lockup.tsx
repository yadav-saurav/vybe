import { Link, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { ContentItem } from '@vybe/shared';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import { ExplicitBadge } from './Buttons';
import { menuFor, openMenuAt, playItem } from '../features/actions';
import { usePlayer } from '../stores/player';
import s from './Lockup.module.css';

export const hrefFor = (item: ContentItem) =>
  item.type === 'song' ? `/album/${item.data.album.id}?i=${item.data.id}` : `/${item.type}/${item.data.id}`;

export const titleOf = (item: ContentItem) =>
  item.type === 'album' || item.type === 'song' ? item.data.title : item.data.name;

export const subtitleOf = (item: ContentItem) => {
  switch (item.type) {
    case 'album': return item.data.artist.name;
    case 'song': return item.data.artist.name;
    case 'playlist': return item.data.curatorName;
    case 'artist': return 'Artist';
    case 'station': return item.data.tagline;
  }
};

/** Square artwork + title/subtitle with hover play & more buttons (reference "product lockup"). */
export function Lockup({ item, size = 'md', showSubtitle = true, subtitle, titleNode }: { item: ContentItem; size?: 'sm' | 'md' | 'lg'; showSubtitle?: boolean; subtitle?: string; /** Optional rich title (e.g. search highlight); defaults to the plain title. */ titleNode?: ReactNode }) {
  const navigate = useNavigate();
  const isCircle = item.type === 'artist';
  const ctxId = usePlayer((p) => p.context?.id);
  const isPlaying = usePlayer((p) => p.isPlaying) && ctxId === item.data.id;
  const explicit = (item.type === 'album' || item.type === 'song') && item.data.isExplicit;
  return (
    <div className={clsx(s.lockup, s[size], isCircle && s.artist)} onContextMenu={(e) => openMenuAt(e, menuFor(item, { navigate }))}>
      <div className={s.artWrap}>
        <Link to={hrefFor(item)} aria-label={titleOf(item)} className={s.artLink}>
          <Artwork artwork={item.data.artwork} rounded={isCircle ? 'circle' : 'sm'} size={size === 'lg' ? 500 : 300} alt="" />
        </Link>
        {!isCircle && (
          <div className={clsx(s.overlay, isPlaying && s.overlayOn)}>
            <button className={s.play} aria-label={`Play ${titleOf(item)}`} onClick={(e) => { e.preventDefault(); if (isPlaying) usePlayer.getState().pause(); else playItem(item); }}>
              <Icon name={isPlaying ? 'pause' : 'play'} size={16} />
            </button>
            <button className={s.more} aria-label="More" onClick={(e) => openMenuAt(e, menuFor(item, { navigate }))}>
              <Icon name="more" size={16} />
            </button>
          </div>
        )}
      </div>
      <div className={s.meta}>
        <Link to={hrefFor(item)} className={clsx(s.title, 'clamp-1')}>{titleNode ?? titleOf(item)}{explicit && <ExplicitBadge />}</Link>
        {showSubtitle && !isCircle && (
          item.type === 'album' || item.type === 'song'
            ? <Link to={`/artist/${item.data.artist.id}`} className={clsx(s.subtitle, 'clamp-1')}>{subtitle ?? subtitleOf(item)}</Link>
            : <div className={clsx(s.subtitle, 'clamp-1')}>{subtitle ?? subtitleOf(item)}</div>
        )}
      </div>
    </div>
  );
}
