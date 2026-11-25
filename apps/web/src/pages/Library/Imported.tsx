import { useAccount, DEMO_NOTE } from '../../stores/account';
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { formatLongDuration, type Song } from '@vybe/shared';
import { api } from '../../lib/api';
import { IMPORT_ACCEPT } from '../../lib/imports';
import { useLibraryAsync } from '../../features/library/useLibraryAsync';
import { ConfirmSheet } from '../../features/detail/Sheet';
import { Icon } from '../../components/Icon';
import { TrackList } from '../../components/TrackList';
import { PillButton } from '../../components/Buttons';
import { usePlayer, type PlayContext } from '../../stores/player';
import { useImports, type UploadItem } from '../../stores/imports';
import s from './Imported.module.css';
import l from './Library.module.css';

const CTX: PlayContext = { type: 'library', id: 'imported', title: 'Imported' };

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Library → Imported: a drop zone, the upload queue and the user's imported songs. */
export function ImportedView() {
  const { data, error, loading } = useLibraryAsync('library:imports', (sig) => api.imports(sig));
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState(() => params.get('q') ?? '');
  const [pendingDelete, setPendingDelete] = useState<Song | null>(null);
  const highlightId = params.get('i') ?? undefined;
  const songs = data?.songs;

  // Follow ?q= when it changes (e.g. "Go to Artist" from an imported track while already here).
  const q = params.get('q');
  useEffect(() => { if (q !== null) setFilter(q); }, [q]);

  const visible = useMemo<Song[]>(() => {
    const f = filter.trim().toLowerCase();
    const list = songs ?? [];
    if (!f) return list;
    return list.filter((x) => [x.title, x.artist.name, x.album.title].some((v) => v.toLowerCase().includes(f)));
  }, [songs, filter]);

  // Bring a linked track (?i=) into view once the list renders.
  useEffect(() => {
    if (!highlightId || !songs) return;
    const idx = visible.findIndex((x) => x.id === highlightId);
    if (idx < 0) return;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-imported-list] [data-row-index="${idx}"]`)?.scrollIntoView({ block: 'center' }));
  }, [highlightId, songs, visible]);

  const total = visible.reduce((n, x) => n + x.durationMs, 0);
  const confirmDelete = async () => {
    const song = pendingDelete;
    setPendingDelete(null);
    if (song && (await useImports.getState().deleteImport(song)) && song.id === highlightId) {
      params.delete('i');
      setParams(params, { replace: true });
    }
  };

  const isDemo = useAccount((a) => a.isDemo);
  return (
    <>
      {isDemo ? <p className={s.demoNote} role="note">{DEMO_NOTE}</p> : <><DropZone /><UploadQueue /></>}

      {error && <p className={l.none}>Couldn’t load your imported music. Check your connection and try again.</p>}
      {loading && !songs && <div className={clsx(s.listSkeleton, l.pulse)} aria-busy="true" />}

      {songs && songs.length === 0 && (
        <div className={s.empty}>
          <p className={l.emptyTitle}>No imported music yet</p>
          <p className={l.emptyText}>Import songs you own — files stay private to your account.</p>
        </div>
      )}

      {songs && songs.length > 0 && (
        <section aria-labelledby="imported-songs-title" className={s.songs}>
          <h2 id="imported-songs-title" className="visually-hidden">Imported songs</h2>
          <div className={l.toolbar}>
            <div className={l.toolbarLeft}>
              <PillButton icon="play" variant="key" disabled={!visible.length}
                onClick={() => usePlayer.getState().playSongs(visible, 0, CTX)}>Play</PillButton>
              <PillButton icon="shuffle" variant="soft" disabled={!visible.length}
                onClick={() => usePlayer.getState().playSongs(visible, 0, CTX, { shuffle: true })}>Shuffle</PillButton>
              <span className={l.count}>
                {visible.length} {visible.length === 1 ? 'song' : 'songs'}{visible.length ? `, ${formatLongDuration(total)}` : ''}
              </span>
            </div>
            <label className={l.filter}>
              <span className="visually-hidden">Filter imported songs</span>
              <Icon name="search" size={14} />
              <input type="search" value={filter} placeholder="Filter" autoComplete="off" spellCheck={false}
                onChange={(e) => setFilter(e.target.value)} />
            </label>
          </div>
          {visible.length ? (
            <div data-imported-list>
              <TrackList songs={visible} context={CTX} variant="playlist" highlightId={highlightId}
                extraMenu={(song) => [{ label: 'Delete from Vybe', icon: 'trash', destructive: true, onSelect: () => setPendingDelete(song) }]} />
            </div>
          ) : <p className={l.none}>No imported songs match “{filter}”.</p>}
        </section>
      )}

      {pendingDelete && (
        <ConfirmSheet
          title="Delete from Vybe?"
          message={`“${pendingDelete.title}” will be removed from your library, playlists and history, and its file deleted from Vybe. The copy on your computer isn’t affected.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}

/** Dashed card that opens the file picker on click, Enter or Space. Drops are handled window-wide (see DropImport). */
function DropZone() {
  const input = useRef<HTMLInputElement>(null);
  const busy = useImports((u) => u.busy);
  const dragActive = useImports((u) => u.dragActive);
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const open = () => input.current?.click();
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
  const isFiles = (e: DragEvent) => [...e.dataTransfer.types].includes('Files');

  useEffect(() => { if (!dragActive) { depth.current = 0; setOver(false); } }, [dragActive]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Import music. Drop audio files here or choose files"
      aria-describedby="import-hint"
      aria-busy={busy || undefined}
      className={clsx(s.zone, dragActive && s.zoneArmed, over && s.zoneOver)}
      onClick={open}
      onKeyDown={onKey}
      onDragEnter={(e) => { if (isFiles(e)) { depth.current++; setOver(true); } }}
      onDragLeave={(e) => { if (isFiles(e) && --depth.current <= 0) { depth.current = 0; setOver(false); } }}
    >
      <span className={s.zoneIcon} aria-hidden><Icon name="upload" size={26} /></span>
      <span className={s.zoneTitle}>
        {over ? 'Drop to import' : <>Drop audio files here or <span className={s.zoneLink}>Choose Files</span></>}
      </span>
      <span id="import-hint" className={s.zoneHint}>
        MP3, M4A, AAC, FLAC, OGG, Opus or WAV, up to 50 MB each. Only songs you own — they stay private to your account.
      </span>
      <input
        ref={input}
        type="file"
        multiple
        accept={IMPORT_ACCEPT}
        className={s.hiddenInput}
        tabIndex={-1}
        aria-hidden
        data-testid="import-input"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void useImports.getState().importFiles(files);
        }}
      />
    </div>
  );
}

