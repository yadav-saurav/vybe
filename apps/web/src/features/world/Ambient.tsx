import { useEffect, useRef, useState } from 'react';
import type { Artwork } from '@vybe/shared';
import { lightGradient, paletteOf, type Palette } from '../../lib/palette';
import s from './Ambient.module.css';

/**
 * Ambient lighting: the artwork you're looking at, blown up and blurred into a soft glow behind
 * the top of the page. Cross-fades when it changes (hovering a card, a new hero).
 */
export function AmbientGlow({ artwork }: { artwork?: Artwork | null }) {
  const [layers, setLayers] = useState<{ key: string; pal: Palette }[]>([]);
  useEffect(() => {
    if (!artwork) return;
    let alive = true;
    paletteOf(artwork).then((pal) => {
      if (alive) setLayers((l) => (l.at(-1)?.key === artwork.url ? l : [...l.slice(-1), { key: artwork.url, pal }]));
    });
    const t = setTimeout(() => setLayers((l) => l.slice(-1)), 1200);
    return () => { alive = false; clearTimeout(t); };
  }, [artwork]);
  return (
    <div className={s.ambient} aria-hidden>
      {layers.map((l) => <div key={l.key} className={s.layer} style={{ backgroundImage: lightGradient(l.pal) }} />)}
      <div className={s.fade} />
    </div>
  );
}

/**
 * The same light, tight around one cover: a soft shadow in the cover's main colour. It's only
 * worked out while the card is hovered or focused (page headers ask for it always).
 */
export function ArtGlow({ artwork, round, always }: { artwork: Artwork; round?: boolean; always?: boolean }) {
  const [on, setOn] = useState(!!always);
  const [color, setColor] = useState<string | null>(null);
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
  useEffect(() => {
    if (!on) return;
    let alive = true;
    paletteOf(artwork).then((p) => { if (alive) setColor(p[1]); });
    return () => { alive = false; };
  }, [on, artwork]);
  return (
    <span ref={ref} className={s.glowSlot} aria-hidden>
      {on && color && <span className={round ? `${s.cardGlow} ${s.round}` : s.cardGlow} style={{ boxShadow: `0 18px 46px -6px ${color}` }} />}
    </span>
  );
}
