import { env } from 'cloudflare:workers';
import {
  findPublishedNewsByLegacyIdForLocale,
  listPublishedNewsForLocale,
  listPublishedDownloadsForLocale,
  listPublishedDownloads,
} from '../lib/content-repository';
import type { Locale } from '../lib/locales';
import { localizedPath } from '../lib/localized-route';
import { getLocalizedContent } from '../lib/translation-repository';
import type {
  CatalogPayload,
  ChromePayload,
  ContactPayload,
  InquiryPayload,
} from '../lib/translation-types';
import { PublicInnerPage } from './public-inner-page';
import { PublicInquiryForm } from './public-inquiry-form';
import { SolutionFinder } from './solution-finder';

/* oxlint-disable next/no-img-element, next/no-html-link-for-pages -- Preserve the original catalog, news, downloads, and contact markup and native links. */

export type PublicSearchParams = Record<string, string | string[] | undefined>;
export type PublicInnerRouteProps = {
  searchParams: Promise<PublicSearchParams>;
};
type LocalizedRouteProps = PublicInnerRouteProps & { locale: Locale };
type PagePayloads = {
  catalog: CatalogPayload;
  chrome: ChromePayload;
  contact: ContactPayload;
  inquiry: InquiryPayload;
};

function database() {
  return (env as unknown as { DB: D1Database }).DB;
}
// Match URLSearchParams.get: repeated catalog/inquiry keys use their first value.
function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function managedPage<K extends keyof PagePayloads>(
  db: D1Database,
  id: K,
  locale: Locale,
) {
  const localized = await getLocalizedContent(db, 'public_content', id, locale);
  if (
    !localized?.payload ||
    localized.payload.kind !== id ||
    localized.source.payload.kind !== id
  )
    throw new Error(`published ${id} content is unavailable`);
  return {
    payload: localized.payload as PagePayloads[K],
    source: localized.source.payload as PagePayloads[K],
  };
}

const catalogImage = (type: string, id: string) => {
  if (type === 'brand' && id === '127')
    return '/reference/original/catalog/brand-127.jpg';
  if (type === 'industry') {
    if (['1', '73', '82'].includes(id))
      return '/reference/original/feature01.jpg';
    if (['4', '77', '97', '100', '98'].includes(id))
      return '/reference/original/feature02.jpg';
    if (['6', '84', '78', '91', '81'].includes(id))
      return '/reference/original/feature03.jpg';
    return '/reference/original/feature04.jpg';
  }
  if (['122', '123', '124'].includes(id))
    return '/reference/original/index_005.jpg';
  if (['7', '87', '104', '105', '106', '107', '108', '92'].includes(id))
    return '/reference/original/index_003.jpg';
  if (['1', '78', '80', '79', '150', '90'].includes(id))
    return '/reference/original/index_004.jpg';
  if (['72', '128', '129', '93'].includes(id))
    return '/reference/original/index_001.jpg';
  if (['140', '141', '142', '143', '144', '145', '146'].includes(id))
    return '/reference/original/index_010.png';
  if (['111', '113', '114', '110'].includes(id))
    return '/reference/original/index_006.jpg';
  if (['112', '116', '151', '155', '109'].includes(id))
    return '/reference/original/index_007.jpg';
  if (
    [
      '2',
      '5',
      '81',
      '82',
      '83',
      '84',
      '85',
      '86',
      '127',
      '91',
      '147',
      '149',
      '152',
      '153',
      '154',
      '156',
      '158',
      '159',
      '160',
      '161',
      '120',
      '121',
    ].includes(id)
  )
    return '/reference/original/index_008.jpg';
  return '/reference/original/index_009.jpg';
};

