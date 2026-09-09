'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LOCALE_COOKIE_NAME, LOCALE_LABELS, type Locale } from '../lib/locales';
import { localeFromPathname, localizedPath } from '../lib/localized-route';

const COOKIE_MAX_AGE_SECONDS = 31_536_000;
const EMPTY_BROWSER_LOCATION = { hash: '', search: '' };

function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}`;
}

function browserLocation() {
  return { hash: window.location.hash, search: window.location.search };
}

export function LanguageSwitcher() {
  const pathname = usePathname() || '/';
  const [location, setLocation] = useState(EMPTY_BROWSER_LOCATION);
  const currentLocale = localeFromPathname(pathname);

  useEffect(() => {
    const synchronizeLocation = () => setLocation(browserLocation());
    synchronizeLocation();
    window.addEventListener('hashchange', synchronizeLocation);

    return () => window.removeEventListener('hashchange', synchronizeLocation);
  }, [pathname]);

  return (
    <nav aria-label="Language">
      {(['zh-TW', 'en'] as const).map((locale) => {
        const href = localizedPath(locale, pathname, location.search, location.hash);

        return (
          <a
            aria-current={currentLocale === locale ? 'page' : undefined}
            href={href}
            key={locale}
            onClick={(event) => {
              writeLocaleCookie(locale);
              const currentLocation = browserLocation();
              const correctedHref = localizedPath(locale, pathname, currentLocation.search, currentLocation.hash);
              event.currentTarget.setAttribute('href', correctedHref);
            }}
          >
            {LOCALE_LABELS[locale]}
          </a>
        );
      })}
    </nav>
  );
}
