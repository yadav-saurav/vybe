import { Link } from 'react-router-dom';
import type { HeroCard as HeroCardData, Shelf } from '@vybe/shared';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { hrefFor, subtitleOf, titleOf } from '../../components/Lockup';
import { playItem } from '../actions';
import { artUrl } from '../../lib/color';
import { Track } from './Track';
import { LiveBadge, isLive } from './shared';
import s from './Hero.module.css';

/** Large editorial cards, two per viewport on desktop. Falls back to plain items when no heroCards are sent. */
export function HeroShelf({ shelf }: { shelf: Shelf }) {
  const cards: HeroCardData[] = shelf.heroCards?.length
    ? shelf.heroCards
    : shelf.items.map((item) => ({ eyebrow: '', title: titleOf(item), subtitle: subtitleOf(item) ?? '', caption: '', item }));
  if (!cards.length) return null;
  return (
    <Track label={shelf.title} columns={2} variant="hero">
      {cards.map((card, i) => <HeroCard key={`${card.item.type}:${card.item.data.id}:${i}`} card={card} />)}
    </Track>
  );
}

function HeroCard({ card }: { card: HeroCardData }) {
  const { item } = card;
  const href = hrefFor(item);
  const { artwork } = item.data;
  return (
    <article className={s.card}>
      <div className={s.heading}>
        {card.eyebrow && <p className={s.eyebrow}>{card.eyebrow}</p>}
        <h3 className={s.title}><Link to={href}>{card.title}</Link></h3>
        {card.subtitle && <p className={s.subtitle}>{card.subtitle}</p>}
      </div>
      <div className={s.art} style={{ backgroundColor: artwork.bgColor }}>
        <div className={s.bg} aria-hidden="true"><img src={artUrl(artwork, 400)} alt="" decoding="async" draggable={false} /></div>
        <div className={s.scrim} aria-hidden="true" />
        {card.caption && <p className={s.caption}>{card.caption}</p>}
        <div className={s.square}><Artwork artwork={artwork} size={300} rounded="sm" /></div>
        {isLive(item) && <LiveBadge />}
        <Link to={href} className={s.cover} aria-label={card.title} tabIndex={-1} />
        <button
          type="button"
          className={s.play}
          aria-label={`Play ${card.title}`}
          onClick={(e) => { e.preventDefault(); playItem(item); }}
        >
          <Icon name="play" size={20} />
        </button>
      </div>
    </article>
  );
}
