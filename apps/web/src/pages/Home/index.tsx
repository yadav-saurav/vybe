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
    </div>
  );
}
