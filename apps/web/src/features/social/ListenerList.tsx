import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ListenerCard } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { useUI } from '../../stores/ui';
import s from './ListenerList.module.css';

/** A listener with a Follow button. Used by Search → Listeners and profile follower lists. */
export function ListenerRow({ listener, onNavigate }: { listener: ListenerCard; onNavigate?: () => void }) {
  const [following, setFollowing] = useState(listener.isFollowing);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (!useAuth.getState().user) { useUI.getState().openSignIn(); return; }
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try { await (next ? api.follow(listener.id) : api.unfollow(listener.id)); }
    catch { setFollowing(!next); useUI.getState().toast('Something went wrong'); }
    finally { setBusy(false); }
  };
  return (
    <li className={s.row}>
      <Link to={`/profile/${listener.id}`} className={s.who} onClick={onNavigate}>
        <span className={s.avatar} style={{ background: listener.avatarColor }} aria-hidden>{listener.displayName.slice(0, 1).toUpperCase()}</span>
        <span className="clamp-1">{listener.displayName}{listener.isMe && <span className={s.you}> (you)</span>}</span>
      </Link>
      {!listener.isMe && (
        <button className={following ? s.following : s.follow} onClick={toggle} disabled={busy} aria-pressed={following}
          aria-label={`${following ? 'Unfollow' : 'Follow'} ${listener.displayName}`}>
          {following ? 'Following' : 'Follow'}
        </button>
      )}
    </li>
  );
}

export function ListenerList({ listeners, empty, onNavigate }: { listeners: ListenerCard[]; empty: string; onNavigate?: () => void }) {
  if (!listeners.length) return <p className={s.empty}>{empty}</p>;
  return <ul className={s.list}>{listeners.map((l) => <ListenerRow key={l.id} listener={l} onNavigate={onNavigate} />)}</ul>;
}
