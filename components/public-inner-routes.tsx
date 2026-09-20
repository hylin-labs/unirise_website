import { env } from 'cloudflare:workers';
import {
  findPublishedNewsByLegacyIdForLocale,
  listPublishedNewsForLocale,
  listPublishedDownloadsForLocale,
  listPublishedDownloads,
} from '../lib/content-repository';
import type { Locale } from '../lib/locales';
import { localizedPath } from '../lib/localized-route';
import { stablePublicImage } from '../lib/public-image';
import { youtubeThumbnailUrl, youtubeVideoId } from '../lib/youtube';
import { getLocalizedContent } from '../lib/translation-repository';
import type {
  CatalogPayload,
  ChromePayload,
  ContactPayload,
  InquiryPayload,
} from '../lib/translation-types';
import { PublicInnerPage } from './public-inner-page';
import { ContextualInquiryEntry } from './contextual-inquiry-entry';
import { PublicInquiryForm } from './public-inquiry-form';
import { PublicVideoEmbed } from './public-video-embed';
import { SolutionFinder } from './solution-finder';
import { ProjectPassport } from './project-passport';

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
        <ContextualInquiryEntry
          locale={locale}
          topic={productTitle}
          inquiryHref={localizedPath(
            locale,
            '/inquiry',
            `?product=${encodeURIComponent(productTitle)}`,
          )}
        />
      </div>
    </PublicInnerPage>
  );
}

