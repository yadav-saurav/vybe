import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { Song } from '@vybe/shared';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { avatarBg } from '../../lib/color';
import { worldDefaultCountry } from '../../lib/world';
import { usePlayer } from '../../stores/player';
import { useAuth } from '../../stores/auth';
import { useUI } from '../../stores/ui';
import { canControl, inviteLink, useJam } from '../../stores/jam';
import { AmbientGlow } from '../../features/world/Ambient';
import s from './JamHome.module.css';

/** Jam: listen together. Start one and invite friends, or join theirs; then fill it with playlists and moods. */
export default function JamHomePage() {
  const jam = useJam((j) => j.jam);
  const user = useAuth((a) => a.user);
  return (
    <div className={`page ${s.page}`}>
      <AmbientGlow artwork={jam?.queue[jam.index]?.song.artwork} />
      <header className="page-header">
        <p className={s.eyebrow}><Icon name="jam" size={14} />Jam</p>
        <h1 className={s.title}>Listen together</h1>
        <p className={s.sub}>Start a Jam and invite your friends, or join theirs. Add your playlists or search any song, and everyone hears the same song at the same moment.</p>
      </header>
      {!user ? <SignedOut /> : jam ? <Live /> : <StartOrJoin />}
    </div>
  );
}

function SignedOut() {
  return (
    <div className={s.glass}>
      <h2 className={s.h2}>Sign in to Jam</h2>
      <p className={s.sub}>Start a Jam with friends, or join one with a 6-letter code.</p>
      <button className={s.primary} onClick={() => useUI.getState().openSignIn()}>Sign In</button>
    </div>
  );
}

