import { useState } from 'react';
import type { Artwork as Art } from '@vybe/shared';
import clsx from 'clsx';
import { artUrl } from '../lib/color';
import s from './Artwork.module.css';

/** Square artwork with placeholder colour, lazy loading, fade-in and hairline border (reference style). */
export function Artwork({ artwork, size = 300, alt = '', rounded = 'sm', className, eager }: {
  artwork?: Art; size?: number; alt?: string; rounded?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'circle'; className?: string; eager?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={clsx(s.art, s[rounded], className)} style={{ backgroundColor: artwork?.bgColor }}>
      {artwork && (
        <img src={artUrl(artwork, size <= 120 ? 160 : size <= 320 ? 400 : 1000)} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false}
          className={clsx(s.img, loaded && s.loaded)} onLoad={() => setLoaded(true)} />
      )}
    </div>
  );
}
