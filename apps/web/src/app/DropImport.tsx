import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Icon } from '../components/Icon';
import { IMPORTED_PATH } from '../lib/imports';
import { useAuth } from '../stores/auth';
import { useImports } from '../stores/imports';
import s from './DropImport.module.css';

const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');

/**
 * Signed-in users can drop audio files anywhere in the window: a full-window overlay invites the drop,
 * the files upload through the imports store, and the app navigates to Library → Imported.
 * On the Imported page itself the page's drop zone lights up instead of the overlay.
 */
export function DropImport() {
  const user = useAuth((a) => a.user);
  const active = useImports((u) => u.dragActive);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onImported = pathname.startsWith(IMPORTED_PATH);
  const here = useRef({ navigate, onImported });
  here.current = { navigate, onImported };

  useEffect(() => {
    if (!user) return;
    let depth = 0;
    const set = useImports.getState().setDragActive;
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; set(true); };
    const over = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) set(false); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0; set(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      if (!here.current.onImported) here.current.navigate(IMPORTED_PATH);
      void useImports.getState().importFiles(files);
    };
    // Esc or a drag that ends outside the window clears the overlay.
    const reset = () => { depth = 0; set(false); };
    addEventListener('dragenter', enter);
    addEventListener('dragover', over);
    addEventListener('dragleave', leave);
    addEventListener('drop', drop);
    addEventListener('dragend', reset);
    addEventListener('blur', reset);
    return () => {
      removeEventListener('dragenter', enter);
      removeEventListener('dragover', over);
      removeEventListener('dragleave', leave);
      removeEventListener('drop', drop);
      removeEventListener('dragend', reset);
      removeEventListener('blur', reset);
      reset();
    };
  }, [user]);

  if (!user) return null;
  return (
    <div className={clsx(s.overlay, active && !onImported && s.on)} aria-hidden="true">
      <div className={s.card}>
        <span className={s.icon}><Icon name="upload" size={34} /></span>
        <p className={s.title}>Drop to import into Vybe</p>
        <p className={s.text}>MP3, M4A, AAC, FLAC, OGG, Opus or WAV · private to your account</p>
      </div>
    </div>
  );
}