export async function PublicCatalogRoute({
  locale,
  searchParams,
}: LocalizedRouteProps) {
  const db = database();
  const [params, catalog, { payload: chrome }] = await Promise.all([
    searchParams,
    managedPage(db, 'catalog', locale),
    managedPage(db, 'chrome', locale),
  ]);
  const { text, literals } = catalog.payload;
  const type = first(params.type) || '';
  const id = first(params.id) || '';
  const titles =
    type === 'industry'
      ? text.industryTitles
      : type === 'brand'
        ? text.brandTitles
        : {};
  const sourceTitles =
    type === 'industry'
      ? catalog.source.text.industryTitles
      : type === 'brand'
        ? catalog.source.text.brandTitles
        : {};
  const group = titles[id] || first(params.group) || text.title;
  const title = first(params.item) || group;
  const productTitle =
    type === 'brand' && id === literals.specialProductId
      ? text.specialProduct
      : title;
  // Note keys are stable schema keys; translated titles must not replace them.
  const noteKey = sourceTitles[id] || first(params.group) || group;
  const note =
    text.groupNotes[noteKey] ||
    text.defaultNote.replace('{group}', () => group);
  return (
    <PublicInnerPage
      locale={locale}
      path="/catalog"
      chrome={chrome}
      title={title}
      eyebrow={type === 'industry' ? text.industryEyebrow : text.brandEyebrow}
      breadcrumbs={[
        {
          label: type === 'industry' ? text.industry : text.brand,
          href: localizedPath(locale, '/catalog', '?type=brand&id=89'),
        },
        { label: title },
      ]}
    >
      <div className="original-product-layout">
        <img src={catalogImage(type, id)} alt={productTitle} decoding="async" />
        <article>
          <h2>{productTitle}</h2>
          <p>{note}</p>
          <p>{text.specifications}</p>
          <a
            className="original-inquiry-button"
            href={localizedPath(
              locale,
              '/inquiry',
              `?product=${encodeURIComponent(productTitle)}`,
            )}
          >
            {text.inquire}
          </a>
        </article>
      </div>
    </PublicInnerPage>
  );
}

const newsCopy = {
  'zh-TW': {
    video: '影片',
    back: '← 回到最新消息',
    inquire: '洽詢更多資訊',
    more: '了解更多 →',
  },
  en: {
    video: 'video',
    back: '← Back to news',
    inquire: 'Request more information',
    more: 'Learn more →',
  },
};

