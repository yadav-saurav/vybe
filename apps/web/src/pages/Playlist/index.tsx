import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ContentItem, PlaylistPage, Song } from '@vybe/shared';
import { api } from '../../lib/api';
import { invalidate, useAsync } from '../../lib/useAsync';
import { TrackList } from '../../components/TrackList';
import { Shelf } from '../../components/Shelf';
import { Lockup } from '../../components/Lockup';
import type { PlayContext } from '../../stores/player';
import { useAuth } from '../../stores/auth';
import { useUI } from '../../stores/ui';
import {
  ConfirmSheet, ContainerHeader, DetailError, DetailFooter, DetailPage, DetailSkeleton, HeaderPill,
  ReorderTracks, updatedLabel, useDocumentTitle,
} from '../../features/detail';
import s from './Playlist.module.css';

const moveItem = <T,>(arr: T[], from: number, to: number) => {
  const next = arr.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

/** Playlist page. User-owned playlists are editable: reorder, remove tracks, edit details and delete. */
export default function PlaylistPageView() {
  const { id = '' } = useParams();
  const { data, error, reload } = useAsync(`playlist:${id}`, (signal) => api.playlist(id, signal));
  const page = data && data.playlist.id === id ? data : undefined;

  // Reload after the playlist editor sheet closes, so name and track changes show up.
  const editorOpen = useUI((st) => st.playlistEditor !== null);
  const wasEditorOpen = useRef(false);
  useEffect(() => {
    if (wasEditorOpen.current && !editorOpen) reload();
    wasEditorOpen.current = editorOpen;
  }, [editorOpen, reload]);

  useDocumentTitle(page?.playlist.name);

  if (!page) return error ? <DetailError error={error} onRetry={reload} /> : <DetailSkeleton />;
  return <PlaylistView key={id} page={page} reload={reload} />;
}

function PlaylistView({ page, reload }: { page: PlaylistPage; reload: () => void }) {
  const { playlist } = page;
  const user = useAuth((st) => st.user);
  const navigate = useNavigate();
  const isOwner = playlist.kind === 'user' && !!user && playlist.ownerId === user.id;
  const isMix = playlist.kind === 'personal-mix';

  const [tracks, setTracks] = useState<Song[]>(page.tracks);
  useEffect(() => setTracks(page.tracks), [page]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saveSeq = useRef(0);

  // Optimistic reorder: update now, save in the background, roll back if the latest save fails.
  const onMove = (from: number, to: number) => {
    const prev = tracks;
    const next = moveItem(prev, from, to);
    setTracks(next);
    const seq = ++saveSeq.current;
    api.updatePlaylist(playlist.id, { trackIds: next.map((t) => t.id) })
      .then(() => { invalidate(`playlist:${playlist.id}`); invalidate('library:'); })
      .catch(() => {
        if (seq === saveSeq.current) setTracks(prev);
        useUI.getState().toast('Couldn’t save the new order');
      });
  };

  const extraMenu = useCallback((song: Song, index: number) => (isOwner ? [{
    label: 'Remove from Playlist',
    icon: 'trash',
    destructive: true,
    onSelect: async () => {
      try {
        await api.removeFromPlaylist(playlist.id, index);
        invalidate('library:');
        useUI.getState().toast(`Removed “${song.title}”`);
        reload();
      } catch { useUI.getState().toast('Something went wrong'); }
    },
  }] : []), [isOwner, playlist.id, reload]);

  const deletePlaylist = async () => {
    setConfirmDelete(false);
    try {
      await api.deletePlaylist(playlist.id);
      invalidate('library:');
      invalidate(`playlist:${playlist.id}`);
      useUI.getState().toast('Playlist deleted');
      navigate('/library/playlists');
    } catch { useUI.getState().toast('Something went wrong'); }
  };

  const context: PlayContext = { type: 'playlist', id: playlist.id, title: playlist.name };
  const item: ContentItem = { type: 'playlist', data: playlist };
  const durationMs = tracks.reduce((sum, t) => sum + t.durationMs, 0);
  const subtitle = isMix ? `Made for ${user?.displayName ?? playlist.curatorName}` : playlist.curatorName;
  const meta = isMix ? 'Updated Today' : `Updated ${updatedLabel(playlist.updatedAt)}`;
  const notes = playlist.description.trim() || undefined;

  const list = tracks.length === 0 ? (
    <div className={s.empty}>
      {isOwner ? (
        <>
          <p>This playlist is empty.</p>
          <Link to="/search" className={s.findLink}>Find music to add</Link>
        </>
      ) : <p>No songs yet.</p>}
    </div>
  ) : isOwner ? (
    <ReorderTracks onMove={onMove}>
      <TrackList variant="playlist" songs={tracks} context={context} extraMenu={extraMenu} />
    </ReorderTracks>
  ) : (
    <TrackList variant="playlist" songs={tracks} context={context} />
  );

  return (
    <DetailPage artwork={playlist.artwork}>
      <ContainerHeader
        item={item}
        artwork={playlist.artwork}
        title={playlist.name}
        subtitle={subtitle}
        meta={meta}
        notes={notes}
        showLibraryToggle={!isOwner && playlist.kind === 'editorial'}
        extraActions={isOwner ? (
          <HeaderPill icon="edit" onClick={() => useUI.getState().openPlaylistEditor({ mode: 'edit', playlistId: playlist.id })}>Edit</HeaderPill>
        ) : undefined}
        menuExtra={isOwner ? [{ label: 'Delete Playlist', icon: 'trash', destructive: true, onSelect: () => setConfirmDelete(true) }] : undefined}
      />

      <div className={s.tracks}>{list}</div>

      {tracks.length > 0 && (
        <DetailFooter trackCount={tracks.length} durationMs={durationMs} />
      )}

      {page.moreLikeThis.length > 0 && (
        <Shelf title="More Like This">
          {page.moreLikeThis.map((p) => <Lockup key={p.id} item={{ type: 'playlist', data: p }} />)}
        </Shelf>
      )}

      {confirmDelete && (
        <ConfirmSheet
          title="Delete Playlist?"
          message={`“${playlist.name}” will be permanently deleted. This can’t be undone.`}
          confirmLabel="Delete"
          onConfirm={deletePlaylist}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </DetailPage>
  );
}
