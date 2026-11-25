import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { api, ApiError, type JamView } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { useJam } from '../../stores/jam';
import { useUI } from '../../stores/ui';
import s from './Jam.module.css';

/** Where an invite link lands: who's hosting, what's playing, and one button to join. */
export default function JamInvite() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuth((a) => a.user);
  const current = useJam((j) => j.jam);
  const busy = useJam((j) => j.busy);
  const [view, setView] = useState<JamView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setError(null);
    api.jam(code).then((v) => { if (alive) setView(v); })
      .catch((e) => { if (alive) setError(e instanceof ApiError && e.status === 404 ? 'This Jam has ended or the link is wrong.' : 'Couldn’t load this Jam. Try again.'); });
    return () => { alive = false; };
  }, [code, user]);

  const inThis = current?.code === code.toUpperCase();
  const join = async () => {
    if (await useJam.getState().join(code)) {
      useUI.getState().setNowPlayingOpen(true);
      navigate('/home', { replace: true });
    }
  };

  const playing = view?.queue[view.index]?.song;
  return (
    <div className={`page ${s.page}`}>
      <div className={s.card}>
        <div className={s.badge}><Icon name="jam" size={28} /></div>
        {!user ? (
          <>
            <h1 className={s.title}>You’re invited to a Jam</h1>
            <p className={s.sub}>Sign in to listen together. It’s free.</p>
            <button className={s.primary} onClick={() => useUI.getState().openSignIn()}>Sign In to Join</button>
          </>
        ) : error ? (
          <>
            <h1 className={s.title}>Jam not found</h1>
            <p className={s.sub}>{error}</p>
            <Link className={s.secondary} to="/home">Go Home</Link>
          </>
        ) : !view ? (
          <p className={s.sub} aria-busy="true">Loading Jam…</p>
        ) : (
          <>
            <h1 className={s.title}>{view.hostName}’s Jam</h1>
            <p className={s.sub}>{view.listeners.length} {view.listeners.length === 1 ? 'person' : 'people'} listening together</p>
            {playing && (
              <div className={s.now}>
                <span className={s.nowArt}><Artwork artwork={playing.artwork} size={120} rounded="sm" /></span>
                <span className={s.nowText}>
                  <span className={s.eyebrow}>{view.playing ? 'Playing now' : 'Paused'}</span>
                  <span className="clamp-1">{playing.title}</span>
                  <span className={`clamp-1 ${s.muted}`}>{playing.artist.name}</span>
                </span>
              </div>
            )}
            {inThis
              ? <button className={s.primary} onClick={() => useUI.getState().setNowPlayingOpen(true)}>You’re in · Open Player</button>
              : <button className={s.primary} disabled={busy} onClick={join}>{busy ? 'Joining…' : 'Join Jam'}</button>}
            {current && !inThis && <p className={s.hint}>Joining will take you out of your current Jam.</p>}
          </>
        )}
      </div>
    </div>
  );
}
