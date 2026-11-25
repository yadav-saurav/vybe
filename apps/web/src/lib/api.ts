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
