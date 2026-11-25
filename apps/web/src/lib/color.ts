import type { Artwork } from '@vybe/shared';
import type { CSSProperties } from 'react';

/** CSS variables that tint a page with the artwork palette (album/playlist/artist headers). */
export const tintVars = (a?: Artwork): CSSProperties =>
  a ? ({ '--tint-bg': a.bgColor, '--tint-1': a.textColor1, '--tint-2': a.textColor2, '--tint-3': a.textColor3 } as CSSProperties) : {};

export const artUrl = (a: Artwork | undefined, size: number) => (a ? `${a.url}${a.url.includes('?') ? '&' : '?'}w=${size}` : undefined);
