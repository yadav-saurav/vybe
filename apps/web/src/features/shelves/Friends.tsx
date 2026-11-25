import { Link } from 'react-router-dom';
import type { Shelf as ShelfData } from '@vybe/shared';
import { Lockup } from '../../components/Lockup';
import { Track } from './Track';
import s from './Friends.module.css';

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
};

/** "Friends Are Listening": who you follow and the last song they shared, one card each. */
export function FriendsShelf({ shelf }: { shelf: ShelfData }) {
  const cards = shelf.friendCards ?? [];
  return (
    <Track title={shelf.title} columns={5}>
      {cards.map((c) => (
        <div key={c.userId} className={s.card}>
          <Link to={`/profile/${c.userId}`} className={s.who}>
            <span className={s.avatar} style={{ background: c.avatarColor }}>{c.displayName.slice(0, 1).toUpperCase()}</span>
            <span className={s.text}><b className="clamp-1">{c.displayName}</b><span className="clamp-1">{ago(c.playedAt)}</span></span>
          </Link>
          <Lockup item={c.item} />
        </div>
      ))}
    </Track>
  );
}
