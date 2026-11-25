import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { PageBody } from '../../features/shelves/PageBody';
import { useDocumentTitle } from '../../features/shelves/useDocumentTitle';

export default function NewPage() {
  const { data, error, loading, reload } = useAsync('page:new', (signal) => api.page('new', signal));
  useDocumentTitle('New');

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="t-large-title">New</h1>
      </header>
      <PageBody pageKey="new" data={data} error={error} loading={loading} onRetry={reload} emptyMessage="Nothing new right now. Check back soon." />
    </div>
  );
}
