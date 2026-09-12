import type { Locale } from '../lib/locales';

const copy = {
  'zh-TW': {
    eyebrow: '下一步',
    title: '想確認這項方案是否適合您的產線？',
    description:
      '把目前閱讀的產品或資料帶入詢價，專員就能先掌握您正在評估的主題。',
    finder: '使用快速選型',
    inquiry: '帶入詢價',
    reassurance: '送出前不會建立帳號，也不代表任何採購承諾。',
  },
  en: {
    eyebrow: 'Next step',
    title: 'Would you like to check whether this fits your line?',
    description:
      'Bring the product or information you are reading into an enquiry so a specialist understands the topic you are evaluating.',
    finder: 'Use Solution Finder',
    inquiry: 'Bring to enquiry',
    reassurance: 'No account is created and there is no purchase commitment before you submit.',
  },
} as const;

export function ContextualInquiryEntry({
  locale,
  topic,
  inquiryHref,
}: {
  locale: Locale;
  topic: string;
  inquiryHref: string;
}) {
  const text = copy[locale];
  const finderHref = locale === 'en' ? '/en/inquiry#solution-finder' : '/inquiry#solution-finder';
  return (
    <aside className="contextual-inquiry-entry" aria-label={text.eyebrow}>
      <span>{text.eyebrow}</span>
      <h2>{text.title}</h2>
      <p>{text.description}</p>
      <p className="contextual-inquiry-topic">{topic}</p>
      <div>
        <a href={finderHref}>{text.finder}</a>
        <a className="original-inquiry-button" href={inquiryHref}>
          {text.inquiry}
        </a>
      </div>
      <small>{text.reassurance}</small>
    </aside>
  );
}
