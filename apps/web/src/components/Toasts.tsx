import { useUI } from '../stores/ui';
import s from './Toasts.module.css';

export function Toasts() {
  const toasts = useUI((u) => u.toasts);
  return <div className={s.wrap} role="status" aria-live="polite">{toasts.map((t) => <div key={t.id} className={s.toast}>{t.text}</div>)}</div>;
}
