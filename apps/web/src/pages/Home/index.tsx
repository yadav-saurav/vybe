import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { useAuth } from '../../stores/auth';
import { PageBody } from '../../features/shelves/PageBody';
import { useDocumentTitle } from '../../features/shelves/useDocumentTitle';
import s from './Home.module.css';

const greetingFor = (name: string) => {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${name}`;
};

export default function HomePage() {
  const user = useAuth((a) => a.user);
  const ready = useAuth((a) => a.ready);
  // Wait for the session check; the key includes the user so signing in or out refetches the personalised page.
  const key = ready ? `page:home:${user?.id ?? 'anon'}` : null;
  const { data, error, loading, reload } = useAsync(key, (signal) => api.page('home', signal));
  useDocumentTitle('Home');

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="t-large-title">Home</h1>
        {user && <p className={s.greeting}>{greetingFor(user.displayName)}</p>}
      </header>
      <PageBody pageKey="home" data={data} error={error} loading={loading || !ready} onRetry={reload} emptyMessage="Nothing for you yet. Play a few songs to get started." />
      {user && data && <ReplayCard userId={user.id} />}
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
