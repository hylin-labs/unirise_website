import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { PublicHomeRoute } from '../app/page';
import { initialPublicContent } from '../lib/public-content';
import { legacyDownloads, legacyNewsPosts } from '../lib/seed-content-data';
import { localizedPath, alternateLocalePath } from '../lib/localized-route';
import {
  getLocalizedContent,
  listTranslationResources,
} from '../lib/translation-repository';
import type {
  ResourceType,
  TranslationPayload,
} from '../lib/translation-types';
import { ContentDatabase } from './helpers/content-d1';

const routes = {
  '/catalog': () => import('../app/catalog/page'),
  '/news': () => import('../app/news/page'),
  '/downloads': () => import('../app/downloads/page'),
  '/contact': () => import('../app/contact/page'),
  '/inquiry': () => import('../app/inquiry/page'),
  '/en/catalog': () => import('../app/en/catalog/page'),
  '/en/news': () => import('../app/en/news/page'),
  '/en/downloads': () => import('../app/en/downloads/page'),
  '/en/contact': () => import('../app/en/contact/page'),
  '/en/inquiry': () => import('../app/en/inquiry/page'),
};
let database: ContentDatabase;
const english = structuredClone(initialPublicContent);
english.catalog.text.industryTitles['73'] = 'OPTIMUM food sorting';
english.catalog.text.brandTitles['127'] =
  'Fish and chicken bone X-ray inspection';
english.catalog.text.specialProduct =
  '3. Fish and chicken bone FSCAN-4350G X-ray inspection';
english.catalog.text.groupNotes['OPTIMUM-食材分選'] =
  'OPTIMUM belt and free-fall sorting systems.';
english.catalog.text.inquire = 'Add to inquiry';
english.contact.text.title = 'Contact us';
english.contact.text.company = 'Unirise Technology';
english.inquiry.text.title = 'Inquiry';
english.inquiry.text.name = 'Name';
english.inquiry.text.submit = 'Create inquiry email';
english.chrome.text.home = 'Home';
english.chrome.text.nav[2] = 'News';
english.chrome.text.nav[3] = 'Downloads';

function translation(
  resourceType: ResourceType,
  resourceId: string,
  payload: TranslationPayload,
) {
  database.seed('content_translations', {
    id: `en-${resourceType}-${resourceId}`,
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
    translated_at: '2026-09-10T00:00:00Z',
    updated_at: '2026-09-10T00:00:00Z',
  });
}

beforeEach(() => {
  database = new ContentDatabase();
  Object.assign(env, { DB: database.d1 });
  for (const [id, payload] of Object.entries(initialPublicContent)) {
    database.seed('public_content', {
      id,
      payload_json: JSON.stringify(payload),
      source_version: 1,
      status: 'published',
    });
    translation('public_content', id, english[id as keyof typeof english]);
  }
  for (const post of legacyNewsPosts)
    database.seed('managed_news', {
      id: post.id,
      legacy_id: post.id,
      title: post.title,
      lead: post.lead,
      image_url: post.image,
      highlights_json: JSON.stringify(post.highlights),
      video_url: post.video ?? null,
      status: 'published',
      source_version: 1,
      published_at: '2026-09-10T00:00:00Z',
    });
  for (const item of legacyDownloads)
    database.seed('managed_downloads', {
      id: item.id,
      legacy_id: item.id,
      title: item.title,
      status: 'published',
      source_version: 1,
      published_at: '2026-09-10T00:00:00Z',
    });
  const post = legacyNewsPosts.find((item) => item.id === '3944')!;
  translation('news', post.id, {
    kind: 'news',
    text: {
      title: 'Xavis inspection update',
      lead: 'Inspection news in English.',
      highlights: ['Inspection highlight'],
    },
    literals: {
      legacyId: post.id,
      imageUrl: post.image,
      videoUrl: post.video ?? null,
    },
  });
  translation('download', '3853', {
    kind: 'download',
    text: { title: 'NIHOT recycling' },
    literals: { legacyId: '3853' },
  });
});

async function renderRoute(path: string) {
  const url = new URL(path, 'https://unirise.test');
  if (url.pathname === '/' || url.pathname === '/en')
    return renderToStaticMarkup(
      await PublicHomeRoute({ locale: url.pathname === '/' ? 'zh-TW' : 'en' }),
    );
  const load = routes[url.pathname as keyof typeof routes];
  expect(load, `route exists: ${path}`).toBeTypeOf('function');
  const routeModule = (await load()) as {
    default: (props: {
      searchParams: Promise<Record<string, string>>;
    }) => Promise<React.ReactElement>;
  };
  return renderToStaticMarkup(
    await routeModule.default({
      searchParams: Promise.resolve(Object.fromEntries(url.searchParams)),
    }),
  );
}

const matrix = [
  ['/', 'original-features', 'original-features'],
  ['/catalog?type=industry&id=73', 'OPTIMUM-食材分選', 'OPTIMUM food sorting'],
  [
    '/catalog?type=brand&id=127',
    'FSCAN-4350G',
    'Fish and chicken bone FSCAN-4350G',
  ],
  ['/news', 'news-card-grid', 'Xavis inspection update'],
  ['/news?id=3944', 'article-detail', 'Inspection news in English.'],
  ['/downloads', 'download-list', 'NIHOT recycling'],
  ['/downloads?id=3853', 'NIHOT-回收再生', 'NIHOT recycling'],
  ['/contact', 'contact-card', 'Contact us'],
  [
    '/inquiry?product=FSCAN-4350G%20%26%20XAVIS',
    'FSCAN-4350G &amp; XAVIS',
    'Create inquiry email',
  ],
];

