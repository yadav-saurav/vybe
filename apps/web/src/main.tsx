import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './styles/global.css';
import { router } from './app/routes';
import { useAuth } from './stores/auth';
import { useLibrary } from './stores/library';
import { useAccount } from './stores/account';
import { registerServiceWorker } from './lib/install';

// Bootstrap session, then library (when signed in).
useAuth.getState().init().then(() => { if (useAuth.getState().user) { useLibrary.getState().load(); useAccount.getState().load(); } });
useAuth.subscribe((s, prev) => {
  if (s.user && s.user.id !== prev.user?.id) { useLibrary.getState().load(); useAccount.getState().load(); }
  if (!s.user && prev.user) { useLibrary.getState().reset(); useAccount.getState().reset(); }
});

registerServiceWorker();

createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
