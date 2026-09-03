import { newsPosts } from '../app/news-data';
import { uniriseSchema } from '../db/schema';
import { legacyKnowledge } from './site-knowledge';

const legacyDownloads = [
  { id: '3853', title: 'NIHOT-回收再生' },
  { id: '77', title: 'OPTIMUM-食材分選' },
  { id: '3854', title: 'PROMIX-塑膠化工' },
  { id: '78', title: 'XAVIS-X光檢測' },
] as const;

export async function seedLegacyContent(db: D1Database): Promise<void> {
  const publishedAt = new Date().toISOString();

  await db.prepare(`INSERT OR IGNORE INTO ${uniriseSchema.adminUsers} (id, email, role, enabled) VALUES (?, ?, ?, ?)`)
    .bind('hungyu@gmail.com', 'hungyu@gmail.com', 'admin', 1).run();

  for (const post of newsPosts) {
    await db.prepare(`INSERT OR IGNORE INTO ${uniriseSchema.managedNews} (id, legacy_id, title, lead, image_url, highlights_json, video_url, status, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(post.id, post.id, post.title, post.lead, post.image, JSON.stringify(post.highlights), post.video ?? null, 'published', publishedAt).run();
  }

  for (const download of legacyDownloads) {
    await db.prepare(`INSERT OR IGNORE INTO ${uniriseSchema.managedDownloads} (id, legacy_id, title, status, published_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(download.id, download.id, download.title, 'published', publishedAt).run();
  }

  for (const item of legacyKnowledge) {
    await db.prepare(`INSERT OR IGNORE INTO ${uniriseSchema.chatKnowledge} (id, title, href, body, tags_json, status, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(item.id, item.title, item.href, item.content, '[]', 'published', publishedAt).run();
  }
}
