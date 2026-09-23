import { uniriseSchema } from '../db/schema';
import { englishSeedPayload } from './english-seed';
import { initialPublicContent, PUBLIC_CONTENT_IDS } from './public-content';
import {
  legacyDownloads,
  legacyKnowledge,
  legacyNewsPosts,
} from './seed-content-data';

export type SeedLegacyContentOptions = {
  seedEnglishTranslations?: boolean;
};

export async function seedLegacyContent(
  db: D1Database,
  { seedEnglishTranslations = true }: SeedLegacyContentOptions = {},
): Promise<void> {
  const publishedAt = new Date().toISOString();

  for (const id of PUBLIC_CONTENT_IDS) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO ${uniriseSchema.publicContent} (id, payload_json, source_version, status) VALUES (?, ?, ?, ?)`,
      )
      .bind(id, JSON.stringify(initialPublicContent[id]), 1, 'published')
      .run();
    if (seedEnglishTranslations) {
      await seedEnglishTranslation(db, 'public_content', id, {
        ...initialPublicContent[id],
      });
    }
  }

  for (const email of ['hungyu@gmail.com']) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO ${uniriseSchema.adminUsers} (id, email, role, enabled) VALUES (?, ?, ?, ?)`,
      )
      .bind(email, email, 'admin', 1)
      .run();
  }

  // This is the only active administrator account. Keep an existing legacy
  // account in the audit trail, but prevent it from creating new sessions.
  await db
    .prepare(
      `UPDATE ${uniriseSchema.adminUsers} SET enabled = 0 WHERE email = ?`,
    )
    .bind('hungyu@craniai.com')
    .run();

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
    if (seedEnglishTranslations) {
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
  }

  for (const download of legacyDownloads) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO ${uniriseSchema.managedDownloads} (id, legacy_id, title, status, published_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(download.id, download.id, download.title, 'published', publishedAt)
      .run();
    if (seedEnglishTranslations) {
      await seedEnglishTranslation(db, 'download', download.id, {
        kind: 'download',
        text: { title: download.title },
        literals: { legacyId: download.id },
      });
    }
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
    if (seedEnglishTranslations) {
      await seedEnglishTranslation(db, 'knowledge', item.id, {
        kind: 'knowledge',
        text: { title: item.title, body: item.content, tags: [] },
        literals: { href: item.href },
      });
    }
  }
  await refreshInquiryCopy(db);
}

const previousInquiryHelp =
  '填寫下列表單後，系統會開啟您的郵件程式並建立一封寄給合軒科技的詢問信。';
const previousInquiryHelpEnglish =
  'Complete the form below to open your email program with an enquiry addressed to Unirise Technology.';

type StoredPublicPayload = {
  text?: Record<string, unknown>;
};

function parseStoredPublicPayload(value: string): StoredPublicPayload | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as StoredPublicPayload)
      : null;
  } catch {
    return null;
  }
}

async function refreshInquiryCopy(db: D1Database) {
  const inquiry = initialPublicContent.inquiry;
  const fields = ['help', 'submit', 'sending', 'sent', 'delayed', 'error', 'rateLimited'] as const;
  const stored = await db
    .prepare(
      `SELECT payload_json FROM ${uniriseSchema.publicContent} WHERE id = ? LIMIT 1`,
    )
    .bind('inquiry')
    .first<{ payload_json: string }>();
  const payload = stored && parseStoredPublicPayload(stored.payload_json);
  if (payload?.text?.help === previousInquiryHelp) {
    const text = { ...payload.text };
    for (const field of fields) text[field] = inquiry.text[field];
    await db
      .prepare(
        `UPDATE ${uniriseSchema.publicContent} SET payload_json = ? WHERE id = ?`,
      )
      .bind(JSON.stringify({ ...payload, text }), 'inquiry')
      .run();
  }

  const translated = englishSeedPayload(inquiry);
  if (translated.kind !== 'inquiry') return;
  const english = await db
    .prepare(
      `SELECT id, payload_json FROM ${uniriseSchema.contentTranslations}
       WHERE resource_type = ? AND resource_id = ? AND locale = ? LIMIT 1`,
    )
    .bind('public_content', 'inquiry', 'en')
    .first<{ id: string; payload_json: string }>();
  const englishPayload =
    english && parseStoredPublicPayload(english.payload_json);
  if (english && englishPayload?.text?.help === previousInquiryHelpEnglish) {
    const text = { ...englishPayload.text };
    for (const field of fields) text[field] = translated.text[field];
    await db
      .prepare(
        `UPDATE ${uniriseSchema.contentTranslations} SET payload_json = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(
        JSON.stringify({ ...englishPayload, text }),
        new Date().toISOString(),
        english.id,
      )
      .run();
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
