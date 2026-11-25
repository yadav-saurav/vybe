import { useCallback, useEffect, useRef, useState } from 'react';

/** Small data hook: runs `fn` when deps change, aborts stale requests, caches by key for instant back-navigation. */
const cache = new Map<string, unknown>();

export function useAsync<R>(key: string | null, fn: (signal: AbortSignal) => Promise<R>) {
  const [state, setState] = useState<{ data?: R; error?: Error; loading: boolean }>(() =>
    key && cache.has(key) ? { data: cache.get(key) as R, loading: false } : { loading: !!key });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    setState((s) => ({ data: cache.has(key) ? (cache.get(key) as R) : s.data, loading: !cache.has(key) }));
    fnRef.current(ctrl.signal)
      .then((data) => { cache.set(key, data); if (!ctrl.signal.aborted) setState({ data, loading: false }); })
      .catch((error: Error) => { if (!ctrl.signal.aborted) setState({ error, loading: false }); });
    return () => ctrl.abort();
  }, [key, nonce]);

  const reload = useCallback(() => { if (key) cache.delete(key); setNonce((n) => n + 1); }, [key]);
  return { ...state, reload };
}

export const invalidate = (prefix: string) => { for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k); };
