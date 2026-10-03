import { useCallback, useState } from 'react';

import { fetchAiHelpEnabled, translateFields, type AiErrorCode, type Kind } from './aiDraft';
import { looksLikeContact } from './contactCheck';
import { buildI18n, detectLang, type Lang } from './i18nText';

export type Versions = Record<Lang, Record<string, string>>;

const other = (l: Lang): Lang => (l === 'en' ? 'ur' : 'en');

/**
 * The English and Urdu versions of a post or listing while its author reviews them.
 * `keys` are the text fields, e.g. ['title', 'description'] or ['headline', 'about'].
 * The author's own text is the original; the other language is an AI draft until they edit it.
 */
export function useBilingual(kind: Kind, keys: string[]) {
  const [versions, setVersions] = useState<Versions | null>(null);
  const [source, setSource] = useState<Lang>('en');
  const [ai, setAi] = useState(false);
  const [stale, setStale] = useState<Partial<Record<Lang, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiErrorCode | null>(null);
  const [checked, setChecked] = useState(false);
  const [tried, setTried] = useState(false);

  const reset = useCallback(() => {
    setVersions(null);
    setStale({});
    setAi(false);
    setChecked(false);
    setError(null);
    setTried(false);
  }, []);

  /** Use a draft the AI helper wrote in both languages. */
  const applyDraft = useCallback((src: Lang, en: Record<string, string>, ur: Record<string, string>) => {
    setSource(src);
    setVersions({ en, ur });
    setAi(true);
    setStale({});
    setChecked(false);
    setError(null);
    setTried(true);
  }, []);

  /** Use versions that were saved earlier (editing a post or listing). */
  const applyVersions = useCallback((src: Lang, en: Record<string, string>, ur: Record<string, string>, wasAi: boolean) => {
    setSource(src);
    setVersions({ en, ur });
    setAi(wasAi);
    setStale({});
    setChecked(false);
    setError(null);
    setTried(true);
  }, []);

  /** The author types the other language themselves (no AI): both versions start from what they wrote. */
  const startManual = useCallback(
    (originals: Record<string, string>) => {
      const src = detectLang(keys.map((k) => originals[k] ?? '').join(' '));
      const mine = Object.fromEntries(keys.map((k) => [k, (originals[k] ?? '').trim()]));
      const blank = Object.fromEntries(keys.map((k) => [k, '']));
      setSource(src);
      setVersions({ ...({ en: {}, ur: {} } as Versions), [src]: mine, [other(src)]: blank });
      setAi(false);
      setStale({});
      setChecked(false);
      setError(null);
      setTried(true);
    },
    [keys],
  );

  /** Make the other language for text the author wrote themselves. Does nothing when AI help is off. */
  const prepare = useCallback(
    async (originals: Record<string, string>) => {
      const src = detectLang(keys.map((k) => originals[k] ?? '').join(' '));
      setSource(src);
      setError(null);
      if (!(await fetchAiHelpEnabled())) {
        setTried(true);
        return;
      }
      setBusy(true);
      try {
        const fields = Object.fromEntries(keys.filter((k) => (originals[k] ?? '').trim()).map((k) => [k, originals[k].trim()]));
        const res = await translateFields(kind, src, fields);
        if (res.ok) {
          setVersions({ ...({ en: {}, ur: {} } as Versions), [src]: fields, [other(src)]: res.data });
          setAi(true);
          setStale({});
          setChecked(false);
        } else {
          setError(res.error);
        }
      } finally {
        setBusy(false);
        setTried(true);
      }
    },
    [kind, keys],
  );

  /** The author edited one language: the other may now be out of date. */
  const edit = useCallback((lang: Lang, key: string, value: string) => {
    setVersions((v) => (v ? { ...v, [lang]: { ...v[lang], [key]: value } } : v));
    setStale((s) => ({ ...s, [other(lang)]: true }));
    setChecked(false);
  }, []);

  /** Redo `lang` from the other language's current text. */
  const update = useCallback(
    async (lang: Lang) => {
      if (!versions) return;
      const from = other(lang);
      setBusy(true);
      setError(null);
      const res = await translateFields(kind, from, versions[from]);
      setBusy(false);
      if (res.ok) {
        setVersions((v) => (v ? { ...v, [lang]: { ...v[lang], ...res.data } } : v));
        setStale((s) => ({ ...s, [lang]: false }));
        setAi(true);
        setChecked(false);
      } else {
        setError(res.error);
      }
    },
    [kind, versions],
  );

  const original = (key: string): string | null => (versions ? versions[source][key] ?? null : null);

  const toI18n = (key: string) =>
    versions ? buildI18n(source, versions.en[key] ?? '', versions.ur[key] ?? '', ai) : null;

  /** A version is missing text, so it cannot be saved as a translation yet. */
  const incomplete = () => !!versions && (['en', 'ur'] as Lang[]).some((l) => keys.some((k) => !(versions[l][k] ?? '').trim()));

  const hasContact = () => !!versions && (['en', 'ur'] as Lang[]).some((l) => Object.values(versions[l]).some(looksLikeContact));

  return {
    versions,
    source,
    ai,
    stale,
    busy,
    error,
    tried,
    checked,
    setChecked,
    reset,
    applyDraft,
    applyVersions,
    startManual,
    incomplete,
    prepare,
    edit,
    update,
    original,
    toI18n,
    hasContact,
  };
}
