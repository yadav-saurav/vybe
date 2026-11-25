import { useEffect } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';

/** Sets the browser tab title while a detail page is mounted. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · Vybe`;
    return () => { document.title = 'Vybe'; };
  }, [title]);
}

/** Resolves a genre id to its display name (falls back to a capitalised id while loading). */
export function useGenreName(genreId: string) {
  const { data } = useAsync('browse-categories', (s) => api.browseCategories(s));
  const genre = data?.genres.find((g) => g.id === genreId);
  return genre?.name ?? genreId.charAt(0).toUpperCase() + genreId.slice(1);
}
