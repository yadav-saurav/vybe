/** Date and number formatting shared by the album, playlist and artist pages. */

export const formatLongDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

export const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

export const yearOf = (iso: string) => iso.slice(0, 4);

/** "Today", "Yesterday", "3 days ago", then a long date. Used for "Updated <…>" lines. */
export function updatedLabel(iso: string, now = Date.now()): string {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (!(days >= 1)) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatLongDate(iso);
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
/** 1200000 -> "1.2M" */
export const formatCompact = (n: number) => compact.format(n);

export const pluralSongs = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;
