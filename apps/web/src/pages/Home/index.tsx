import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { useUI } from '../../stores/ui';
import { LyricsDemo } from '../../features/world/LyricsDemo';
import { useAuth } from '../../stores/auth';
import { useDocumentTitle } from '../../features/shelves/useDocumentTitle';
import { WorldSection } from '../../features/world/WorldSection';
import s from './Home.module.css';

const greetingFor = (name: string) => {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${name}`;
};

export default function HomePage() {
  const user = useAuth((a) => a.user);
  const ready = useAuth((a) => a.ready);
  useDocumentTitle('Home');

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="t-large-title">{user ? greetingFor(user.displayName) : 'Home'}</h1>
        {!user && ready && <p className={s.greeting}>Trending songs, popular artists and top charts from India and around the world. <button className={s.signIn} onClick={() => useUI.getState().openSignIn()}>Sign in</button> for the full experience.</p>}
      </header>
      {/* Remount on sign-in/out: signed-in listeners get the full home. */}
      {ready && <WorldSection key={user?.id ?? 'anon'} source="home" more={false} />}
      <LyricsDemo />
      {user && <ReplayCard userId={user.id} />}
    </div>
  );
}

/** Last Home row: a one-line summary of this year's listening that links to the full Replay page. */
function ReplayCard({ userId }: { userId: string }) {
  const { data } = useAsync(`replay-card:${userId}`, (sig) => api.stats('year', sig));
  if (!data || data.plays === 0) return null;
  const top = data.topArtists[0];
  return (
    <section className={s.replay} aria-labelledby="replay-card-title">
      <h2 id="replay-card-title" className={s.replayTitle}>Your Replay</h2>
      <Link to="/replay" className={s.replayCard} style={{ ['--replay' as string]: top?.artist?.artwork.bgColor ?? 'var(--key)' }}>
        <span className={s.replayBig}>{Math.round(data.totalMs / 60000).toLocaleString()}</span>
        <span className={s.replayText}>
          <b>minutes this year</b>
          <span>{top ? `Top artist: ${top.name}` : ''}{data.longestStreakDays > 1 ? ` · ${data.longestStreakDays}-day streak` : ''}</span>
        </span>
        <span className={s.replayCta}>See your Replay</span>
      </Link>
    </section>
  );
}
