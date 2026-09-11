import { env } from 'cloudflare:workers';
import type { Metadata } from 'next';
import { PublicHome } from '../components/public-home';
import { listPublishedNewsForLocale } from '../lib/content-repository';
import type { Locale } from '../lib/locales';
import { localizedPath } from '../lib/localized-route';
import { localizedPageMetadata } from '../lib/locale-seo';
import { getLocalizedContent } from '../lib/translation-repository';
import type { ChromePayload, HomePayload } from '../lib/translation-types';

type PublicHomeRouteProps = { locale: Locale };

export const metadata: Metadata = localizedPageMetadata('zh-TW', '/');

async function localizedPayload<T extends HomePayload | ChromePayload>(
  db: D1Database,
  id: 'home' | 'chrome',
  locale: Locale,
): Promise<T> {
  const localized = await getLocalizedContent(db, 'public_content', id, locale);
  if (!localized?.payload || localized.payload.kind !== id)
    throw new Error(`published ${id} content is unavailable`);
  return localized.payload as T;
}

/** Server boundary for managed public content; interactions remain in PublicHome. */
export async function PublicHomeRoute({ locale }: PublicHomeRouteProps) {
  const db = (env as unknown as { DB: D1Database }).DB;
  const [home, chrome, news] = await Promise.all([
    localizedPayload<HomePayload>(db, 'home', locale),
    localizedPayload<ChromePayload>(db, 'chrome', locale),
    listPublishedNewsForLocale(db, locale),
  ]);
  return (
    <PublicHome
      locale={locale}
      home={home}
      chrome={chrome}
      news={news}
      pathname={localizedPath(locale, '/')}
    />
  );
}

export default function HomePage() {
  return <PublicHomeRoute locale="zh-TW" />;
}
