import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { PageBody } from '../../features/shelves/PageBody';
import { useDocumentTitle } from '../../features/shelves/useDocumentTitle';

export default function RadioPage() {
  const { data, error, loading, reload } = useAsync('page:radio', (signal) => api.page('radio', signal));
  useDocumentTitle('Radio');

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="t-large-title">Radio</h1>
      </header>
      <PageBody data={data} error={error} loading={loading} onRetry={reload} emptyMessage="No stations are available right now." />
    </div>
  );
}
