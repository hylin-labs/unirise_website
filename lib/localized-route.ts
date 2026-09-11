import { DEFAULT_LOCALE, type Locale } from './locales';

import { PUBLIC_PATHS } from './public-route-inventory.mjs';

export type PublicPath = (typeof PUBLIC_PATHS)[number];

function isPublicPath(pathname: string): pathname is PublicPath {
  return (PUBLIC_PATHS as readonly string[]).includes(pathname);
}

function localePrefix(locale: Locale, pathname: PublicPath): string {
  return locale === 'en'
    ? pathname === '/'
      ? '/en'
      : `/en${pathname}`
    : pathname;
}

function safeSuffix(value: string, prefix: '?' | '#'): string {
  return value.startsWith(prefix) ? value : '';
}

export function publicPathWithoutLocale(pathname: string): PublicPath | null {
  if (typeof pathname !== 'string') return null;
  if (isPublicPath(pathname)) return pathname;

  if (pathname === '/en') return '/';
  if (!pathname.startsWith('/en/')) return null;

  const withoutEnglishPrefix = pathname.slice(3);
  return isPublicPath(withoutEnglishPrefix) ? withoutEnglishPrefix : null;
}

export function localeFromPathname(pathname: string): Locale | null {
  const publicPath = publicPathWithoutLocale(pathname);
  if (!publicPath) return null;
  return pathname === '/en' || pathname.startsWith('/en/')
    ? 'en'
    : DEFAULT_LOCALE;
}

export function localizedPath(
  locale: Locale,
  pathname: string,
  search = '',
  hash = '',
): string {
  const publicPath = publicPathWithoutLocale(pathname) ?? '/';
  return `${localePrefix(locale, publicPath)}${safeSuffix(search, '?')}${safeSuffix(hash, '#')}`;
}

export function alternateLocalePath(
  pathname: string,
  search = '',
  hash = '',
): string {
  const locale = localeFromPathname(pathname);
  if (!locale) return localizedPath(DEFAULT_LOCALE, '/', search, hash);
  return localizedPath(
    locale === 'en' ? DEFAULT_LOCALE : 'en',
    pathname,
    search,
    hash,
  );
}
