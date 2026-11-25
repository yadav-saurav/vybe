import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Icon } from './Icon';
import s from './Shelf.module.css';

/**
 * Section with header + horizontally scrolling, scroll-snapped row of items.
 * `columns` = how many items fit per "page" at desktop width (reference uses 5 lockups/row at 1440px with 260px sidebar).
 */
export function Shelf({ title, href, children, columns = 5, rows = 1, className, headerExtra }: {
  title?: ReactNode; href?: string; children: ReactNode; columns?: number; rows?: number; className?: string; headerExtra?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const update = () => {
    const el = scroller.current; if (!el) return;
    setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  };
  useEffect(() => {
    update();
    const el = scroller.current; if (!el) return;
    const ro = new ResizeObserver(update); ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const page = (dir: 1 | -1) => { const el = scroller.current; if (el) el.scrollBy({ left: dir * (el.clientWidth + 20), behavior: 'smooth' }); };

  return (
    <section className={clsx(s.shelf, className)} style={{ ['--cols' as string]: columns, ['--rows' as string]: rows }}>
      {title && (
        <header className={s.header}>
          {href ? <Link to={href} className={clsx(s.title, s.titleLink)}>{title}<Icon name="chevron-right" size={14} /></Link> : <h2 className={s.title}>{title}</h2>}
          {headerExtra}
        </header>
      )}
      <div className={s.viewport}>
        <div ref={scroller} className={s.scroller} onScroll={update}>{children}</div>
        {!edges.start && <button className={clsx(s.nav, s.prev)} aria-label="Previous" onClick={() => page(-1)}><Icon name="chevron-left" size={16} /></button>}
        {!edges.end && <button className={clsx(s.nav, s.next)} aria-label="Next" onClick={() => page(1)}><Icon name="chevron-right" size={16} /></button>}
      </div>
    </section>
  );
}
