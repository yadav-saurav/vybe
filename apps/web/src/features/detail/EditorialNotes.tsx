import { useLayoutEffect, useRef, useState } from 'react';
import { NotesSheet } from './Sheet';
import s from './EditorialNotes.module.css';

/** Notes clamped to three lines; a MORE button appears only when the text actually overflows. */
export function EditorialNotes({ text, title }: { text: string; title: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div className={s.notes}>
      <p ref={ref} className={s.text}>{text}</p>
      {clamped && <button className={s.more} onClick={() => setOpen(true)} aria-haspopup="dialog">MORE</button>}
      {open && <NotesSheet title={title} text={text} onClose={() => setOpen(false)} />}
    </div>
  );
}
