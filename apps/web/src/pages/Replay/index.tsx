import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { api, type ReplayStats } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { useAuth } from '../../stores/auth';
import { useUI } from '../../stores/ui';
import { usePlayer } from '../../stores/player';
import { Artwork } from '../../components/Artwork';
import { TrackList } from '../../components/TrackList';
import { PillButton } from '../../components/Buttons';
import { Skel, ErrorState } from '../../features/shelves/PageBody';
import { useDocumentTitle } from '../../features/shelves/useDocumentTitle';
import s from './Replay.module.css';

type Period = 'week' | 'month' | 'year' | 'all';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'This Week' }, { id: 'month', label: 'This Month' }, { id: 'year', label: 'This Year' }, { id: 'all', label: 'All Time' },
];
const minutes = (ms: number) => Math.round(ms / 60000).toLocaleString();
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Replay: your listening, summarised (Vybe's take on year-in-review stats). */
export default function ReplayPage() {
  useDocumentTitle('Replay');
  const user = useAuth((a) => a.user);
  const ready = useAuth((a) => a.ready);
  const [period, setPeriod] = useState<Period>('year');
  const { data, error, reload } = useAsync(user ? `replay:${user.id}:${period}` : null, (sig) => api.stats(period, sig));

  if (ready && !user) {
    return (
      <div className="page"><header className="page-header"><h1 className="t-large-title">Replay</h1></header>
        <div className={s.signedOut}>
          <p className="t-2">Sign in to see your top songs, artists and listening time.</p>
          <PillButton onClick={() => useUI.getState().openSignIn()}>Sign In</PillButton>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="t-large-title">Replay</h1>
        <div className={s.tabs} role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.id} role="tab" aria-selected={period === p.id} className={clsx(s.tab, period === p.id && s.tabOn)} onClick={() => setPeriod(p.id)}>{p.label}</button>
          ))}
        </div>
      </header>
      {error ? <ErrorState onRetry={reload} /> : !data ? <ReplaySkeleton /> : data.plays === 0 ? <Empty /> : <ReplayBody data={data} period={period} name={user?.displayName ?? ''} />}
    </div>
  );
}

function ReplayBody({ data, period, name }: { data: ReplayStats; period: Period; name: string }) {
  const top = data.topArtists[0];
  const label = PERIODS.find((p) => p.id === period)!.label.toLowerCase();
  const songs = data.topSongs.map((t) => t.song);
  const maxHour = Math.max(1, ...data.byHour);
  const maxDay = Math.max(1, ...data.byWeekday);
  return (
    <>
      <section className={s.hero} style={{ ['--hero' as string]: top?.artist?.artwork.bgColor ?? 'var(--key)' }}>
        {top?.artist && <Artwork artwork={top.artist.artwork} size={500} rounded="lg" className={s.heroArt} />}
        <div className={s.heroText}>
          <p className={s.eyebrow}>{name ? `${name}’s Replay` : 'Your Replay'} · {label}</p>
          <p className={s.big}>{minutes(data.totalMs)}<span> minutes listened</span></p>
          <div className={s.facts}>
            {top && <Fact k="Top artist" v={top.name} href={`/artist/${top.id}`} />}
            {data.topSongs[0] && <Fact k="Top song" v={data.topSongs[0].song.title} href={`/album/${data.topSongs[0].song.album.id}?i=${data.topSongs[0].song.id}`} />}
            <Fact k="Songs" v={data.uniqueSongs.toLocaleString()} />
            <Fact k="Artists" v={data.uniqueArtists.toLocaleString()} />
            <Fact k="Longest streak" v={`${data.longestStreakDays} day${data.longestStreakDays === 1 ? '' : 's'}`} />
            {data.topHourLabel && <Fact k="You listen most" v={data.topHourLabel} />}
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className="t-title-3">Top Songs</h2>
          <PillButton icon="play" onClick={() => usePlayer.getState().playSongs(songs, 0, { type: 'queue', title: `Replay ${label}` })}>Play</PillButton>
        </div>
        <TrackList songs={songs.slice(0, 10)} variant="compact" context={{ type: 'queue', title: `Replay ${label}` }} />
      </section>

      {data.topArtists.length > 0 && (
        <section className={s.section}>
          <h2 className="t-title-3">Top Artists</h2>
          <ol className={s.artists}>
            {data.topArtists.slice(0, 6).map((a, i) => (
              <li key={a.id}>
                <Link to={`/artist/${a.id}`} className={s.artist}>
                  <span className={s.rank}>{i + 1}</span>
                  {a.artist ? <Artwork artwork={a.artist.artwork} size={200} rounded="circle" /> : <span className={s.artistPh} />}
                  <span className={clsx(s.artistName, 'clamp-1')}>{a.name}</span>
                  <span className={s.artistMeta}>{minutes(a.ms)} min · {a.plays} plays</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className={s.grid2}>
        <section className={s.card}>
          <h2 className="t-title-3">Top Genres</h2>
          <ul className={s.genres}>
            {data.topGenres.map((g) => (
              <li key={g.id}>
                <span className={s.genreName}>{g.name}</span>
                <span className={s.bar}><span style={{ width: `${Math.max(4, g.share * 100)}%`, background: g.color }} /></span>
                <span className={s.pct}>{Math.round(g.share * 100)}%</span>
              </li>
            ))}
          </ul>
        </section>
        <section className={s.card}>
          <h2 className="t-title-3">When You Listen</h2>
          <div className={s.hours} aria-label="Plays by hour of day">
            {data.byHour.map((n, h) => <span key={h} title={`${h}:00 · ${n} plays`} style={{ height: `${(n / maxHour) * 100}%` }} />)}
          </div>
          <div className={s.hourAxis}><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span></div>
          <div className={s.days}>
            {data.byWeekday.map((n, d) => (
              <div key={d} className={s.day}><span className={s.dayBar}><span style={{ height: `${(n / maxDay) * 100}%` }} /></span><span>{WEEKDAYS[d]}</span></div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Fact({ k, v, href }: { k: string; v: string; href?: string }) {
  return <div className={s.fact}><span className={s.factK}>{k}</span>{href ? <Link to={href} className={clsx(s.factV, 'clamp-1')}>{v}</Link> : <span className={clsx(s.factV, 'clamp-1')}>{v}</span>}</div>;
}

function Empty() {
  return <div className={s.signedOut}><p className="t-2">No listening yet for this period. Play some music and your Replay will build up here.</p><Link to="/home" className={s.link}>Find something to play</Link></div>;
}

function ReplaySkeleton() {
  return <div aria-busy="true"><Skel className={s.skelHero} /><Skel className={s.skelRow} /><Skel className={s.skelRow} /></div>;
}
