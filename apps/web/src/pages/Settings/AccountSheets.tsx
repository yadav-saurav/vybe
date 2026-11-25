import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { useLibrary } from '../../stores/library';
import { useUI } from '../../stores/ui';
import { usePlayer } from '../../stores/player';
import { Sheet } from '../../features/overlays/Sheet';
import s from './AccountSheets.module.css';

/** Change-password and delete-account dialogs. Both re-ask for the current password. */
export function AccountSheets({ which, onClose }: { which: 'password' | 'delete' | null; onClose: () => void }) {
  return (
    <>
      <PasswordSheet open={which === 'password'} onClose={onClose} />
      <DeleteSheet open={which === 'delete'} onClose={onClose} />
    </>
  );
}

function useFormState(open: boolean) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setBusy(false); setError(null); } }, [open]);
  return { busy, setBusy, error, setError };
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const { busy, setBusy, error, setError } = useFormState(open);
  useEffect(() => { if (open) { setCurrent(''); setNext(''); setAgain(''); } }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    if (next !== again) return setError('The new passwords don’t match.');
    setBusy(true); setError(null);
    try {
      await api.changePassword(current, next);
      useUI.getState().toast('Password Changed');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? 'Current password is incorrect.' : err instanceof ApiError && err.code === 'same_password' ? 'Choose a password you haven’t used here.' : 'Something went wrong. Try again.');
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy="pw-title" className={s.sheet}>
      <form className={s.form} onSubmit={submit} noValidate>
        <h2 id="pw-title" className={s.title}>Change Password</h2>
        <label className={s.label} htmlFor="pw-cur">Current password</label>
        <input id="pw-cur" className={s.input} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <label className={s.label} htmlFor="pw-new">New password</label>
        <input id="pw-new" className={s.input} type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required aria-describedby="pw-hint" />
        <span id="pw-hint" className={s.hint}>At least 8 characters. You’ll stay signed in here; other devices are signed out.</span>
        <label className={s.label} htmlFor="pw-again">Confirm new password</label>
        <input id="pw-again" className={s.input} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
        {error && <p className={s.error} role="alert">{error}</p>}
        <div className={s.actions}>
          <button type="button" className={s.ghost} onClick={onClose}>Cancel</button>
          <button type="submit" className={s.primary} disabled={busy || !current || !next || !again}>{busy ? 'Saving…' : 'Change Password'}</button>
        </div>
      </form>
    </Sheet>
  );
}

function DeleteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const { busy, setBusy, error, setError } = useFormState(open);
  const navigate = useNavigate();
  useEffect(() => { if (open) setPassword(''); }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.deleteAccount(password);
      usePlayer.getState().pause();
      useAuth.setState({ user: null });
      useLibrary.getState().reset();
      onClose();
      navigate('/home');
      useUI.getState().toast('Account Deleted');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? 'That password is incorrect.' : 'Something went wrong. Try again.');
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy="del-title" className={s.sheet}>
      <form className={s.form} onSubmit={submit} noValidate>
        <h2 id="del-title" className={s.title}>Delete your account?</h2>
        <p className={s.body}>This permanently removes your library, playlists, listening history and imported songs. It can’t be undone.</p>
        <label className={s.label} htmlFor="del-pw">Enter your password to confirm</label>
        <input id="del-pw" className={s.input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className={s.error} role="alert">{error}</p>}
        <div className={s.actions}>
          <button type="button" className={s.ghost} onClick={onClose}>Cancel</button>
          <button type="submit" className={s.danger} disabled={busy || !password}>{busy ? 'Deleting…' : 'Delete Account'}</button>
        </div>
      </form>
    </Sheet>
  );
}
