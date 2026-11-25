import { useAccount } from './account';
import { create } from 'zustand';
import type { Song } from '@vybe/shared';
import { api, ApiError } from '../lib/api';
import { invalidate } from '../lib/useAsync';
import { IMPORT_EXTENSIONS, MAX_IMPORT_BYTES } from '../lib/imports';
import { useLibrary } from './library';
import { usePlayer } from './player';
import { useUI } from './ui';

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'skipped' | 'error';

export interface UploadItem {
  key: number;
  name: string;
  size: number;
  progress: number; // 0..1
  status: UploadStatus;
  reason?: string;
}

interface ImportsState {
  queue: UploadItem[];
  busy: boolean;
  /** True while files are dragged over the window (drives the drop overlay and the drop zone highlight). */
  dragActive: boolean;
  setDragActive: (v: boolean) => void;
  /** Uploads files one by one (two at a time) and toasts a summary when the batch finishes. */
  importFiles: (files: File[]) => Promise<void>;
  clearFinished: () => void;
  /** Deletes an imported song from Vybe (files, library, playlists, history) and drops it from the queue. */
  deleteImport: (song: Song) => Promise<boolean>;
}

const CONCURRENCY = 2;
let nextKey = 1;

const extOf = (name: string) => { const i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i + 1).toLowerCase(); };

/** Reason a file is rejected before upload, mirroring the server's checks. */
export function precheck(file: File): string | undefined {
  if (!IMPORT_EXTENSIONS.includes(extOf(file.name))) return 'unsupported format';
  if (file.size > MAX_IMPORT_BYTES) return 'too large (max 50 MB)';
  if (file.size === 0) return 'empty file';
  return undefined;
}

/** "12 imported, 1 skipped (unsupported format)". */
export function summarize(imported: number, skippedReasons: string[], failed = 0): string {
  const parts = [`${imported} imported`];
  if (skippedReasons.length) {
    const counts = new Map<string, number>();
    for (const r of skippedReasons) counts.set(r, (counts.get(r) ?? 0) + 1);
    const detail = [...counts].map(([r, n]) => (counts.size > 1 ? `${n} ${r}` : r)).join(', ');
    parts.push(`${skippedReasons.length} skipped (${detail})`);
  }
  if (failed) parts.push(`${failed} failed`);
  return parts.join(', ');
}

export const useImports = create<ImportsState>((set, get) => {
  const patch = (key: number, p: Partial<UploadItem>) =>
    set({ queue: get().queue.map((it) => (it.key === key ? { ...it, ...p } : it)) });

  return {
    queue: [],
    busy: false,
    dragActive: false,
    setDragActive: (dragActive) => { if (get().dragActive !== dragActive) set({ dragActive }); },

    importFiles: async (files) => {
      // The shared demo account can't upload: its files would be visible to every visitor.
      if (useAccount.getState().isDemo) { useUI.getState().toast('Create your own account to import music'); return; }
      if (!files.length) return;
      const items: UploadItem[] = files.map((f) => ({ key: nextKey++, name: f.name, size: f.size, progress: 0, status: 'queued' }));
      // Finished rows from an earlier batch make way for the new one.
      set({ queue: [...get().queue.filter((q) => q.status === 'queued' || q.status === 'uploading'), ...items], busy: true });

      let imported = 0, failed = 0;
      const skipped: string[] = [];
      const jobs = files.map((file, i) => ({ file, item: items[i] }));
      const worker = async () => {
        for (let job = jobs.shift(); job; job = jobs.shift()) {
          const { file, item } = job;
          const local = precheck(file);
          if (local) { skipped.push(local); patch(item.key, { status: 'skipped', reason: local, progress: 1 }); continue; }
          patch(item.key, { status: 'uploading' });
          try {
            const res = await api.importFiles([file], (f) => patch(item.key, { progress: Math.min(0.99, f) }));
            if (res.imported.length) { imported += res.imported.length; patch(item.key, { status: 'done', progress: 1 }); }
            else {
              const reason = res.skipped[0]?.reason ?? 'could not be read';
              skipped.push(reason);
              patch(item.key, { status: 'skipped', reason, progress: 1 });
            }
          } catch (e) {
            if (e instanceof ApiError && e.status === 413) { skipped.push('too large (max 50 MB)'); patch(item.key, { status: 'skipped', reason: 'too large (max 50 MB)', progress: 1 }); }
            else if (e instanceof ApiError && e.status === 401) { failed++; patch(item.key, { status: 'error', reason: 'sign in required' }); }
            else { failed++; patch(item.key, { status: 'error', reason: e instanceof Error ? e.message : 'upload failed' }); }
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

      set({ busy: get().queue.some((q) => q.status === 'queued' || q.status === 'uploading') });
      if (imported) {
        invalidate('library:');
        await useLibrary.getState().load();
      }
      useUI.getState().toast(summarize(imported, skipped, failed));
    },

    clearFinished: () => set({ queue: get().queue.filter((q) => q.status === 'queued' || q.status === 'uploading') }),

    deleteImport: async (song) => {
      try {
        await api.deleteImport(song.id);
      } catch {
        useUI.getState().toast('Couldn’t delete that song');
        return false;
      }
      const p = usePlayer.getState();
      for (const q of [...p.userQueue, ...p.contextQueue, ...p.autoplay]) if (q.song.id === song.id) p.removeFromQueue(q.uid);
      if (p.current?.song.id === song.id) {
        const s = usePlayer.getState();
        if (s.userQueue.length || s.contextQueue.length || s.autoplay.length) s.next(); else s.pause();
      }
      invalidate('library:');
      invalidate('playlist:');
      await useLibrary.getState().load();
      useUI.getState().toast('Deleted from Vybe');
      return true;
    },
  };
});
