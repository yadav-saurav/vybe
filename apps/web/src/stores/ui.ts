import { create } from 'zustand';
import type { ContentItem, Song } from '@vybe/shared';

export interface MenuAction {
  label: string;
  icon?: string; // icon name from components/Icon
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}
export type MenuEntry = MenuAction | 'separator';

export interface ContextMenuState { x: number; y: number; entries: MenuEntry[]; anchor?: DOMRect }

interface UIState {
  menu: ContextMenuState | null;
  openMenu: (m: ContextMenuState) => void;
  closeMenu: () => void;

  toasts: { id: number; text: string }[];
  toast: (text: string) => void;

  signInOpen: boolean;
  openSignIn: () => void;
  closeSignIn: () => void;

  /** "Add to Playlist" picker. */
  addToPlaylist: { songs: Song[] } | null;
  openAddToPlaylist: (songs: Song[]) => void;
  closeAddToPlaylist: () => void;

  /** New / edit playlist sheet. */
  playlistEditor: { mode: 'create'; seedSongs?: Song[] } | { mode: 'edit'; playlistId: string } | null;
  openPlaylistEditor: (s: UIState['playlistEditor']) => void;
  closePlaylistEditor: () => void;

  /** Full-screen Now Playing; panel = right side pane on desktop chrome player (lyrics/queue). */
  nowPlayingOpen: boolean;
  setNowPlayingOpen: (v: boolean) => void;
  sidePanel: 'lyrics' | 'queue' | null;
  setSidePanel: (p: UIState['sidePanel']) => void;

  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;

  theme: 'system' | 'light' | 'dark';
  setTheme: (t: UIState['theme']) => void;

  share: (item: ContentItem) => void;
}

let toastId = 0;
const savedTheme = (() => { try { return (localStorage.getItem('vybe:theme') as UIState['theme']) || 'system'; } catch { return 'system'; } })();
const applyTheme = (t: UIState['theme']) => {
  if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
};
applyTheme(savedTheme);

export const useUI = create<UIState>((set, get) => ({
  menu: null,
  openMenu: (menu) => set({ menu }),
  closeMenu: () => set({ menu: null }),

  toasts: [],
  toast: (text) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, text }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 2400);
  },

  signInOpen: false,
  openSignIn: () => set({ signInOpen: true }),
  closeSignIn: () => set({ signInOpen: false }),

  addToPlaylist: null,
  openAddToPlaylist: (songs) => set({ addToPlaylist: { songs } }),
  closeAddToPlaylist: () => set({ addToPlaylist: null }),

  playlistEditor: null,
  openPlaylistEditor: (playlistEditor) => set({ playlistEditor }),
  closePlaylistEditor: () => set({ playlistEditor: null }),

  nowPlayingOpen: false,
  setNowPlayingOpen: (nowPlayingOpen) => set({ nowPlayingOpen }),
  sidePanel: null,
  setSidePanel: (sidePanel) => set({ sidePanel }),

  mobileNavOpen: false,
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),

  theme: savedTheme,
  setTheme: (theme) => { try { localStorage.setItem('vybe:theme', theme); } catch { /* private mode */ } applyTheme(theme); set({ theme }); },

  share: (item) => {
    const path = item.type === 'song' ? `/album/${item.data.album.id}?i=${item.data.id}` : `/${item.type}/${item.data.id}`;
    const url = location.origin + path;
    navigator.clipboard?.writeText(url).then(() => get().toast('Link Copied'), () => get().toast(url));
  },
}));
