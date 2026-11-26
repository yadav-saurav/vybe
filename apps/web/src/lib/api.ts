import type * as T from '@vybe/shared';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

/** Worldwide reads retry quietly when the music service is briefly busy (HTTP 503), up to twice. */
async function request<R>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<R> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await requestOnce<R>(method, path, body, signal);
    } catch (e) {
      const busy = e instanceof ApiError && e.status === 503 && method === 'GET' && path.startsWith('/world/');
      if (!busy || attempt >= 2 || signal?.aborted) throw e;
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    }
  }
}

async function requestOnce<R>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<R> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) {
    let code = 'http_error', message = res.statusText;
    try { const j = (await res.json()) as T.ApiError; code = j.error.code; message = j.error.message; } catch { /* non-JSON */ }
    throw new ApiError(res.status, code, message);
  }
  return res.status === 204 ? (undefined as R) : ((await res.json()) as R);
}

const get = <R>(p: string, s?: AbortSignal) => request<R>('GET', p, undefined, s);

/**
 * Short-lived memory cache for worldwide pages (albums, artists, Show all). Hovering a card warms it,
 * so the page is usually ready by the time it's clicked. Failed requests are forgotten.
 */
const memo = new Map<string, { at: number; p: Promise<unknown> }>();
const MEMO_MS = 10 * 60_000;
function cachedGet<R>(path: string): Promise<R> {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.p as Promise<R>;
  const p = request<R>('GET', path).catch((e) => { memo.delete(path); throw e; });
  memo.set(path, { at: Date.now(), p });
  if (memo.size > 300) memo.delete(memo.keys().next().value as string);
  return p;
}
/** Resolve with the cached promise, but let the caller stop waiting (component unmounted). */
const withSignal = <R,>(p: Promise<R>, s?: AbortSignal) => (s ? Promise.race([p, new Promise<R>((_, rej) => s.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')), { once: true }))]) : p);
export const prefetch = (path: string) => { cachedGet(path).catch(() => {}); };
const enc = encodeURIComponent;

export const api = {
  // auth
  me: () => get<{ user: T.User | null }>('/auth/me'),
  signIn: (email: string, password: string) => request<{ user: T.User }>('POST', '/auth/signin', { email, password }),
  signUp: (email: string, password: string, displayName: string) => request<{ user: T.User }>('POST', '/auth/signup', { email, password, displayName }),
  signOut: () => request<{ ok: true }>('POST', '/auth/signout', {}),

  // pages
  page: (name: 'home' | 'new' | 'radio', s?: AbortSignal) => get<T.PageResponse>(`/pages/${name}`, s),
  browseCategories: (s?: AbortSignal) => get<{ genres: T.Genre[] }>('/pages/browse-categories', s),
  genre: (id: string, s?: AbortSignal) => get<T.PageResponse>(`/genres/${enc(id)}`, s),

  // catalog
  song: (id: string) => get<{ song: T.Song }>(`/songs/${enc(id)}`),
  songs: (ids: string[]) => ids.length ? get<{ songs: T.Song[] }>(`/songs?ids=${ids.map(enc).join(',')}`) : Promise.resolve({ songs: [] }),
  lyrics: (id: string, s?: AbortSignal) => get<{ lines: T.LyricLine[] }>(`/songs/${enc(id)}/lyrics`, s),
  album: (id: string, s?: AbortSignal) => get<T.AlbumPage>(`/albums/${enc(id)}`, s),
  artist: (id: string, s?: AbortSignal) => get<T.ArtistPage>(`/artists/${enc(id)}`, s),
  artistSongs: (id: string, sort: 'popularity' | 'date' = 'popularity') => get<{ songs: T.Song[] }>(`/artists/${enc(id)}/songs?sort=${sort}`),
  playlist: (id: string, s?: AbortSignal) => get<T.PlaylistPage>(`/playlists/${enc(id)}`, s),
  stationNext: (id: string, exclude: string[] = [], count = 10) =>
    get<T.StationPlayback>(`/stations/${enc(id)}/next?count=${count}&exclude=${exclude.map(enc).join(',')}`),
  autoplay: (songId: string, exclude: string[] = [], count = 10) =>
    get<{ songs: T.Song[] }>(`/recommendations/autoplay?songId=${enc(songId)}&count=${count}&exclude=${exclude.map(enc).join(',')}`),

  // search
  search: (term: string, s?: AbortSignal) => get<T.SearchResults>(`/search?term=${enc(term)}&limit=25`, s),
  suggestions: (term: string, s?: AbortSignal) => get<{ suggestions: T.SearchSuggestion[] }>(`/search/suggestions?term=${enc(term)}`, s),

  // profile
  updateProfile: (patch: { displayName?: string; avatarColor?: string }) => request<{ user: T.User }>('PATCH', '/me', patch),
  changePassword: (currentPassword: string, newPassword: string) => request<{ ok: true }>('PUT', '/me/password', { currentPassword, newPassword }),
  deleteAccount: (password: string) => request<{ ok: true }>('DELETE', '/me', { password }),
  settings: (s?: AbortSignal) => get<{ shareActivity: boolean; isDemo: boolean }>('/me/settings', s),
  updateSettings: (patch: { shareActivity?: boolean }) => request<{ shareActivity: boolean; isDemo: boolean }>('PATCH', '/me/settings', patch),
  searchListeners: (q: string, s?: AbortSignal) => get<{ listeners: ListenerCard[] }>(`/users/search?q=${enc(q)}`, s),
  followersOf: (id: string, s?: AbortSignal) => get<{ listeners: ListenerCard[] }>(`/users/${enc(id)}/followers`, s),
  followingOf: (id: string, s?: AbortSignal) => get<{ listeners: ListenerCard[] }>(`/users/${enc(id)}/following`, s),
  userProfile: (id: string, s?: AbortSignal) => get<PublicProfile>(`/users/${enc(id)}`, s),
  follow: (id: string) => request<PublicProfile>('PUT', `/me/following/${enc(id)}`),
  unfollow: (id: string) => request<PublicProfile>('DELETE', `/me/following/${enc(id)}`),

  // jam (listen together)
  myJam: () => get<{ jam?: JamView | null }>('/me/jam'),
  jam: (code: string) => get<JamView>(`/jams/${enc(code)}`),
  startJam: (body: { songIds: string[]; index?: number; positionMs?: number; playing?: boolean }) => request<JamView>('POST', '/jams', body),
  joinJam: (code: string) => request<JamView>('POST', `/jams/${enc(code)}/join`),
  leaveJam: (code: string) => request<void>('POST', `/jams/${enc(code)}/leave`),
  jamControl: (code: string, action: JamAction, extra: { positionMs?: number; index?: number } = {}) =>
    request<JamView>('POST', `/jams/${enc(code)}/control`, { action, ...extra }),
  jamAdd: (code: string, songIds: string[], position: 'next' | 'last') => request<JamView>('POST', `/jams/${enc(code)}/queue`, { songIds, position }),
  jamRemove: (code: string, entryId: string) => request<JamView>('DELETE', `/jams/${enc(code)}/queue/${enc(entryId)}`),
  jamSettings: (code: string, patch: { guestsCanControl?: boolean }) => request<JamView>('PATCH', `/jams/${enc(code)}`, patch),
  jamEventsUrl: (code: string) => `/api/jams/${enc(code)}/events`,

  // worldwide (Apple previews)
  worldCountries: () => get<{ countries: { code: string; name: string }[] }>('/world/countries'),
  worldChart: (country: string, s?: AbortSignal) => get<WorldList>(`/world/charts?country=${enc(country)}`, s),
  worldHome: (s?: AbortSignal) => get<WorldHome>('/world/home', s),
  artistPhotos: (names: string[], s?: AbortSignal) => get<{ photos: Record<string, T.Artwork> }>(`/world/artist-photos?names=${names.map(enc).join(',')}`, s),
  worldGenreCovers: (s?: AbortSignal) => get<{ covers: Record<string, T.Artwork> }>('/world/genre-covers', s),
  worldSection: (name: string, s?: AbortSignal) => get<WorldHome>(`/world/section/${name}`, s),
  worldShelf: (id: string, s?: AbortSignal) => withSignal(cachedGet<WorldShelf>(`/world/shelves/${enc(id)}`), s),
  worldAlbum: (id: string, s?: AbortSignal) => withSignal(cachedGet<{ album: WorldAlbum; songs: T.Song[] }>(`/world/albums/${enc(id)}`), s),
  worldSearchAll: (term: string, country: string, s?: AbortSignal) => get<{ songs: T.Song[]; artists: WorldArtist[]; albums: WorldAlbum[] }>(`/world/search-all?term=${enc(term)}&country=${enc(country)}`, s),
  worldArtist: (id: string, country: string, s?: AbortSignal) => withSignal(cachedGet<{ artist: WorldArtist; songs: T.Song[] }>(`/world/artists/${enc(id)}?country=${enc(country)}`), s),
  worldSearch: (term: string, country: string, s?: AbortSignal) => get<WorldList>(`/world/search?term=${enc(term)}&country=${enc(country)}`, s),

  // replay
  stats: (period: 'week' | 'month' | 'year' | 'all', s?: AbortSignal) => get<ReplayStats>(`/me/stats?period=${period}`, s),

  // library
  library: () => get<T.LibraryState>('/me/library'),
  addToLibrary: (type: LibType, id: string) => request<T.LibraryState>('PUT', `/me/library/${type}/${enc(id)}`),
  removeFromLibrary: (type: LibType, id: string) => request<T.LibraryState>('DELETE', `/me/library/${type}/${enc(id)}`),
  love: (type: LibType, id: string) => request<T.LibraryState>('PUT', `/me/loves/${type}/${enc(id)}`),
  unlove: (type: LibType, id: string) => request<T.LibraryState>('DELETE', `/me/loves/${type}/${enc(id)}`),
  librarySongs: (s?: AbortSignal) => get<{ songs: T.Song[] }>('/me/library/songs', s),
  libraryAlbums: (s?: AbortSignal) => get<{ albums: T.Album[] }>('/me/library/albums', s),
  libraryArtists: (s?: AbortSignal) => get<{ artists: T.Artist[] }>('/me/library/artists', s),
  libraryPlaylists: (s?: AbortSignal) => get<{ playlists: T.Playlist[] }>('/me/library/playlists', s),
  recentlyAdded: (s?: AbortSignal) => get<{ items: T.ContentItem[] }>('/me/recently-added', s),
  history: (limit = 50) => get<{ entries: (T.PlayHistoryEntry & { song: T.Song })[] }>(`/me/history?limit=${limit}`),
  logPlay: (songId: string, playedMs: number, contextType?: T.ContentType, contextId?: string) =>
    request<{ ok: true }>('POST', '/me/history', { songId, playedMs, contextType, contextId }),

  // user playlists
  createPlaylist: (name: string, description = '', trackIds: string[] = []) => request<{ playlist: T.Playlist }>('POST', '/me/playlists', { name, description, trackIds }),
  updatePlaylist: (id: string, patch: Partial<Pick<T.Playlist, 'name' | 'description' | 'isPublic' | 'isCollaborative' | 'trackIds'>>) =>
    request<{ playlist: T.Playlist }>('PATCH', `/me/playlists/${enc(id)}`, patch),
  addToPlaylist: (id: string, trackIds: string[]) => request<{ playlist: T.Playlist }>('POST', `/me/playlists/${enc(id)}/tracks`, { trackIds }),
  removeFromPlaylist: (id: string, index: number) => request<{ playlist: T.Playlist }>('DELETE', `/me/playlists/${enc(id)}/tracks/${index}`),
  deletePlaylist: (id: string) => request<{ ok: true }>('DELETE', `/me/playlists/${enc(id)}`),

  // imported music (private to the signed-in user)
  importFiles,
  imports: (s?: AbortSignal) => get<{ songs: T.Song[] }>('/me/imports', s),
  deleteImport: (id: string) => request<{ ok: true }>('DELETE', `/me/imports/${enc(id)}`),
};

/**
 * Uploads audio files to POST /api/me/imports as multipart "files". Uses XMLHttpRequest because
 * fetch has no upload progress; `onProgress` receives the sent fraction (0..1) of the whole request.
 */
function importFiles(files: File[], onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<T.ImportResult> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    for (const f of files) body.append('files', f, f.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/me/imports');
    xhr.withCredentials = true;
    xhr.responseType = 'text';
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      let parsed: unknown;
      try { parsed = JSON.parse(xhr.responseText); } catch { parsed = undefined; }
      if (xhr.status >= 200 && xhr.status < 300 && parsed) { onProgress?.(1); resolve(parsed as T.ImportResult); return; }
      const err = (parsed as T.ApiError | undefined)?.error;
      reject(new ApiError(xhr.status, err?.code ?? 'http_error', err?.message ?? (xhr.statusText || 'Upload failed')));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network_error', 'Can’t reach Vybe right now'));
    xhr.onabort = () => reject(new ApiError(0, 'aborted', 'Upload cancelled'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

export type LibType = 'song' | 'album' | 'playlist' | 'artist';

export interface ReplayStats {
  period: string; from: string; to: string; totalMs: number; plays: number; uniqueSongs: number; uniqueArtists: number;
  longestStreakDays: number; activeDays: number; topHourLabel: string;
  topSongs: { song: T.Song; plays: number; ms: number }[];
  topArtists: { id: string; name: string; artist?: T.Artist; plays: number; ms: number }[];
  topGenres: { id: string; name: string; color: string; plays: number; share: number }[];
  byHour: number[]; byWeekday: number[]; byMonth: number[];
}

export interface PublicProfile {
  user: { id: string; displayName: string; avatarColor: string; createdAt: string };
  followers: number; following: number; isFollowing: boolean; isMe: boolean; playlists: T.Playlist[];
}

export interface ListenerCard { id: string; displayName: string; avatarColor: string; isFollowing: boolean; isMe: boolean }

export type JamAction = 'play' | 'pause' | 'seek' | 'next' | 'previous' | 'jump' | 'ended';
export interface JamEntry { entryId: string; song: T.Song; addedBy: string; addedById: string }
export interface JamListener { id: string; displayName: string; avatarColor: string; isHost: boolean; online: boolean }
/** A Jam's shared state. `positionMs` is the playhead as of `serverTime`. */
export interface JamView {
  code: string; hostId: string; hostName: string; guestsCanControl: boolean;
  queue: JamEntry[]; index: number; positionMs: number; playing: boolean;
  serverTime: number; version: number; listeners: JamListener[]; ended: boolean;
}

export interface WorldList { title: string; country: string; songs: T.Song[] }
export interface WorldArtist { id: string; name: string; genre: string; artwork: T.Artwork | null; country: string }
export interface WorldStation { id: string; name: string; description: string; artwork: T.Artwork; songs: T.Song[] }
export interface WorldAlbum { id: string; title: string; artistName: string; artistId: string; artwork: T.Artwork; releaseDate: string; country: string }
export interface WorldShelf { id: string; title: string; subtitle: string; kind: 'hero' | 'cards' | 'artists' | 'stations' | 'albums' | 'charts'; songs: T.Song[]; artists: WorldArtist[]; stations?: WorldStation[]; albums?: WorldAlbum[]; link?: string }
export interface WorldHome { shelves: WorldShelf[]; complete: boolean }
