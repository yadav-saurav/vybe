import type * as T from '@vybe/shared';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

async function request<R>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<R> {
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
  updatePlaylist: (id: string, patch: Partial<Pick<T.Playlist, 'name' | 'description' | 'isPublic' | 'trackIds'>>) =>
    request<{ playlist: T.Playlist }>('PATCH', `/me/playlists/${enc(id)}`, patch),
  addToPlaylist: (id: string, trackIds: string[]) => request<{ playlist: T.Playlist }>('POST', `/me/playlists/${enc(id)}/tracks`, { trackIds }),
  removeFromPlaylist: (id: string, index: number) => request<{ playlist: T.Playlist }>('DELETE', `/me/playlists/${enc(id)}/tracks/${index}`),
  deletePlaylist: (id: string) => request<{ ok: true }>('DELETE', `/me/playlists/${enc(id)}`),
};

export type LibType = 'song' | 'album' | 'playlist' | 'artist';
