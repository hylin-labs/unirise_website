import type { Metadata } from 'next';
import type { Locale } from './locales';
import { bilingualSitemapRouteInventory } from './public-route-inventory.mjs';
import {
  localizedPath,
  publicPathWithoutLocale,
  type PublicPath,
} from './localized-route';

const FALLBACK_SITE_ORIGIN = 'https://unirise.craniai.com';

const pageCopy: Record<
  Locale,
  Record<PublicPath, { title: string; description: string }>
> = {
  'zh-TW': {
    '/': {
      title: '合軒科技有限公司 | Unirise Technology Inc.',
      description: '食品分選、X光異物檢測、回收再生與塑膠化工解決方案。',
    },
    '/catalog': {
      title: '產品目錄 | 合軒科技有限公司',
      description:
        '瀏覽合軒科技的食品分選、X光檢測、回收再生與塑膠化工產品目錄。',
    },
    '/news': {
      title: '最新消息 | 合軒科技有限公司',
      description: '查看合軒科技的產品、技術與公司最新消息。',
    },
    '/downloads': {
      title: '下載專區 | 合軒科技有限公司',
      description: '索取合軒科技食品分選、X光檢測與回收再生產品資料。',
    },
    '/search': {
      title: '網站搜尋 | 合軒科技有限公司',
      description: '搜尋合軒科技的產品、最新消息與下載資料。',
    },
    '/contact': {
      title: '聯絡我們 | 合軒科技有限公司',
      description: '聯絡合軒科技，洽詢食品分選、X光檢測與回收再生方案。',
    },
    '/inquiry': {
      title: '詢價系統 | 合軒科技有限公司',
      description: '向合軒科技提出產品詢問與資料索取。',
    },
    '/project': {
      title: '專案方案護照 | 合軒科技有限公司',
      description: '查看合軒科技專案的初步方案設定與下一步服務入口。',
    },
  },
  en: {
    '/': {
      title: 'Unirise Technology Inc. | Food Sorting and Inspection Solutions',
      description:
        'Food sorting, X-ray inspection, recycling, and plastics processing solutions from Unirise Technology Inc.',
    },
    '/catalog': {
      title: 'Product Catalog | Unirise Technology Inc.',
      description:
        'Explore Unirise food sorting, X-ray inspection, recycling, and plastics processing solutions.',
    },
    '/news': {
      title: 'News | Unirise Technology Inc.',
      description:
        'Read the latest product, technology, and company news from Unirise Technology Inc.',
    },
    '/downloads': {
      title: 'Downloads | Unirise Technology Inc.',
      description:
        'Request Unirise product information for food sorting, X-ray inspection, and recycling solutions.',
    },
    '/search': {
      title: 'Search | Unirise Technology Inc.',
      description:
        'Search Unirise products, news, and downloadable product information.',
    },
    '/contact': {
      title: 'Contact Us | Unirise Technology Inc.',
      description:
        'Contact Unirise Technology Inc. about food sorting, X-ray inspection, and recycling solutions.',
    },
    '/inquiry': {
      title: 'Inquiry | Unirise Technology Inc.',
      description:
        'Request product information and discuss your application with Unirise Technology Inc.',
    },
    '/project': {
      title: 'Project Solution Passport | Unirise Technology Inc.',
      description:
        'View an initial Unirise project configuration and next-step service options.',
    },
  },
};

function configuredSiteOrigin(value = process.env.NEXT_PUBLIC_SITE_URL) {
  if (!value) return FALLBACK_SITE_ORIGIN;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return FALLBACK_SITE_ORIGIN;
    return url.origin;
  } catch {
    return FALLBACK_SITE_ORIGIN;
  }
}

/** The sole absolute-URL origin used by localized metadata and the sitemap. */
export const siteOrigin = configuredSiteOrigin();

function absoluteUrl(path: string) {
  return new URL(path, `${siteOrigin}/`).toString();
}

function safeLegacyId(value: string | null) {
  return value && /^\d{1,160}$/.test(value) ? value : null;
}

/**
 * Retain only public, stable query keys in canonical URLs. This avoids giving
 * arbitrary inquiry text, tracking values, or unsupported routes an indexable
 * canonical while preserving the existing legacy detail IDs.
 */
export function canonicalSearch(pathname: string, search = '') {
  const path = publicPathWithoutLocale(pathname) ?? '/';
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : '',
  );
  const id = safeLegacyId(params.get('id'));

  if ((path === '/news' || path === '/downloads') && id) return `?id=${id}`;
  if (path === '/catalog') {
    const type = params.get('type');
    if ((type === 'industry' || type === 'brand') && id)
      return `?type=${type}&id=${id}`;
  }
  return '';
}

export function metadataSearchFromParams(
  pathname: string,
  params: Record<string, string | string[] | undefined>,
) {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const path = publicPathWithoutLocale(pathname) ?? '/';
  const id = first(params.id);
  if ((path === '/news' || path === '/downloads') && safeLegacyId(id ?? null))
    return `?id=${id}`;
  if (path === '/catalog') {
    const type = first(params.type);
    if ((type === 'industry' || type === 'brand') && safeLegacyId(id ?? null))
      return `?type=${type}&id=${id}`;
  }
  return '';
}

function localizedUrl(locale: Locale, pathname: string, search = '') {
  return absoluteUrl(
    localizedPath(locale, pathname, canonicalSearch(pathname, search)),
  );
}

export function localizedPageMetadata(
  locale: Locale,
  pathname: string,
  search = '',
): Metadata {
  const path = publicPathWithoutLocale(pathname) ?? '/';
  const canonical = localizedUrl(locale, path, search);
  const chinese = localizedUrl('zh-TW', path, search);
  const english = localizedUrl('en', path, search);
  const copy = pageCopy[locale][path];

  return {
    metadataBase: new URL(siteOrigin),
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical,
      languages: { 'zh-Hant': chinese, en: english },
    },
    openGraph: {
      type: 'website',
      url: canonical,
      title: copy.title,
      description: copy.description,
      images: [{ url: '/og.png', width: 1200, height: 630, alt: copy.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.title,
      description: copy.description,
      images: ['/og.png'],
    },
    other: { 'content-language': locale === 'en' ? 'en' : 'zh-Hant' },
  };
}

export type SitemapInput = {
  newsIds: readonly string[];
  downloadIds: readonly string[];
};

/** Build a stable public-only sitemap inventory from published legacy IDs. */
export function localizedSitemapEntries({
  newsIds,
  downloadIds,
}: SitemapInput): Array<{ url: string }> {
  return bilingualSitemapRouteInventory({ newsIds, downloadIds }).map(
    (path) => ({ url: absoluteUrl(path) }),
  );
}
