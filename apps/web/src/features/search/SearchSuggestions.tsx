import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { ContentItem, SearchSuggestion } from '@vybe/shared';
import { api } from '../../lib/api';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { titleOf } from '../../components/Lockup';
import { Highlight } from './Highlight';
import { richSubtitle } from './labels';
import { contentEntry, loadRecent, recentKey, saveRecent, type RecentEntry } from './recent';
import s from './search.module.css';

type Opt =
  | { key: string; kind: 'term'; term: string }
  | { key: string; kind: 'content'; item: ContentItem }
  | { key: string; kind: 'recent'; entry: RecentEntry };

const RECENT_LIMIT = 6;

const toOpt = (sg: SearchSuggestion): Opt[] => {
  if (sg.kind === 'term' && sg.term) return [{ key: `t:${sg.term}`, kind: 'term', term: sg.term }];
  if (sg.kind === 'content' && sg.item) return [{ key: `c:${sg.item.type}:${sg.item.data.id}`, kind: 'content', item: sg.item }];
  return [];
};

/**
 * Floating suggestions panel under a search input. It attaches to the input element it is given
 * (focus, blur, keyboard and ARIA combobox attributes), so the same component serves the sidebar
 * field on desktop and the page field on mobile.
 *  - empty term: shows Recent searches
 *  - term: shows api.suggestions() (term completions and content items), debounced
 *  - ↑/↓ move, Enter picks (otherwise the form submits as usual), Esc closes
 */
export function SearchSuggestions({ inputRef, term, onPickTerm }: {
  inputRef: RefObject<HTMLInputElement | null>;
  term: string;
  onPickTerm: (term: string) => void;
}) {
  const listId = useId();
  const navigate = useNavigate();
  const q = term.trim();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [fetched, setFetched] = useState<Opt[]>([]);

  // Remote suggestions for the current term (150ms debounce; a newer term aborts the older request).
  useEffect(() => {
    if (!q) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      api.suggestions(q, ctrl.signal)
        .then(({ suggestions }) => { if (!ctrl.signal.aborted) setFetched(suggestions.flatMap(toOpt)); })
        .catch(() => { /* aborted or offline: keep the last list */ });
    }, 150);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [q]);

  const recents = useMemo<Opt[]>(
    () => (open && !q ? loadRecent().slice(0, RECENT_LIMIT).map((entry) => ({ key: recentKey(entry), kind: 'recent', entry })) : []),
    [open, q],
  );
  const options: Opt[] = q ? (open ? fetched : []) : recents;

  // Latest values for native listeners attached once per input.
  const live = useRef({ options, active, open });
  live.current = { options, active, open };

  const pick = (o: Opt) => {
    setOpen(false);
    setActive(-1);
    if (o.kind === 'term') {
      saveRecent({ kind: 'term', term: o.term });
      onPickTerm(o.term);
    } else {
      const entry = o.kind === 'content' ? contentEntry(o.item) : o.entry;
      saveRecent(entry);
      if (entry.kind === 'term') onPickTerm(entry.term);
      else navigate(entry.href);
    }
    inputRef.current?.blur();
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-controls', listId);
    const onFocus = () => setOpen(true);
    const onBlur = () => { setOpen(false); setActive(-1); };
    const onKey = (e: KeyboardEvent) => {
      const { options: opts, active: cur, open: isOpen } = live.current;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen) { setOpen(true); return; }
        if (!opts.length) return;
        const n = opts.length;
        setActive(e.key === 'ArrowDown' ? (cur + 1) % n : cur <= 0 ? n - 1 : cur - 1);
      } else if (e.key === 'Enter') {
        if (isOpen && cur >= 0 && opts[cur]) { e.preventDefault(); pickRef.current(opts[cur]); }
      } else if (e.key === 'Escape') {
        if (isOpen) { e.preventDefault(); setOpen(false); setActive(-1); }
      }
    };
    el.addEventListener('focus', onFocus);
    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKey);
    if (document.activeElement === el) setOpen(true);
    return () => {
      el.removeEventListener('focus', onFocus);
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKey);
      el.removeAttribute('role');
      el.removeAttribute('aria-autocomplete');
      el.removeAttribute('aria-controls');
      el.removeAttribute('aria-expanded');
      el.removeAttribute('aria-activedescendant');
    };
  }, [inputRef, listId]);

  const showing = open && options.length > 0;
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.setAttribute('aria-expanded', String(showing));
    if (showing && active >= 0) el.setAttribute('aria-activedescendant', `${listId}-${active}`);
    else el.removeAttribute('aria-activedescendant');
  });

  // Reset the highlighted row whenever the list it refers to changes.
  useEffect(() => { setActive(-1); }, [q, open, fetched]);

  if (!showing) return null;
  return (
    <ul id={listId} role="listbox" aria-label={q ? 'Suggestions' : 'Recent searches'} className={s.panel}
      onMouseDown={(e) => e.preventDefault() /* keep focus in the field */}>
      {!q && <li role="presentation" className={s.caption}>Recent</li>}
      {options.map((o, i) => (
        <li key={o.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}
          className={clsx(s.option, i === active && s.active)}
          onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
          <OptionBody opt={o} query={q} />
        </li>
      ))}
    </ul>
  );
}

function OptionBody({ opt, query }: { opt: Opt; query: string }) {
  if (opt.kind === 'term' || (opt.kind === 'recent' && opt.entry.kind === 'term')) {
    const text = opt.kind === 'term' ? opt.term : opt.kind === 'recent' && opt.entry.kind === 'term' ? opt.entry.term : '';
    const isRecent = opt.kind === 'recent';
    return (
      <>
        <span className={s.optIcon}><Icon name={isRecent ? 'clock' : 'search'} size={16} /></span>
        <span className={clsx(s.optTitle, 'clamp-1')}><Highlight text={text} term={isRecent ? '' : query} /></span>
      </>
    );
  }
  // Content: either a live suggestion or a stored recent entry.
  const view = opt.kind === 'content'
    ? { title: titleOf(opt.item), subtitle: richSubtitle(opt.item), artwork: opt.item.data.artwork, round: opt.item.type === 'artist' }
    : opt.entry.kind === 'content'
      ? { title: opt.entry.title, subtitle: opt.entry.subtitle, artwork: opt.entry.artwork, round: opt.entry.type === 'artist' }
      : null;
  if (!view) return null;
  return (
    <>
      <span className={s.thumb}><Artwork artwork={view.artwork} size={80} rounded={view.round ? 'circle' : 'xs'} /></span>
      <span className={s.optText}>
        <span className={clsx(s.optTitle, 'clamp-1')}><Highlight text={view.title} term={query} /></span>
        <span className={clsx(s.optSub, 'clamp-1')}>{view.subtitle}</span>
      </span>
    </>
  );
}
