'use client';

import { useSearchParams } from 'next/navigation';
import { OriginalFooter, OriginalHeader } from '../original-shell';

/* oxlint-disable next/no-img-element, next/no-html-link-for-pages -- Catalog assets and links retain original markup to preserve the reconstructed site's dimensions, query-string links, and behavior. */

const groupNotes: Record<string, string> = {
  '食材分選': '原網站將天然或加工食品原物料依顏色與外觀瑕疵進行自動化品質分級。',
  'X光機異物檢測': '原網站提供各類食品包裝型態的 X 光檢查，作為食品出廠前的安全把關。',
  '回收再生': '原網站列出消費端廢棄物的整體風選分類設備與回收再生解決方案。',
  '塑膠化工': '原網站涵蓋食品容器物理性發泡、板材押出與厚薄量測相關技術。',
  'OPTIMUM-食材分選': 'OPTIMUM 食材分選系列包含皮帶式、自由落體式及適用堅果、乾果與易碎水果的機型。',
  'XAVIS-食品異物X光機檢測': 'XAVIS 食品 X 光檢測系列包含未包裝、袋裝、罐裝、瓶裝、管道式與魚骨／雞骨等應用。',
  'NIHOT-回收再生': 'NIHOT 系列包含移動式與固定式風選機、碟篩等回收再生設備。',
};

const industryTitles: Record<string, string> = {
  '1':'食材分選','4':'X光機異物檢測','6':'回收再生','7':'塑膠化工','73':'OPTIMUM-食材分選','82':'Smart Grader-採樣分析','77':'XAVIS-X光機檢測','97':'XAVIS-FSCAN自動重量檢測機','100':'XAVIS-FSCAN重量分級檢測機','98':'XAVIS-FSCAN鋁箔金屬檢測機','84':'NIR手持式分析儀','78':'NIHOT-回收再生','91':'Matthiessen-破袋機','81':'合軒','86':'MEAF-板材押出生產線','79':'PROMIX-物理發泡','96':'SBI-測厚儀',
};

const brandTitles: Record<string, string> = {
  '89':'品牌介紹','90':'OPTIMUM','91':'XAVIS','110':'Smart Grader','124':'MEAF','93':'PROMIX','146':'SBI','109':'NIR','92':'NIHOT','131':'Matthiessen','98':'合軒','1':'OPTIMUM-食材分選','78':'NOVUS (皮帶式-適用新鮮、乾燥或冷凍產品)','80':'VENTUS (適用堅果和乾果等產品)','79':'TRIPLUS (自由落體式-適用新鮮、乾燥或冷凍產品)','150':'MAGNUS (適用易碎水果)','147':'XAVIS-自動重量檢測機','156':'CWF590W輕量型重量檢測機','158':'CWF590WR滾輪式重量檢測機','149':'CSCAN自動重量檢測機','161':'CWIN69X多列式重量檢測機','159':'XAVIS-重量分級檢測機','160':'XAVIS重量分級檢測機','2':'XAVIS-食品異物X光機檢測','5':'小包裝/未包裝X光食品自動異物檢測機','81':'低密度中型包裝/散裝 X光食品自動異物檢測機','82':'高密度中型包裝 X光食品自動異物檢測機','83':'管道式 X光食品自動異物檢測機','84':'大型包裝 X光食品自動異物檢測機','85':'小型罐頭/瓶子包裝 X光食品自動異物檢測機','86':'大型罐頭/瓶子包裝 X光食品自動異物檢測機','127':'魚骨/雞骨專用 X光食品自動異物檢測機','152':'XAVIS-鋁箔金屬檢測機','153':'MDN-200AD鋁箔金屬檢測機(標準)','154':'MDN-200AH鋁箔金屬檢測機(進階)','120':'XAVIS-工業產品X光機檢測','121':'電池檢測專用','111':'Smart Grader-採樣分析','113':'智慧採樣分析器','114':'智慧分級機','122':'MEAF-板材押出生產線','123':'板材押出生產線','72':'PROMIX-物理發泡','128':'P1 冷卻混合器','129':'熔體混合器','140':'SBI-測厚儀','141':'KAPA I & KAPA II 電容/渦流雙感測厚薄儀','142':'KAPA IR 紅外線厚薄儀','143':'XRS SOFT X-RAY 低能量X光厚薄儀','144':'SHADOW 雷射陰影測量厚薄儀','145':'STG 雷射位移測量厚薄儀','112':'NIR手持式分析儀','116':'手持式NIR分析儀-塑料用','151':'手持式NIR分析儀-紡織用','155':'手持螢幕NIR分析儀-塑料用','7':'NIHOT-回收再生','87':'SDM 移動式風選機','104':'SDI 風選機','105':'WSF 風選機','106':'DDS 風選機','107':'SDX 風選機','108':'碟篩','137':'Matthiessen-破袋機','138':'SFIIIK3 破袋機','99':'合軒','100':'渦電流分選機','101':'磁滾筒','102':'上吸式磁鐵','103':'鋁罐分選機',
};

