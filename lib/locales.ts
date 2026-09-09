export const LOCALES = ['zh-TW', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'zh-TW';
export const LOCALE_COOKIE_NAME = 'unirise_locale';

export const LOCALE_LABELS: Readonly<Record<Locale, string>> = {
  'zh-TW': '繁體中文',
  en: 'English',
};

export function parseLocale(value: unknown): Locale | null {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
    ? (value as Locale)
    : null;
}

export function parseLocaleOrDefault(value: unknown): Locale {
  return parseLocale(value) ?? DEFAULT_LOCALE;
}
