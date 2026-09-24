'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { publicAnalyticsPath } from '../lib/public-analytics-path';
import {
  localeFromPathname,
  publicPathWithoutLocale,
} from '../lib/localized-route';
import type { Locale } from '../lib/locales';

export type VisitorStats = { total: number; today: number };

const VisitorStatsContext = createContext<VisitorStats | null>(null);

export function useVisitorStats() {
  return useContext(VisitorStatsContext);
}

export function VisitorAnalyticsProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const [stats, setStats] = useState<VisitorStats | null>(null);

  useEffect(() => {
    let active = true;
    const pagePath = publicAnalyticsPath(
      window.location.pathname,
      window.location.search,
    );
    const track = (
      name: 'page_view' | 'download_click',
      path: string,
      metadata?: { downloadId: string },
      eventLocale: Locale = locale,
    ) =>
      fetch('/api/analytics', {
        method: 'POST',
        cache: 'no-store',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: eventLocale, name, path, metadata }),
      }).catch(() => undefined);

    fetch('/api/visitor-stats', { method: 'POST', cache: 'no-store' })
      .then(async (response) =>
        response.ok ? (response.json() as Promise<VisitorStats>) : null,
      )
      .then((nextStats) => {
        if (active && nextStats) setStats(nextStats);
        if (
          nextStats &&
          pagePath &&
          window.location.hostname !== 'localhost' &&
          window.location.hostname !== '127.0.0.1' &&
          window.location.pathname !== '/admin' &&
          !window.location.pathname.startsWith('/admin/')
        ) {
          void track('page_view', pagePath);
        }
      })
      .catch(() => undefined);

    const captureDownload = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a');
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      const downloadId = url.searchParams.get('id');
      const downloadLocale = localeFromPathname(url.pathname);
      const downloadPath = publicAnalyticsPath(url.pathname, url.search);
      if (
        url.origin === window.location.origin &&
        publicPathWithoutLocale(url.pathname) === '/downloads' &&
        downloadLocale &&
        downloadPath &&
        downloadId &&
        /^\d{1,12}$/.test(downloadId)
      ) {
        void track(
          'download_click',
          downloadPath,
          { downloadId },
          downloadLocale,
        );
      }
    };
    document.addEventListener('click', captureDownload, true);
    return () => {
      active = false;
      document.removeEventListener('click', captureDownload, true);
    };
  }, [locale]);

  return (
    <VisitorStatsContext.Provider value={stats}>
      {children}
    </VisitorStatsContext.Provider>
  );
}
