import { describe, expect, it, vi } from 'vitest';
import type { AdminIdentity } from '../lib/admin-auth';
import {
  ContentValidationError,
  findPublishedNewsByLegacyId,
  listPublishedDownloads,
  retrievePublishedKnowledge,
  saveDownload,
  saveKnowledge,
  saveNews,
  setDownloadPublication,
  setKnowledgePublication,
  setNewsPublication,
} from '../lib/content-repository';
import { createDownloadsAdminHandler } from '../app/api/admin/downloads/route';
import { createKnowledgeAdminHandler } from '../app/api/admin/knowledge/route';
import { createNewsAdminHandler } from '../app/api/admin/news/route';
import { ContentDatabase } from './helpers/content-d1';

vi.mock('cloudflare:workers', () => ({ env: {} }));

const admin: AdminIdentity = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
};

describe('managed content repository', () => {
  it('never returns a draft knowledge record to public retrieval', async () => {
    const database = new ContentDatabase();
    await saveKnowledge(
      database.d1,
      {
        id: 'draft',
        title: 'Draft',
        href: '/contact',
        body: 'private address',
        tags: [],
        status: 'draft',
      },
      admin,
    );
    await saveKnowledge(
      database.d1,
      {
        id: 'published',
        title: 'Published',
        href: '/contact',
        body: 'public address',
        tags: [],
        status: 'draft',
      },
      admin,
    );
    await setKnowledgePublication(database.d1, 'published', 'published', admin);

    await expect(
      retrievePublishedKnowledge(database.d1, 'address'),
    ).resolves.toEqual([
      expect.objectContaining({ title: 'Published', href: '/contact' }),
    ]);
  });

  it('makes a draft retrievable only after an audited publication change', async () => {
    const database = new ContentDatabase();
    await saveKnowledge(
      database.d1,
      {
        id: 'publish-me',
        title: 'Service location',
        href: '/contact',
        body: 'Tainan office',
        tags: ['office'],
        status: 'draft',
      },
      admin,
    );

    await expect(
      retrievePublishedKnowledge(database.d1, 'Tainan'),
    ).resolves.toEqual([]);
    await setKnowledgePublication(
      database.d1,
      'publish-me',
      'published',
      admin,
    );
    await expect(
      retrievePublishedKnowledge(database.d1, 'Tainan'),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'publish-me', title: 'Service location' }),
    ]);
    expect(database.rows('admin_audit_log')).toEqual([
      expect.objectContaining({
        admin_user_id: 'admin-1',
        action: 'knowledge.saved',
        target_id: 'publish-me',
      }),
      expect.objectContaining({
        admin_user_id: 'admin-1',
        action: 'knowledge.published',
        target_id: 'publish-me',
      }),
    ]);
  });

  it('preserves the original publication time when editing published knowledge', async () => {
    vi.useFakeTimers();
    try {
      const database = new ContentDatabase();
      vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
      await saveKnowledge(
        database.d1,
        {
          id: 'published-edit',
          title: 'Published title',
          href: '/contact',
          body: 'Original body',
          tags: [],
          status: 'draft',
        },
        admin,
      );
      await setKnowledgePublication(
        database.d1,
        'published-edit',
        'published',
        admin,
      );

      vi.setSystemTime(new Date('2026-09-02T00:00:00.000Z'));
      await saveKnowledge(
        database.d1,
        {
          id: 'published-edit',
          title: 'Updated title',
          href: '/contact',
          body: 'Updated body',
          tags: [],
          status: 'published',
        },
        admin,
      );

      expect(database.rows('chat_knowledge')[0]).toEqual(
        expect.objectContaining({
          title: 'Updated title',
          published_at: '2026-09-01T00:00:00.000Z',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('forces publication changes through the audited publication operation', async () => {
    const database = new ContentDatabase();
    await saveKnowledge(
      database.d1,
      {
        id: 'save-publish',
        title: 'Draft title',
        href: '/contact',
        body: 'Draft body',
        tags: [],
        status: 'draft',
      },
      admin,
    );
    await expect(
      saveKnowledge(
        database.d1,
        {
          id: 'save-publish',
          title: 'Published title',
          href: '/contact',
          body: 'Published body',
          tags: [],
          status: 'published',
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ContentValidationError);
    expect(database.rows('chat_knowledge')[0]).toEqual(
      expect.objectContaining({ status: 'draft', published_at: null }),
    );

    await setKnowledgePublication(
      database.d1,
      'save-publish',
      'published',
      admin,
    );
    expect(database.rows('admin_audit_log').map((row) => row.action)).toEqual([
      'knowledge.saved',
      'knowledge.published',
    ]);
  });

  it('preserves published legacy news IDs and hides draft downloads', async () => {
    const database = new ContentDatabase();
    await saveNews(
      database.d1,
      {
        id: 'news-3944',
        legacyId: '3944',
        title: 'Published news',
        lead: 'Published body',
        imageUrl: '/images/news.jpg',
        highlights: ['Verified detail'],
        videoUrl: 'https://www.youtube.com/embed/example',
        status: 'draft',
      },
      admin,
    );
    await setNewsPublication(database.d1, 'news-3944', 'published', admin);
    await saveDownload(
      database.d1,
      {
        id: 'download-draft',
        legacyId: '77',
        title: 'Private',
        status: 'draft',
      },
      admin,
    );
    await saveDownload(
      database.d1,
      {
        id: 'download-public',
        legacyId: '3853',
        title: 'NIHOT-回收再生',
        status: 'draft',
      },
      admin,
    );
    await setDownloadPublication(
      database.d1,
      'download-public',
      'published',
      admin,
    );

    await expect(
      findPublishedNewsByLegacyId(database.d1, '3944'),
    ).resolves.toEqual(expect.objectContaining({ legacyId: '3944' }));
    await expect(listPublishedDownloads(database.d1)).resolves.toEqual([
      expect.objectContaining({ legacyId: '3853', title: 'NIHOT-回收再生' }),
    ]);
  });

  it.each([
    ['empty title', { title: '', href: '/contact', body: 'body', tags: [] }],
    [
      'long title',
      { title: 't'.repeat(161), href: '/contact', body: 'body', tags: [] },
    ],
    ['empty body', { title: 'title', href: '/contact', body: '', tags: [] }],
    [
      'long body',
      { title: 'title', href: '/contact', body: 'b'.repeat(8001), tags: [] },
    ],
    [
      'too many tags',
      {
        title: 'title',
        href: '/contact',
        body: 'body',
        tags: Array(13).fill('tag'),
      },
    ],
    [
      'insecure URL',
      { title: 'title', href: 'http://example.com', body: 'body', tags: [] },
    ],
  ])('rejects %s', async (_name, invalid) => {
    const database = new ContentDatabase();
    await expect(
      saveKnowledge(
        database.d1,
        { id: 'invalid', status: 'draft', ...invalid },
        admin,
      ),
    ).rejects.toBeInstanceOf(ContentValidationError);
    expect(database.rows('chat_knowledge')).toEqual([]);
    expect(database.rows('admin_audit_log')).toEqual([]);
  });

  it('rejects a nonnumeric legacy ID', async () => {
    const database = new ContentDatabase();
    await expect(
      saveDownload(
        database.d1,
        {
          id: 'invalid-legacy-id',
          legacyId: '3853&redirect=/admin',
          title: 'Download title',
          status: 'draft',
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ContentValidationError);
    expect(database.rows('managed_downloads')).toEqual([]);
    expect(database.rows('admin_audit_log')).toEqual([]);
  });
});

describe('admin content APIs', () => {
  it.each([
    ['news', createNewsAdminHandler],
    ['downloads', createDownloadsAdminHandler],
    ['knowledge', createKnowledgeAdminHandler],
  ])('rejects unauthenticated %s mutations', async (_name, createHandler) => {
    const database = new ContentDatabase();
    const handler = createHandler(database.d1, async () => null);
    const response = await handler(
      new Request('https://unirise.example/api/admin/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it.each([
    ['null', 'null'],
    ['an array', '[]'],
  ])(
    'returns a validation response for %s authenticated content',
    async (_name, body) => {
      const database = new ContentDatabase();
      const handler = createKnowledgeAdminHandler(
        database.d1,
        async () => admin,
      );
      const response = await handler(
        new Request('https://unirise.example/api/admin/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_content' });
      expect(database.rows('admin_audit_log')).toEqual([]);
    },
  );

  it.each([
    ['news', createNewsAdminHandler],
    ['downloads', createDownloadsAdminHandler],
    ['knowledge', createKnowledgeAdminHandler],
  ])(
    'rejects a null authenticated %s publication payload',
    async (_name, createHandler) => {
      const database = new ContentDatabase();
      const handler = createHandler(database.d1, async () => admin);
      const response = await handler(
        new Request('https://unirise.example/api/admin/content', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: 'null',
        }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_content' });
      expect(database.rows('admin_audit_log')).toEqual([]);
    },
  );

  it('rejects an unauthenticated mutation through the default requireAdmin path', async () => {
    const database = new ContentDatabase();
    const handler = createKnowledgeAdminHandler(database.d1);
    const response = await handler(
      new Request('https://unirise.example/api/admin/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });
});
