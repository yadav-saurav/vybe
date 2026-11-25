import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type PublicProfile } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { useAuth } from '../../stores/auth';
import { useUI } from '../../stores/ui';
import { Lockup } from '../../components/Lockup';
import { PillButton } from '../../components/Buttons';
import { ErrorState, Skel } from '../../features/shelves/PageBody';
import { useDocumentTitle } from '../../features/shelves/useDocumentTitle';
import s from './Profile.module.css';

/** Public listener profile: avatar, counts, follow, public playlists. */
export default function ProfilePage() {
  const { id = '' } = useParams();
  const viewer = useAuth((a) => a.user?.id ?? 'anon');
  const { data, error, reload } = useAsync(`profile:${id}:${viewer}`, (sig) => api.userProfile(id, sig));
  const [override, setOverride] = useState<PublicProfile | null>(null);
  const p = override?.user.id === id ? override : data;
  useDocumentTitle(p?.user.displayName ?? 'Profile');

  if (error) return <div className="page"><header className="page-header" /><ErrorState title="This listener isn't available" onRetry={reload} /></div>;
  if (!p) return <div className="page" aria-busy="true"><div className={s.head}><Skel className={s.skelAvatar} /><Skel className={s.skelName} /></div></div>;

  const toggleFollow = async () => {
    if (viewer === 'anon') { useUI.getState().openSignIn(); return; }
    try { setOverride(await (p.isFollowing ? api.unfollow(id) : api.follow(id))); }
    catch { useUI.getState().toast('Something went wrong'); }
  };
  const publicCount = p.playlists.filter((pl) => pl.isPublic).length;
  const since = new Date(p.user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="page">
      <header className={s.head}>
        <span className={s.avatar} style={{ background: p.user.avatarColor }}>{p.user.displayName.slice(0, 1).toUpperCase()}</span>
        <div className={s.meta}>
          <p className={s.eyebrow}>Profile</p>
          <h1 className={s.name}>{p.user.displayName}</h1>
          <p className={s.counts}>
            <b>{publicCount}</b> public playlist{publicCount === 1 ? '' : 's'} · <b>{p.followers}</b> follower{p.followers === 1 ? '' : 's'} · <b>{p.following}</b> following · on Vybe since {since}
          </p>
          <div className={s.actions}>
            {p.isMe
              ? <Link to="/settings" className={s.editLink}>Edit Profile</Link>
              : <PillButton variant={p.isFollowing ? 'soft' : 'key'} onClick={toggleFollow}>{p.isFollowing ? 'Following' : 'Follow'}</PillButton>}
            <button className={s.share} onClick={() => { navigator.clipboard?.writeText(location.href); useUI.getState().toast('Link Copied'); }}>Share</button>
          </div>
        </div>
      </header>
      <section>
        <h2 className="t-title-3">{p.isMe ? 'Your Playlists' : 'Public Playlists'}</h2>
        {p.playlists.length ? (
          <div className={s.grid}>{p.playlists.map((pl) => <Lockup key={pl.id} item={{ type: 'playlist', data: pl }} />)}</div>
        ) : (
          <p className="t-2" style={{ marginTop: 8 }}>{p.isMe ? 'Playlists you make public appear here. Turn on “Show on my profile” when editing a playlist.' : 'No public playlists yet.'}</p>
        )}
      </section>
    </div>
  );
}
