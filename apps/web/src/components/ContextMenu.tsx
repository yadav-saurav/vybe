import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useUI } from '../stores/ui';
import { Icon } from './Icon';
import s from './ContextMenu.module.css';

/** Single global context menu (right-click / "···"), keyboard navigable, auto-flips at screen edges. */
export function ContextMenuHost() {
  const menu = useUI((u) => u.menu);
  const close = useUI((u) => u.closeMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!menu || !ref.current) { setPos(null); return; }
    const r = ref.current.getBoundingClientRect();
    let left = menu.anchor ? menu.anchor.right - r.width : menu.x;
    let top = menu.anchor ? menu.anchor.bottom + 6 : menu.y;
    if (left + r.width > innerWidth - 8) left = innerWidth - r.width - 8;
    if (top + r.height > innerHeight - 8) top = Math.max(8, (menu.anchor ? menu.anchor.top - 6 : menu.y) - r.height);
    setPos({ left: Math.max(8, left), top });
    ref.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    addEventListener('keydown', onKey); addEventListener('mousedown', onDown, true); addEventListener('resize', close); addEventListener('wheel', close, { passive: true });
    return () => { removeEventListener('keydown', onKey); removeEventListener('mousedown', onDown, true); removeEventListener('resize', close); removeEventListener('wheel', close); };
  }, [menu, close]);

  if (!menu) return null;
  return createPortal(
    <div ref={ref} role="menu" className={s.menu} style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}>
      {menu.entries.map((e, i) => e === 'separator' ? <div key={i} className={s.sep} role="separator" /> : (
        <button key={i} role="menuitem" disabled={e.disabled} className={clsx(s.item, e.destructive && s.destructive)} onClick={() => { close(); e.onSelect(); }}>
          <span>{e.label}</span>{e.icon && <Icon name={e.icon} size={16} />}
        </button>
      ))}
    </div>, document.body);
}
