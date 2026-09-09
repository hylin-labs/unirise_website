'use client';

import { useEffect, useState } from 'react';
import { publicAnalyticsPath } from '../lib/public-analytics-path';
import styles from './visitor-counter.module.css';

type VisitorStats = { total: number; today: number };

const formatter = new Intl.NumberFormat('zh-TW');

export function VisitorCounter() {
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
    ) =>
      fetch('/api/analytics', {
        method: 'POST',
        cache: 'no-store',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path, metadata }),
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
      if (
        url.origin === window.location.origin &&
        url.pathname === '/downloads' &&
        downloadId &&
        /^\d{1,12}$/.test(downloadId)
      ) {
        void track('download_click', `/downloads?id=${downloadId}`, {
          downloadId,
        });
      }
    };
    document.addEventListener('click', captureDownload, true);
    return () => {
      active = false;
      document.removeEventListener('click', captureDownload, true);
    };
  }, []);

  if (!stats)
    return (
      <span className={styles.counter} aria-live="polite">
        訪客統計載入中
      </span>
    );

  return (
    <span className={styles.counter} aria-live="polite">
      累計訪客 {formatter.format(stats.total)} ｜ 今日訪客{' '}
      {formatter.format(stats.today)}
    </span>
  );
}