export async function PublicNewsRoute({
  locale,
  searchParams,
}: LocalizedRouteProps) {
  const db = database();
  const [params, { payload: chrome }] = await Promise.all([
    searchParams,
    managedPage(db, 'chrome', locale),
  ]);
  const id = params.id;
  const post =
    typeof id === 'string' && id
      ? await findPublishedNewsByLegacyIdForLocale(db, id, locale)
      : null;
  const posts = post ? [] : await listPublishedNewsForLocale(db, locale);
  const copy = newsCopy[locale];
  return (
    <PublicInnerPage
      locale={locale}
      path="/news"
      chrome={chrome}
      title={post?.title || chrome.text.nav[2]}
      eyebrow="News"
      breadcrumbs={[{ label: chrome.text.nav[2] }]}
      contentClassName="news-page"
    >
      {post ? (
        <article className="article article-detail">
          <img src={post.imageUrl} alt={post.title} decoding="async" />
          <time>NEWS · {post.legacyId}</time>
          <h2>{post.title}</h2>
          <p className="article-lead">{post.lead}</p>
          <ul>
            {post.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
          {post.videoUrl && (
            <div className="video-wrap">
              <iframe
                src={post.videoUrl}
                title={`${post.title} ${copy.video}`}
                allowFullScreen
              />
            </div>
          )}
          <div className="article-actions">
            <a href={localizedPath(locale, '/news')}>{copy.back}</a>
            <a
              className="original-inquiry-button"
              href={localizedPath(
                locale,
                '/inquiry',
                `?product=${encodeURIComponent(post.title)}`,
              )}
            >
              {copy.inquire}
            </a>
          </div>
        </article>
      ) : (
        <div className="news-card-grid">
          {posts.map((item) => (
            <article className="article news-card" key={item.id}>
              <a
                href={localizedPath(
                  locale,
                  '/news',
                  `?id=${encodeURIComponent(item.legacyId)}`,
                )}
              >
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  loading="lazy"
                  decoding="async"
                />
              </a>
              <time>NEWS</time>
              <h2>{item.title}</h2>
              <p>{item.lead}</p>
              <a
                href={localizedPath(
                  locale,
                  '/news',
                  `?id=${encodeURIComponent(item.legacyId)}`,
                )}
              >
                {copy.more}
              </a>
            </article>
          ))}
        </div>
      )}
    </PublicInnerPage>
  );
}

const downloadCopy = {
  'zh-TW': {
    selected: '{collection} 資料索取',
    choose: '選擇產品資料',
    help: '原網站設有下列產品資料分類。為確保資料為最新版本，請透過詢價系統索取。',
    request: '索取產品資料',
  },
  en: {
    selected: 'Request {collection} information',
    choose: 'Choose product information',
    help: 'The original website lists the product information categories below. Please use the inquiry system to request the latest version.',
    request: 'Request product information',
  },
};

export async function PublicDownloadsRoute({
  locale,
  searchParams,
}: LocalizedRouteProps) {
  const db = database();
  const [params, { payload: chrome }, downloads] = await Promise.all([
    searchParams,
    managedPage(db, 'chrome', locale),
    listPublishedDownloadsForLocale(db, locale),
  ]);
  let selected = params.id
    ? downloads.find((item) => item.legacyId === params.id)
    : downloads.find((item) => item.title === params.collection);
  // Locale switches preserve old collection queries containing Chinese titles.
  if (
    !params.id &&
    !selected &&
    typeof params.collection === 'string' &&
    locale === 'en'
  ) {
    const source = (await listPublishedDownloads(db)).find(
      (item) => item.title === params.collection,
    );
    selected = downloads.find((item) => item.legacyId === source?.legacyId);
  }
  const collection = selected?.title;
  const copy = downloadCopy[locale];
  return (
    <PublicInnerPage
      locale={locale}
      path="/downloads"
      chrome={chrome}
      title={collection || chrome.text.nav[3]}
      eyebrow="Download"
      breadcrumbs={[{ label: chrome.text.nav[3] }]}
    >
      <div className="original-content-panel download-panel">
        <h2>
          {collection
            ? copy.selected.replace('{collection}', () => collection)
            : copy.choose}
        </h2>
        <p>{copy.help}</p>
        {collection ? (
          <a
            className="original-inquiry-button"
            href={localizedPath(
              locale,
              '/inquiry',
              `?product=${encodeURIComponent(collection)}`,
            )}
          >
            {copy.request}
          </a>
        ) : (
          <div className="download-list">
            {downloads.map((item) => (
              <a
                href={localizedPath(
                  locale,
                  '/downloads',
                  `?id=${encodeURIComponent(item.legacyId)}`,
                )}
                key={item.id}
              >
                {item.title}
                <span>→</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </PublicInnerPage>
  );
}

export async function PublicContactRoute({ locale }: { locale: Locale }) {
  const db = database();
  const [{ payload: contact }, { payload: chrome }] = await Promise.all([
    managedPage(db, 'contact', locale),
    managedPage(db, 'chrome', locale),
  ]);
  const { text, literals } = contact;
  return (
    <PublicInnerPage
      locale={locale}
      path="/contact"
      chrome={chrome}
      title={text.title}
      eyebrow={text.eyebrow}
      breadcrumbs={[{ label: text.title }]}
    >
      <div className="original-content-panel contact-card">
        <h2>{text.company}</h2>
        <a href={literals.phoneUrl}>
          {text.phone}　{literals.phone}
        </a>
        <a href={literals.emailUrl}>
          {text.email}　{literals.email}
        </a>
        <p>
          {text.address}　{text.addressValue}
        </p>
        <a className="original-inquiry-button" href={literals.emailUrl}>
          {text.action}
        </a>
      </div>
    </PublicInnerPage>
  );
}

export async function PublicInquiryRoute({
  locale,
  searchParams,
}: LocalizedRouteProps) {
  const db = database();
  const [params, { payload: inquiry }, { payload: chrome }] = await Promise.all(
    [
      searchParams,
      managedPage(db, 'inquiry', locale),
      managedPage(db, 'chrome', locale),
    ],
  );
  const product = first(params.product) || '';
  return (
    <PublicInnerPage
      locale={locale}
      path="/inquiry"
      chrome={chrome}
      title={inquiry.text.title}
      eyebrow={inquiry.text.eyebrow}
      breadcrumbs={[{ label: inquiry.text.title }]}
    >
      <SolutionFinder locale={locale} />
      <PublicInquiryForm key={product} inquiry={inquiry} product={product} />
    </PublicInnerPage>
  );
}
