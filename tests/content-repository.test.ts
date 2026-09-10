import { describe, expect, it, vi } from 'vitest';
import type { AdminIdentity } from '../lib/admin-auth';
import {
  buildAdminContentPayload,
  parseDatabaseTimestamp,
  redirectAdminUnauthorized,
} from '../lib/admin-content';
import {
  ContentConflictError,
  ContentValidationError,
  findPublishedNewsByLegacyId,
  findPublishedNewsByLegacyIdForLocale,
  listPublishedDownloads,
  listPublishedDownloadsForLocale,
  listPublishedNewsForLocale,
  retrievePublishedKnowledge,
  retrievePublishedKnowledgeForLocale,
  saveDownload,
  saveKnowledge,
  saveNews,
  setDownloadPublication,
  setKnowledgePublication,
  setNewsPublication,
} from '../lib/content-repository';
import { retrieveSiteKnowledge } from '../lib/site-knowledge';
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

function translationFixture(
  resourceType: 'news' | 'download' | 'knowledge',
  resourceId: string,
  payload: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `translation-${resourceId}`,
    resource_type: resourceType,
    resource_id: resourceId,
    source_version: 1,
    locale: 'en',
    payload_json: JSON.stringify(payload),
    status: 'needs_review',
    origin: 'ai',
    outdated: 0,
    failure_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    translated_at: '2026-09-09T00:00:00.000Z',
    updated_at: '2026-09-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('managed content repository', () => {
  it('parses legacy SQLite timestamps as UTC before Taipei display', () => {
    expect(parseDatabaseTimestamp('2026-09-08 12:34:56').toISOString()).toBe(
      '2026-09-08T12:34:56.000Z',
    );
    expect(
      parseDatabaseTimestamp('2026-09-08T12:34:56.000+08:00').toISOString(),
    ).toBe('2026-09-08T04:34:56.000Z');
  });

  it('redirects expired admin mutations to the login page', () => {
    let redirectedTo = '';
    const location = {
      assign(path: string) {
        redirectedTo = path;
      },
    };

    expect(
      redirectAdminUnauthorized(new Response(null, { status: 401 }), location),
    ).toBe(true);
    expect(redirectedTo).toBe('/admin/login');
    expect(
      redirectAdminUnauthorized(new Response(null, { status: 409 }), location),
    ).toBe(false);
  });

  it('builds complete create and edit payloads for every admin content form', () => {
    expect(
      buildAdminContentPayload({
        kind: 'news',
        id: 'news-1',
        legacyId: '9001',
        title: 'News title',
        lead: 'News lead',
        imageUrl: '/news.jpg',
        highlightsText: 'First\n\nSecond',
        videoUrl: 'https://www.youtube.com/embed/demo',
        href: '',
        body: '',
        tagsText: '',
        status: 'draft',
      }),
    ).toEqual({
      id: 'news-1',
      legacyId: '9001',
      title: 'News title',
      lead: 'News lead',
      imageUrl: '/news.jpg',
      highlights: ['First', 'Second'],
      videoUrl: 'https://www.youtube.com/embed/demo',
      status: 'draft',
    });
    expect(
      buildAdminContentPayload({
        kind: 'downloads',
        id: '',
        legacyId: '9002',
        title: 'Brochure',
        lead: '',
        imageUrl: '',
        highlightsText: '',
        videoUrl: '',
        href: '',
        body: '',
        tagsText: '',
        status: 'published',
      }),
    ).toEqual({ legacyId: '9002', title: 'Brochure', status: 'draft' });
    expect(
      buildAdminContentPayload({
        kind: 'knowledge',
        id: 'knowledge-1',
        legacyId: '',
        title: 'Answer',
        lead: '',
        imageUrl: '',
        highlightsText: '',
        videoUrl: '',
        href: '/contact',
        body: 'Source body',
        tagsText: 'contact, service',
        status: 'draft',
      }),
    ).toEqual({
      id: 'knowledge-1',
      title: 'Answer',
      href: '/contact',
      body: 'Source body',
      tags: ['contact', 'service'],
      status: 'draft',
    });
  });

  it('returns every editable field from each authenticated admin content endpoint', async () => {
    const database = new ContentDatabase();
    await saveNews(
      database.d1,
      {
        id: 'news-edit',
        legacyId: '9001',
        title: 'Editable news',
        lead: 'Editable lead',
        imageUrl: '/news.jpg',
        highlights: ['One', 'Two'],
        videoUrl: 'https://www.youtube.com/embed/demo',
        status: 'draft',
      },
      admin,
    );
    await saveDownload(
      database.d1,
      {
        id: 'download-edit',
        legacyId: '9002',
        title: 'Editable brochure',
        status: 'draft',
      },
      admin,
    );
    await saveKnowledge(
      database.d1,
      {
        id: 'knowledge-edit',
        title: 'Editable knowledge',
        href: '/contact',
        body: 'Editable answer source',
        tags: ['contact'],
        status: 'draft',
      },
      admin,
    );

    const authenticated = async () => admin;
    const responses = await Promise.all([
      createNewsAdminHandler(
        database.d1,
        authenticated,
      )(new Request('https://unirise.tw/api/admin/news')),
      createDownloadsAdminHandler(
        database.d1,
        authenticated,
      )(new Request('https://unirise.tw/api/admin/downloads')),
      createKnowledgeAdminHandler(
        database.d1,
        authenticated,
      )(new Request('https://unirise.tw/api/admin/knowledge')),
    ]);
    const [news, downloads, knowledge] = await Promise.all(
      responses.map((response) => response.json()),
    );

    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200,
    ]);
    expect(news).toEqual({
      records: [
        expect.objectContaining({
          lead: 'Editable lead',
          imageUrl: '/news.jpg',
          highlights: ['One', 'Two'],
          videoUrl: 'https://www.youtube.com/embed/demo',
          status: 'draft',
        }),
      ],
    });
    expect(downloads).toEqual({
      records: [
        expect.objectContaining({
          legacyId: '9002',
          title: 'Editable brochure',
          status: 'draft',
        }),
      ],
    });
    expect(knowledge).toEqual({
      records: [
        expect.objectContaining({
          href: '/contact',
          content: 'Editable answer source',
          tags: ['contact'],
          status: 'draft',
        }),
      ],
    });
  });

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

  it('preserves publication state and time when editing all published content types', async () => {
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
      await saveNews(
        database.d1,
        {
          id: 'published-news-edit',
          legacyId: '3944',
          title: 'Original news title',
          lead: 'Original lead',
          imageUrl: '/images/news.jpg',
          highlights: [],
          status: 'draft',
        },
        admin,
      );
      await setNewsPublication(
        database.d1,
        'published-news-edit',
        'published',
        admin,
      );
      await saveDownload(
        database.d1,
        {
          id: 'published-download-edit',
          legacyId: '3853',
          title: 'Original download title',
          status: 'draft',
        },
        admin,
      );
      await setDownloadPublication(
        database.d1,
        'published-download-edit',
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
      await saveNews(
        database.d1,
        {
          id: 'published-news-edit',
          legacyId: '3944',
          title: 'Updated news title',
          lead: 'Updated lead',
          imageUrl: '/images/news.jpg',
          highlights: [],
          status: 'published',
        },
        admin,
      );
      await saveDownload(
        database.d1,
        {
          id: 'published-download-edit',
          legacyId: '3853',
          title: 'Updated download title',
          status: 'published',
        },
        admin,
      );

      expect(database.rows('chat_knowledge')[0]).toEqual(
        expect.objectContaining({
          title: 'Updated title',
          status: 'published',
          published_at: '2026-09-01T00:00:00.000Z',
        }),
      );
      expect(database.rows('managed_news')[0]).toEqual(
        expect.objectContaining({
          title: 'Updated news title',
          status: 'published',
          published_at: '2026-09-01T00:00:00.000Z',
        }),
      );
      expect(database.rows('managed_downloads')[0]).toEqual(
        expect.objectContaining({
          title: 'Updated download title',
          status: 'published',
          published_at: '2026-09-01T00:00:00.000Z',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a knowledge save interleaved with publication', async () => {
    const database = new ContentDatabase();
    await saveKnowledge(
      database.d1,
      {
        id: 'knowledge-publish-race',
        title: 'Original title',
        href: '/contact',
        body: 'Original body',
        tags: [],
        status: 'draft',
      },
      admin,
    );
    database.interleaveNextBatch(() =>
      setKnowledgePublication(
        database.d1,
        'knowledge-publish-race',
        'published',
        admin,
      ),
    );

    await expect(
      saveKnowledge(
        database.d1,
        {
          id: 'knowledge-publish-race',
          title: 'Stale title',
          href: '/contact',
          body: 'Stale body',
          tags: [],
          status: 'draft',
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ContentConflictError);
    expect(database.rows('chat_knowledge')[0]).toEqual(
      expect.objectContaining({
        title: 'Original title',
        status: 'published',
        published_at: expect.any(String),
      }),
    );
    expect(database.rows('admin_audit_log').map((row) => row.action)).toEqual([
      'knowledge.saved',
      'knowledge.published',
    ]);
  });

  it('rejects a news save interleaved with unpublication', async () => {
    const database = new ContentDatabase();
    await saveNews(
      database.d1,
      {
        id: 'news-unpublish-race',
        legacyId: '3944',
        title: 'Original title',
        lead: 'Original lead',
        imageUrl: '/images/news.jpg',
        highlights: [],
        status: 'draft',
      },
      admin,
    );
    await setNewsPublication(
      database.d1,
      'news-unpublish-race',
      'published',
      admin,
    );
    database.interleaveNextBatch(() =>
      setNewsPublication(database.d1, 'news-unpublish-race', 'draft', admin),
    );

    await expect(
      saveNews(
        database.d1,
        {
          id: 'news-unpublish-race',
          legacyId: '3944',
          title: 'Stale title',
          lead: 'Stale lead',
          imageUrl: '/images/news.jpg',
          highlights: [],
          status: 'published',
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ContentConflictError);
    expect(database.rows('managed_news')[0]).toEqual(
      expect.objectContaining({
        title: 'Original title',
        status: 'draft',
        published_at: null,
      }),
    );
    expect(database.rows('admin_audit_log').map((row) => row.action)).toEqual([
      'news.saved',
      'news.published',
      'news.unpublished',
    ]);
  });

  it('rejects a download save interleaved with publication', async () => {
    const database = new ContentDatabase();
    await saveDownload(
      database.d1,
      {
        id: 'download-publish-race',
        legacyId: '3853',
        title: 'Original title',
        status: 'draft',
      },
      admin,
    );
    database.interleaveNextBatch(() =>
      setDownloadPublication(
        database.d1,
        'download-publish-race',
        'published',
        admin,
      ),
    );

    await expect(
      saveDownload(
        database.d1,
        {
          id: 'download-publish-race',
          legacyId: '3853',
          title: 'Stale title',
          status: 'draft',
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ContentConflictError);
    expect(database.rows('managed_downloads')[0]).toEqual(
      expect.objectContaining({
        title: 'Original title',
        status: 'published',
        published_at: expect.any(String),
      }),
    );
    expect(database.rows('admin_audit_log').map((row) => row.action)).toEqual([
      'download.saved',
      'download.published',
    ]);
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

  it('keeps Chinese reads unchanged while resolving public English news and downloads', async () => {
    const database = new ContentDatabase();
    await saveNews(
      database.d1,
      {
        id: 'localized-news',
        legacyId: '3944',
        title: '中文新聞',
        lead: '中文摘要',
        imageUrl: '/images/news.jpg',
        highlights: ['中文重點'],
        videoUrl: 'https://www.youtube.com/embed/example',
        status: 'draft',
      },
      admin,
    );
    await setNewsPublication(database.d1, 'localized-news', 'published', admin);
    await saveDownload(
      database.d1,
      {
        id: 'localized-download',
        legacyId: '3853',
        title: '中文下載',
        status: 'draft',
      },
      admin,
    );
    await setDownloadPublication(
      database.d1,
      'localized-download',
      'published',
      admin,
    );
    database.seed(
      'content_translations',
      translationFixture('news', 'localized-news', {
        kind: 'news',
        text: {
          title: 'English news',
          lead: 'English summary',
          highlights: ['English highlight'],
        },
        literals: {
          legacyId: '3944',
          imageUrl: '/images/news.jpg',
          videoUrl: 'https://www.youtube.com/embed/example',
        },
      }),
    );
    database.seed(
      'content_translations',
      translationFixture('download', 'localized-download', {
        kind: 'download',
        text: { title: 'English download' },
        literals: { legacyId: '3853' },
      }),
    );

    await expect(findPublishedNewsByLegacyId(database.d1, '3944')).resolves.toEqual(
      expect.objectContaining({
        title: '中文新聞',
        lead: '中文摘要',
        imageUrl: '/images/news.jpg',
        videoUrl: 'https://www.youtube.com/embed/example',
      }),
    );
    await expect(listPublishedDownloads(database.d1)).resolves.toEqual([
      expect.objectContaining({ title: '中文下載', legacyId: '3853' }),
    ]);
    await expect(listPublishedNewsForLocale(database.d1, 'en')).resolves.toEqual([
      expect.objectContaining({
        id: 'localized-news',
        legacyId: '3944',
        title: 'English news',
        lead: 'English summary',
        highlights: ['English highlight'],
        imageUrl: '/images/news.jpg',
        videoUrl: 'https://www.youtube.com/embed/example',
        locale: 'en',
        missing: false,
      }),
    ]);
    await expect(
      findPublishedNewsByLegacyIdForLocale(database.d1, '3944', 'en'),
    ).resolves.toEqual(
      expect.objectContaining({ title: 'English news', locale: 'en', missing: false }),
    );
    await expect(listPublishedDownloadsForLocale(database.d1, 'en')).resolves.toEqual([
      expect.objectContaining({
        id: 'localized-download',
        legacyId: '3853',
        title: 'English download',
        locale: 'en',
        missing: false,
      }),
    ]);
  });

  it('marks an absent English translation while returning Chinese display fallback', async () => {
    const database = new ContentDatabase();
    await saveNews(
      database.d1,
      {
        id: 'missing-english',
        legacyId: '4000',
        title: '只有中文',
        lead: '中文摘要',
        imageUrl: '/images/news.jpg',
        highlights: ['中文重點'],
        status: 'draft',
      },
      admin,
    );
    await setNewsPublication(database.d1, 'missing-english', 'published', admin);
    database.seed(
      'content_translations',
      translationFixture(
        'news',
        'missing-english',
        {
          kind: 'news',
          text: {
            title: 'Private English news',
            lead: 'Private English summary',
            highlights: ['Private English highlight'],
          },
          literals: {
            legacyId: '4000',
            imageUrl: '/images/news.jpg',
            videoUrl: null,
          },
        },
        { status: 'draft' },
      ),
    );

    await expect(listPublishedNewsForLocale(database.d1, 'en')).resolves.toEqual([
      expect.objectContaining({
        id: 'missing-english',
        title: '只有中文',
        lead: '中文摘要',
        requestedLocale: 'en',
        locale: 'zh-TW',
        missing: true,
      }),
    ]);
  });

  it('uses English-only knowledge and locale-prefixed source links without rewriting human translations', async () => {
    const database = new ContentDatabase();
    await saveKnowledge(
      database.d1,
      {
        id: 'english-knowledge',
        title: '中文知識',
        href: '/catalog?type=brand&id=2',
        body: '中文檢測資訊',
        tags: ['檢測'],
        status: 'draft',
      },
      admin,
    );
    await setKnowledgePublication(
      database.d1,
      'english-knowledge',
      'published',
      admin,
    );
    const translation = translationFixture(
      'knowledge',
      'english-knowledge',
      {
        kind: 'knowledge',
        text: {
          title: 'Inspection knowledge',
          body: 'X-ray inspection guidance',
          tags: ['inspection'],
        },
        literals: { href: '/catalog?type=brand&id=2' },
      },
      { origin: 'human', outdated: 1 },
    );
    database.seed('content_translations', translation);

    await expect(
      retrievePublishedKnowledge(database.d1, '檢測'),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'english-knowledge',
        title: '中文知識',
        href: '/catalog?type=brand&id=2',
      }),
    ]);
    await expect(
      retrievePublishedKnowledgeForLocale(database.d1, 'inspection', 'en'),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'english-knowledge',
        title: 'Inspection knowledge',
        href: '/en/catalog?type=brand&id=2',
        locale: 'en',
        missing: false,
        outdated: true,
      }),
    ]);
    await expect(
      retrieveSiteKnowledge(database.d1, 'en', 'inspection'),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'english-knowledge',
        title: 'Inspection knowledge',
        href: '/en/catalog?type=brand&id=2',
      }),
    ]);
    await expect(
      retrieveSiteKnowledge(database.d1, 'en', '中文'),
    ).resolves.toEqual([]);
    expect(database.rows('content_translations')).toEqual([translation]);
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

  it('returns 409 when a publication change wins a concurrent save', async () => {
    const database = new ContentDatabase();
    await saveKnowledge(
      database.d1,
      {
        id: 'api-save-race',
        title: 'Original title',
        href: '/contact',
        body: 'Original body',
        tags: [],
        status: 'draft',
      },
      admin,
    );
    database.interleaveNextBatch(() =>
      setKnowledgePublication(database.d1, 'api-save-race', 'published', admin),
    );
    const handler = createKnowledgeAdminHandler(database.d1, async () => admin);

    const response = await handler(
      new Request('https://unirise.example/api/admin/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'api-save-race',
          title: 'Stale title',
          href: '/contact',
          body: 'Stale body',
          tags: [],
          status: 'draft',
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'content_conflict' });
    expect(database.rows('chat_knowledge')[0]).toEqual(
      expect.objectContaining({
        title: 'Original title',
        status: 'published',
      }),
    );
  });
});
