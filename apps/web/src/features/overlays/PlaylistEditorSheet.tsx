import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { invalidate } from '../../lib/useAsync';
import { Sheet } from './Sheet';
import { PillButton } from '../../components/Buttons';
import { Icon } from '../../components/Icon';
import { useLibrary } from '../../stores/library';
import { useUI } from '../../stores/ui';
import type { Song } from '@vybe/shared';
import f from './forms.module.css';

type Spec = { mode: 'create'; seedSongs?: Song[] } | { mode: 'edit'; playlistId: string };

export function PlaylistEditorSheet() {
  const editor = useUI((u) => u.playlistEditor);
  const close = useUI((u) => u.closePlaylistEditor);
  const last = useRef<Spec | null>(null);
  if (editor) last.current = editor;
  const spec = editor ?? last.current;
  const key = spec ? (spec.mode === 'edit' ? `edit:${spec.playlistId}` : `create:${spec.seedSongs?.length ?? 0}`) : 'none';
  return (
    <Sheet open={!!editor} onClose={close} labelledBy="ple-title">
      {spec && <EditorForm key={key} spec={spec} onClose={close} />}
    </Sheet>
  );
}

function EditorForm({ spec, onClose }: { spec: Spec; onClose: () => void }) {
  const navigate = useNavigate();
  const editing = spec.mode === 'edit';
  const seedIds = spec.mode === 'create' ? (spec.seedSongs ?? []).map((x) => x.id) : [];
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [isCollab, setIsCollab] = useState(false);
  const [trackCount, setTrackCount] = useState<number | null>(editing ? null : seedIds.length);
  const [loading, setLoading] = useState(editing);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Edit: load the current values from the server.
  useEffect(() => {
    if (spec.mode !== 'edit') return;
    const ctrl = new AbortController();
    api.playlist(spec.playlistId, ctrl.signal)
      .then(({ playlist, tracks }) => {
        setName(playlist.name);
        setDesc(playlist.description ?? '');
        setIsPublic(!!playlist.isPublic);
        setIsCollab(!!playlist.isCollaborative);
        setTrackCount(playlist.trackIds?.length ?? tracks.length);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setLoading(false);
        setFormError(err instanceof ApiError && err.status === 404 ? 'This playlist no longer exists.' : 'Couldn’t load this playlist.');
      });
    return () => ctrl.abort();
  }, [spec]);

  const nameRef = useRef<HTMLInputElement>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || loading) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Give your playlist a name');
      nameRef.current?.focus();
      return;
    }
    setNameError(null);
    setFormError(null);
    setBusy(true);
    const ui = useUI.getState();
    try {
      if (spec.mode === 'create') {
        const { playlist } = await api.createPlaylist(trimmed, desc.trim(), seedIds);
        const finalPlaylist = isPublic || isCollab ? (await api.updatePlaylist(playlist.id, { isPublic, isCollaborative: isCollab })).playlist : playlist;
        invalidate('library:');
        onClose();
        ui.toast(`Created “${finalPlaylist.name}”`);
        await useLibrary.getState().load();
        navigate(`/playlist/${finalPlaylist.id}`);
      } else {
        await api.updatePlaylist(spec.playlistId, { name: trimmed, description: desc.trim(), isPublic, isCollaborative: isCollab });
        invalidate('library:');
        invalidate(`playlist:${spec.playlistId}`);
        onClose();
        ui.toast('Playlist saved');
        await useLibrary.getState().load();
      }
    } catch {
      setFormError('Couldn’t save your playlist. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const countText = trackCount === null
    ? ' '
    : trackCount === 0
      ? 'This playlist is empty. Add songs from any ··· menu.'
      : `${trackCount} ${trackCount === 1 ? 'song' : 'songs'}${editing ? '' : ' will be added'}`;

  return (
    <form className={f.body} noValidate onSubmit={save} aria-labelledby="ple-title">
      <header className={f.head}>
        <h2 id="ple-title" className={f.title}>{editing ? 'Edit Playlist' : 'New Playlist'}</h2>
        <button type="button" className={f.close} aria-label="Close" onClick={onClose}><Icon name="close" size={14} /></button>
      </header>

      {formError && <p role="alert" className={f.alert}>{formError}</p>}

      <div className={f.field}>
        <label className={f.label} htmlFor="ple-name">Name</label>
        <input id="ple-name" ref={nameRef} className={f.input} name="name" data-autofocus maxLength={100}
          value={name} disabled={loading} autoComplete="off"
          onChange={(e) => { setName(e.target.value); if (nameError) setNameError(null); }}
          aria-required="true" aria-invalid={!!nameError} aria-describedby={nameError ? 'ple-name-error' : undefined} />
        {nameError && <span id="ple-name-error" className={f.error}>{nameError}</span>}
      </div>

      <div className={f.field}>
        <label className={f.label} htmlFor="ple-desc">Description</label>
        <textarea id="ple-desc" className={`${f.input} ${f.textarea}`} name="description" maxLength={300}
          value={desc} disabled={loading} onChange={(e) => setDesc(e.target.value)} aria-describedby="ple-desc-hint" />
        <span id="ple-desc-hint" className={f.hint}>Optional. Up to 300 characters.</span>
      </div>

      <div className={f.row}>
        <span className={f.rowText}>
          <span id="ple-public-label" className={f.rowTitle}>Show on my profile</span>
          <span className={f.hint} id="ple-public-hint">Other people can find this playlist on your profile.</span>
        </span>
        <button type="button" role="switch" aria-checked={isPublic} aria-labelledby="ple-public-label" aria-describedby="ple-public-hint"
          disabled={loading} className={`${f.switch} ${isPublic ? f.switchOn : ''}`} onClick={() => setIsPublic((v) => !v)} />
      </div>

      <div className={f.row}>
        <span className={f.rowText}>
          <span id="ple-collab-label" className={f.rowTitle}>Let others add songs</span>
          <span className={f.hint} id="ple-collab-hint">Anyone with the link can add songs. Only you can remove or reorder them.</span>
        </span>
        <button type="button" role="switch" aria-checked={isCollab} aria-labelledby="ple-collab-label" aria-describedby="ple-collab-hint"
          disabled={loading} className={`${f.switch} ${isCollab ? f.switchOn : ''}`} onClick={() => setIsCollab((v) => !v)} />
      </div>

      <p className={f.hint} aria-live="polite">{countText}</p>

      <div className={f.actions}>
        <button type="button" className={f.ghost} onClick={onClose}>Cancel</button>
        <PillButton type="submit" variant="key" disabled={busy || loading}>
          {busy ? 'Saving…' : 'Save'}
        </PillButton>
      </div>
    </form>
  );
}
