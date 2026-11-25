import type { Shelf as ShelfData } from '@vybe/shared';
import { Shelf } from '../../components/Shelf';
import { Lockup } from '../../components/Lockup';
import { HeroShelf } from './Hero';
import { SongChartShelf } from './Chart';
import { LargeTilesShelf, TilesShelf } from './Tiles';
import { FriendsShelf } from './Friends';
import { Track } from './Track';
import { LiveWrap, keyOf } from './shared';

/** Renders one shelf of a page response by its `layout`. Renders nothing for an empty shelf. */
export function ShelfRenderer({ shelf }: { shelf: ShelfData }) {
  if (!shelf.items.length && !shelf.heroCards?.length && !shelf.friendCards?.length) return null;
  switch (shelf.layout) {
    case 'hero': return <HeroShelf shelf={shelf} />;
    case 'friends': return <FriendsShelf shelf={shelf} />;
    case 'song-list': return <SongChartShelf shelf={shelf} />;
    case 'tiles': return <TilesShelf shelf={shelf} />;
    case 'large-tiles': return <LargeTilesShelf shelf={shelf} />;
    case 'circle-artists': return <CircleShelf shelf={shelf} />;
    case 'grid-lockups':
    default: return <LockupShelf shelf={shelf} />;
  }
}

function LockupShelf({ shelf }: { shelf: ShelfData }) {
  return (
    <Shelf title={shelf.title} href={shelf.seeAllHref} columns={5}>
      {shelf.items.map((item, i) => (
        <LiveWrap key={keyOf(item, i)} item={item}><Lockup item={item} /></LiveWrap>
      ))}
    </Shelf>
  );
}

function CircleShelf({ shelf }: { shelf: ShelfData }) {
  return (
    <Track title={shelf.title} subtitle={shelf.subtitle} href={shelf.seeAllHref} columns={6}>
      {shelf.items.map((item, i) => <Lockup key={keyOf(item, i)} item={item} />)}
    </Track>
  );
}
