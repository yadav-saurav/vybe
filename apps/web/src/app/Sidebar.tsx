import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { Icon } from '../components/Icon';
import { useAuth } from '../stores/auth';
import { useUI } from '../stores/ui';
import { useLibrary } from '../stores/library';
import { useAsync } from '../lib/useAsync';
import { api } from '../lib/api';
import { menuFor, openMenuAt } from '../features/actions';
import s from './Sidebar.module.css';

const primary = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/new', label: 'New', icon: 'new' },
  { to: '/radio', label: 'Radio', icon: 'radio' },
];
const library = [
  { to: '/library/recently-added', label: 'Recently Added', icon: 'clock' },
  { to: '/library/artists', label: 'Artists', icon: 'artist' },
  { to: '/library/albums', label: 'Albums', icon: 'album' },
  { to: '/library/songs', label: 'Songs', icon: 'note' },
  { to: '/library/made-for-you', label: 'Made for You', icon: 'sparkle' },
];

export function Sidebar() {
  const user = useAuth((a) => a.user);
  const openSignIn = useUI((u) => u.openSignIn);
  const mobileOpen = useUI((u) => u.mobileNavOpen);
  const setMobileOpen = useUI((u) => u.setMobileNavOpen);
  const navigate = useNavigate();
  const location = useLocation();
  const playlistIds = useLibrary((l) => l.playlistIds.join(','));
  const { data: pls } = useAsync(user ? `library:playlists:${playlistIds}` : null, (sig) => api.libraryPlaylists(sig));
  const [term, setTerm] = useState(new URLSearchParams(location.search).get('term') ?? '');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMobileOpen(false); }, [location.pathname, setMobileOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); searchRef.current?.focus(); } };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div className={clsx(s.scrim, mobileOpen && s.scrimOn)} onClick={() => setMobileOpen(false)} />
      <nav className={clsx(s.sidebar, mobileOpen && s.open)} aria-label="Main">
        <div className={s.logoRow}>
          <NavLink to="/home" className={s.logo} aria-label="Vybe home"><VybeWordmark /></NavLink>
        </div>
        <form className={s.search} role="search" onSubmit={(e) => { e.preventDefault(); navigate(term ? `/search?term=${encodeURIComponent(term)}` : '/search'); }}>
          <Icon name="search" size={14} className={s.searchIcon} />
          <input ref={searchRef} type="search" placeholder="Search" aria-label="Search" value={term}
            onFocus={() => { if (!location.pathname.startsWith('/search')) navigate('/search'); }}
            onChange={(e) => { setTerm(e.target.value); navigate(`/search${e.target.value ? `?term=${encodeURIComponent(e.target.value)}` : ''}`, { replace: location.pathname.startsWith('/search') }); }} />
        </form>
        <div className={s.scroll}>
          <ul className={s.group}>
            {primary.map((i) => <NavItem key={i.to} {...i} />)}
          </ul>
          {user && <>
            <div className={s.groupTitle}>Library</div>
            <ul className={s.group}>{library.map((i) => <NavItem key={i.to} {...i} />)}</ul>
            <div className={s.groupTitle}>
              Playlists
              <button className={s.groupAction} aria-label="New Playlist" title="New Playlist" onClick={() => useUI.getState().openPlaylistEditor({ mode: 'create' })}><Icon name="plus" size={14} /></button>
            </div>
            <ul className={s.group}>
              <NavItem to="/library/playlists" label="All Playlists" icon="playlist" />
              {pls?.playlists.map((p) => (
                <li key={p.id} onContextMenu={(e) => openMenuAt(e, menuFor({ type: 'playlist', data: p }, { navigate }))}>
                  <NavLink to={`/playlist/${p.id}`} className={({ isActive }) => clsx(s.item, isActive && s.active)}>
                    <Icon name="playlist" size={18} className={s.icon} /><span className="clamp-1">{p.name}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </>}
        </div>
        <div className={s.footer}>
          {user ? (
            <button className={s.account} onClick={(e) => openMenuAt(e, [
              { label: `Signed in as ${user.displayName}`, disabled: true, onSelect: () => {} },
              'separator',
              { label: 'Appearance: System', icon: useUI.getState().theme === 'system' ? 'check' : undefined, onSelect: () => useUI.getState().setTheme('system') },
              { label: 'Appearance: Light', icon: useUI.getState().theme === 'light' ? 'check' : undefined, onSelect: () => useUI.getState().setTheme('light') },
              { label: 'Appearance: Dark', icon: useUI.getState().theme === 'dark' ? 'check' : undefined, onSelect: () => useUI.getState().setTheme('dark') },
              'separator',
              { label: 'Sign Out', onSelect: async () => { await useAuth.getState().signOut(); useLibrary.getState().reset(); navigate('/home'); } },
            ])}>
              <span className={s.avatar} style={{ background: user.avatarColor }}>{user.displayName.slice(0, 1).toUpperCase()}</span>
              <span className="clamp-1">{user.displayName}</span>
            </button>
          ) : (
            <button className={s.signIn} onClick={openSignIn}><Icon name="user" size={14} />Sign In</button>
          )}
        </div>
      </nav>
    </>
  );
}

function NavItem({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <li>
      <NavLink to={to} className={({ isActive }) => clsx(s.item, isActive && s.active)}>
        <Icon name={icon} size={18} className={s.icon} /><span>{label}</span>
      </NavLink>
    </li>
  );
}

export function VybeWordmark({ height = 26 }: { height?: number }) {
  return (
    <svg height={height} viewBox="0 0 92 28" aria-hidden className={s.wordmark}>
      <defs><linearGradient id="vybe-g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#ff5f7e" /><stop offset="1" stopColor="#b44dff" /></linearGradient></defs>
      <rect x="0" y="2" width="24" height="24" rx="7" fill="url(#vybe-g)" />
      <path d="M6.5 9.5 12 19l5.5-9.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <text x="30" y="21.5" fontFamily="var(--font-display)" fontWeight="700" fontSize="20" letterSpacing="-0.6" fill="currentColor">vybe</text>
    </svg>
  );
}
