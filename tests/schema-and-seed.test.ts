import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createFakeD1 } from './helpers/fake-d1';
import { ensureInitialContent } from '../lib/runtime-initialization';
import { seedLegacyContent } from '../lib/seed-content';

describe('legacy content seed', () => {
  it('keeps news 3944 published and addressable by its existing ID', async () => {
    const db = createFakeD1();
    await seedLegacyContent(db);
    await seedLegacyContent(db);
    const row = await db
      .prepare(
        'SELECT legacy_id, status, published_at FROM managed_news WHERE legacy_id = ?',
      )
      .bind('3944')
      .first<{ legacy_id: string; status: string; published_at: string }>();
    const count = await db
      .prepare('SELECT COUNT(*) AS count FROM managed_news WHERE legacy_id = ?')
      .bind('3944')
      .first<{ count: number }>();

    expect(row).toEqual({
      legacy_id: '3944',
      status: 'published',
      published_at: expect.any(String),
    });
    expect(count).toEqual({ count: 1 });
  });

  it('migrates the published SBI article and its YouTube video', async () => {
    const db = createFakeD1();
    await seedLegacyContent(db);

    const row = await db
      .prepare(
        'SELECT legacy_id, title, video_url, status FROM managed_news WHERE legacy_id = ?',
      )
      .bind('111')
      .first<{
        legacy_id: string;
        title: string;
        video_url: string;
        status: string;
      }>();

    expect(row).toEqual({
      legacy_id: '111',
      title: '厚薄測量儀 SBI',
      video_url: 'https://www.youtube.com/watch?v=iuZ4P8mqLkw',
      status: 'published',
    });
  });
});

describe('admin schema migration', () => {
  it('contains only schema definitions; runtime initialization owns initial content', async () => {
    const migration = await readFile(
      resolve('drizzle/0002_add_admin_content_leads_analytics.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE admin_users');
    expect(migration).toContain(
      'CREATE INDEX chat_question_log_outcome_date_idx',
    );
    expect(migration).not.toMatch(/\bINSERT\b/i);
    expect(migration).not.toMatch(/\bUPDATE\b/i);
    expect(migration).not.toMatch(/\bDELETE\b/i);
  });
});

describe('runtime content initialization', () => {
  it('seeds a database once per Worker isolate and remains safe when invoked repeatedly', async () => {
    const db = createFakeD1();

    await Promise.all([
      ensureInitialContent(db),
      ensureInitialContent(db),
      ensureInitialContent(db),
    ]);

    const count = await db
      .prepare('SELECT COUNT(*) AS count FROM managed_news WHERE legacy_id = ?')
      .bind('3944')
      .first<{ count: number }>();
    expect(count).toEqual({ count: 1 });
  });

  it('does not rely on isolate-local state to seed another D1 binding', async () => {
    const first = createFakeD1();
    const second = createFakeD1();

    await ensureInitialContent(first);
    await ensureInitialContent(second);

    await expect(
      second
        .prepare(
          'SELECT legacy_id, status FROM managed_news WHERE legacy_id = ?',
        )
        .bind('3944')
        .first<{ legacy_id: string; status: string }>(),
    ).resolves.toEqual({ legacy_id: '3944', status: 'published' });
  });
});
