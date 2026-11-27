import { useParams } from 'react-router-dom';
import { WorldSection } from '../../features/world/WorldSection';
import { genreName } from '../../lib/genres';
import { useDocumentTitle } from '../../features/shelves/useDocumentTitle';

export default function GenrePage() {
  const { id = '' } = useParams();
  // Keyed by id so switching genres starts from a clean loading state instead of showing the previous genre.
  return <GenreView key={id} id={id} />;
}

function GenreView({ id }: { id: string }) {
  const heading = genreName(id);
  useDocumentTitle(heading ?? 'Genre');

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="t-large-title">{heading}</h1>
      </header>
      {id && <WorldSection source={`genre/${id}`} more={false} />}
    </div>
  );
}
