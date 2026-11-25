import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Artwork as Art, ContentItem } from '@vybe/shared';
import { Artwork } from '../../components/Artwork';
import { CircleButton, ExplicitBadge } from '../../components/Buttons';
import { Icon } from '../../components/Icon';
import { menuFor, openMenuAt, playItem } from '../actions';
import { usePlayer } from '../../stores/player';
import { useLibrary } from '../../stores/library';
import type { MenuEntry } from '../../stores/ui';
import { EditorialNotes } from './EditorialNotes';
import s from './ContainerHeader.module.css';

export interface ContainerHeaderProps {
  /** Album or playlist item: drives Play / Shuffle, the library and love buttons and the ··· menu. */
  item: ContentItem;
  artwork: Art;
  title: string;
  explicit?: boolean;
  /** Artist link (albums) or curator (playlists). */
  subtitle: ReactNode;
  /** Genre · year, "Single · Pop · 2026", "Updated Today", ... */
  meta: string;
  notes?: string;
  /** Show the Add / Added toggle (editorial playlists and albums, not user playlists). */
  showLibraryToggle: boolean;
  /** Extra action buttons after Add (e.g. "Edit" on user playlists). */
  extraActions?: ReactNode;
  /** Entries prepended to the ··· menu (e.g. "Delete Playlist"). */
  menuExtra?: MenuEntry[];
}

/**
 * Header shared by album and playlist pages (see docs/DESIGN.md, album-d.png).
 * The page wrapper (DetailPage) supplies the tint; this only lays out the content.
 */
export function ContainerHeader(p: ContainerHeaderProps) {
  const navigate = useNavigate();
  const { item } = p;
  const id = item.data.id;
  const libType = item.type === 'album' ? 'album' : 'playlist';
  const isPlayable = item.type === 'album' || item.type === 'playlist';
  const context = usePlayer((st) => st.context);
  const isCurrentContext = !!context && context.type === item.type && context.id === id;
  const isPlayingContext = usePlayer((st) => st.isPlaying) && isCurrentContext;
  const inLibrary = useLibrary((l) => (libType === 'album' ? l.albumIds : l.playlistIds).includes(id));
  const loved = useLibrary((l) => l.lovedIds.includes(id));

  const onPlay = () => {
    if (isCurrentContext) usePlayer.getState().togglePlay();
    else playItem(item);
  };

  return (
    <section className={s.header} aria-label={p.title}>
      <div className={s.artWrap}>
        <Artwork artwork={p.artwork} size={540} eager className={s.art} />
      </div>

      <div className={s.info}>
        <h1 className={s.title}>
          <span>{p.title}</span>
          {p.explicit && <ExplicitBadge />}
        </h1>
        <div className={s.subtitle}>{p.subtitle}</div>
        <div className={s.meta}>{p.meta}</div>

        {p.notes && <EditorialNotes text={p.notes} title={p.title} />}

        <div className={s.actions}>
          {isPlayable && (
            <>
              <button className={s.primary} onClick={onPlay} aria-label={isPlayingContext ? `Pause ${p.title}` : `Play ${p.title}`}>
                <Icon name={isPlayingContext ? 'pause' : 'play'} size={14} />
                <span>{isPlayingContext ? 'Pause' : 'Play'}</span>
              </button>
              <button className={s.secondary} onClick={() => playItem(item, { shuffle: true })} aria-label={`Shuffle ${p.title}`}>
                <Icon name="shuffle" size={16} />
                <span>Shuffle</span>
              </button>
            </>
          )}
          {p.showLibraryToggle && (
            <button className={s.secondary} aria-pressed={inLibrary} onClick={() => useLibrary.getState().toggle(libType, id)}>
              <Icon name={inLibrary ? 'check' : 'plus'} size={14} />
              <span>{inLibrary ? 'Added' : 'Add'}</span>
            </button>
          )}
          {p.extraActions}
          <CircleButton
            icon={loved ? 'heart-fill' : 'heart'}
            label={loved ? `Remove ${p.title} from favourites` : `Favourite ${p.title}`}
            active={loved}
            size={36}
            onClick={() => useLibrary.getState().toggleLove(libType, id)}
          />
        </div>
      </div>

      <CircleButton
        icon="more"
        label={`More options for ${p.title}`}
        size={34}
        className={s.menu}
        onClick={(e) => openMenuAt(e, menuFor(item, { navigate, extra: p.menuExtra }))}
      />
    </section>
  );
}

/** Secondary pill for page-specific actions in the header (e.g. "Edit"). */
export function HeaderPill({ icon, children, ...rest }: { icon?: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={s.secondary} {...rest}>
      {icon && <Icon name={icon} size={14} />}
      <span>{children}</span>
    </button>
  );
}