const newsCopy = {
  'zh-TW': {
    eyebrow: '最新消息',
    label: '最新消息',
    video: '影片',
    playVideo: '播放影片',
    openVideo: '在 YouTube 開啟影片',
    back: '← 回到最新消息',
    inquire: '洽詢更多資訊',
    more: '了解更多 →',
  },
  en: {
    eyebrow: 'News',
    label: 'NEWS',
    video: 'video',
    playVideo: 'Play video',
    openVideo: 'Open video on YouTube',
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
  const postVideoUrl =
    post?.videoUrl ??
    (post && youtubeVideoId(post.imageUrl) ? post.imageUrl : null);
  const postImageUrl = post
    ? (youtubeThumbnailUrl(post.imageUrl) ?? stablePublicImage(post.imageUrl))
    : '';
  return (
    <PublicInnerPage
      locale={locale}
      path="/news"
      chrome={chrome}
      title={post?.title || chrome.text.nav[2]}
      eyebrow={copy.eyebrow}
      breadcrumbs={[{ label: chrome.text.nav[2] }]}
      contentClassName="news-page"
    >
      {post ? (
        <article className="article article-detail">
          <img
            src={postImageUrl}
            alt={post.title}
            decoding="async"
          />
          <time>{copy.label} · {post.legacyId}</time>
          <h2>{post.title}</h2>
          <p className="article-lead">{post.lead}</p>
          <ul>
            {post.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
          {postVideoUrl && (
            <PublicVideoEmbed
              label={`${post.title} ${copy.video}`}
              openLabel={copy.openVideo}
              playLabel={copy.playVideo}
              poster={postImageUrl}
              src={postVideoUrl}
              title={`${post.title} ${copy.video}`}
            />
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
          <ContextualInquiryEntry
            locale={locale}
            topic={post.title}
            inquiryHref={localizedPath(
              locale,
              '/inquiry',
              `?product=${encodeURIComponent(post.title)}`,
            )}
          />
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
                  src={
                    youtubeThumbnailUrl(item.imageUrl) ??
                    stablePublicImage(item.imageUrl)
                  }
                  alt={item.title}
                  loading="lazy"
                  decoding="async"
                />
              </a>
              <time>{copy.label}</time>
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
    eyebrow: '下載',
    selected: '{collection} 資料索取',
    choose: '選擇產品資料',
    help: '原網站設有下列產品資料分類。為確保資料為最新版本，請透過詢價系統索取。',
    request: '索取產品資料',
  },
  en: {
    eyebrow: 'Download',
    selected: 'Request {collection} information',
    choose: 'Choose product information',
    help: 'The original website lists the product information categories below. Please use the inquiry system to request the latest version.',
    request: 'Request product information',
  },
};

const searchCopy = {
  'zh-TW': {
    eyebrow: '網站搜尋',
    title: '搜尋產品、消息與下載資料',
    placeholder: '輸入產品、品牌或關鍵字',
    submit: '搜尋',
    prompt: '請輸入關鍵字，搜尋公開產品、最新消息與下載資料。',
    count: '找到 {count} 項結果',
    none: '找不到相關的公開內容，請換個關鍵字或直接聯絡我們。',
    catalog: '產品目錄',
    news: '最新消息',
    download: '下載資料',
    downloadSummary: '可透過詢價系統索取最新產品資料。',
  },
  en: {
    eyebrow: 'Search',
    title: 'Search products, news and downloads',
    placeholder: 'Enter a product, brand or keyword',
    submit: 'Search',
    prompt: 'Search publicly available products, news and downloadable product information.',
    count: '{count} results found',
    none: 'No public content matched that search. Try another term or contact us directly.',
    catalog: 'Product catalog',
    news: 'News',
    download: 'Downloads',
    downloadSummary: 'Use the inquiry system to request the latest product information.',
  },
};

type PublicSearchResult = {
  category: string;
  href: string;
  summary: string;
  title: string;
  score: number;
};

function searchScore(query: string, ...values: string[]) {
  const text = values.join(' ').toLocaleLowerCase();
  const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (!terms.length || !terms.every((term) => text.includes(term))) return 0;
  const title = values[0].toLocaleLowerCase();
  return terms.reduce(
    (score, term) => score + (title.includes(term) ? 8 : 2),
    0,
  );
}

export async function PublicSearchRoute({
  locale,
  searchParams,
}: LocalizedRouteProps) {
  const db = database();
  const [params, catalog, { payload: chrome }, news, downloads] =
    await Promise.all([
      searchParams,
      managedPage(db, 'catalog', locale),
      managedPage(db, 'chrome', locale),
      listPublishedNewsForLocale(db, locale),
      listPublishedDownloadsForLocale(db, locale),
    ]);
  const copy = searchCopy[locale];
  const query = (first(params.q) || '').trim().slice(0, 100);
  const catalogResults = [
    ...Object.entries(catalog.payload.text.industryTitles).map(
      ([id, title]) => ({
        category: copy.catalog,
        href: localizedPath(locale, '/catalog', `?type=industry&id=${id}`),
        summary: catalog.payload.text.industry,
        title,
      }),
    ),
    ...Object.entries(catalog.payload.text.brandTitles).map(([id, title]) => ({
      category: copy.catalog,
      href: localizedPath(locale, '/catalog', `?type=brand&id=${id}`),
      summary: catalog.payload.text.brand,
      title,
    })),
  ];
  const results: PublicSearchResult[] = query
    ? [
        ...catalogResults,
        ...news.map((item) => ({
          category: copy.news,
          href: localizedPath(
            locale,
            '/news',
            `?id=${encodeURIComponent(item.legacyId)}`,
          ),
          summary: item.lead,
          title: item.title,
        })),
        ...downloads.map((item) => ({
          category: copy.download,
          href: localizedPath(
            locale,
            '/downloads',
            `?id=${encodeURIComponent(item.legacyId)}`,
          ),
          summary: copy.downloadSummary,
          title: item.title,
        })),
      ]
        .map((item) => ({
          ...item,
          score: searchScore(query, item.title, item.summary),
        }))
        .filter((item) => item.score > 0)
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.title.localeCompare(right.title, locale),
        )
        .slice(0, 40)
    : [];
  return (
    <PublicInnerPage
      locale={locale}
      path="/search"
      chrome={chrome}
      title={copy.title}
      eyebrow={copy.eyebrow}
      breadcrumbs={[{ label: copy.eyebrow }]}
      contentClassName="search-page"
    >
      <section className="original-content-panel original-search-panel">
        <search>
          <form action={localizedPath(locale, '/search')} method="get">
            <label htmlFor="site-search-query">{copy.title}</label>
            <div>
              <input
                id="site-search-query"
                name="q"
                type="search"
                defaultValue={query}
                maxLength={100}
                placeholder={copy.placeholder}
              />
              <button type="submit">{copy.submit}</button>
            </div>
          </form>
        </search>
        {!query ? <p className="search-empty">{copy.prompt}</p> : null}
        {query ? (
          <p className="search-summary">
            {copy.count.replace('{count}', String(results.length))}
          </p>
        ) : null}
        {query && !results.length ? (
          <p className="search-empty">{copy.none}</p>
        ) : null}
        {results.length ? (
          <div className="search-results">
            {results.map((result) => (
              <article key={result.href}>
                <span>{result.category}</span>
                <h2>
                  <a href={result.href}>{result.title}</a>
                </h2>
                <p>{result.summary}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </PublicInnerPage>
  );
}

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
      eyebrow={copy.eyebrow}
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
          <>
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
            <ContextualInquiryEntry
              locale={locale}
              topic={collection}
              inquiryHref={localizedPath(
                locale,
                '/inquiry',
                `?product=${encodeURIComponent(collection)}`,
              )}
            />
          </>
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
  const brief = first(params.brief)?.slice(0, 900) || '';
  const service = first(params.service) === '1';
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
      <PublicInquiryForm
        key={`${product}:${brief}`}
        inquiry={inquiry}
        product={product}
        brief={brief}
        locale={locale}
        service={service}
      />
    </PublicInnerPage>
  );
}

const projectPassportCopy = {
  'zh-TW': { title: '專案方案護照', eyebrow: '專案工作台' },
  en: { title: 'Project Solution Passport', eyebrow: 'Project Workspace' },
} as const;

export async function PublicProjectPassportRoute({
  locale,
  searchParams,
}: LocalizedRouteProps) {
  const [params, { payload: chrome }] = await Promise.all([
    searchParams,
    managedPage(database(), 'chrome', locale),
  ]);
  const search = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) => {
      const entries = Array.isArray(value) ? value : [value];
      return entries
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => [key, entry]);
    }),
  ).toString();
  const copy = projectPassportCopy[locale];
  return (
    <PublicInnerPage
      locale={locale}
      path="/project"
      chrome={chrome}
      title={copy.title}
      eyebrow={copy.eyebrow}
      breadcrumbs={[{ label: copy.title }]}
    >
      <ProjectPassport locale={locale} search={search} />
    </PublicInnerPage>
  );
}
