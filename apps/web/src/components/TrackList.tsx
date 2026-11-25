import { Fragment, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { formatDuration, type Song } from '@vybe/shared';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import { ExplicitBadge } from './Buttons';
import { menuFor, openMenuAt, playFromList } from '../features/actions';
import { usePlayer, type PlayContext } from '../stores/player';
import { useLibrary } from '../stores/library';
import type { MenuEntry } from '../stores/ui';
import s from './TrackList.module.css';

/**
 * Song table used by album, playlist, library, search and artist "Top Songs".
 *  variant 'album'    → track number column, no artwork, no album column (album page)
 *  variant 'playlist' → artwork + Song | Artist | Album | Time columns (playlist / library songs)
 *  variant 'compact'  → artwork + title/artist stacked (charts, search, artist top songs)
 */
export type TrackListVariant = 'album' | 'playlist' | 'compact';

export function TrackList({ songs, context, variant = 'playlist', extraMenu, highlightId, showHeader = variant === 'playlist', sectionTitle }: {
  songs: Song[]; context: PlayContext; variant?: TrackListVariant; extraMenu?: (song: Song, index: number) => MenuEntry[]; highlightId?: string; showHeader?: boolean;
  /** Optional divider label rendered above a row (e.g. "Disc 2"). Return undefined for no divider. */
  sectionTitle?: (song: Song, index: number) => string | undefined;
}) {
  return (
    <div className={clsx(s.list, s[variant])} role="table" aria-label="Songs">
      {showHeader && (
        <div className={clsx(s.row, s.head)} role="row">
          <div className={s.cSong} role="columnheader">Song</div>
          <div className={s.cArtist} role="columnheader">Artist</div>
          <div className={s.cAlbum} role="columnheader">Album</div>
          <div className={s.cTime} role="columnheader">Time</div>
          <div className={s.cMore} />
        </div>
      )}
      {songs.map((song, i) => {
        const section = sectionTitle?.(song, i);
        return (
          <Fragment key={`${song.id}-${i}`}>
            {section && <div className={s.section} role="presentation">{section}</div>}
            <TrackRow song={song} index={i} songs={songs} context={context} variant={variant} extraMenu={extraMenu} highlighted={song.id === highlightId} />
          </Fragment>
        );
      })}
    </div>
  );
}

const TrackRow = memo(function TrackRow({ song, index, songs, context, variant, extraMenu, highlighted }: {
  song: Song; index: number; songs: Song[]; context: PlayContext; variant: TrackListVariant; extraMenu?: (song: Song, index: number) => MenuEntry[]; highlighted?: boolean;
}) {
  const navigate = useNavigate();
  const isCurrent = usePlayer((p) => p.current?.song.id === song.id);
  const isPlaying = usePlayer((p) => p.isPlaying) && isCurrent;
  const loved = useLibrary((l) => l.lovedIds.includes(song.id));
  const menu = (e: React.MouseEvent) => openMenuAt(e, menuFor({ type: 'song', data: song }, { navigate, extra: extraMenu?.(song, index) }));
  const play = () => { if (isCurrent) usePlayer.getState().togglePlay(); else playFromList(songs, index, context); };

  return (
    <div role="row" tabIndex={0} aria-selected={highlighted} data-row-index={index}
      className={clsx(s.row, isCurrent && s.current, highlighted && s.highlighted)}
      onDoubleClick={play} onKeyDown={(e) => { if (e.key === 'Enter') play(); }} onContextMenu={menu}>
      <div className={s.cSong} role="cell">
        {variant === 'album' ? (
          <div className={s.lead}>
            <span className={s.num}>{isCurrent ? <Equalizer playing={isPlaying} /> : song.trackNumber}</span>
            <button className={s.leadPlay} aria-label={isPlaying ? 'Pause' : `Play ${song.title}`} onClick={play}><Icon name={isPlaying ? 'pause' : 'play'} size={14} /></button>
          </div>
        ) : (
          <div className={s.leadArt}>
            <Artwork artwork={song.artwork} size={80} rounded="xs" />
            <button className={clsx(s.artPlay, isCurrent && s.artPlayOn)} aria-label={isPlaying ? 'Pause' : `Play ${song.title}`} onClick={play}>
              {isCurrent && !isPlaying ? <Icon name="play" size={14} /> : isCurrent ? <><span className={s.eqWrap}><Equalizer playing /></span><Icon name="pause" size={14} className={s.pauseIcon} /></> : <Icon name="play" size={14} />}
            </button>
          </div>
        )}
        <div className={s.titles}>
          <div className={clsx(s.title, 'clamp-1')}>
            {song.title}{song.featuring.length > 0 && variant === 'album' && <span className={s.feat}> (feat. {song.featuring.map((f) => f.name).join(' & ')})</span>}
            {song.isExplicit && <ExplicitBadge />}
          </div>
          {variant === 'compact' && <div className={clsx(s.sub, 'clamp-1')}><Link to={`/artist/${song.artist.id}`}>{song.artist.name}</Link> · <Link to={`/album/${song.album.id}`}>{song.album.title}</Link></div>}
          {variant === 'album' && song.artist.id !== songs[0]?.artist.id && <div className={clsx(s.sub, 'clamp-1')}>{song.artist.name}</div>}
        </div>
        {loved && <Icon name="heart-fill" size={12} className={s.loved} />}
      </div>
      {variant === 'playlist' && <>
        <div className={clsx(s.cArtist, 'clamp-1')} role="cell"><Link to={`/artist/${song.artist.id}`}>{song.artist.name}</Link></div>
        <div className={clsx(s.cAlbum, 'clamp-1')} role="cell"><Link to={`/album/${song.album.id}?i=${song.id}`}>{song.album.title}</Link></div>
      </>}
      <div className={s.cTime} role="cell">{formatDuration(song.durationMs)}</div>
      <div className={s.cMore} role="cell">
        <button className={s.more} aria-label={`More options for ${song.title}`} onClick={menu}><Icon name="more" size={18} /></button>
      </div>
    </div>
  );
});

/** Animated "now playing" bars. */
export function Equalizer({ playing }: { playing: boolean }) {
  return <span className={clsx(s.eq, playing && s.eqOn)} aria-hidden><i /><i /><i /><i /></span>;
}
