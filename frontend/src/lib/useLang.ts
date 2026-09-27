import { useEffect } from 'react';
import { setHighlightLang } from './highlight';

/** Read-only code on this page follows the chapter's language; back to JavaScript when the page closes. */
export function useHighlightLang(lang: string | null | undefined) {
  setHighlightLang(lang);
  useEffect(() => { setHighlightLang(lang); return () => setHighlightLang('javascript'); }, [lang]);
}
