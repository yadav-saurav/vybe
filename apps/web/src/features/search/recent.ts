import type { Artwork, ContentItem } from '@vybe/shared';
import { hrefFor, titleOf } from '../../components/Lockup';
import { richSubtitle } from './labels';

/** Recently searched terms and content, kept per browser (localStorage). */
export type RecentEntry =
  | { kind: 'term'; term: string }
  | { kind: 'content'; key: string; type: ContentItem['type']; title: string; subtitle: string; href: string; artwork: Artwork };

const KEY = 'vybe:search:recent';
const MAX = 10;

export const recentKey = (e: RecentEntry) => (e.kind === 'term' ? `t:${e.term.toLowerCase()}` : `c:${e.key}`);

export function loadRecent(): RecentEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as RecentEntry[]).slice(0, MAX) : [];
  } catch {
    return []; // private mode, blocked storage or corrupt JSON
  }
}

/** Moves the entry to the top of the list and returns the new list. */
export function saveRecent(entry: RecentEntry): RecentEntry[] {
  const id = recentKey(entry);
  const next = [entry, ...loadRecent().filter((e) => recentKey(e) !== id)].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  return next;
}

export function clearRecent() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

export function contentEntry(item: ContentItem): RecentEntry {
  return {
    kind: 'content',
    key: `${item.type}:${item.data.id}`,
    type: item.type,
    title: titleOf(item),
    subtitle: richSubtitle(item),
    href: hrefFor(item),
    artwork: item.data.artwork,
  };
}
