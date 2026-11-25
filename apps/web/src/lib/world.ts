import type { Song } from '@vybe/shared';

/**
 * Worldwide songs are Apple's official 30-second previews (ids `wd_<cc>_<trackId>`, albums
 * `wl_<cc>_<collectionId>`). They play everywhere in Vybe but have no Vybe album/artist page and
 * can't go in your library; "Listen on Apple Music" opens the full song.
 */
export const WORLD_PATH = '/world';
export const isWorld = (song: Pick<Song, 'id' | 'source'> | null | undefined) => !!song && (song.source === 'world' || song.id.startsWith('wd_'));

const parts = (id: string) => id.split('_'); // [prefix, cc, number]

export const appleMusicUrl = (song: Song) => {
  const [, cc, track] = parts(song.id);
  const [, , album] = parts(song.album.id);
  return `https://music.apple.com/${cc}/album/${album}?i=${track}`;
};

export const worldCountryOf = (song: Song) => parts(song.id)[1];

/** "More by this artist" / "this album" stay inside Vybe as a worldwide search. */
export const worldSearchHref = (term: string, country?: string) =>
  `${WORLD_PATH}?q=${encodeURIComponent(term)}${country ? `&c=${country}` : ''}`;

/** Storefronts offered in the app (the server accepts the same list). */
export const WORLD_COUNTRIES: { code: string; name: string }[] = [
  { code: 'in', name: 'India' }, { code: 'us', name: 'United States' }, { code: 'gb', name: 'United Kingdom' }, { code: 'kr', name: 'South Korea' },
  { code: 'jp', name: 'Japan' }, { code: 'br', name: 'Brazil' }, { code: 'mx', name: 'Mexico' }, { code: 'es', name: 'Spain' },
  { code: 'fr', name: 'France' }, { code: 'de', name: 'Germany' }, { code: 'it', name: 'Italy' }, { code: 'ng', name: 'Nigeria' },
  { code: 'za', name: 'South Africa' }, { code: 'ae', name: 'UAE' }, { code: 'eg', name: 'Egypt' }, { code: 'tr', name: 'Türkiye' },
  { code: 'pk', name: 'Pakistan' }, { code: 'np', name: 'Nepal' }, { code: 'id', name: 'Indonesia' }, { code: 'ph', name: 'Philippines' },
  { code: 'au', name: 'Australia' }, { code: 'ca', name: 'Canada' }, { code: 'ar', name: 'Argentina' }, { code: 'co', name: 'Colombia' },
];

const KEY = 'vybe:world:country';
/** The listener's last pick, else their browser region if offered, else India. */
export const worldDefaultCountry = () => {
  try { const saved = localStorage.getItem(KEY); if (saved && WORLD_COUNTRIES.some((c) => c.code === saved)) return saved; } catch { /* private mode */ }
  const region = (navigator.language.split('-')[1] ?? '').toLowerCase();
  return WORLD_COUNTRIES.some((c) => c.code === region) ? region : 'in';
};
export const rememberWorldCountry = (c: string) => { try { localStorage.setItem(KEY, c); } catch { /* ignore */ } };

/** A worldwide artist's page in Vybe (their popular songs as previews). */
export const worldArtistHref = (song: Song) => `${WORLD_PATH}/artist/${song.artist.id}?c=${worldCountryOf(song)}`;

/** Apple songs show licensed lyrics links (never copied text); Vybe's demo songs have their own synced lyrics. */
export const lyricsAvailable = (song: Song | null | undefined) => !!song && (song.hasLyrics || isWorld(song));
export const geniusSearchUrl = (song: Song) => `https://genius.com/search?q=${encodeURIComponent(`${song.title} ${song.artist.name}`)}`;
