import { useEffect, useRef, useState } from 'react';
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

/**
 * The same glow, tight around one piece of artwork (cards light up on hover). It renders only while
 * its card is hovered or focused, so a page of cards doesn't keep hundreds of blurred images alive.
 */
export function ArtGlow({ artwork, round, always }: { artwork: Artwork; round?: boolean; always?: boolean }) {
  const [on, setOn] = useState(!!always);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (always) return;
    const host = ref.current?.closest('[data-glow-host]');
    if (!host) return;
    const enter = () => setOn(true), leave = () => setOn(false);
    host.addEventListener('pointerenter', enter); host.addEventListener('pointerleave', leave);
    host.addEventListener('focusin', enter); host.addEventListener('focusout', leave);
    return () => { host.removeEventListener('pointerenter', enter); host.removeEventListener('pointerleave', leave); host.removeEventListener('focusin', enter); host.removeEventListener('focusout', leave); };
  }, [always]);
  return (
    <span ref={ref} className={s.glowSlot} aria-hidden>
      {on && <img className={round ? `${s.cardGlow} ${s.round}` : s.cardGlow} src={artUrl(artwork, 100)} alt="" draggable={false} />}
    </span>
  );
}
