import { useEffect, useRef } from 'react';
import { useAsync } from '../../lib/useAsync';
import { useLibrary } from '../../stores/library';

/**
 * useAsync for library data that also refetches when the library store reloads
 * (every add/remove/love and every `useLibrary.load()` yields a new `addedAt` object).
 * `invalidate('library:')` alone only clears the cache, so mounted views need this to refresh.
 */
export function useLibraryAsync<R>(key: string, fn: (signal: AbortSignal) => Promise<R>) {
  const res = useAsync<R>(key, fn);
  const stamp = useLibrary((l) => l.addedAt);
  const seen = useRef(stamp);
  const { reload } = res;
  useEffect(() => {
    if (seen.current === stamp) return;
    seen.current = stamp;
    reload();
  }, [stamp, reload]);
  return res;
}
