import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import EnglishLayout, { metadata as englishLayoutMetadata } from '../app/en/layout';
import sitemap from '../app/sitemap';
import {
  localizedPageMetadata,
  localizedSitemapEntries,
  siteOrigin,
} from '../lib/locale-seo';
import { ContentDatabase } from './helpers/content-d1';

describe('localized SEO metadata', () => {
  it('gives Chinese and English home pages their own metadata, canonical, and reciprocal alternates', () => {
    const chinese = localizedPageMetadata('zh-TW', '/');
    const english = localizedPageMetadata('en', '/');

    expect(chinese.title).toBe('合軒科技有限公司 | Unirise Technology Inc.');
    expect(chinese.description).toContain('食品分選');
    expect(chinese.alternates).toEqual({
      canonical: `${siteOrigin}/`,
      languages: { 'zh-Hant': `${siteOrigin}/`, en: `${siteOrigin}/en` },
    });
    expect(english.title).toBe(
      'Unirise Technology Inc. | Food Sorting and Inspection Solutions',
    );
    expect(english.description).toContain('Food sorting');
    expect(english.alternates).toEqual({
      canonical: `${siteOrigin}/en`,
      languages: { 'zh-Hant': `${siteOrigin}/`, en: `${siteOrigin}/en` },
    });
  });

  it('uses same-resource, locale-specific canonicals for supported detail queries', () => {
    const chineseNews = localizedPageMetadata('zh-TW', '/news', '?id=3944');
    const englishNews = localizedPageMetadata('en', '/news', '?id=3944');
    const chineseDownload = localizedPageMetadata(
      'zh-TW',
      '/downloads',
      '?id=3853',
    );
    const englishCatalog = localizedPageMetadata(
      'en',
      '/catalog',
      '?type=brand&id=127',
    );

    expect(chineseNews.alternates?.canonical).toBe(
      `${siteOrigin}/news?id=3944`,
    );
    expect(englishNews.alternates?.canonical).toBe(
      `${siteOrigin}/en/news?id=3944`,
    );
    expect(englishNews.alternates?.languages).toEqual({
      'zh-Hant': `${siteOrigin}/news?id=3944`,
      en: `${siteOrigin}/en/news?id=3944`,
    });
    expect(chineseDownload.alternates?.canonical).toBe(
      `${siteOrigin}/downloads?id=3853`,
    );
    expect(englishCatalog.alternates?.canonical).toBe(
      `${siteOrigin}/en/catalog?type=brand&id=127`,
    );
    expect(englishNews.alternates?.canonical).not.toBe(
      chineseNews.alternates?.canonical,
    );
  });

  it('drops arbitrary or unsafe queries from canonical URLs', () => {
    const metadata = localizedPageMetadata(
      'en',
      '/news',
      '?id=3944&redirect=https%3A%2F%2Fattacker.example',
    );
    const unsupported = localizedPageMetadata('en', '//attacker.example', '?id=1');

    expect(metadata.alternates?.canonical).toBe(
      `${siteOrigin}/en/news?id=3944`,
    );
    expect(unsupported.alternates?.canonical).toBe(`${siteOrigin}/en`);
  });
});

describe('localized sitemap', () => {
  it('contains every static public route and current public news/download detail in both locales only', () => {
    const entries = localizedSitemapEntries({
      newsIds: ['3944', '3943'],
      downloadIds: ['3853'],
    });
    const urls = entries.map((entry) => entry.url);

    for (const path of [
      '/',
      '/catalog',
      '/news',
      '/downloads',
      '/contact',
      '/inquiry',
      '/en',
      '/en/catalog',
      '/en/news',
      '/en/downloads',
      '/en/contact',
      '/en/inquiry',
      '/news?id=3944',
      '/en/news?id=3944',
      '/downloads?id=3853',
      '/en/downloads?id=3853',
    ])
      expect(urls).toContain(`${siteOrigin}${path}`);

    expect(urls).not.toContain(`${siteOrigin}/admin`);
    expect(urls).not.toContain(`${siteOrigin}/api/chat`);
    expect(urls.every((url) => !url.includes('product='))).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('uses only currently published managed records when the sitemap route runs', async () => {
    const database = new ContentDatabase();
    Object.assign(env, { DB: database.d1 });
    database.seed('managed_news', {
      id: 'published-news',
      legacy_id: '3944',
      title: 'Published',
      lead: 'Published lead',
      image_url: '/news.jpg',
      highlights_json: '[]',
      video_url: null,
      status: 'published',
      source_version: 1,
      published_at: '2026-09-10T00:00:00Z',
    });
    database.seed('managed_news', {
      id: 'draft-news',
      legacy_id: '9999',
      title: 'Draft',
      lead: 'Draft lead',
      image_url: '/draft.jpg',
      highlights_json: '[]',
      video_url: null,
      status: 'draft',
      source_version: 1,
      published_at: null,
    });
    database.seed('managed_downloads', {
      id: 'published-download',
      legacy_id: '3853',
      title: 'Published',
      status: 'published',
      source_version: 1,
      published_at: '2026-09-10T00:00:00Z',
    });

    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain(`${siteOrigin}/en/news?id=3944`);
    expect(urls).toContain(`${siteOrigin}/downloads?id=3853`);
    expect(urls).not.toContain(`${siteOrigin}/en/news?id=9999`);
  });
});

describe('English document language', () => {
  it('sets English metadata and changes the root language without emitting a nested html element', () => {
    const html = renderToStaticMarkup(
      createElement(
        EnglishLayout,
        null,
        createElement('main', null, 'English content'),
      ),
    );

    expect(html).toContain('English content');
    expect(html).not.toContain('<html');
    expect(englishLayoutMetadata.other).toMatchObject({
      'content-language': 'en',
    });
  });
});
