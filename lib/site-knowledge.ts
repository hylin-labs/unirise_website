import { newsPosts } from '../app/news-data';
import { retrievePublishedKnowledge } from './content-repository';

export type KnowledgeSource = { title: string; href: string };
type KnowledgeChunk = KnowledgeSource & { content: string };
export type LegacyKnowledge = KnowledgeChunk & { id: string };

const catalogChunks: KnowledgeChunk[] = [
  {
    title: '公司服務領域',
    href: '/',
    content:
      '合軒科技的公開服務領域為食品分選、X 光檢測、回收再生與塑膠化工。天然或加工食品原物料可依顏色或外觀瑕疵由自動化分選機完成品質等級分類。各類食品包裝型態可透過 X 光檢查，作為食品出廠前的安全把關。',
  },
  {
    title: '代理品牌',
    href: '/catalog?type=brand&id=89',
    content:
      '合軒科技網站列出的代理品牌為：OPTIMUM、XAVIS、Smart Grader、MEAF、PROMIX、SBI、NIR、NIHOT、Matthiessen、合軒。',
  },
  {
    title: 'OPTIMUM 食材分選',
    href: '/catalog?type=brand&id=1',
    content:
      'OPTIMUM 食材分選系列包括 NOVUS 皮帶式機型（適用新鮮、乾燥或冷凍產品）、VENTUS（適用堅果和乾果）、TRIPLUS 自由落體式機型（適用新鮮、乾燥或冷凍產品）及 MAGNUS（適用易碎水果）。',
  },
  {
    title: 'XAVIS 食品異物 X 光檢測',
    href: '/catalog?type=brand&id=2',
    content:
      'XAVIS 食品 X 光檢測系列列有小包裝或未包裝、低密度中型包裝或散裝、高密度中型包裝、管道式、大型包裝、小型罐頭或瓶子包裝、大型罐頭或瓶子包裝，以及魚骨或雞骨專用的 X 光食品自動異物檢測機。',
  },
  {
    title: 'XAVIS 自動重量與重量分級檢測',
    href: '/catalog?type=brand&id=147',
    content:
      'XAVIS 自動重量檢測機包括 CWF590W 輕量型、CWF590WR 滾輪式、CSCAN 自動重量檢測機及 CWIN69X 多列式重量檢測機。網站亦列有 XAVIS 重量分級檢測機與 MDN-200AD、MDN-200AH 鋁箔金屬檢測機。',
  },
  {
    title: 'Smart Grader 採樣分析',
    href: '/catalog?type=brand&id=111',
    content: 'Smart Grader 系列包括智慧採樣分析器與智慧分級機。',
  },
  {
    title: 'MEAF 與 PROMIX',
    href: '/catalog?type=brand&id=122',
    content:
      'MEAF 提供板材押出生產線。PROMIX 物理發泡系列包括 P1 冷卻混合器與熔體混合器。',
  },
  {
    title: 'SBI 測厚儀',
    href: '/catalog?type=brand&id=140',
    content:
      'SBI 測厚儀系列包括 KAPA I 與 KAPA II 電容或渦流雙感測厚薄儀、KAPA IR 紅外線厚薄儀、XRS SOFT X-RAY 低能量 X 光厚薄儀、SHADOW 雷射陰影測量厚薄儀及 STG 雷射位移測量厚薄儀。',
  },
  {
    title: 'NIR 手持式分析儀',
    href: '/catalog?type=brand&id=112',
    content:
      'NIR 系列包括手持式 NIR 分析儀（塑料用）、手持式 NIR 分析儀（紡織用）及手持螢幕 NIR 分析儀（塑料用）。',
  },
  {
    title: 'NIHOT 回收再生',
    href: '/catalog?type=brand&id=7',
    content:
      'NIHOT 回收再生系列包括 SDM 移動式風選機、SDI 風選機、WSF 風選機、DDS 風選機、SDX 風選機及碟篩。網站亦將回收再生列為公司服務領域。',
  },
  {
    title: 'Matthiessen 與合軒設備',
    href: '/catalog?type=brand&id=137',
    content:
      'Matthiessen 系列列有 SFIIIK3 破袋機。合軒設備列有渦電流分選機、磁滾筒、上吸式磁鐵及鋁罐分選機。',
  },
  {
    title: '聯絡與詢價',
    href: '/contact',
    content:
      '可使用網站的詢價系統提出產品詢問與資料索取。合軒科技電話為 06-3319283，Email 為 info-unirise@unirise.tw，地址為台南市東區裕義路598號。',
  },
  {
    title: '下載專區',
    href: '/downloads?id=3853',
    content:
      '下載專區提供 NIHOT 回收再生、OPTIMUM 食材分選、PROMIX 塑膠化工及 XAVIS X 光檢測等分類的產品資料索取入口。',
  },
];

const catalogKnowledgeIds = [
  'catalog-services',
  'catalog-brands',
  'catalog-optimum',
  'catalog-xavis-xray',
  'catalog-xavis-weight',
  'catalog-smart-grader',
  'catalog-meaf-promix',
  'catalog-sbi',
  'catalog-nir',
  'catalog-nihot',
  'catalog-matthiessen',
  'catalog-contact',
  'catalog-downloads',
] as const;

export const legacyKnowledge: LegacyKnowledge[] = [
  ...catalogChunks.map((chunk, index) => ({
    id: catalogKnowledgeIds[index] ?? `catalog-${index}`,
    ...chunk,
  })),
  ...newsPosts.map((post) => ({
    id: `news-${post.id}`,
    title: `最新消息：${post.title}`,
    href: `/news?id=${post.id}`,
    content: `${post.title}。${post.lead}。${post.highlights.join('。')}`,
  })),
];

export function retrieveSiteKnowledge(
  db: D1Database,
  query: string,
  limit = 4,
) {
  return retrievePublishedKnowledge(db, query, limit);
}
