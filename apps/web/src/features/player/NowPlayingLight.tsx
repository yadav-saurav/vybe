import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { usePlayer } from '../../stores/player';
import { lightGradient, paletteOf, type Palette } from '../../lib/palette';
import s from './NowPlayingLight.module.css';

/**
 * Lighting that follows the music: the playing song's colours, painted as soft gradients behind the
 * whole app. It glows while music plays, dims when paused, and cross-fades between songs.
 * (Gradients instead of a blurred image: same look, a fraction of the work for the browser.)
 */
export function NowPlayingLight() {
  const art = usePlayer((p) => p.current?.song.artwork ?? null);
  const playing = usePlayer((p) => p.isPlaying);
  const [layers, setLayers] = useState<{ key: string; pal: Palette }[]>([]);
  useEffect(() => {
    if (!art) { setLayers([]); document.documentElement.style.removeProperty('--np-glow'); return; }
    let alive = true;
    paletteOf(art).then((pal) => {
      if (!alive) return;
      setLayers((l) => (l.at(-1)?.key === art.url ? l : [...l.slice(-1), { key: art.url, pal }]));
      document.documentElement.style.setProperty('--np-glow', pal[1]); // the player's glass picks it up too
    });
    const t = setTimeout(() => setLayers((l) => l.slice(-1)), 1600);
    return () => { alive = false; clearTimeout(t); };
  }, [art]);
  return (
    <div className={clsx(s.light, playing && s.on)} aria-hidden>
      {layers.map((l) => <div key={l.key} className={s.layer} style={{ backgroundImage: lightGradient(l.pal) }} />)}
    </div>
  );
}
