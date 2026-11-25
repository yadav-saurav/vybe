import type { Artwork } from '@vybe/shared';
import type { CSSProperties } from 'react';

const rgb = (hex: string) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lum = (c: number[]) => { const [r, g, b] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a: string, b: string) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const mix = (a: string, b: string, t: number) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

/** Move `fg` toward `strong` until it reaches WCAG AA (4.5:1) on `bg`. */
export const ensureContrast = (fg: string, bg: string, strong: string, min = 4.5) => {
  if (!/^#[0-9a-f]{6}$/i.test(fg) || !/^#[0-9a-f]{6}$/i.test(bg)) return fg;
  for (let t = 0; t <= 1.0001; t += 0.1) { const c = mix(fg, strong, t); if (contrast(c, bg) >= min) return c; }
  return strong;
};

/** CSS variables that tint a page with the artwork palette; secondary/accent text is lifted to AA contrast. */
export const tintVars = (a?: Artwork): CSSProperties => {
  if (!a) return {};
  // Mid-tone artwork can leave even the primary text just under AA; nudge the background away from it.
  const away = contrast(a.textColor1, '#000000') > contrast(a.textColor1, '#ffffff') ? '#000000' : '#ffffff';
  const bg = contrast(a.textColor1, a.bgColor) >= 7 ? a.bgColor : ensureContrast(a.bgColor, a.textColor1, away, 7);
  const t2 = ensureContrast(a.textColor2, bg, a.textColor1);
  const t3 = ensureContrast(a.textColor3, bg, a.textColor1);
  return { '--tint-bg': bg, '--tint-1': a.textColor1, '--tint-2': t2, '--tint-3': t3 } as CSSProperties;
};

/**
 * Artwork at the size it's shown. Apple's image service renders any size from the URL itself
 * (".../600x600bb.jpg"), so thumbnails download small; other images take a ?w= hint.
 */
export const artUrl = (a: Artwork | undefined, size: number) => {
  if (!a) return undefined;
  if (a.url.includes('mzstatic.com') && /\/\d+x\d+bb\.jpg$/.test(a.url)) {
    const px = Math.min(1000, Math.max(60, Math.ceil(size / 50) * 50)); // a few sizes, so the browser cache gets hits
    return a.url.replace(/\/\d+x\d+bb\.jpg$/, `/${px}x${px}bb.jpg`);
  }
  return `${a.url}${a.url.includes('?') ? '&' : '?'}w=${size}`;
};

/** Avatar background: the listener's colour, deepened just enough that the white initial reads (AA, 4.5:1). */
export const avatarBg = (color: string) => ensureContrast(color, '#ffffff', '#000000');
