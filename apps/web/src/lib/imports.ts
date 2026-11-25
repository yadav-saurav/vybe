import type { Song } from '@vybe/shared';

/** Imported tracks live only in the owner's library: they have no album, artist or shareable page. */
export const isImported = (song: Pick<Song, 'id' | 'source'>) => song.source === 'import' || song.id.startsWith('im_');

export const IMPORTED_PATH = '/library/imported';

/** Where a song's album link goes (imports open the Imported list, focused on the track). */
export const albumHref = (song: Song) => (isImported(song) ? `${IMPORTED_PATH}?i=${encodeURIComponent(song.id)}` : `/album/${song.album.id}?i=${song.id}`);

/** Where a song's artist link goes. */
export const artistHref = (song: Song) => (isImported(song) ? `${IMPORTED_PATH}?q=${encodeURIComponent(song.artist.name)}` : `/artist/${song.artist.id}`);

/** File types offered by the picker; the server re-checks extension and contents. */
export const IMPORT_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.flac,.ogg,.oga,.opus,.wav';
export const IMPORT_EXTENSIONS = ['mp3', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'wav'];
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
