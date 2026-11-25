import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { Artwork } from '@vybe/shared';
import { usePlayer } from '../../stores/player';
import { artUrl } from '../../lib/color';
import s from './NowPlayingLight.module.css';

/**
 * Lighting that follows the music: the playing song's artwork, blurred into a soft wash of colour
 * behind the whole app. It glows while music plays, dims when paused, and cross-fades between songs.
 */
export function NowPlayingLight() {
  const art = usePlayer((p) => p.current?.song.artwork ?? null);
  const playing = usePlayer((p) => p.isPlaying);
  const [layers, setLayers] = useState<{ key: string; art: Artwork }[]>([]);
  useEffect(() => {
    if (!art) { setLayers([]); return; }
    setLayers((l) => (l.at(-1)?.key === art.url ? l : [...l.slice(-1), { key: art.url, art }]));
    const t = setTimeout(() => setLayers((l) => l.slice(-1)), 1600);
    return () => clearTimeout(t);
  }, [art]);
  // The player's glass picks up the song's colour too.
  useEffect(() => {
    const root = document.documentElement;
    if (art) root.style.setProperty('--np-glow', art.bgColor); else root.style.removeProperty('--np-glow');
  }, [art]);
  return (
    <div className={clsx(s.light, playing && s.on)} aria-hidden>
      {layers.map((l) => (
        <div key={l.key} className={s.layer}>
          <img src={artUrl(l.art, 200)} alt="" draggable={false} />
        </div>
      ))}
    </div>
  );
}
