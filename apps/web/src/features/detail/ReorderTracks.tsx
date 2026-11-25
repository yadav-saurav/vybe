import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import s from './ReorderTracks.module.css';

/**
 * Makes the rows of a TrackList reorderable (rows carry data-row-index).
 *  - Mouse / pen: press a row and drag it up or down; the drop line shows where it lands.
 *  - Keyboard: focus a row and press Alt+ArrowUp / Alt+ArrowDown.
 * The parent owns the order: onMove(from, to) is called once per completed move.
 */
export function ReorderTracks({ onMove, children }: { onMove: (from: number, to: number) => void; children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; from: number; startY: number; active: boolean; row: HTMLElement; to: number } | null>(null);
  const focusAfter = useRef<number | null>(null);
  const [announce, setAnnounce] = useState('');

  const rows = () => Array.from(wrap.current?.querySelectorAll<HTMLElement>('[data-row-index]') ?? []);

  // Keep keyboard focus on the moved row after the parent re-renders with the new order.
  useEffect(() => {
    if (focusAfter.current == null) return;
    const el = wrap.current?.querySelector<HTMLElement>(`[data-row-index="${focusAfter.current}"]`);
    focusAfter.current = null;
    el?.focus();
  });

  const hideIndicator = () => { if (indicator.current) indicator.current.style.opacity = '0'; };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType === 'touch') return; // touch keeps scrolling
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input')) return;
    const row = target.closest<HTMLElement>('[data-row-index]');
    if (!row || !wrap.current?.contains(row)) return;
    drag.current = { id: e.pointerId, from: Number(row.dataset.rowIndex), startY: e.clientY, active: false, row, to: -1 };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.abs(dy) < 4) return;
      d.active = true;
      wrap.current?.setPointerCapture(e.pointerId);
      d.row.classList.add(s.dragging);
    }
    d.row.style.transform = `translateY(${dy}px)`;
    const others = rows().filter((r) => r !== d.row);
    let to = 0;
    for (const r of others) {
      const b = r.getBoundingClientRect();
      if (e.clientY > b.top + b.height / 2) to++;
    }
    d.to = to;
    const box = wrap.current?.getBoundingClientRect();
    const ind = indicator.current;
    if (ind && box) {
      const edge = to < others.length ? others[to].getBoundingClientRect().top : (others.at(-1)?.getBoundingClientRect().bottom ?? box.top);
      ind.style.transform = `translateY(${edge - box.top - 1}px)`;
      ind.style.opacity = '1';
    }
  };

  const finishPointer = (e: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    d.row.style.transform = '';
    d.row.classList.remove(s.dragging);
    hideIndicator();
    if (!d.active) return;
    if (wrap.current?.hasPointerCapture(e.pointerId)) wrap.current.releasePointerCapture(e.pointerId);
    if (commit && d.to >= 0 && d.to !== d.from) {
      onMove(d.from, d.to);
      setAnnounce(`Moved to position ${d.to + 1}`);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-row-index]');
    if (!row) return;
    e.preventDefault();
    const count = rows().length;
    const from = Number(row.dataset.rowIndex);
    const to = Math.min(count - 1, Math.max(0, from + (e.key === 'ArrowUp' ? -1 : 1)));
    if (to === from) return;
    focusAfter.current = to;
    onMove(from, to);
    setAnnounce(`Moved to position ${to + 1} of ${count}`);
  };

  return (
    <div
      ref={wrap}
      className={s.reorder}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finishPointer(e, true)}
      onPointerCancel={(e) => finishPointer(e, false)}
      onKeyDown={onKeyDown}
    >
      <div ref={indicator} className={s.indicator} aria-hidden="true" />
      {children}
      <div className="visually-hidden" role="status" aria-live="polite">{announce}</div>
    </div>
  );
}
