import type { ContentItem } from '@vybe/shared';
import { useUI } from '../../stores/ui';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import { hrefFor, subtitleOf, titleOf } from '../../components/Lockup';
import { Sheet } from './Sheet';
import s from './ShareSheet.module.css';

const urlFor = (item: ContentItem) => location.origin + hrefFor(item);
const kindLabel: Record<ContentItem['type'], string> = { song: 'Song', album: 'Album', playlist: 'Playlist', artist: 'Artist', station: 'Station' };

/** Share card: artwork + title, copy link, native share sheet, and quick links. */
export function ShareSheet() {
  const item = useUI((u) => u.shareItem);
  const close = useUI((u) => u.closeShare);
  const open = !!item;
  const url = item ? urlFor(item) : '';
  const text = item ? `${titleOf(item)}${item.type === 'artist' ? '' : ` · ${subtitleOf(item)}`} on Vybe` : '';

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); useUI.getState().toast('Link Copied'); close(); }
    catch { useUI.getState().toast(url); }
  };
  const native = async () => {
    try { await navigator.share({ title: text, url }); close(); } catch { /* user cancelled */ }
  };
  const enc = encodeURIComponent;
  const quick = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${enc(`${text} ${url}`)}` },
    { label: 'X', href: `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}` },
    { label: 'Email', href: `mailto:?subject=${enc(text)}&body=${enc(url)}` },
  ];

  return (
    <Sheet open={open} onClose={close} labelledBy="share-title" className={s.sheet}>
      {item && (
        <div className={s.wrap}>
          <div className={s.card} style={{ background: item.data.artwork.bgColor, color: item.data.artwork.textColor1 }}>
            <div className={s.art}><Artwork artwork={item.data.artwork} size={500} rounded={item.type === 'artist' ? 'circle' : 'md'} /></div>
            <p className={s.kind} style={{ color: item.data.artwork.textColor2 }}>{kindLabel[item.type]}</p>
            <h2 id="share-title" className={s.title}>{titleOf(item)}</h2>
            {item.type !== 'artist' && <p className={s.sub} style={{ color: item.data.artwork.textColor2 }}>{subtitleOf(item)}</p>}
            <p className={s.brand}><img src="/logo-mark.webp" alt="" width={16} height={16} />Vybe</p>
          </div>
          <div className={s.link}><span className="clamp-1">{url.replace(/^https?:\/\//, '')}</span></div>
          <div className={s.actions}>
            <button className={s.primary} onClick={copy}><Icon name="share" size={16} />Copy Link</button>
            {'share' in navigator && <button className={s.secondary} onClick={native}>More…</button>}
          </div>
          <div className={s.quick}>
            {quick.map((q) => <a key={q.label} href={q.href} target="_blank" rel="noreferrer noopener" className={s.quickLink} onClick={close}>{q.label}</a>)}
          </div>
        </div>
      )}
    </Sheet>
  );
}
