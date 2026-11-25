import { avatarBg } from '../lib/color';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { Icon } from '../components/Icon';
import { useAuth } from '../stores/auth';
import { useUI, type MenuEntry } from '../stores/ui';
import { useLibrary } from '../stores/library';
import { useAsync } from '../lib/useAsync';
import { api } from '../lib/api';
import { menuFor, openMenuAt } from '../features/actions';
import { SearchSuggestions } from '../features/search/SearchSuggestions';
import s from './Sidebar.module.css';

const primary = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/jam', label: 'Jam', icon: 'jam' },
];
const library = [
  { to: '/library/recently-added', label: 'Recently Added', icon: 'clock' },
  { to: '/library/artists', label: 'Artists', icon: 'artist' },
  { to: '/library/albums', label: 'Albums', icon: 'album' },
  { to: '/library/songs', label: 'Songs', icon: 'note' },
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
  // Keep the field in step with ?term= (the page's own field on mobile can change it) without fighting the caret.
  useEffect(() => {
    if (!location.pathname.startsWith('/search') || document.activeElement === searchRef.current) return;
    setTerm(new URLSearchParams(location.search).get('term') ?? '');
  }, [location.pathname, location.search]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); searchRef.current?.focus(); } };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, []);

  // On phones the sidebar is an off-screen drawer: while closed it must be out of the tab order too.
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const mq = matchMedia('(max-width: 760px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on); return () => mq.removeEventListener('change', on);
  }, []);

  return (
    <>
      <div className={clsx(s.scrim, mobileOpen && s.scrimOn)} onClick={() => setMobileOpen(false)} />
      <nav className={clsx(s.sidebar, mobileOpen && s.open)} aria-label="Main" inert={narrow && !mobileOpen}>
        <div className={s.logoRow}>
          <NavLink to="/home" className={s.logo} aria-label="Vybe home"><VybeWordmark /></NavLink>
        </div>
        <form className={s.search} role="search" onSubmit={(e) => { e.preventDefault(); navigate(term ? `/search?term=${encodeURIComponent(term)}` : '/search'); }}>
          <Icon name="search" size={14} className={s.searchIcon} />
          <input ref={searchRef} type="search" placeholder="Search" aria-label="Search" value={term}
            onFocus={() => { if (!location.pathname.startsWith('/search')) navigate('/search'); }}
            onChange={(e) => { setTerm(e.target.value); navigate(`/search${e.target.value ? `?term=${encodeURIComponent(e.target.value)}` : ''}`, { replace: location.pathname.startsWith('/search') }); }} />
          <SearchSuggestions inputRef={searchRef} term={term} onPickTerm={(t) => { setTerm(t); navigate(`/search?term=${encodeURIComponent(t)}`); }} />
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
            <button className={s.account} onClick={(e) => openMenuAt(e, accountMenu(user, navigate))}>
              <span className={s.avatar} style={{ background: avatarBg(user.avatarColor) }}>{user.displayName.slice(0, 1).toUpperCase()}</span>
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

/** Account menu shared by the desktop sidebar and the phone header (theme lives only in Settings). */
export function accountMenu(user: { id: string; displayName: string }, navigate: (to: string) => void): MenuEntry[] {
  return [
    { label: `Signed in as ${user.displayName}`, disabled: true, onSelect: () => {} },
    'separator',
    { label: 'Profile', icon: 'user', onSelect: () => navigate(`/profile/${user.id}`) },
    { label: 'Replay', icon: 'wave', onSelect: () => navigate('/replay') },
    { label: 'Settings', icon: 'edit', onSelect: () => navigate('/settings') },
    'separator',
    { label: 'Sign Out', onSelect: async () => { await useAuth.getState().signOut(); useLibrary.getState().reset(); navigate('/home'); } },
  ];
}

export function VybeWordmark({ height = 26 }: { height?: number }) {
  return (
    <span className={s.wordmark} style={{ height, gap: Math.round(height * 0.3) }} aria-hidden>
      <img src="/logo-mark.webp" alt="" width={height} height={height} className={s.wordmarkIcon} />
      <span className={s.wordmarkText} style={{ fontSize: Math.round(height * 0.77) }}>vybe</span>
    </span>
  );
}