describe('complete bilingual public route matrix', () => {
  for (const [path, chinese, translated] of matrix) {
    for (const locale of ['zh-TW', 'en'] as const)
      it(`${locale} ${path} renders the matching resource`, async () => {
        const url = new URL(path, 'https://unirise.test');
        const localized = localizedPath(locale, url.pathname, url.search);
        const html = await renderRoute(localized);
        expect(html).toContain(locale === 'en' ? translated : chinese);
        expect(html).toContain('original-header');
        expect(html).toContain('original-footer');
        expect(html).toContain(
          `href="${locale === 'en' ? url.pathname : localizedPath('en', url.pathname)}"`,
        );
        if (url.pathname !== '/')
          expect(html).toContain('/reference/original/subbanner.png');
      });
  }

  it('maps home anchors reciprocally to existing sections', async () => {
    for (const hash of ['#news', '#brands', '#contact']) {
      expect(alternateLocalePath('/', '', hash)).toBe(`/en${hash}`);
      expect(alternateLocalePath('/en', '', hash)).toBe(`/${hash}`);
      for (const path of ['/', '/en'])
        expect(await renderRoute(path)).toContain(`id="${hash.slice(1)}"`);
    }
  });

  it('uses translated catalog notes while preserving assets and product inquiry values', async () => {
    const industry = await renderRoute('/en/catalog?type=industry&id=73');
    expect(industry).toContain('OPTIMUM belt and free-fall sorting systems.');
    expect(industry).toContain('/reference/original/feature01.jpg');
    const product = await renderRoute('/en/catalog?type=brand&id=127');
    expect(product).toContain('/reference/original/catalog/brand-127.jpg');
    expect(product).toContain(
      `href="/en/inquiry?product=${encodeURIComponent(english.catalog.text.specialProduct)}"`,
    );
  });

  it('supports every numeric catalog ID and legacy item/group query precedence', async () => {
    for (const type of ['industry', 'brand'] as const) {
      for (const [id, title] of Object.entries(
        initialPublicContent.catalog.text[`${type}Titles`],
      )) {
        for (const locale of ['zh-TW', 'en'] as const) {
          const path = localizedPath(
            locale,
            '/catalog',
            `?type=${type}&id=${id}`,
          );
          const html = await renderRoute(path);
          const expected =
            locale === 'en' ? english.catalog.text[`${type}Titles`][id] : title;
          expect(html).toContain(
            renderToStaticMarkup(<strong>{expected}</strong>),
          );
        }
      }
    }
    const html = await renderRoute(
      '/en/catalog?group=Custom%20group&item=Custom%20item',
    );
    expect(html).toContain('<h2>Custom item</h2>');
    expect(html).toContain('Custom group');
  });

  it('keeps news media and localized detail, back and inquiry links', async () => {
    const list = await renderRoute('/en/news');
    expect(list).toContain('href="/en/news?id=3944"');
    const html = await renderRoute('/en/news?id=3944');
    const post = legacyNewsPosts.find((item) => item.id === '3944')!;
    expect(html).toContain(post.image);
    if (post.video) expect(html).toContain(post.video);
    expect(html).toContain('Inspection highlight');
    expect(html).toContain('href="/en/news"');
    expect(html).toContain(
      'href="/en/inquiry?product=Xavis%20inspection%20update"',
    );
  });

  it('supports all download IDs and legacy Chinese collection names under English', async () => {
    for (const item of legacyDownloads) {
      const html = await renderRoute(`/en/downloads?id=${item.id}`);
      expect(html).toContain('original-inquiry-button');
      expect(html).not.toContain('class="download-list"');
    }
    const html = await renderRoute(
      `/en/downloads?collection=${encodeURIComponent('NIHOT-回收再生')}`,
    );
    expect(html).toContain('href="/en/inquiry?product=NIHOT%20recycling"');
    expect(await renderRoute('/en/downloads')).toContain(
      'href="/en/downloads?id=3853"',
    );
    expect(await renderRoute('/en/downloads?id=unknown')).toContain(
      'class="download-list"',
    );
    expect(await renderRoute('/en/news?id=unknown')).toContain(
      'class="news-card-grid"',
    );
  });

  it('renders missing English as Chinese fallback visible in admin inventory', async () => {
    const missing = legacyNewsPosts.find((post) => post.id === '3943')!;
    expect(await renderRoute('/en/news?id=3943')).toContain(missing.title);
    const resolved = await getLocalizedContent(
      database.d1,
      'news',
      '3943',
      'en',
    );
    expect(resolved).toMatchObject({ missing: true, locale: 'zh-TW' });
    const inventory = await listTranslationResources(database.d1);
    expect(
      inventory.find((item) => item.source.resourceId === '3943'),
    ).toMatchObject({ translation: null, public: false });
  });

  it('retains contact destinations, query prefill, form fields and requirements', async () => {
    const contact = await renderRoute('/en/contact');
    expect(contact).toContain('href="tel:063319283"');
    expect(contact).toContain('href="mailto:info-unirise@unirise.tw"');
    const form = await renderRoute(
      '/en/inquiry?product=FSCAN-4350G%20%26%20XAVIS',
    );
    expect(form).toContain('value="FSCAN-4350G &amp; XAVIS"');
    for (const name of ['name', 'company', 'phone', 'email'])
      expect(form).toMatch(
        new RegExp(`<input(?=[^>]*name="${name}")(?=[^>]*required)[^>]*>`),
      );
    expect(form).toMatch(/textarea name="message" required/);
    expect(form).toContain('type="email"');
    expect(form).toContain('inquiry-panel inquiry-form');
  });
});
