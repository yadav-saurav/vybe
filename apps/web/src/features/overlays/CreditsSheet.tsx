import { Link } from 'react-router-dom';
import { formatDuration, type Album, type Song } from '@vybe/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { useUI } from '../../stores/ui';
import { Artwork } from '../../components/Artwork';
import { Sheet } from './Sheet';
import s from './CreditsSheet.module.css';

const isImported = (song: Song) => song.source === 'import';
const fullDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

/** Song credits: who made it, where it's from, and the legal line. Opened from a song's ··· menu. */
export function CreditsSheet() {
  const song = useUI((u) => u.creditsSong);
  const close = useUI((u) => u.closeCredits);
  return (
    <Sheet open={!!song} onClose={close} labelledBy="credits-title" className={s.sheet}>
      {song && <CreditsBody song={song} onClose={close} />}
    </Sheet>
  );
}

function CreditsBody({ song, onClose }: { song: Song; onClose: () => void }) {
  // Label and copyright live on the album; imported files have no catalog album.
  const { data } = useAsync(isImported(song) ? null : `album:${song.album.id}`, (sig) => api.album(song.album.id, sig));
  const album: Album | undefined = data?.album;
  const rows: [string, React.ReactNode][] = [
    ['Artist', <Link key="a" to={isImported(song) ? '/library/imported' : `/artist/${song.artist.id}`} onClick={onClose}>{song.artist.name}</Link>],
    ...(song.featuring.length ? [['Featuring', song.featuring.map((f) => f.name).join(', ')] as [string, string]] : []),
    ...(song.composer ? [['Written by', song.composer] as [string, string]] : []),
    ['Album', isImported(song) ? song.album.title : <Link key="al" to={`/album/${song.album.id}?i=${song.id}`} onClick={onClose}>{song.album.title}</Link>],
    ['Released', fullDate(song.releaseDate)],
    ['Length', formatDuration(song.durationMs)],
    ...(!isImported(song) ? [['Tempo', `${song.bpm} BPM`] as [string, string]] : []),
    ...(album?.recordLabel ? [['Label', album.recordLabel] as [string, string]] : []),
  ];
  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <div className={s.art}><Artwork artwork={song.artwork} size={160} rounded="sm" /></div>
        <div className={s.titles}>
          <h2 id="credits-title" className={s.title}>{song.title}</h2>
          <p className={s.sub}>Credits</p>
        </div>
      </header>
      <dl className={s.list}>
        {rows.map(([k, v]) => <div key={k} className={s.row}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {album?.copyright && <p className={s.legal}>{album.copyright}</p>}
      <button className={s.close} onClick={onClose}>Done</button>
    </div>
  );
}