function StartOrJoin() {
  const busy = useJam((j) => j.busy);
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
        <p className={s.sub}>You’ll get a code and a link to send your friends. Then add your playlists or a mood: rock, rap, sad, party and more.</p>
        <button className={s.primary} disabled={busy} onClick={() => void useJam.getState().start()}>{busy ? 'Starting…' : 'Start a Jam'}</button>
      </section>
      <section className={s.glass} aria-labelledby="join-title">
        <span className={s.badge}><Icon name="plus" size={22} /></span>
        <h2 id="join-title" className={s.h2}>Join a Jam</h2>
        <p className={s.sub}>Enter the code your friend shared, or open their invite link.</p>
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
  const control = canControl(jam, me);
  const now = jam.queue[jam.index];
  const upcoming = jam.queue.slice(jam.index + 1).map((e, i) => ({ e, index: jam.index + 1 + i }));
  const copy = async () => {
    try { await navigator.clipboard.writeText(inviteLink(jam.code)); useUI.getState().toast('Invite link copied'); } catch { useUI.getState().toast(inviteLink(jam.code)); }
  };
  const share = async () => {
    try { await navigator.share({ title: 'Join my Jam on Vybe', text: `Jam code ${jam.code}`, url: inviteLink(jam.code) }); } catch { /* cancelled */ }
  };
  return (
    <div className={s.cols}>
      <div className={s.stack}>
        <section className={clsx(s.glass, s.nowCard)} aria-label="Now playing in the Jam">
          <span className={clsx(s.live, !connected && s.off)}>{connected ? 'Live' : 'Reconnecting…'}</span>
          {now ? (
            <div className={s.nowRow}>
              <div className={s.nowArt}><Artwork artwork={now.song.artwork} size={300} rounded="md" /></div>
              <div className={s.nowText}>
                <h2 className={clsx(s.h2, 'clamp-2')}>{now.song.title}</h2>
                <p className={clsx(s.sub, 'clamp-1')}>{now.song.artist.name}</p>
                <p className={s.muted}>Added by {now.addedBy}</p>
                <button className={s.primary} onClick={() => useUI.getState().setNowPlayingOpen(true)}>Open Player</button>
              </div>
            </div>
          ) : (
            <div className={s.empty}>
              <h2 className={s.h2}>Your Jam is empty</h2>
              <p className={s.sub}>Add one of your playlists or search for a song. The first song starts for everyone.</p>
            </div>
          )}
        </section>

        <section className={s.glass} aria-label="Up next">
          <h3 className={s.h3}>Up next ({upcoming.length})</h3>
          {upcoming.length ? (
            <ol className={s.queue}>
              {upcoming.map(({ e, index }) => {
                const mine = e.addedById === me;
                return (
                  <li key={e.entryId}>
                    <button className={s.qMain} disabled={!control} onClick={() => void useJam.getState().jumpTo(index)}
                      aria-label={`Play ${e.song.title} now`} title={control ? 'Play now' : 'The host controls playback'}>
                      <span className={s.qArt}><Artwork artwork={e.song.artwork} size={80} rounded="xs" /></span>
                      <span className={s.qText}><span className="clamp-1">{e.song.title}</span><span className={clsx(s.muted, 'clamp-1')}>{e.song.artist.name} · {mine ? 'you' : e.addedBy}</span></span>
                    </button>
                    {(mine || control) && (
                      <button className={s.qRemove} aria-label={`Remove ${e.song.title} from the Jam`} title="Remove" onClick={() => void useJam.getState().removeEntry(e.entryId)}>
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : <p className={s.muted}>Nothing queued yet. Add a playlist or search for a song.</p>}
        </section>
      </div>

      <div className={s.stack}>
        <AddMusic />
        <section className={s.glass} aria-label="Invite and listeners">
          <h2 className={s.h2}>{isHost ? 'Your Jam' : `${jam.hostName}’s Jam`}</h2>
          <p className={s.codeBig} aria-label={`Code ${jam.code.split('').join(' ')}`}>{jam.code}</p>
          <div className={s.row}>
            <button className={s.secondary} onClick={copy}><Icon name="share" size={14} />Copy invite link</button>
            {'share' in navigator && <button className={s.secondary} onClick={share}>Share…</button>}
          </div>
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
          <button className={s.secondary} onClick={() => useJam.getState().setSheetOpen(true)}>Jam settings</button>
        </section>
      </div>
    </div>
  );
}

/** Fill the Jam: your own playlists, or search for any song. */
function AddMusic() {
  const [tab, setTab] = useState<'playlists' | 'search'>('playlists');
  const [adding, setAdding] = useState<string | null>(null);
  const { data } = useAsync('jam:my-playlists', (sig) => api.libraryPlaylists(sig));
  const mine = data?.playlists ?? [];

  const addPlaylist = async (id: string, name: string) => {
    setAdding(id);
    try {
      const page = await api.playlist(id);
      const songs = page.tracks as Song[];
      if (!songs.length) { useUI.getState().toast(`“${name}” has no songs yet`); return; }
      await useJam.getState().addSongs(songs, `Added “${name}” to the Jam`);
    } catch { useUI.getState().toast('Couldn’t add that playlist. Try again.'); } finally { setAdding(null); }
  };

  return (
    <section className={s.glass} aria-labelledby="add-music-title">
      <h2 id="add-music-title" className={s.h2}>Add music</h2>
      <div className={s.tabs} role="tablist" aria-label="Add music from">
        <button role="tab" aria-selected={tab === 'playlists'} className={clsx(s.tab, tab === 'playlists' && s.tabOn)} onClick={() => setTab('playlists')}>Your playlists</button>
        <button role="tab" aria-selected={tab === 'search'} className={clsx(s.tab, tab === 'search' && s.tabOn)} onClick={() => setTab('search')}>Search</button>
      </div>
      {tab === 'playlists' ? (
        mine.length ? (
          <ul className={s.playlists}>
            {mine.map((p) => (
              <li key={p.id}>
                <span className={s.qArt}><Artwork artwork={p.artwork} size={80} rounded="xs" /></span>
                <span className={s.qText}><span className="clamp-1">{p.name}</span><span className={s.muted}>{p.trackIds.length} songs</span></span>
                <button className={s.addBtn} disabled={adding !== null} onClick={() => void addPlaylist(p.id, p.name)}>
                  {adding === p.id ? 'Adding…' : <><Icon name="plus" size={14} />Add</>}
                </button>
              </li>
            ))}
          </ul>
        ) : <p className={s.muted}>You don’t have playlists yet. Make one from any song’s ··· menu (Add to a Playlist), or use Search.</p>
      ) : <JamSearch />}
    </section>
  );
}

/** Search any song or artist and put it in the Jam: play it now for everyone, or add it to the queue. */
function JamSearch() {
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(term.trim()), 300); return () => clearTimeout(t); }, [term]);
  const { data, error } = useAsync(q.length >= 2 ? `jam-search:${q}` : null, (sig) => api.worldSearch(q, worldDefaultCountry(), sig));
  const songs = data?.songs.slice(0, 20) ?? [];
  const playNow = (song: Song) => usePlayer.getState().playSongs([song], 0); // in a Jam: goes next and plays for everyone
  const add = (song: Song) => void useJam.getState().addSongs([song], `Added “${song.title}” to the Jam`);
  return (
    <div className={s.search}>
      <label className={s.searchField}>
        <Icon name="search" size={16} />
        <span className="visually-hidden">Search songs and artists</span>
        <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search any song or artist" autoComplete="off" enterKeyHint="search" />
      </label>
      {q.length < 2 ? <p className={s.muted}>Find anything to play: a song, an artist, a film soundtrack.</p>
        : error ? <p className={s.muted}>Search isn’t available right now. Try again in a moment.</p>
        : !data ? <p className={s.muted} aria-busy="true">Searching…</p>
        : !songs.length ? <p className={s.muted}>No songs found for “{q}”.</p>
        : (
          <ul className={s.playlists}>
            {songs.map((song) => (
              <li key={song.id}>
                <span className={s.qArt}><Artwork artwork={song.artwork} size={80} rounded="xs" /></span>
                <span className={s.qText}><span className="clamp-1">{song.title}</span><span className={clsx(s.muted, 'clamp-1')}>{song.artist.name}</span></span>
                <button className={s.iconBtn} aria-label={`Play ${song.title} now`} title="Play now" onClick={() => playNow(song)}><Icon name="play" size={14} /></button>
                <button className={s.addBtn} aria-label={`Add ${song.title} to the Jam`} onClick={() => add(song)}><Icon name="plus" size={14} />Add</button>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
