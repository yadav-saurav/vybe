import { avatarBg } from '../../lib/color';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { useUI } from '../../stores/ui';
import { usePlayer } from '../../stores/player';
import { useSettings } from '../../stores/settings';
import { PillButton } from '../../components/Buttons';
import { useDocumentTitle } from '../../features/shelves/useDocumentTitle';
import { promptInstall, useInstallState } from '../../lib/install';
import { EQ_BANDS, EQ_PRESETS } from '../../features/player/eq';
import { AccountSheets } from './AccountSheets';
import { useAsync } from '../../lib/useAsync';
import { useAccount, DEMO_NOTE } from '../../stores/account';
import s from './Settings.module.css';

const COLOR_NAMES: Record<string, string> = { '#e11d48': 'Red', '#f97316': 'Orange', '#eab308': 'Yellow', '#22c55e': 'Green', '#14b8a6': 'Teal', '#0ea5e9': 'Sky', '#6366f1': 'Indigo', '#a855f7': 'Purple', '#ec4899': 'Pink', '#64748b': 'Slate' };
const COLORS = ['#e11d48', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#64748b'];

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const user = useAuth((a) => a.user);
  const st = useSettings();
  const theme = useUI((u) => u.theme);
  const autoplay = usePlayer((p) => p.autoplayEnabled);
  const [name, setName] = useState(user?.displayName ?? '');
  const [color, setColor] = useState(user?.avatarColor ?? COLORS[0]);
  const install = useInstallState();
  const isDemo = useAccount((a) => a.isDemo);
  const [sheet, setSheet] = useState<'password' | 'delete' | null>(null);
  const [eqOpen, setEqOpen] = useState(false);
  const { data: acct } = useAsync(user ? `settings:${user.id}` : null, (sig) => api.settings(sig));
  const [share, setShare] = useState<boolean | null>(null);
  useEffect(() => { if (acct) setShare(acct.shareActivity); }, [acct]);
  const toggleShare = async (v: boolean) => { setShare(v); try { await api.updateSettings({ shareActivity: v }); } catch { setShare(!v); useUI.getState().toast('Something went wrong'); } };
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setName(user?.displayName ?? ''); setColor(user?.avatarColor ?? COLORS[0]); }, [user]);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const { user: u } = await api.updateProfile({ displayName: name, avatarColor: color });
      useAuth.setState({ user: u });
      useUI.getState().toast('Profile Saved');
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  };
  const dirty = user && (name.trim() !== user.displayName || color !== user.avatarColor);

  return (
    <div className="page">
      <header className="page-header"><h1 className="t-large-title">Settings</h1></header>

      {user ? (
        <Section title="Account">
          <div className={s.account}>
            <span className={s.avatar} style={{ background: avatarBg(color) }}>{(name || user.displayName).slice(0, 1).toUpperCase()}</span>
            <div className={s.accountFields}>
              <label className={s.label} htmlFor="dn">Display name</label>
              <input id="dn" className={s.input} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-describedby={err ? 'dn-err' : undefined} />
              <span className={s.label}>Avatar colour</span>
              <div className={s.swatches} role="radiogroup" aria-label="Avatar colour">
                {COLORS.map((c) => <button key={c} role="radio" aria-checked={c === color} aria-label={COLOR_NAMES[c] ?? c} className={clsx(s.swatch, c === color && s.swatchOn)} style={{ background: c }} onClick={() => setColor(c)} />)}
              </div>
              {err && <p id="dn-err" className={s.err}>{err}</p>}
              <div className={s.row}>
                <PillButton onClick={save} disabled={isDemo || !dirty || saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</PillButton>
                <Link to={`/profile/${user.id}`} className={s.link}>View profile</Link>
              </div>
              <p className={s.hint}>Signed in as {user.email}</p>
              {isDemo && <p className={s.demoNote} role="note">{DEMO_NOTE}</p>}
            </div>
          </div>
        </Section>
      ) : (
        <Section title="Account"><PillButton onClick={() => useUI.getState().openSignIn()}>Sign In</PillButton></Section>
      )}

      {user && (
        <Section title="Privacy">
          <Row label="Share my listening activity" hint="People who follow you can see the last song you played, on their Home">
            <Toggle on={!!share} onChange={toggleShare} label="Share my listening activity" />
          </Row>
        </Section>
      )}

      {user && !isDemo && (
        <Section title="Security">
          <Row label="Password" hint="Changing it signs you out on your other devices">
            <button className={s.textBtn} onClick={() => setSheet('password')}>Change Password</button>
          </Row>
          <Row label="Delete account" hint="Permanently removes your library, playlists, history and imported songs">
            <button className={clsx(s.textBtn, s.danger)} onClick={() => setSheet('delete')}>Delete Account…</button>
          </Row>
        </Section>
      )}

      <Section title="Playback">
        <Row label="Crossfade" hint={st.crossfadeSec ? `${st.crossfadeSec} seconds of overlap between songs` : 'Off: songs play back to back'}>
          <input type="range" min={0} max={12} step={1} value={st.crossfadeSec} className={s.range} aria-label="Crossfade seconds"
            onChange={(e) => st.set({ crossfadeSec: Number(e.target.value) })} />
          <span className={s.value}>{st.crossfadeSec ? `${st.crossfadeSec}s` : 'Off'}</span>
        </Row>
        <Row label="Sound Check" hint="Evens out the volume of songs you import (Vybe’s own catalog is already level)">
          <Toggle on={st.soundCheck} onChange={(v) => st.set({ soundCheck: v })} label="Sound Check" />
        </Row>
        <Row label="Autoplay" hint="Keep playing similar music when your queue ends">
          <Toggle on={autoplay} onChange={(v) => usePlayer.getState().setAutoplayEnabled(v)} label="Autoplay" />
        </Row>
        <Row label="Equalizer" hint={st.eqPreset === 'custom' ? 'Custom' : EQ_PRESETS[st.eqPreset]?.label}>
          <select className={s.select} aria-label="Equalizer preset" value={st.eqPreset}
            onChange={(e) => { const k = e.target.value; st.set(k === 'custom' ? { eqPreset: 'custom' } : { eqPreset: k, eqGains: EQ_PRESETS[k].gains }); }}>
            {Object.entries(EQ_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            {st.eqPreset === 'custom' && <option value="custom">Custom</option>}
          </select>
          <button className={s.textBtn} aria-expanded={eqOpen} onClick={() => setEqOpen((v) => !v)}>{eqOpen ? 'Hide' : 'Adjust'}</button>
        </Row>
        {eqOpen && (
          <div className={s.eq} role="group" aria-label="Equalizer bands">
            {EQ_BANDS.map((b, i) => (
              <label key={b.freq} className={s.band}>
                <span className={s.bandGain}>{st.eqGains[i] > 0 ? '+' : ''}{st.eqGains[i]} dB</span>
                <input type="range" min={-12} max={12} step={1} value={st.eqGains[i]} aria-label={`${b.label} gain`} className={s.bandRange}
                  onChange={(e) => { const gains = st.eqGains.slice(); gains[i] = Number(e.target.value); st.set({ eqGains: gains, eqPreset: 'custom' }); }} />
                <span className={s.bandFreq}>{b.label}</span>
              </label>
            ))}
            <button className={s.textBtn} onClick={() => st.set({ eqPreset: 'flat', eqGains: EQ_PRESETS.flat.gains })}>Reset</button>
          </div>
        )}
        <Row label="Audio quality" hint="High uses more data on mobile networks">
          <select className={s.select} value={st.audioQuality} onChange={(e) => st.set({ audioQuality: e.target.value as 'normal' | 'high' })}>
            <option value="high">High</option><option value="normal">Normal</option>
          </select>
        </Row>
      </Section>

      {(install === 'prompt' || install === 'ios') && (
        <Section title="Install">
          <Row label="Install Vybe" hint={install === 'ios' ? 'Tap Share, then Add to Home Screen' : 'Open Vybe like an app, with its own icon and window'}>
            {install === 'prompt' && <PillButton onClick={async () => { if (await promptInstall()) useUI.getState().toast('Vybe Installed'); }}>Install</PillButton>}
          </Row>
        </Section>
      )}

      <Section title="Appearance">
        <Row label="Theme">
          <div className={s.seg} role="radiogroup" aria-label="Theme">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} role="radio" aria-checked={theme === t} className={clsx(s.segBtn, theme === t && s.segOn)} onClick={() => useUI.getState().setTheme(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </Row>
      </Section>
      {user && <AccountSheets which={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className={s.section}><h2 className={s.sectionTitle}>{title}</h2><div className={s.card}>{children}</div></section>;
}
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className={s.rowItem}><div className={s.rowText}><span className={s.rowLabel}>{label}</span>{hint && <span className={s.hint}>{hint}</span>}</div><div className={s.rowControl}>{children}</div></div>;
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} className={clsx(s.toggle, on && s.toggleOn)} onClick={() => onChange(!on)}><span /></button>;
}
