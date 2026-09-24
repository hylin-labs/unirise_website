import type { Locale } from '../lib/locales';
import { useVisitorStats } from './visitor-analytics';
import styles from './visitor-counter.module.css';

export function VisitorCounter({ locale }: { locale: Locale }) {
  const formatter = new Intl.NumberFormat(locale);
  const stats = useVisitorStats();

  if (!stats)
    return (
      <span className={styles.counter} aria-live="polite">
        {locale === 'en' ? 'Loading visitor statistics' : '訪客統計載入中'}
      </span>
    );

  return (
    <span className={styles.counter} aria-live="polite">
      {locale === 'en' ? 'Total visitors' : '累計訪客'}{' '}
      {formatter.format(stats.total)} ｜{' '}
      {locale === 'en' ? 'Visitors today' : '今日訪客'}{' '}
      {formatter.format(stats.today)}
    </span>
  );
}
