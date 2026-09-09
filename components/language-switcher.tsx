'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { LOCALE_COOKIE_NAME, LOCALE_LABELS, type Locale } from '../lib/locales';
import { localeFromPathname, localizedPath } from '../lib/localized-route';

const COOKIE_MAX_AGE_SECONDS = 31_536_000;

function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}`;
}

export function LanguageSwitcher() {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [hash, setHash] = useState('');
  const currentLocale = localeFromPathname(pathname);

  useEffect(() => {
    setHash(window.location.hash);
  }, [pathname]);

  return (
    <nav aria-label="Language">
      {(['zh-TW', 'en'] as const).map((locale) => (
        <a
          aria-current={currentLocale === locale ? 'page' : undefined}
          href={localizedPath(locale, pathname, search ? `?${search}` : '', hash)}
          key={locale}
          onClick={() => writeLocaleCookie(locale)}
        >
          {LOCALE_LABELS[locale]}
        </a>
      ))}
    </nav>
  );
}