function UploadQueue() {
  const queue = useImports((u) => u.queue);
  const busy = useImports((u) => u.busy);
  if (!queue.length) return null;
  const done = queue.filter((q) => q.status === 'done').length;
  return (
    <section className={s.queue} aria-labelledby="upload-queue-title">
      <div className={s.queueHead}>
        <h2 id="upload-queue-title" className={s.queueTitle}>
          {busy ? `Importing ${queue.length} ${queue.length === 1 ? 'file' : 'files'}…` : `${done} of ${queue.length} imported`}
        </h2>
        {!busy && <button type="button" className={s.clear} onClick={() => useImports.getState().clearFinished()}>Clear</button>}
      </div>
      <ul className={s.queueList}>
        {queue.map((item) => <QueueRow key={item.key} item={item} />)}
      </ul>
    </section>
  );
}

const STATUS_TEXT: Record<UploadItem['status'], string> = {
  queued: 'Waiting',
  uploading: 'Uploading',
  done: 'Imported',
  skipped: 'Skipped',
  error: 'Failed',
};

function QueueRow({ item }: { item: UploadItem }) {
  const pct = Math.round(item.progress * 100);
  const status = item.status === 'uploading' ? `${STATUS_TEXT.uploading} ${pct}%`
    : item.reason ? `${STATUS_TEXT[item.status]} (${item.reason})` : STATUS_TEXT[item.status];
  return (
    <li className={clsx(s.row, s[item.status])}>
      <span className={s.rowIcon} aria-hidden>
        <Icon name={item.status === 'done' ? 'check' : item.status === 'skipped' || item.status === 'error' ? 'info' : 'note'} size={16} />
      </span>
      <div className={s.rowMain}>
        <div className={s.rowLine}>
          <span className={clsx(s.rowName, 'clamp-1')}>{item.name}</span>
          <span className={s.rowSize}>{formatSize(item.size)}</span>
        </div>
        <div className={s.bar} role="progressbar" aria-label={item.name} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={item.status === 'skipped' || item.status === 'error' ? undefined : pct}
          aria-valuetext={status}>
          <span className={s.fill} style={{ transform: `scaleX(${item.status === 'queued' ? 0 : item.progress})` }} />
        </div>
        <span className={s.rowStatus}>{status}</span>
      </div>
    </li>
  );
}
