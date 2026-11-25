import { useState } from 'react';
import clsx from 'clsx';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../stores/auth';
import { usePlayer } from '../../stores/player';
import { useUI } from '../../stores/ui';
import { inviteLink, useJam } from '../../stores/jam';
import type { JamListener } from '../../lib/api';
import { Sheet } from '../overlays/Sheet';
import s from './Jam.module.css';

/** The one home for Jam: start it, invite people, see who's listening, host settings, leave or end. */
export function JamSheet() {
  const open = useJam((j) => j.sheetOpen);
  const jam = useJam((j) => j.jam);
  const close = () => useJam.getState().setSheetOpen(false);
  return (
    <Sheet open={open} onClose={close} labelledBy="jam-title" className={s.sheet}>
      {jam ? <Live /> : <Intro />}
    </Sheet>
  );
}

function Intro() {
  const busy = useJam((j) => j.busy);
  const song = usePlayer((p) => p.current?.song);
  return (
    <div className={s.wrap}>
      <div className={s.hero} aria-hidden><Icon name="jam" size={34} /></div>
      <h2 id="jam-title" className={s.title}>Start a Jam</h2>
      <p className={s.sub}>Listen together in real time. Everyone hears the same song at the same moment, and anyone in the Jam can add songs.</p>
      <ul className={s.points}>
        <li><Icon name="share" size={16} />Invite friends with a link</li>
        <li><Icon name="queue" size={16} />One shared queue{song ? `, starting with “${song.title}”` : ''}</li>
        <li><Icon name="user" size={16} />You decide whether guests can skip and pause</li>
      </ul>
      <button className={s.primary} disabled={busy} onClick={() => void useJam.getState().start()}>{busy ? 'Starting…' : 'Start Jam'}</button>
    </div>
  );
}

function Live() {
  const jam = useJam((j) => j.jam)!;
  const connected = useJam((j) => j.connected);
  const me = useAuth((a) => a.user?.id);
  const isHost = jam.hostId === me;
  const url = inviteLink(jam.code);
  const toast = (m: string) => useUI.getState().toast(m);
  const [confirming, setConfirming] = useState(false);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('Invite Link Copied'); } catch { toast(url); }
  };
  const share = async () => {
    try { await navigator.share({ title: `Join ${jam.hostName}’s Jam on Vybe`, url }); } catch { /* cancelled */ }
  };
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const online = jam.listeners.filter((l) => l.online).length;

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <span className={clsx(s.live, !connected && s.reconnecting)}>{connected ? 'Live' : 'Reconnecting…'}</span>
        <h2 id="jam-title" className={s.title}>{isHost ? 'Your Jam' : `${jam.hostName}’s Jam`}</h2>
        <p className={s.sub}>{jam.listeners.length} {jam.listeners.length === 1 ? 'person' : 'people'} · {online} listening now</p>
      </div>

      <div className={s.invite}>
        <span className={s.codeLabel}>Invite code</span>
        <span className={s.code} aria-label={`Invite code ${jam.code.split('').join(' ')}`}>{jam.code}</span>
        <div className={s.actions}>
          <button className={s.primary} onClick={copy}><Icon name="share" size={16} />Copy Link</button>
          {canShare && <button className={s.secondary} onClick={share}>Share…</button>}
        </div>
      </div>

      <section aria-label="Listeners">
        <h3 className={s.section}>Listening</h3>
        <ul className={s.people}>
          {jam.listeners.map((l) => <Person key={l.id} l={l} me={l.id === me} />)}
        </ul>
      </section>

      {isHost && (
        <label className={s.setting}>
          <span>
            <span className={s.settingTitle}>Guests can control playback</span>
            <span className={s.settingHint}>Play, pause, skip and seek. Guests can always add songs.</span>
          </span>
          <input type="checkbox" role="switch" className={s.switch} checked={jam.guestsCanControl}
            onChange={(e) => void useJam.getState().setGuestsCanControl(e.target.checked)} />
        </label>
      )}
      {!isHost && !jam.guestsCanControl && <p className={s.note}>The host controls playback. You can still add songs from any ··· menu.</p>}

      {confirming
        ? <div className={s.confirm} role="group" aria-label="End the Jam for everyone?">
            <span>End the Jam for everyone?</span>
            <button className={s.secondary} onClick={() => setConfirming(false)}>Cancel</button>
            <button className={s.danger} onClick={() => void useJam.getState().leave()} autoFocus>End Jam</button>
          </div>
        : <button className={s.leave} onClick={() => (isHost ? setConfirming(true) : void useJam.getState().leave())}>{isHost ? 'End Jam' : 'Leave Jam'}</button>}
    </div>
  );
}

function Person({ l, me }: { l: JamListener; me: boolean }) {
  return (
    <li className={s.person}>
      <span className={s.avatar} style={{ background: l.avatarColor }} aria-hidden>{l.displayName.slice(0, 1).toUpperCase()}
        <span className={clsx(s.dot, l.online && s.dotOn)} />
      </span>
      <span className={clsx(s.name, 'clamp-1')}>{l.displayName}{me && ' (you)'}</span>
      {l.isHost && <span className={s.badge}>Host</span>}
      <span className="visually-hidden">{l.online ? 'listening now' : 'away'}</span>
    </li>
  );
}

/** Shown on the player while in a Jam; opens the Jam sheet. */
export function JamChip({ className, compact }: { className?: string; compact?: boolean }) {
  const jam = useJam((j) => j.jam);
  if (!jam) return null;
  const n = jam.listeners.filter((l) => l.online).length;
  return (
    <button className={clsx(s.chip, className)} onClick={() => useJam.getState().setSheetOpen(true)}
      aria-label={`In a Jam with ${jam.listeners.length} ${jam.listeners.length === 1 ? 'person' : 'people'}. Open Jam`} title="Jam">
      <Icon name="jam" size={compact ? 14 : 15} />{compact ? n : `Jam · ${n} listening`}
    </button>
  );
}