const catalogImage = (type: string, id: string) => {
  if (type === 'brand' && id === '127') return '/reference/original/catalog/brand-127.jpg';
  if (type === 'industry') {
    if (['1','73','82'].includes(id)) return '/reference/original/feature01.jpg';
    if (['4','77','97','100','98'].includes(id)) return '/reference/original/feature02.jpg';
    if (['6','84','78','91','81'].includes(id)) return '/reference/original/feature03.jpg';
    return '/reference/original/feature04.jpg';
  }
  if (['122','123','124'].includes(id)) return '/reference/original/index_005.jpg';
  if (['7','87','104','105','106','107','108','92'].includes(id)) return '/reference/original/index_003.jpg';
  if (['1','78','80','79','150','90'].includes(id)) return '/reference/original/index_004.jpg';
  if (['72','128','129','93'].includes(id)) return '/reference/original/index_001.jpg';
  if (['140','141','142','143','144','145','146'].includes(id)) return '/reference/original/index_010.png';
  if (['111','113','114','110'].includes(id)) return '/reference/original/index_006.jpg';
  if (['112','116','151','155','109'].includes(id)) return '/reference/original/index_007.jpg';
  if (['2','5','81','82','83','84','85','86','127','91','147','149','152','153','154','156','158','159','160','161','120','121'].includes(id)) return '/reference/original/index_008.jpg';
  return '/reference/original/index_009.jpg';
};

export default function CatalogPage() {
  const params = useSearchParams();
  const type = params.get('type') || '';
  const id = params.get('id') || '';
  const mappedTitle = type === 'industry' ? industryTitles[id] : type === 'brand' ? brandTitles[id] : '';
  const group = mappedTitle || params.get('group') || '產品目錄';
  const item = params.get('item');
  const title = item || group;
  const productTitle = type === 'brand' && id === '127'
    ? '3. 魚骨/雞骨檢測 FSCAN-4350G X光食品自動異物檢測機'
    : title;
  return <main id="top" className="original-home original-inner-page">
    <OriginalHeader />
    <section className="original-sub-banner"><img src="/reference/original/subbanner.png" alt="" /></section>
    <section className="original-inner-content">
      <nav className="original-breadcrumb"><a href="/">HOME</a><span>/</span><a href="/catalog?type=brand&id=89">{type === 'industry' ? '產業服務' : '代理品牌'}</a><span>/</span><strong>{title}</strong></nav>
      <div className="original-inner-title"><span>{type === 'industry' ? 'Industry' : 'Brand'}</span><small>{title}</small></div>
      <div className="original-product-layout">
        <img src={catalogImage(type,id)} alt={productTitle} decoding="async" />
        <article><h2>{productTitle}</h2><p>{groupNotes[group] || `「${group}」為合軒科技原網站所列的正式產品與服務分類。`}</p><p>完整規格、選配與適用產線請向合軒科技確認。</p><a className="original-inquiry-button" href={`/inquiry?product=${encodeURIComponent(productTitle)}`}>加入詢問車</a></article>
      </div>
    </section>
    <OriginalFooter />
  </main>;
}
