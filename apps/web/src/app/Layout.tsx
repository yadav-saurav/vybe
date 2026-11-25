import { Suspense, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar, VybeWordmark, accountMenu } from './Sidebar';
import { openMenuAt } from '../features/actions';
import { Icon } from '../components/Icon';
import { ContextMenuHost } from '../components/ContextMenu';
import { Toasts } from '../components/Toasts';
import { useUI } from '../stores/ui';
import { useAuth } from '../stores/auth';
import { PlayerChrome, NowPlaying, PlayerEngine } from '../features/player';
import { Overlays } from '../features/overlays';
import { tintVars, avatarBg } from '../lib/color';
import clsx from 'clsx';
import { NowPlayingLight } from '../features/player/NowPlayingLight';
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
  const navigate = useNavigate();
  const tint = useUI((u) => u.pageTint);
  return (
    <div className={clsx(s.app, tint && 'tinted')} style={tintVars(tint ?? undefined)}>
      <NowPlayingLight />
      <Sidebar />
      <div className={s.column}>
        <header className={s.mobileHeader}>
          <span />
          <VybeWordmark height={22} />
          {user ? <button className={s.mobileAvatar} style={{ background: avatarBg(user.avatarColor) }} aria-label="Account" onClick={(e) => openMenuAt(e, accountMenu(user, navigate))}>{user.displayName[0]?.toUpperCase()}</button>
            : <button className={s.mobileSignIn} onClick={() => useUI.getState().openSignIn()}>Sign In</button>}
        </header>
        <main ref={main} id="main" className={s.main} tabIndex={-1}>
          <Suspense fallback={<div className={s.loading} aria-busy="true" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <TabBar />
      <PlayerChrome />
      <NowPlaying />
      <PlayerEngine />
      <Overlays />
      <ContextMenuHost />
      <Toasts />
    </div>
  );
}

const TABS = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/search', label: 'Search', icon: 'search' },
  { to: '/jam', label: 'Jam', icon: 'jam' },
  { to: '/library', label: 'Library', icon: 'album', match: '/library' },
];

/** Phone navigation (≤760px): one tap to every top-level section, no hidden drawer. */
function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav className={s.tabbar} aria-label="Sections">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => clsx(s.tab, (isActive || (t.match && pathname.startsWith(t.match))) && s.tabOn)}>
          <Icon name={t.icon} size={22} /><span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
