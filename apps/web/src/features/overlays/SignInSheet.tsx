import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import { invalidate } from '../../lib/useAsync';
import { Sheet } from './Sheet';
import { PillButton } from '../../components/Buttons';
import { useAuth } from '../../stores/auth';
import { useLibrary } from '../../stores/library';
import { useUI } from '../../stores/ui';
import { VybeWordmark } from '../../app/Sidebar';
import f from './forms.module.css';

type Mode = 'signin' | 'signup';
const DEMO = { email: 'demo@vybe.app', password: 'vybe1234' };

/** Maps API failures to the copy shown under the form. */
export function authErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Incorrect email or password';
    if (err.status === 409) return 'An account with this email already exists';
    if (err.status === 400 && err.message) return err.message;
    return 'Something went wrong. Please try again.';
  }
  return 'Can’t reach Vybe right now. Check your connection and try again.';
}

export function SignInSheet() {
  const open = useUI((u) => u.signInOpen);
  const close = useUI((u) => u.closeSignIn);
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Start from a clean form every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setMode('signin'); setName(''); setEmail(''); setPassword(''); setErrors({}); setFormError(null); setBusy(false);
  }, [open]);

  const switchMode = (next: Mode) => { setMode(next); setErrors({}); setFormError(null); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: typeof errors = {};
    if (mode === 'signup' && !name.trim()) next.name = 'Enter a display name';
    if (!email.trim()) next.email = 'Enter your email address';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter an email address like name@example.com';
    if (!password) next.password = mode === 'signup' ? 'Choose a password' : 'Enter your password';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) {
      const firstBad = (mode === 'signup' && next.name) ? 'signup-name' : next.email ? 'signin-email' : 'signin-password';
      document.getElementById(firstBad)?.focus();
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') await useAuth.getState().signIn(email.trim(), password);
      else await useAuth.getState().signUp(email.trim(), password, name.trim());
      const user = useAuth.getState().user;
      close();
      useUI.getState().toast(`Welcome, ${user?.displayName ?? 'to Vybe'}`);
      await useLibrary.getState().load();
      invalidate(''); // personalised pages refetch
    } catch (err) {
      const message = authErrorMessage(err);
      setFormError(message);
      if (err instanceof ApiError && err.status === 401) setErrors({ password: message });
      if (err instanceof ApiError && err.status === 409) setErrors({ email: message });
    } finally {
      setBusy(false);
    }
  };

  const useDemo = () => { setMode('signin'); setEmail(DEMO.email); setPassword(DEMO.password); setErrors({}); setFormError(null); };

  const isSignup = mode === 'signup';
  return (
    <Sheet open={open} onClose={close} labelledBy="signin-title">
      <form className={f.body} noValidate onSubmit={submit} aria-labelledby="signin-title">
        <div className={f.brand}><VybeWordmark height={30} /></div>
        <h2 id="signin-title" className={f.titleCentered}>
          {isSignup ? 'Create your Vybe account' : 'Sign in to Vybe'}
        </h2>

        {formError && <p role="alert" className={f.alert} id="signin-form-error">{formError}</p>}

        {isSignup && (
          <div className={f.field}>
            <label className={f.label} htmlFor="signup-name">Display name</label>
            <input id="signup-name" className={f.input} name="displayName" autoComplete="name" value={name} data-autofocus={isSignup || undefined}
              onChange={(e) => setName(e.target.value)} maxLength={60}
              aria-invalid={!!errors.name} aria-describedby={errors.name ? 'signup-name-error' : undefined} />
            {errors.name && <span id="signup-name-error" className={f.error}>{errors.name}</span>}
          </div>
        )}

        <div className={f.field}>
          <label className={f.label} htmlFor="signin-email">Email</label>
          <input id="signin-email" className={f.input} type="email" name="email" inputMode="email"
            autoComplete={isSignup ? 'email' : 'username'} autoCapitalize="none" spellCheck={false}
            value={email} onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email} aria-describedby={errors.email ? 'signin-email-error' : undefined}
            data-autofocus={!isSignup || undefined} />
          {errors.email && <span id="signin-email-error" className={f.error}>{errors.email}</span>}
        </div>

        <div className={f.field}>
          <label className={f.label} htmlFor="signin-password">Password</label>
          <input id="signin-password" className={f.input} type="password" name="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password} aria-describedby={errors.password ? 'signin-password-error' : undefined} />
          {errors.password && <span id="signin-password-error" className={f.error}>{errors.password}</span>}
        </div>

        <PillButton type="submit" variant="key" disabled={busy} className={f.block}>
          {busy ? 'Please wait…' : isSignup ? 'Create Account' : 'Sign In'}
        </PillButton>

        {!isSignup && (
          <button type="button" className={f.linkCentered} onClick={useDemo}>Use demo account</button>
        )}

        <p className={f.switchLine}>
          {isSignup ? 'Already have an account? ' : 'New to Vybe? '}
          <button type="button" className={f.linkBtn} onClick={() => switchMode(isSignup ? 'signin' : 'signup')}>
            {isSignup ? 'Sign In' : 'Create Account'}
          </button>
        </p>
      </form>
    </Sheet>
  );
}
