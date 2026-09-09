'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LOCALE_COOKIE_NAME, LOCALE_LABELS, type Locale } from '../lib/locales';
import { localeFromPathname, localizedPath } from '../lib/localized-route';

const COOKIE_MAX_AGE_SECONDS = 31_536_000;

function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}`;
}

export function LanguageSwitcher() {
  const pathname = usePathname() || '/';
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const [hash, setHash] = useState(() => (typeof window === 'undefined' ? '' : window.location.hash));
  const currentLocale = localeFromPathname(pathname);

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener('hashchange', updateHash);

    return () => window.removeEventListener('hashchange', updateHash);
  }, [pathname]);

  return (
    <nav aria-label="Language">
      {(['zh-TW', 'en'] as const).map((locale) => (
        <a
          aria-current={currentLocale === locale ? 'page' : undefined}
          href={localizedPath(locale, pathname, search, hash)}
          key={locale}
          onClick={() => writeLocaleCookie(locale)}
        >
          {LOCALE_LABELS[locale]}
        </a>
      ))}
    </nav>
  );
}
