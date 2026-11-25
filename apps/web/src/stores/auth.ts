import { create } from 'zustand';
import type { User } from '@vybe/shared';
import { api } from '../lib/api';

interface AuthState {
  user: User | null;
  ready: boolean;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  init: async () => {
    try { const { user } = await api.me(); set({ user, ready: true }); } catch { set({ user: null, ready: true }); }
  },
  signIn: async (email, password) => { const { user } = await api.signIn(email, password); set({ user }); },
  signUp: async (email, password, displayName) => { const { user } = await api.signUp(email, password, displayName); set({ user }); },
  signOut: async () => { await api.signOut(); set({ user: null }); },
}));
