import { create } from 'zustand';
import { api } from '../lib/api';

/** Server-side account flags for the signed-in user (loaded on sign-in, cleared on sign-out). */
interface AccountState {
  isDemo: boolean;
  shareActivity: boolean;
  load: () => Promise<void>;
  reset: () => void;
}

export const useAccount = create<AccountState>((set) => ({
  isDemo: false,
  shareActivity: false,
  load: async () => {
    try { const s = await api.settings(); set({ isDemo: s.isDemo, shareActivity: s.shareActivity }); } catch { set({ isDemo: false, shareActivity: false }); }
  },
  reset: () => set({ isDemo: false, shareActivity: false }),
}));

export const DEMO_NOTE = 'You’re using the shared demo account. Create your own free account to import music, change the password or edit the profile.';
