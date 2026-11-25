import type { Album, ContentItem, Playlist, Song, Station } from '@vybe/shared';
import { api } from '../lib/api';
import { usePlayer, type PlayContext } from '../stores/player';
import { useLibrary } from '../stores/library';
import { useUI, type MenuEntry } from '../stores/ui';
import { useAuth } from '../stores/auth';
import { invalidate } from '../lib/useAsync';
import { IMPORTED_PATH, isImported } from '../lib/imports';

/**
 * Central content actions so every surface (lockups, rows, headers, Now Playing) behaves identically.
 */

export async function tracksFor(item: ContentItem): Promise<{ songs: Song[]; context: PlayContext }> {
  switch (item.type) {
    case 'song': return { songs: [item.data], context: { type: 'album', id: item.data.album.id, title: item.data.album.title } };
    case 'album': { const p = await api.album(item.data.id); return { songs: p.tracks, context: { type: 'album', id: item.data.id, title: item.data.title } }; }
    case 'playlist': { const p = await api.playlist(item.data.id); return { songs: p.tracks, context: { type: 'playlist', id: item.data.id, title: item.data.name } }; }
    case 'artist': { const p = await api.artist(item.data.id); return { songs: p.topSongs, context: { type: 'artist', id: item.data.id, title: item.data.name } }; }
    case 'station': { const p = await api.stationNext(item.data.id); return { songs: p.tracks, context: { type: 'station', id: item.data.id, title: item.data.name } }; }
  }
}

export async function playItem(item: ContentItem, opts?: { shuffle?: boolean }) {
  try {
    if (item.type === 'station') return playStation(item.data);
    const { songs, context } = await tracksFor(item);
    usePlayer.getState().playSongs(songs, 0, context, opts);
  } catch { useUI.getState().toast('Unable to play right now'); }
}

export async function playStation(station: Station) {
  const { tracks } = await api.stationNext(station.id);
  usePlayer.getState().playStation(station.id, station.name, tracks);
}

/** Play a song within its list (album/playlist page row double-click / click). */
export const playFromList = (songs: Song[], index: number, context: PlayContext) => usePlayer.getState().playSongs(songs, index, context);

export async function queueItem(item: ContentItem, where: 'next' | 'later') {
  try {
    const { songs } = item.type === 'song' ? { songs: [item.data] } : await tracksFor(item);
    const p = usePlayer.getState();
    if (where === 'next') p.playNext(songs); else p.playLater(songs);
    useUI.getState().toast(where === 'next' ? 'Playing Next' : 'Added to Queue');
  } catch { useUI.getState().toast('Something went wrong'); }
}

export async function startStationFrom(item: ContentItem) {
  // "Create Station" from a song/artist: uses autoplay recommendations seeded by the song.
  const seed = item.type === 'song' ? item.data : item.type === 'artist' ? (await api.artist(item.data.id)).topSongs[0] : null;
  if (!seed) return;
  const { songs } = await api.autoplay(seed.id, [], 25);
  usePlayer.getState().playSongs([seed, ...songs], 0, { type: 'station', id: `seed:${seed.id}`, title: `${seed.title} Station` });
}

const libType = (item: ContentItem) => (item.type === 'station' ? null : item.type);

/** Build the "···" context menu for any content item. `extra` entries are prepended (e.g. "Remove from Playlist"). */
export function menuFor(item: ContentItem, opts: { extra?: MenuEntry[]; navigate?: (to: string) => void } = {}): MenuEntry[] {
  const lib = useLibrary.getState();
  const ui = useUI.getState();
  const t = libType(item);
  const entries: MenuEntry[] = [...(opts.extra ?? [])];
  if (opts.extra?.length) entries.push('separator');

  // Imported tracks are always in the library (removing them is "Delete from Vybe") and have no public page.
  const imported = item.type === 'song' && isImported(item.data);
  if (t) {
    const inLib = lib.has(t, item.data.id);
    if (!(item.type === 'playlist' && (item.data as Playlist).kind === 'user') && !imported) {
      entries.push({ label: inLib ? 'Remove from Library' : 'Add to Library', icon: inLib ? 'trash' : 'plus', destructive: inLib, onSelect: () => lib.toggle(t, item.data.id) });
    }
    if (item.type !== 'artist') {
      const loved = lib.isLoved(item.data.id);
      entries.push({ label: loved ? 'Undo Favorite' : 'Favorite', icon: loved ? 'heart-fill' : 'heart', onSelect: () => lib.toggleLove(t, item.data.id) });
    }
  }
  if (item.type === 'song' || item.type === 'album' || item.type === 'playlist') {
    entries.push({ label: 'Add to a Playlist…', icon: 'playlist', onSelect: async () => {
      if (!useAuth.getState().user) { ui.openSignIn(); return; }
      const { songs } = item.type === 'song' ? { songs: [item.data] } : await tracksFor(item);
      ui.openAddToPlaylist(songs);
    } });
  }
  entries.push('separator');
  if (item.type !== 'artist') {
    entries.push({ label: 'Play Next', icon: 'play-next', onSelect: () => queueItem(item, 'next') });
    entries.push({ label: 'Play Last', icon: 'play-later', onSelect: () => queueItem(item, 'later') });
  }
  if (item.type === 'song' || item.type === 'artist') entries.push({ label: 'Create Station', icon: 'radio', onSelect: () => startStationFrom(item) });
  entries.push('separator');
  if (opts.navigate) {
    const nav = opts.navigate;
    if (imported) {
      entries.push({ label: 'Go to Imported', icon: 'upload', onSelect: () => nav(`${IMPORTED_PATH}?i=${encodeURIComponent(item.data.id)}`) });
    } else if (item.type === 'song') {
      entries.push({ label: 'Go to Album', icon: 'album', onSelect: () => nav(`/album/${item.data.album.id}?i=${item.data.id}`) });
      entries.push({ label: 'Go to Artist', icon: 'artist', onSelect: () => nav(`/artist/${item.data.artist.id}`) });
    } else if (item.type === 'album') entries.push({ label: 'Go to Artist', icon: 'artist', onSelect: () => nav(`/artist/${(item.data as Album).artist.id}`) });
  }
  if (!imported) entries.push({ label: 'Share', icon: 'share', onSelect: () => ui.share(item) });
  // Trim trailing / duplicate separators
  return entries.filter((e, i, a) => e !== 'separator' || (i > 0 && i < a.length - 1 && a[i - 1] !== 'separator'));
}

/** Open a context menu at a mouse event or anchored under a button. */
export function openMenuAt(e: { clientX: number; clientY: number; currentTarget?: EventTarget | null; preventDefault?: () => void; stopPropagation?: () => void }, entries: MenuEntry[]) {
  e.preventDefault?.();
  e.stopPropagation?.();
  const el = e.currentTarget as HTMLElement | null;
  const anchor = el && 'getBoundingClientRect' in el ? el.getBoundingClientRect() : undefined;
  useUI.getState().openMenu({ x: e.clientX, y: e.clientY, entries, anchor: e.clientX === 0 && e.clientY === 0 ? anchor : undefined });
}

export async function addSongsToPlaylist(playlistId: string, songs: Song[], playlistName: string) {
  await api.addToPlaylist(playlistId, songs.map((x) => x.id));
  invalidate(`playlist:${playlistId}`);
  invalidate('library:');
  useUI.getState().toast(`Added to “${playlistName}”`);
}
