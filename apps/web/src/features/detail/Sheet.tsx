import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/Icon';
import s from './Sheet.module.css';

/**
 * Modal sheet rendered into <body> so it always uses the app theme, not a tinted page palette.
 * Escape and a click on the scrim close it; focus moves into the dialog on open.
 */
export function Sheet({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, []);

  return createPortal(
    <div className={s.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className={s.sheet}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Full editorial notes opened from the "MORE" button. */
export function NotesSheet({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  const id = 'notes-sheet-title';
  return (
    <Sheet labelledBy={id} onClose={onClose}>
      <div className={s.head}>
        <h2 id={id} className={s.title}>{title}</h2>
        <button className={s.close} aria-label="Close" onClick={onClose}><Icon name="close" size={14} /></button>
      </div>
      <div className={s.body}><p>{text}</p></div>
    </Sheet>
  );
}

/** Destructive confirmation (e.g. "Delete Playlist"). */
export function ConfirmSheet({ title, message, confirmLabel, onConfirm, onClose }: {
  title: string; message: string; confirmLabel: string; onConfirm: () => void; onClose: () => void;
}) {
  const id = 'confirm-sheet-title';
  return (
    <Sheet labelledBy={id} onClose={onClose}>
      <div className={s.head}><h2 id={id} className={s.title}>{title}</h2></div>
      <p className={s.message}>{message}</p>
      <div className={s.actions}>
        <button className={`${s.btn} ${s.cancel}`} onClick={onClose}>Cancel</button>
        <button className={`${s.btn} ${s.danger}`} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Sheet>
  );
}
