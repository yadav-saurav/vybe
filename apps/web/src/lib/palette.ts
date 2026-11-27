import { useEffect, useState } from 'react';
import type { Artwork } from '@vybe/shared';
import { artUrl } from './color';

/**
 * The main colours of a cover, read once from a tiny copy of the image. Glows and lighting are then
 * painted with plain colour gradients, which are far cheaper for the browser than blurring images.
 */
export type Palette = [string, string, string];

const cache = new Map<string, Promise<Palette>>();
const fallback = (a: Artwork): Palette => [a.bgColor, a.bgColor, a.bgColor];

/** Lift dull colours a little so the glow reads as colour, not grey. */
function vivid(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const boost = max - min < 40 ? 1.25 : 1.1;
  const mid = (max + min) / 2;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(mid + (v - mid) * boost)));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

function read(a: Artwork): Promise<Palette> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 6; c.height = 6;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) { resolve(fallback(a)); return; }
        ctx.drawImage(img, 0, 0, 6, 6);
        const d = ctx.getImageData(0, 0, 6, 6).data;
        // Average three areas: top-left, centre and bottom-right.
        const avg = (x0: number, y0: number, x1: number, y1: number) => {
          let r = 0, g = 0, b = 0, n = 0;
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * 6 + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
          return vivid(r / n, g / n, b / n);
        };
        resolve([avg(0, 0, 3, 3), avg(2, 2, 4, 4), avg(3, 3, 6, 6)]);
      } catch {
        resolve(fallback(a)); // the image server didn't allow reading pixels
      }
    };
    img.onerror = () => resolve(fallback(a));
    img.src = artUrl(a, 60) ?? a.url;
  });
}

export function paletteOf(a: Artwork): Promise<Palette> {
  let p = cache.get(a.url);
  if (!p) {
    p = read(a);
    cache.set(a.url, p);
    if (cache.size > 400) cache.delete(cache.keys().next().value as string);
  }
  return p;
}

/** The cover's colours (its stored background colour until they've been read). */
export function usePalette(a: Artwork | null | undefined): Palette | null {
  const [pal, setPal] = useState<Palette | null>(a ? fallback(a) : null);
  useEffect(() => {
    if (!a) { setPal(null); return; }
    let alive = true;
    paletteOf(a).then((p) => { if (alive) setPal(p); });
    return () => { alive = false; };
  }, [a?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  return pal;
}

/** A soft wash of light from three colours: layered radial gradients, no blur needed. */
export const lightGradient = ([a, b, c]: Palette) =>
  `radial-gradient(60% 70% at 18% 20%, ${a} 0%, transparent 70%), radial-gradient(55% 65% at 82% 30%, ${b} 0%, transparent 72%), radial-gradient(70% 70% at 50% 95%, ${c} 0%, transparent 75%)`;

/** "rgb(r, g, b)" -> "#rrggbb" (page tints work with hex colours). */
export const toHex = (rgb: string) => {
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return rgb;
  return '#' + m.slice(0, 3).map((v) => Math.max(0, Math.min(255, +v)).toString(16).padStart(2, '0')).join('');
};
