'use client';

import { useSearchParams } from 'next/navigation';

const groupNotes: Record<string, string> = {
  '食材分選': '原網站將天然或加工食品原物料依顏色與外觀瑕疵進行自動化品質分級。',
  'X光機異物檢測': '原網站提供各類食品包裝型態的 X 光檢查，作為食品出廠前的安全把關。',
  '回收再生': '原網站列出消費端廢棄物的整體風選分類設備與回收再生解決方案。',
  '塑膠化工': '原網站涵蓋食品容器物理性發泡、板材押出與厚薄量測相關技術。',
  'OPTIMUM-食材分選': 'OPTIMUM 食材分選系列包含皮帶式、自由落體式及適用堅果、乾果與易碎水果的機型。',
  'XAVIS-食品異物X光機檢測': 'XAVIS 食品 X 光檢測系列包含未包裝、袋裝、罐裝、瓶裝、管道式與魚骨／雞骨等應用。',
  'NIHOT-回收再生': 'NIHOT 系列包含移動式與固定式風選機、碟篩等回收再生設備。',
};

export default function CatalogPage() {
  const params = useSearchParams();
  const group = params.get('group') || '產品目錄';
  const item = params.get('item');
  const title = item || group;
  return <main className="detail-page"><header className="detail-nav"><a href="/">← 回到首頁</a><img src="/reference/logo.png" alt="UniRise 合軒科技有限公司" /><a href="/inquiry">詢價系統</a></header><section className="detail-hero"><div><p>PRODUCT CATALOG</p><h1>{title}</h1><span>代理品牌／產品資料</span></div></section><section className="detail-shell"><nav className="crumb"><a href="/">首頁</a><span>/</span><a href="/catalog">代理品牌</a><span>/</span><strong>{group}</strong>{item && <><span>/</span><strong>{item}</strong></>}</nav><div className="detail-grid"><img src="/reference/feature-xray.jpg" alt="" /><article><div className="section-kicker">PRODUCT INFORMATION</div><h2>{title}</h2><p>{groupNotes[group] || `此頁整理原網站「${group}」分類中所列的產品名稱與服務資訊。`}</p><p className="note">完整規格、選配與適用產線需依實際需求確認。</p><a className="detail-cta" href={`/inquiry?product=${encodeURIComponent(title)}`}>詢問此產品 →</a></article></div></section></main>;
}
