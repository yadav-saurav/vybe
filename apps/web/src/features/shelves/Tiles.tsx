import { Link } from 'react-router-dom';
import type { ContentItem, Shelf } from '@vybe/shared';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { hrefFor, titleOf } from '../../components/Lockup';
import { playItem } from '../actions';
import { artUrl } from '../../lib/color';
import { Track } from './Track';
import { LiveWrap, descriptionOf, keyOf } from './shared';
import s from './Tiles.module.css';

/** Category-style tiles: rounded, coloured with the artwork background and a bold title at the bottom-left. */
export function TilesShelf({ shelf }: { shelf: Shelf }) {
  return (
    <Track title={shelf.title} subtitle={shelf.subtitle} href={shelf.seeAllHref} columns={6}>
      {shelf.items.map((item, i) => (
        <LiveWrap key={keyOf(item, i)} item={item}><Tile item={item} /></LiveWrap>
      ))}
    </Track>
  );
}

function Tile({ item }: { item: ContentItem }) {
  const title = titleOf(item);
  const { artwork } = item.data;
  return (
    <Link to={hrefFor(item)} className={s.tile} aria-label={title} style={{ backgroundColor: artwork.bgColor }}>
      <img className={s.img} src={artUrl(artwork, 400)} alt="" loading="lazy" decoding="async" draggable={false} />
      <span className={s.name}>{title}</span>
    </Link>
  );
}

/** "Made For You" style mixes: big artwork with the name overlaid at the bottom and a description below. */
export function LargeTilesShelf({ shelf }: { shelf: Shelf }) {
  return (
    <Track title={shelf.title} subtitle={shelf.subtitle} href={shelf.seeAllHref} columns={3} variant="large">
      {shelf.items.map((item, i) => <LargeTile key={keyOf(item, i)} item={item} />)}
    </Track>
  );
}

function LargeTile({ item }: { item: ContentItem }) {
  const title = titleOf(item);
  const description = descriptionOf(item);
  return (
    <div className={s.large}>
      <div className={s.art}>
        <Artwork artwork={item.data.artwork} size={500} rounded="lg" />
        <Link to={hrefFor(item)} className={s.cover} aria-label={title} tabIndex={-1} />
        <div className={s.overlay}><span className={s.overlayName}>{title}</span></div>
        <button type="button" className={s.play} aria-label={`Play ${title}`} onClick={() => playItem(item)}>
          <Icon name="play" size={16} />
        </button>
      </div>
      {description && <p className={s.desc}>{description}</p>}
    </div>
  );
}
