import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Skel } from '../../features/shelves/PageBody';
import { WorldSection } from '../../features/world/WorldSection';
import { useDocumentTitle } from '../../features/shelves/useDocumentTitle';
import s from './Genre.module.css';

export default function GenrePage() {
  const { id = '' } = useParams();
  // Keyed by id so switching genres starts from a clean loading state instead of showing the previous genre.
  return <GenreView key={id} id={id} />;
}

function GenreView({ id }: { id: string }) {
  const { data, error } = useAsync(`genre:${id}`, (signal) => api.genre(id, signal));
  const heading = data?.title ?? (error ? 'Genre' : null);
  useDocumentTitle(heading ?? 'Genre');

  return (
    <div className="page">
      <header className="page-header">
        {heading ? <h1 className="t-large-title">{heading}</h1> : <Skel className={s.titleSkel} />}
      </header>
      {id && <WorldSection source={`genre/${id}`} more={false} />}
    </div>
  );
}
