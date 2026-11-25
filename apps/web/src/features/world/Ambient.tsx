import { useEffect, useState } from 'react';
import type { Artwork } from '@vybe/shared';
import { artUrl } from '../../lib/color';
import s from './Ambient.module.css';

/**
 * Ambient lighting: the artwork you're looking at, blown up and blurred into a soft glow behind
 * the top of the page. Cross-fades when it changes (hovering a card, a new hero).
 */
export function AmbientGlow({ artwork }: { artwork?: Artwork | null }) {
  const [layers, setLayers] = useState<{ key: string; art: Artwork }[]>([]);
  useEffect(() => {
    if (!artwork) return;
    setLayers((l) => (l.at(-1)?.key === artwork.url ? l : [...l.slice(-1), { key: artwork.url, art: artwork }]));
    const t = setTimeout(() => setLayers((l) => l.slice(-1)), 1200);
    return () => clearTimeout(t);
  }, [artwork]);
  return (
    <div className={s.ambient} aria-hidden>
      {layers.map((l) => (
        <div key={l.key} className={s.layer} style={{ backgroundColor: l.art.bgColor }}>
          <img src={artUrl(l.art, 200)} alt="" draggable={false} />
        </div>
      ))}
      <div className={s.fade} />
    </div>
  );
}

/** The same glow, tight around one piece of artwork (cards light up on hover). */
export function ArtGlow({ artwork, round }: { artwork: Artwork; round?: boolean }) {
  return <img className={round ? `${s.cardGlow} ${s.round}` : s.cardGlow} src={artUrl(artwork, 200)} alt="" aria-hidden draggable={false} loading="lazy" />;
}
