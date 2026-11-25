import { memo, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { Shelf, Song } from '@vybe/shared';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { ExplicitBadge } from '../../components/Buttons';
import { menuFor, openMenuAt, playFromList } from '../actions';
import { usePlayer, type PlayContext } from '../../stores/player';
import { Track } from './Track';
import s from './Chart.module.css';

const ROWS_PER_COLUMN = 4;

/** "Best New Songs": 3 columns of 4 compact rows per viewport, paged horizontally. Clicking a row plays the shelf's song list. */
export function SongChartShelf({ shelf }: { shelf: Shelf }) {
  const songs = shelf.items.flatMap((item) => (item.type === 'song' ? [item.data] : []));
  if (!songs.length) return null;
  const context: PlayContext = { type: 'queue', id: `shelf:${shelf.id}`, title: shelf.title };

  const columns: Song[][] = [];
  for (let i = 0; i < songs.length; i += ROWS_PER_COLUMN) columns.push(songs.slice(i, i + ROWS_PER_COLUMN));

  return (
    <Track title={shelf.title} subtitle={shelf.subtitle} href={shelf.seeAllHref} columns={3} variant="chart">
      {columns.map((col, c) => (
        <div key={c} className={s.col}>
          {col.map((song, r) => {
            const index = c * ROWS_PER_COLUMN + r;
            return <ChartRow key={`${song.id}:${index}`} song={song} index={index} songs={songs} context={context} />;
          })}
        </div>
      ))}
    </Track>
  );
}

const ChartRow = memo(function ChartRow({ song, index, songs, context }: {
  song: Song; index: number; songs: Song[]; context: PlayContext;
}) {
  const navigate = useNavigate();
  const isCurrent = usePlayer((p) => p.current?.song.id === song.id);
  const isPlaying = usePlayer((p) => p.isPlaying) && isCurrent;
  const menu = (e: MouseEvent) => openMenuAt(e, menuFor({ type: 'song', data: song }, { navigate }));
  const play = () => { if (isCurrent) usePlayer.getState().togglePlay(); else playFromList(songs, index, context); };

  return (
    <div className={clsx(s.row, isCurrent && s.current)} onContextMenu={menu}>
      <button type="button" className={s.hit} onClick={play} aria-label={`${isPlaying ? 'Pause' : 'Play'} ${song.title} by ${song.artist.name}`}>
        <span className={s.artWrap}>
          <Artwork artwork={song.artwork} size={80} rounded="xs" />
          <span className={s.artPlay}><Icon name={isPlaying ? 'pause' : 'play'} size={14} /></span>
        </span>
        <span className={s.meta}>
          <span className={clsx(s.title, 'clamp-1')}>{song.title}{song.isExplicit && <ExplicitBadge />}</span>
          <span className={clsx(s.artist, 'clamp-1')}>{song.artist.name}</span>
        </span>
      </button>
      <button type="button" className={s.more} aria-label={`More options for ${song.title}`} onClick={menu}>
        <Icon name="more" size={18} />
      </button>
    </div>
  );
});
