import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import s from './Sheet.module.css';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const CLOSE_MS = 320; // matches the exit transition in Sheet.module.css

/**
 * Modal primitive: a centred dialog on desktop and a bottom sheet at ≤760px.
 * Scrim click and Esc close it, focus is trapped inside while open and restored on close.
 * The panel stays mounted for the exit animation, then unmounts.
 */
export function Sheet({ open, onClose, labelledBy, className, children }: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Enter / exit choreography: mount, then animate in on the next frame.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), CLOSE_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Focus management, Esc, and a Tab trap while open.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const el = panel.current;
    const raf = requestAnimationFrame(() => {
      const target = el?.querySelector<HTMLElement>('[data-autofocus]')
        ?? el?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled])')
        ?? el?.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? el)?.focus({ preventScroll: true });
    });
    const focusables = () => [...(el?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const items = focusables();
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !el.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !el.contains(active))) { e.preventDefault(); first.focus(); }
    };
    const onFocusIn = (e: FocusEvent) => {
      if (el && e.target instanceof Node && !el.contains(e.target)) focusables()[0]?.focus();
    };
    addEventListener('keydown', onKey, true);
    addEventListener('focusin', onFocusIn);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('keydown', onKey, true);
      removeEventListener('focusin', onFocusIn);
      opener?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!mounted) return null;
  return createPortal(
    <div className={clsx(s.root, shown && s.on)}>
      <div className={s.scrim} aria-hidden onClick={() => closeRef.current()} />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}
        className={clsx(s.panel, className)}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
