'use client';

import { useEffect, useState } from 'react';
import styles from './visitor-counter.module.css';

type VisitorStats = { total: number; today: number };

const formatter = new Intl.NumberFormat('zh-TW');

export function VisitorCounter() {
  const [stats, setStats] = useState<VisitorStats | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/visitor-stats', { method: 'POST', cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() as Promise<VisitorStats> : null)
      .then((nextStats) => { if (active && nextStats) setStats(nextStats); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!stats) return <span className={styles.counter} aria-live="polite">訪客統計載入中</span>;

  return <span className={styles.counter} aria-live="polite">累計訪客 {formatter.format(stats.total)} ｜ 今日訪客 {formatter.format(stats.today)}</span>;
}
