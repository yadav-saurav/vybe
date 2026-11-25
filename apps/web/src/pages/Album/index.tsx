import { useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { ContentItem } from '@vybe/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { TrackList } from '../../components/TrackList';
import { Shelf } from '../../components/Shelf';
import { Lockup } from '../../components/Lockup';
import type { PlayContext } from '../../stores/player';
import {
  ContainerHeader, DetailError, DetailFooter, DetailPage, DetailSkeleton,
  useDocumentTitle, useGenreName, yearOf,
} from '../../features/detail';
import s from './Album.module.css';

/** Album page: header, track list (with disc dividers), footer and related shelves. `?i=<songId>` highlights a track. */
export default function AlbumPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const highlight = params.get('i') ?? undefined;
  const { data, error, reload } = useAsync(`album:${id}`, (signal) => api.album(id, signal));
  const page = data && data.album.id === id ? data : undefined;
  const genre = useGenreName(page?.album.genreId ?? '');
  const pageRef = useRef<HTMLDivElement>(null);
  useDocumentTitle(page?.album.title);

  useEffect(() => {
    if (!highlight || !page) return;
    pageRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlight, page]);

  if (!page) return error ? <DetailError error={error} onRetry={reload} /> : <DetailSkeleton />;

  const { album, tracks, moreByArtist, youMightAlsoLike } = page;
  const multiDisc = new Set(tracks.map((t) => t.discNumber)).size > 1;
  const kind = album.type === 'single' ? 'Single' : album.type === 'ep' ? 'EP' : null;
  const meta = [kind, genre, yearOf(album.releaseDate)].filter(Boolean).join(' · ');
  const context: PlayContext = { type: 'album', id: album.id, title: album.title };
  const item: ContentItem = { type: 'album', data: album };

  return (
    <DetailPage artwork={album.artwork} pageRef={pageRef}>
      <ContainerHeader
        item={item}
        artwork={album.artwork}
        title={album.title}
        explicit={album.isExplicit}
        subtitle={<Link to={`/artist/${album.artist.id}`}>{album.artist.name}</Link>}
        meta={meta}
        notes={album.editorialNotes}
        showLibraryToggle
      />

      <div className={s.tracks}>
        <TrackList
          variant="album"
          songs={tracks}
          context={context}
          highlightId={highlight}
          sectionTitle={multiDisc ? (song, i) => (i === 0 || tracks[i - 1].discNumber !== song.discNumber ? `Disc ${song.discNumber}` : undefined) : undefined}
        />
      </div>

      <DetailFooter
        releaseDate={album.releaseDate}
        trackCount={tracks.length}
        durationMs={album.durationMs}
        copyright={album.copyright}
        recordLabel={album.recordLabel}
      />

      {moreByArtist.length > 0 && (
        <Shelf title={`More by ${album.artist.name}`} href={`/artist/${album.artist.id}`}>
          {moreByArtist.map((a) => <Lockup key={a.id} item={{ type: 'album', data: a }} />)}
        </Shelf>
      )}
      {youMightAlsoLike.length > 0 && (
        <Shelf title="You Might Also Like">
          {youMightAlsoLike.map((a) => <Lockup key={a.id} item={{ type: 'album', data: a }} />)}
        </Shelf>
      )}
    </DetailPage>
  );
}
