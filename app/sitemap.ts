import { env } from 'cloudflare:workers';
import { listPublishedDownloads, listPublishedNews } from '../lib/content-repository';
import { localizedSitemapEntries } from '../lib/locale-seo';

/** Runtime sitemap of the stable public route matrix and published legacy detail IDs. */
export default async function sitemap() {
  const db = (env as unknown as { DB: D1Database }).DB;
  const [news, downloads] = await Promise.all([
    listPublishedNews(db),
    listPublishedDownloads(db),
  ]);
  return localizedSitemapEntries({
    newsIds: news.map((item) => item.legacyId),
    downloadIds: downloads.map((item) => item.legacyId),
  });
}
