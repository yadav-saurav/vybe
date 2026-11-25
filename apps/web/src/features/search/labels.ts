import type { ContentItem } from '@vybe/shared';

/** Short type name shown in lockups, suggestions and recents. */
export const typeLabel = (item: ContentItem): string => {
  switch (item.type) {
    case 'song': return 'Song';
    case 'album':
      return item.data.type === 'single' ? 'Single' : item.data.type === 'ep' ? 'EP' : item.data.type === 'compilation' ? 'Compilation' : 'Album';
    case 'playlist': return item.data.kind === 'personal-mix' ? 'Mix' : 'Playlist';
    case 'artist': return 'Artist';
    case 'station': return 'Station';
  }
};

/** "Album · Artist" style subtitle used by the mixed Top Results lockups. */
export const richSubtitle = (item: ContentItem): string => {
  switch (item.type) {
    case 'song': return `Song · ${item.data.artist.name}`;
    case 'album': return `${typeLabel(item)} · ${item.data.artist.name}`;
    case 'playlist': return `${typeLabel(item)} · ${item.data.curatorName}`;
    case 'artist': return 'Artist';
    case 'station': return 'Station';
  }
};
