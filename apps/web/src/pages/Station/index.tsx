import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Artwork } from '../../components/Artwork';
import { PillButton } from '../../components/Buttons';
import { TrackList } from '../../components/TrackList';
import { playStation } from '../../features/actions';
import { ErrorState, Skel } from '../../features/shelves/PageBody';
import { useDocumentTitle } from '../../features/shelves/useDocumentTitle';
import s from './Station.module.css';

export default function StationPage() {
  const { id = '' } = useParams();
  return <StationView key={id} id={id} />;
}

function StationView({ id }: { id: string }) {
  const { data, error, reload } = useAsync(`station:${id}`, () => api.stationNext(id, [], 20));
  useDocumentTitle(data?.station.name ?? 'Station');

  if (!data) {
    return (
      <div className="page">
        {error ? <ErrorState onRetry={reload} /> : <StationSkeleton />}
      </div>
    );
  }

  const { station, tracks } = data;
  return (
    <div className="page">
      <header className={s.hero}>
        <div className={s.art}><Artwork artwork={station.artwork} size={500} rounded="md" eager /></div>
        <div className={s.info}>
          <p className={s.kicker}>{station.kind === 'live' ? 'Live radio' : 'Station'}</p>
          <h1 className={s.title}>{station.name}</h1>
          {station.tagline && <p className={s.tagline}>{station.tagline}</p>}
          <div className={s.actions}>
            <PillButton icon="play" onClick={() => playStation(station)}>Play</PillButton>
          </div>
        </div>
      </header>

      <section className={s.upNext} aria-labelledby="station-up-next">
        <h2 id="station-up-next" className={s.sectionTitle}>Up Next</h2>
        {tracks.length > 0
          ? <TrackList songs={tracks} context={{ type: 'station', id: station.id, title: station.name }} variant="compact" />
          : <p className={s.empty}>No tracks yet. Press Play to start the station.</p>}
      </section>
    </div>
  );
}

function StationSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="visually-hidden">Loading</span>
      <header className={s.hero}>
        <Skel className={s.skelArt} />
        <div className={s.info}>
          <Skel className={s.skelKicker} />
          <Skel className={s.skelTitle} />
          <Skel className={s.skelLine} />
        </div>
      </header>
    </div>
  );
}
