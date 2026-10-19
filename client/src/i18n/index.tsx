import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { LANGUAGES, type Language } from '@spotter/shared/catalog';
import { en, type Dict, type Key } from './en';
import { de } from './de';
import { fr } from './fr';
import { es } from './es';
import { it } from './it';
import { pl } from './pl';
import { bg } from './bg';

const DICTS: Record<Language, Dict> = { en, de, fr, es, it, pl, bg };

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pl: 'Polski',
  bg: 'Български',
};

/** Locale used for Intl formatting: English defaults to British conventions (24h clock, day-month order). */
const LOCALES: Record<Language, string> = { en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pl: 'pl-PL', bg: 'bg-BG' };

const STORAGE_KEY = 'spotter.lang';

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored && LANGUAGES.includes(stored)) return stored;
  } catch {
    // Storage can be unavailable (private mode); fall through to the browser language.
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.slice(0, 2).toLowerCase() as Language;
    if (LANGUAGES.includes(base)) return base;
  }
  return 'en';
}

export type T = (key: Key, vars?: Record<string, string | number>) => string;

interface I18n {
  lang: Language;
  locale: string;
  setLang: (lang: Language) => void;
  t: T;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(initialLanguage);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not critical.
    }
  }, []);

  const t = useCallback<T>(
    (key, vars) => {
      let text: string = DICTS[lang][key] ?? en[key];
      if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
      return text;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, locale: LOCALES[lang], setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}

/**
 * A label as it reads mid-sentence: "Strength training" → "strength training".
 * German nouns stay capitalised, and acronyms like "HIIT" are left alone.
 */
export function useInlineLabel() {
  const { lang, locale } = useI18n();
  return useCallback(
    (label: string) => {
      const first = label.split(/\s/)[0];
      if (lang === 'de' || (first.length > 1 && first === first.toLocaleUpperCase(locale))) return label;
      return label.charAt(0).toLocaleLowerCase(locale) + label.slice(1);
    },
    [lang, locale],
  );
}

/** "Running, climbing and yoga" in the current language. */
export function useListFormat() {
  const { locale } = useI18n();
  return useCallback((items: string[]) => new Intl.ListFormat(locale, { type: 'conjunction' }).format(items), [locale]);
}

/** Compact time-left label like "21 h" / "45 min", localised by Intl. */
export function useDurationFormat() {
  const { locale } = useI18n();
  return useCallback(
    (ms: number) => {
      const minutes = Math.max(1, Math.ceil(ms / 60_000));
      if (minutes < 60) return new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'short' }).format(minutes);
      return new Intl.NumberFormat(locale, { style: 'unit', unit: 'hour', unitDisplay: 'short' }).format(Math.floor(minutes / 60));
    },
    [locale],
  );
}

export type { Key };
