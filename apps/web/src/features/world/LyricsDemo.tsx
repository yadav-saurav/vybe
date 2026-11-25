import type { Song } from '@vybe/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { usePlayer } from '../../stores/player';
import { useUI } from '../../stores/ui';
import { Artwork } from '../../components/Artwork';
import { Icon } from '../../components/Icon';
import s from './LyricsDemo.module.css';

/** Vybe's own demo songs, whose original lyrics are time-synced: shows the lyrics feature end to end. */
const DEMO_IDS = ['so_0002', 'so_0004'];

export function LyricsDemo() {
  const { data } = useAsync('lyrics-demo', () => api.songs(DEMO_IDS));
  const songs = data?.songs ?? [];
  if (!songs.length) return null;
  const play = (song: Song) => {
    usePlayer.getState().playSongs(songs, songs.indexOf(song), { type: 'queue', title: 'Lyrics demo' });
    useUI.getState().setSidePanel('lyrics');
    useUI.getState().setNowPlayingOpen(true);
  };
  return (
    <section className={s.demo} aria-labelledby="lyrics-demo-title">
      <div className={s.head}>
        <span className={s.icon}><Icon name="lyrics" size={20} /></span>
        <div>
          <h2 id="lyrics-demo-title" className={s.title}>Sing along: lyrics demo</h2>
          <p className={s.sub}>Vybe originals with full, time-synced lyrics. Lines light up with the music; tap one to jump there.</p>
        </div>
      </div>
      <div className={s.songs}>
        {songs.map((song) => (
          <button key={song.id} className={s.song} onClick={() => play(song)}>
            <span className={s.art}><Artwork artwork={song.artwork} size={120} rounded="xs" /></span>
            <span className={s.text}><b className="clamp-1">{song.title}</b><span className="clamp-1">{song.artist.name} · Vybe Original</span></span>
            <span className={s.play}><Icon name="play" size={16} /></span>
          </button>
        ))}
      </div>
    </section>
  );
}
