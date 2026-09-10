import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PublicHome } from '../components/public-home';
import { initialPublicContent } from '../lib/public-content';

const news = [
  {
    id: 'news-3944',
    legacyId: '3944',
    title: 'Xavis inspection',
    lead: 'A verified inspection update.',
    imageUrl: '/reference/original/59d79791614c286ba688923bb61c0027.jpg',
    highlights: [],
    videoUrl: null,
    status: 'published' as const,
    publishedAt: '2026-09-10T00:00:00.000Z',
    requestedLocale: 'en' as const,
    locale: 'en' as const,
    missing: false,
    outdated: false,
  },
];

function englishPayloads() {
  const home = structuredClone(initialPublicContent.home);
  const chrome = structuredClone(initialPublicContent.chrome);
  home.text.heading = 'What we provide';
  home.text.introduction =
    'Automation solutions from food production to consumers';
  home.text.featureLabels = [
    'Food sorting',
    'X-ray inspection',
    'Recycling',
    'Plastics and chemicals',
  ];
  home.text.agencyLabels = [
    'Sheet extrusion lines',
    'Air separation',
    'Food sorting',
    'Physical foaming',
    'Thickness measurement',
    'Sampling analysis',
    'Handheld NIR analyzers',
    'Food X-ray inspection',
    'Eddy-current and iron removal',
  ];
  home.text.news = 'News';
  home.text.brands = 'Agency brands';
  home.text.industry = 'Industry solutions';
  home.text.more = 'Learn more';
  chrome.text.company = 'Unirise Technology Inc.';
  chrome.text.address = 'Address';
  chrome.text.contact = 'Contact';
  chrome.text.search = 'Search';
  chrome.text.cart = 'Inquiry cart';
  chrome.text.language = 'Language';
  chrome.text.homeLink = 'Back to home';
  chrome.text.menu = 'Main navigation';
  chrome.text.openMenu = 'Open menu';
  chrome.text.top = 'Back to top';
  chrome.text.nav = [
    'Industry solutions',
    'Agency brands',
    'News',
    'Downloads',
    'Inquiry',
    'Contact',
  ];
  chrome.text.footerAddress = '598 Yuyi Road, East District, Tainan City';
  chrome.text.chat.open = 'Open chat';
  chrome.text.chat.close = 'Close chat';
  return { home, chrome };
}

describe('PublicHome locale rendering', () => {
  it('keeps the Chinese home markup, classes, assets, and legacy links intact', () => {
    const html = renderToStaticMarkup(
      <PublicHome
        locale="zh-TW"
        home={initialPublicContent.home}
        chrome={initialPublicContent.chrome}
        news={news.map((item) => ({
          ...item,
          locale: 'zh-TW',
          requestedLocale: 'zh-TW',
        }))}
        pathname="/"
      />,
    );

    expect(html).toContain('class="original-header"');
    expect(html).toContain('class="original-features"');
    expect(html).toContain('class="original-agency-carousel"');
    expect(html).toContain('class="original-news-grid"');
    expect(html).toContain('/reference/original/logo.png');
    expect(html).toContain('width="347"');
    expect(html).toContain('href="/catalog?type=industry&amp;id=73"');
    expect(html).toContain('href="/news?id=3944"');
    expect(html).toContain('href="/contact"');
    expect(html).toMatch(
      /original-nav-item[^>]*><a href="\/downloads">下載專區<\/a>/,
    );
    expect(html).toMatch(
      /original-footer[\s\S]*href="\/downloads\?id=3853">下載專區<\/a>/,
    );
    expect(html).toContain('href="/en"');
    expect(html).toContain('https://goo.gl/maps/dvcWWbp4xf8AZ3dF6');
    expect(html).toContain('https://goo.gl/maps/oqLuxoMzVYdmJEwg9');
    expect(html).toContain('https://www.facebook.com/');
    expect(html).toContain('https://line.me/ti/p/W1QdEgfzdb');
    expect(html).toContain(
      'https://www.youtube.com/channel/UCuIR83-YHMNnVc8lbaDB2nQ',
    );
    expect(html).toContain('食材分選');
    expect(html).toContain('代理品牌');
    expect(html).toContain('aria-label="開啟聊天"');
  });

  it('renders the same home UI in English with localized internal links and chrome', () => {
    const { home, chrome } = englishPayloads();
    const html = renderToStaticMarkup(
      <PublicHome
        locale="en"
        home={home}
        chrome={chrome}
        news={news}
        pathname="/en"
      />,
    );

    expect(html).toContain('class="original-header"');
    expect(html).toContain('class="original-features"');
    expect(html).toContain('class="original-agency-carousel"');
    expect(html).toContain('class="original-news-grid"');
    expect(html).toContain('Food sorting');
    expect(html).toContain('Agency brands');
    expect(html).toContain('Sheet extrusion lines');
    expect(html).toContain('Xavis inspection');
    expect(html).toContain('598 Yuyi Road, East District, Tainan City');
    expect(html).toContain('href="/en/catalog?type=industry&amp;id=73"');
    expect(html).toContain('href="/en/news?id=3944"');
    expect(html).toContain('href="/en/contact"');
    expect(html).toMatch(
      /original-nav-item[^>]*><a href="\/en\/downloads">Downloads<\/a>/,
    );
    expect(html).toMatch(
      /original-footer[\s\S]*href="\/en\/downloads\?id=3853">Downloads<\/a>/,
    );
    expect(html).toContain('href="/"');
    expect(html).toContain('https://goo.gl/maps/dvcWWbp4xf8AZ3dF6');
    expect(html).toContain('aria-label="Open chat"');
    expect((html.match(/original-nav-item/g) ?? []).length).toBe(6);
  });
});
