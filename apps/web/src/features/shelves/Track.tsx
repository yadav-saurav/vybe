import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Icon } from '../../components/Icon';
import s from './Track.module.css';

export type TrackVariant = 'default' | 'hero' | 'chart' | 'large';

/**
 * Horizontal, scroll-snapped row of shelf items. Same behaviour as components/Shelf (hover arrows, snap, resize
 * aware), but the column sizing can differ per layout: hero cards, chart columns and large tiles.
 * `columns` = items per viewport at desktop width; children are the grid items (one per column).
 */
export function Track({ title, subtitle, href, columns, rows = 1, variant = 'default', label, children }: {
  title?: string; subtitle?: string; href?: string; columns: number; rows?: number; variant?: TrackVariant; label?: string; children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const start = el.scrollLeft <= 2;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    update();
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, children]);

  const page = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <section className={s.section} aria-label={label ?? title}>
      {title && (
        <header className={s.header}>
          <div className={s.heading}>
            <h2 className={s.title}>
              {href ? <Link to={href} className={s.titleLink}>{title}<Icon name="chevron-right" size={14} /></Link> : title}
            </h2>
            {subtitle && <p className={s.subtitle}>{subtitle}</p>}
          </div>
        </header>
      )}
      <div className={s.viewport}>
        <div
          ref={scroller}
          className={clsx(s.scroller, s[variant])}
          onScroll={update}
          style={{ '--cols': columns, '--rows': rows } as CSSProperties}
        >
          {children}
        </div>
        {!edges.start && <button type="button" className={clsx(s.nav, s.prev)} aria-label="Previous" onClick={() => page(-1)}><Icon name="chevron-left" size={16} /></button>}
        {!edges.end && <button type="button" className={clsx(s.nav, s.next)} aria-label="Next" onClick={() => page(1)}><Icon name="chevron-right" size={16} /></button>}
      </div>
    </section>
  );
}
