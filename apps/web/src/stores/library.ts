import { create } from 'zustand';
import type { LibraryState } from '@vybe/shared';
import { api, type LibType } from '../lib/api';
import { invalidate } from '../lib/useAsync';
import { useUI } from './ui';
import { useAuth } from './auth';

const empty: LibraryState = { songIds: [], albumIds: [], playlistIds: [], artistIds: [], lovedIds: [], addedAt: {} };
type LibKey = 'songIds' | 'albumIds' | 'playlistIds' | 'artistIds';
const key = (t: LibType): LibKey => (t === 'song' ? 'songIds' : t === 'album' ? 'albumIds' : t === 'playlist' ? 'playlistIds' : 'artistIds');

interface Library extends LibraryState {
  loaded: boolean;
  load: () => Promise<void>;
  reset: () => void;
  has: (type: LibType, id: string) => boolean;
  isLoved: (id: string) => boolean;
  toggle: (type: LibType, id: string) => Promise<void>;
  toggleLove: (type: LibType, id: string) => Promise<void>;
}

/** Requires sign-in; otherwise opens the sign-in sheet. Optimistic updates with rollback. */
const requireAuth = () => {
  if (useAuth.getState().user) return true;
  useUI.getState().openSignIn();
  return false;
};

export const useLibrary = create<Library>((set, get) => ({
  ...empty,
  loaded: false,
  load: async () => { try { set({ ...(await api.library()), loaded: true }); } catch { set({ ...empty, loaded: true }); } },
  reset: () => set({ ...empty, loaded: false }),
  has: (type, id) => get()[key(type)].includes(id),
  isLoved: (id) => get().lovedIds.includes(id),
  toggle: async (type, id) => {
    if (!requireAuth()) return;
    const prev = get();
    const k = key(type);
    const adding = !prev[k].includes(id);
    set({ [k]: adding ? [id, ...prev[k]] : prev[k].filter((x) => x !== id) } as Partial<Library>);
    try {
      set(await (adding ? api.addToLibrary(type, id) : api.removeFromLibrary(type, id)));
      invalidate('library:');
      useUI.getState().toast(adding ? 'Added to Library' : 'Removed from Library');
    } catch { set({ [k]: prev[k] } as Partial<Library>); useUI.getState().toast('Something went wrong'); }
  },
  toggleLove: async (type, id) => {
    if (!requireAuth()) return;
    const prev = get().lovedIds;
    const loving = !prev.includes(id);
    set({ lovedIds: loving ? [id, ...prev] : prev.filter((x) => x !== id) });
    try { set(await (loving ? api.love(type, id) : api.unlove(type, id))); invalidate('library:'); }
    catch { set({ lovedIds: prev }); }
  },
}));
