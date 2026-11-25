import { useSyncExternalStore } from 'react';

/** "Add to Home Screen" support: captures the browser's install prompt so Settings can offer it. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; emit(); });
}

const isIosSafari = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);

export type InstallState = 'installed' | 'prompt' | 'ios' | 'unavailable';
const snapshot = (): InstallState => (installed ? 'installed' : deferred ? 'prompt' : isIosSafari() ? 'ios' : 'unavailable');

export const useInstallState = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, snapshot, () => 'unavailable' as InstallState);

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null; emit();
  return outcome === 'accepted';
}

/** Registers the service worker in production builds only (dev servers would cache stale modules). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* optional enhancement */ }); });
}
