import { Fragment } from 'react';
import s from './search.module.css';

/** Wraps every case-insensitive occurrence of `term` in `text` with a highlighted <mark>. */
export function Highlight({ text, term }: { text: string; term: string }) {
  const q = term.trim();
  if (!q) return <>{text}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <mark key={i} className={s.mark}>{part}</mark> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}
