import type { Album, ContentItem, Playlist, Song, Station } from '@vybe/shared';
import { api } from '../lib/api';
import { usePlayer, type PlayContext } from '../stores/player';
import { useLibrary } from '../stores/library';
import { useUI, type MenuEntry } from '../stores/ui';
import { useAuth } from '../stores/auth';
import { invalidate } from '../lib/useAsync';
import { IMPORTED_PATH, isImported } from '../lib/imports';
import { useJam } from '../stores/jam';

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
export function menuFor(item: ContentItem, opts: { extra?: MenuEntry[]; navigate?: (to: string) => void; sleepTimer?: boolean } = {}): MenuEntry[] {
  const lib = useLibrary.getState();
  const ui = useUI.getState();
  const t = libType(item);
  const nav = opts.navigate;
  // Imported tracks are always in the library (removing them is "Delete from Vybe") and have no public page.
  const imported = item.type === 'song' && isImported(item.data);
  const inLib = !!t && lib.has(t, item.data.id);
  const ownPlaylist = item.type === 'playlist' && (item.data as Playlist).kind === 'user' && (item.data as Playlist).ownerId === useAuth.getState().user?.id;

  // Fixed order, identical everywhere: Play → Library → Go to → Share → destructive (red, always last).
  const play: MenuEntry[] = [];
  if (item.type !== 'artist') {
    play.push({ label: 'Play Next', icon: 'play-next', onSelect: () => queueItem(item, 'next') });
    play.push({ label: 'Play Last', icon: 'play-later', onSelect: () => queueItem(item, 'later') });
  }
  if (item.type === 'song' || item.type === 'artist') play.push({ label: 'Create Station', icon: 'radio', onSelect: () => startStationFrom(item) });

  const library: MenuEntry[] = [];
  if (t && !inLib && !ownPlaylist && !imported) library.push({ label: 'Add to Library', icon: 'plus', onSelect: () => lib.toggle(t, item.data.id) });
  if (t && item.type !== 'artist') {
    const loved = lib.isLoved(item.data.id);
    library.push({ label: loved ? 'Undo Favorite' : 'Favorite', icon: loved ? 'heart-fill' : 'heart', onSelect: () => lib.toggleLove(t, item.data.id) });
  }
  if (item.type === 'song' || item.type === 'album' || item.type === 'playlist') {
    library.push({ label: 'Add to a Playlist…', icon: 'playlist', onSelect: async () => {
      if (!useAuth.getState().user) { ui.openSignIn(); return; }
      const { songs } = item.type === 'song' ? { songs: [item.data] } : await tracksFor(item);
      ui.openAddToPlaylist(songs);
    } });
  }

  const goTo: MenuEntry[] = [];
  if (nav) {
    if (imported) {
      goTo.push({ label: 'Go to Imported', icon: 'upload', onSelect: () => nav(`${IMPORTED_PATH}?i=${encodeURIComponent(item.data.id)}`) });
    } else if (item.type === 'song') {
      goTo.push({ label: 'Go to Album', icon: 'album', onSelect: () => nav(`/album/${item.data.album.id}?i=${item.data.id}`) });
      goTo.push({ label: 'Go to Artist', icon: 'artist', onSelect: () => nav(`/artist/${item.data.artist.id}`) });
    } else if (item.type === 'album') goTo.push({ label: 'Go to Artist', icon: 'artist', onSelect: () => nav(`/artist/${(item.data as Album).artist.id}`) });
  }
  if (item.type === 'song') goTo.push({ label: 'Credits', icon: 'info', onSelect: () => ui.openCredits(item.data) });

  if (opts.sleepTimer) {
    goTo.push({ label: useJam.getState().jam ? 'Jam…' : 'Start a Jam…', icon: 'jam', onSelect: () => useJam.getState().setSheetOpen(true) });
    goTo.push({ label: 'Sleep Timer…', icon: 'clock', onSelect: () => ui.setSleepOpen(true) });
  }
  const share: MenuEntry[] = imported ? [] : [{ label: 'Share', icon: 'share', onSelect: () => ui.share(item) }];

  const destructive: MenuEntry[] = [...(opts.extra ?? [])];
  if (t && inLib && !ownPlaylist && !imported) destructive.push({ label: 'Remove from Library', icon: 'trash', destructive: true, onSelect: () => lib.toggle(t, item.data.id) });

  const groups = [play, library, [...goTo, ...share], destructive].filter((g) => g.length);
  return groups.flatMap((g, i) => (i ? ['separator' as const, ...g] : g));
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
