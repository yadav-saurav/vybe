import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../stores/auth';
import { usePlayer } from '../../stores/player';
import { useUI } from '../../stores/ui';
import { inviteLink, useJam } from '../../stores/jam';
import { AmbientGlow } from '../../features/world/Ambient';
import { avatarBg } from '../../lib/color';
import s from './JamHome.module.css';

/** Jam's home: start one from what's playing, join with a code, or see the Jam you're in. */
export default function JamHomePage() {
  const jam = useJam((j) => j.jam);
  const user = useAuth((a) => a.user);
  return (
    <div className={`page ${s.page}`}>
      <AmbientGlow artwork={jam?.queue[jam.index]?.song.artwork ?? usePlayer.getState().current?.song.artwork} />
      <header className="page-header">
        <p className={s.eyebrow}><Icon name="jam" size={14} />Jam</p>
        <h1 className={s.title}>Listen together</h1>
        <p className={s.sub}>One shared queue, one moment. Friends hear the same song at the same time, wherever they are.</p>
      </header>
      {!user ? <SignedOut /> : jam ? <Live /> : <StartOrJoin />}
    </div>
  );
}

function SignedOut() {
  return (
    <div className={s.glass}>
      <h2 className={s.h2}>Sign in to Jam</h2>
      <p className={s.sub}>Start a Jam or join your friends’ with a 6-letter code.</p>
      <button className={s.primary} onClick={() => useUI.getState().openSignIn()}>Sign In</button>
    </div>
  );
}

function StartOrJoin() {
  const busy = useJam((j) => j.busy);
  const song = usePlayer((p) => p.current?.song);
  const [code, setCode] = useState('');
  const navigate = useNavigate();
  const join = async (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length !== 6) { useUI.getState().toast('Jam codes have 6 letters and numbers'); return; }
    if (await useJam.getState().join(c)) navigate('/jam');
  };
  return (
    <div className={s.cols}>
      <section className={s.glass} aria-labelledby="start-title">
        <span className={s.badge}><Icon name="jam" size={22} /></span>
        <h2 id="start-title" className={s.h2}>Start a Jam</h2>
        <p className={s.sub}>{song ? <>Starts with <b>{song.title}</b> and your queue. Invite friends with a link.</> : 'Play a song first, then start a Jam to share it.'}</p>
        <button className={s.primary} disabled={busy || !song} onClick={() => void useJam.getState().start()}>{busy ? 'Starting…' : 'Start Jam'}</button>
        {!song && <Link to="/home" className={s.link}>Find something to play</Link>}
      </section>
      <section className={s.glass} aria-labelledby="join-title">
        <span className={s.badge}><Icon name="plus" size={22} /></span>
        <h2 id="join-title" className={s.h2}>Join a Jam</h2>
        <p className={s.sub}>Enter the code your friend shared.</p>
        <form className={s.join} onSubmit={join}>
          <label className="visually-hidden" htmlFor="jam-code">Jam code</label>
          <input id="jam-code" className={s.code} value={code} maxLength={6} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            placeholder="ABC234" onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} />
          <button className={s.primary} disabled={busy || code.length !== 6}>{busy ? 'Joining…' : 'Join'}</button>
        </form>
      </section>
    </div>
  );
}

function Live() {
  const jam = useJam((j) => j.jam)!;
  const connected = useJam((j) => j.connected);
  const me = useAuth((a) => a.user?.id);
  const isHost = jam.hostId === me;
  const now = jam.queue[jam.index];
  const upcoming = jam.queue.slice(jam.index + 1);
  const copy = async () => {
    try { await navigator.clipboard.writeText(inviteLink(jam.code)); useUI.getState().toast('Invite Link Copied'); } catch { useUI.getState().toast(inviteLink(jam.code)); }
  };
  return (
    <div className={s.cols}>
      <section className={clsx(s.glass, s.nowCard)} aria-label="Now playing in the Jam">
        <span className={clsx(s.live, !connected && s.off)}>{connected ? 'Live' : 'Reconnecting…'}</span>
        {now ? (
          <>
            <div className={s.nowArt}><Artwork artwork={now.song.artwork} size={600} rounded="md" /></div>
            <h2 className={clsx(s.h2, 'clamp-1')}>{now.song.title}</h2>
            <p className={clsx(s.sub, 'clamp-1')}>{now.song.artist.name} · added by {now.addedBy}</p>
          </>
        ) : <p className={s.sub}>The queue is empty. Add songs from any ··· menu.</p>}
        <div className={s.row}>
          <button className={s.primary} onClick={() => useUI.getState().setNowPlayingOpen(true)}>Open Player</button>
          <button className={s.secondary} onClick={() => useJam.getState().setSheetOpen(true)}>Settings</button>
        </div>
      </section>
      <section className={s.glass} aria-label="Invite and listeners">
        <h2 className={s.h2}>{isHost ? 'Your Jam' : `${jam.hostName}’s Jam`}</h2>
        <p className={s.codeBig} aria-label={`Code ${jam.code.split('').join(' ')}`}>{jam.code}</p>
        <button className={s.secondary} onClick={copy}><Icon name="share" size={14} />Copy invite link</button>
        <h3 className={s.h3}>Listening ({jam.listeners.length})</h3>
        <ul className={s.people}>
          {jam.listeners.map((l) => (
            <li key={l.id}>
              <span className={s.avatar} style={{ background: avatarBg(l.avatarColor) }} aria-hidden>{l.displayName.slice(0, 1).toUpperCase()}<i className={clsx(s.dot, l.online && s.dotOn)} /></span>
              <span className="clamp-1">{l.displayName}{l.id === me ? ' (you)' : ''}</span>
              {l.isHost && <span className={s.host}>Host</span>}
            </li>
          ))}
        </ul>
        <h3 className={s.h3}>Up next ({upcoming.length})</h3>
        <ol className={s.queue}>
          {upcoming.slice(0, 8).map((e) => (
            <li key={e.entryId}>
              <span className={s.qArt}><Artwork artwork={e.song.artwork} size={80} rounded="xs" /></span>
              <span className={s.qText}><span className="clamp-1">{e.song.title}</span><span className={clsx(s.muted, 'clamp-1')}>{e.song.artist.name} · {e.addedBy}</span></span>
            </li>
          ))}
          {!upcoming.length && <li className={s.muted}>Add songs with ··· → Play Next or Play Last.</li>}
        </ol>
      </section>
    </div>
  );
}
