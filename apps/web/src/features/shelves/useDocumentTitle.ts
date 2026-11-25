import { useEffect } from 'react';

/** Sets the document title to "<name> — Vybe". */
export function useDocumentTitle(name: string) {
  useEffect(() => { document.title = `${name} — Vybe`; }, [name]);
}
