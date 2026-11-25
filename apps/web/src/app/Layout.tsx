import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar, VybeWordmark } from './Sidebar';
import { Icon } from '../components/Icon';
import { ContextMenuHost } from '../components/ContextMenu';
import { Toasts } from '../components/Toasts';
import { useUI } from '../stores/ui';
import { useAuth } from '../stores/auth';
import { PlayerChrome, NowPlaying, PlayerEngine } from '../features/player';
import { Overlays } from '../features/overlays';
import s from './Layout.module.css';

/** Remembers scroll per history entry (back/forward restores position, new navigation scrolls to top). */
function useScrollRestoration(ref: React.RefObject<HTMLElement | null>) {
  const location = useLocation();
  const positions = useRef(new Map<string, number>());
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const key = location.key;
    el.scrollTop = positions.current.get(key) ?? 0;
    const onScroll = () => positions.current.set(key, el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [location.key, ref]);
}

export function Layout() {
  const main = useRef<HTMLElement>(null);
  useScrollRestoration(main);
  const user = useAuth((a) => a.user);
  return (
    <div className={s.app}>
      <Sidebar />
      <div className={s.column}>
        <header className={s.mobileHeader}>
          <button aria-label="Open navigation" className={s.menuBtn} onClick={() => useUI.getState().setMobileNavOpen(true)}><Icon name="menu" size={22} /></button>
          <VybeWordmark height={22} />
          {user ? <span className={s.mobileAvatar} style={{ background: user.avatarColor }}>{user.displayName[0]?.toUpperCase()}</span>
            : <button className={s.mobileSignIn} onClick={() => useUI.getState().openSignIn()}>Sign In</button>}
        </header>
        <main ref={main} id="main" className={s.main} tabIndex={-1}>
          <Suspense fallback={<div className={s.loading} aria-busy="true" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <PlayerChrome />
      <NowPlaying />
      <PlayerEngine />
      <Overlays />
      <ContextMenuHost />
      <Toasts />
    </div>
  );
}
