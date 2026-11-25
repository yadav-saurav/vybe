import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './Layout';
import { NotFound } from '../pages/NotFound';

/* Route map (mirrors reference IA). Each page lives in src/pages/<Name>/index.tsx and is code-split. */
const Home = lazy(() => import('../pages/Home'));
const Search = lazy(() => import('../pages/Search'));
const Genre = lazy(() => import('../pages/Genre'));
const Album = lazy(() => import('../pages/Album'));
const Playlist = lazy(() => import('../pages/Playlist'));
const Artist = lazy(() => import('../pages/Artist'));
const Library = lazy(() => import('../pages/Library'));
const SeeAll = lazy(() => import('../pages/SeeAll'));
const Replay = lazy(() => import('../pages/Replay'));
const Settings = lazy(() => import('../pages/Settings'));
const Profile = lazy(() => import('../pages/Profile'));
const JamInvite = lazy(() => import('../pages/Jam'));
const World = lazy(() => import('../pages/World'));
const WorldArtist = lazy(() => import('../pages/WorldArtist'));
const WorldAlbum = lazy(() => import('../pages/WorldAlbum'));
const ShelfAll = lazy(() => import('../pages/ShelfAll'));
const JamPage = lazy(() => import('../pages/JamHome'));

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Navigate to="/home" replace /> },
      { path: '/home', element: <Home /> },
      // Retired pages: famous songs now live on Home.
      { path: '/new', element: <Navigate to="/home" replace /> },
      { path: '/radio', element: <Navigate to="/home" replace /> },
      { path: '/station/:id', element: <Navigate to="/home" replace /> },
      { path: '/library/imported', element: <Navigate to="/library/songs" replace /> },
      { path: '/search', element: <Search /> },
      { path: '/genre/:id', element: <Genre /> },
      { path: '/see-all/:page/:shelfId', element: <SeeAll /> },
      { path: '/replay', element: <Replay /> },
      { path: '/settings', element: <Settings /> },
      { path: '/profile/:id', element: <Profile /> },
      { path: '/jam/:code', element: <JamInvite /> },
      { path: '/world', element: <World /> },
      { path: '/chart/:cc', element: <World /> },
      { path: '/world/album/:id', element: <WorldAlbum /> },
      { path: '/shelf/:id', element: <ShelfAll /> },
      { path: '/jam', element: <JamPage /> },
      { path: '/world/artist/:id', element: <WorldArtist /> },
      { path: '/album/:id', element: <Album /> },
      { path: '/playlist/:id', element: <Playlist /> },
      { path: '/artist/:id', element: <Artist /> },
      { path: '/library/made-for-you', element: <Navigate to="/home" replace /> },
      { path: '/library/:section', element: <Library /> },
      { path: '/library', element: <Navigate to="/library/recently-added" replace /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
