import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import type { Song } from '@vybe/shared';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { usePlayer } from '../../stores/player';
import { menuFor, openMenuAt } from '../actions';
import { PlayPauseIcon } from '../player/PlayerChrome';
import s from './WorldRows.module.css';

/** A list of worldwide previews: tap to play the list from that song; ··· for Play Next / Apple Music. */
export function WorldRows({ songs, title, ranked, stale }: { songs: Song[]; title: string; ranked?: boolean; stale?: boolean }) {
  const navigate = useNavigate();
  return (
    <ol className={clsx(s.list, stale && s.stale)}>
      {songs.map((song, i) => <WorldRow key={song.id} song={song} rank={ranked ? i + 1 : undefined} songs={songs} index={i} title={title} navigate={navigate} />)}
    </ol>
  );
}

export function WorldRow({ song, rank, songs, index, title, navigate }: { song: Song; rank?: number; songs: Song[]; index: number; title: string; navigate: (to: string) => void }) {
  const isCurrent = usePlayer((p) => p.current?.song.id === song.id);
  const isPlaying = usePlayer((p) => p.isPlaying);
  const play = () => {
    if (isCurrent) { usePlayer.getState().togglePlay(); return; }
    usePlayer.getState().playSongs(songs, index, { type: 'queue', title });
  };
  const year = song.releaseDate?.slice(0, 4);
  return (
    <li className={clsx(s.row, isCurrent && s.rowOn)} onContextMenu={(e) => openMenuAt(e, menuFor({ type: 'song', data: song }, { navigate }))}>
      {rank !== undefined && <span className={s.rank} aria-hidden>{rank}</span>}
      <button className={s.art} onClick={play} aria-label={isCurrent && isPlaying ? `Pause ${song.title}` : `Play ${song.title} by ${song.artist.name}`}>
        <Artwork artwork={song.artwork} size={120} rounded="xs" />
        <span className={clsx(s.artPlay, isCurrent && s.artPlayOn)}>{isCurrent ? <PlayPauseIcon size={16} /> : <Icon name="play" size={16} />}</span>
      </button>
      <button className={s.text} onClick={play} tabIndex={-1}>
        <span className={clsx(s.songTitle, 'clamp-1')}>{song.title}{song.isExplicit && <span className={s.explicit} aria-label="Explicit">E</span>}</span>
        <span className={clsx(s.songSub, 'clamp-1')}>{song.artist.name}{song.album.title ? ` — ${song.album.title}` : ''}</span>
      </button>
      <span className={s.year}>{year}</span>
      <span className={s.badge}>Preview</span>
      <button className={s.more} aria-label={`More for ${song.title}`} title="More" onClick={(e) => openMenuAt(e, menuFor({ type: 'song', data: song }, { navigate }))}>
        <Icon name="more" size={18} />
      </button>
    </li>
  );
}

export function WorldSkeleton({ count = 10 }: { count?: number }) {
  return (
    <ol className={s.list} aria-hidden>
      {Array.from({ length: count }, (_, i) => <li key={i} className={s.row}><span className={clsx(s.art, s.sk)} /><span className={s.text}><span className={clsx(s.skLine, s.sk)} /><span className={clsx(s.skLine, s.skShort, s.sk)} /></span></li>)}
    </ol>
  );
}
