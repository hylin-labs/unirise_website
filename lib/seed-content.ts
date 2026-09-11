import { uniriseSchema } from '../db/schema';
import { englishSeedPayload } from './english-seed';
import { initialPublicContent, PUBLIC_CONTENT_IDS } from './public-content';
import {
  legacyDownloads,
  legacyKnowledge,
  legacyNewsPosts,
} from './seed-content-data';

export async function seedLegacyContent(db: D1Database): Promise<void> {
  const publishedAt = new Date().toISOString();

  for (const id of PUBLIC_CONTENT_IDS) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO ${uniriseSchema.publicContent} (id, payload_json, source_version, status) VALUES (?, ?, ?, ?)`,
      )
      .bind(id, JSON.stringify(initialPublicContent[id]), 1, 'published')
      .run();
    await seedEnglishTranslation(db, 'public_content', id, {
      ...initialPublicContent[id],
    });
  }

  for (const email of ['hungyu@gmail.com', 'hungyu@craniai.com']) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO ${uniriseSchema.adminUsers} (id, email, role, enabled) VALUES (?, ?, ?, ?)`,
      )
      .bind(email, email, 'admin', 1)
      .run();
  }

  for (const post of legacyNewsPosts) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO ${uniriseSchema.managedNews} (id, legacy_id, title, lead, image_url, highlights_json, video_url, status, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        post.id,
        post.id,
        post.title,
        post.lead,
        post.image,
        JSON.stringify(post.highlights),
        post.video ?? null,
        'published',
        publishedAt,
      )
      .run();
    await seedEnglishTranslation(db, 'news', post.id, {
      kind: 'news',
      text: {
        title: post.title,
        lead: post.lead,
        highlights: post.highlights,
      },
      literals: {
        legacyId: post.id,
        imageUrl: post.image,
        videoUrl: post.video ?? null,
      },
    });
  }

  for (const download of legacyDownloads) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO ${uniriseSchema.managedDownloads} (id, legacy_id, title, status, published_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(download.id, download.id, download.title, 'published', publishedAt)
      .run();
    await seedEnglishTranslation(db, 'download', download.id, {
      kind: 'download',
      text: { title: download.title },
      literals: { legacyId: download.id },
    });
  }

  for (const item of legacyKnowledge) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO ${uniriseSchema.chatKnowledge} (id, title, href, body, tags_json, status, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        item.id,
        item.title,
        item.href,
        item.content,
        '[]',
        'published',
        publishedAt,
      )
      .run();
    await seedEnglishTranslation(db, 'knowledge', item.id, {
      kind: 'knowledge',
      text: { title: item.title, body: item.content, tags: [] },
      literals: { href: item.href },
    });
  }
}

async function seedEnglishTranslation(
  db: D1Database,
  resourceType: 'news' | 'download' | 'knowledge' | 'public_content',
  resourceId: string,
  payload: import('./translation-types').TranslationPayload,
) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR IGNORE INTO ${uniriseSchema.contentTranslations}
       (id, resource_type, resource_id, locale, payload_json, status, source_version, origin, outdated, translated_at, created_at, updated_at)
       VALUES (?, ?, ?, 'en', ?, 'needs_review', 1, 'human', 0, ?, ?, ?)`,
    )
    .bind(
      `seed-en-${resourceType}-${resourceId}`,
      resourceType,
      resourceId,
      JSON.stringify(englishSeedPayload(payload)),
      now,
      now,
      now,
    )
    .run();
}
