'use client';
import type { Locale } from '../lib/locales';
import { validProjectSelection } from '../lib/project-workspace';

const labels = {
  'zh-TW': {
    eyebrow: '方案護照',
    title: '您的專案方案護照',
    description:
      '這份連結整理了目前的初步選型。內容不含聯絡資訊，可安心分享給同事或帶入詢價。',
    unavailable: '此連結沒有完整的方案資料。請先完成快速選型，再建立方案護照。',
    project: '專案名稱',
    recommendation: '建議優先討論',
    selection: '初步設定',
    service: '設備服務支援',
    inquiry: '帶入詢價',
    note: '正式的設備護照會在型號、序號與保固資料完成綁定後提供。',
  },
  en: {
    eyebrow: 'Solution Passport',
    title: 'Your project solution passport',
    description:
      'This link summarizes the initial selection without contact details, so it can be shared with colleagues or brought into an enquiry.',
    unavailable:
      'This link does not contain a complete solution. Complete the Solution Finder first.',
    project: 'Project name',
    recommendation: 'Recommended starting point',
    selection: 'Initial configuration',
    service: 'Equipment service support',
    inquiry: 'Bring to enquiry',
    note:
      'A full equipment passport will be available after model, serial-number, and warranty information are connected.',
  },
} as const;

const values = {
  'zh-TW': {
    fresh: '新鮮蔬果／農產',
    protein: '肉品、海鮮或蛋白質食品',
    packaged: '包裝食品、罐裝或瓶裝產品',
    recycled: '回收物與再生資源',
    plastics: '塑膠、板材或化工材料',
    sorting: '依外觀、色澤或瑕疵分選',
    inspection: 'X 光異物檢測',
    weighing: '重量檢測或重量分級',
    packing: '自動包裝與產線整合',
    recycling: '回收分選與物料處理',
    materials: '材料製程、發泡或測厚',
    pilot: '試產／小量',
    growing: '成長中的量產線',
    high: '高產能或多線生產',
    quality: '品質與一致性',
    throughput: '產能與效率',
    automation: '自動化整合',
    safety: '安全與可追溯性',
  },
  en: {
    fresh: 'Fresh produce and agricultural products',
    protein: 'Meat, seafood, or protein products',
    packaged: 'Packaged, canned, or bottled food',
    recycled: 'Recyclables and recovered materials',
    plastics: 'Plastics, sheet, or chemical materials',
    sorting: 'Sorting by appearance, colour, or defects',
    inspection: 'X-ray foreign-object inspection',
    weighing: 'Checkweighing or weight grading',
    packing: 'Automated packaging and line integration',
    recycling: 'Recycling sorting and material handling',
    materials: 'Processing, foaming, or thickness measurement',
    pilot: 'Pilot or low-volume line',
    growing: 'Growing production line',
    high: 'High-capacity or multi-line production',
    quality: 'Quality and consistency',
    throughput: 'Capacity and efficiency',
    automation: 'Automation and integration',
    safety: 'Safety and traceability',
  },
} as const;

export function ProjectPassport({
  locale,
  search,
}: {
  locale: Locale;
  search: string;
}) {
  const text = labels[locale];
  const params = new URLSearchParams(search);
  const selection = validProjectSelection({
    material: params.get('material') ?? '',
    goal: params.get('goal') ?? '',
    capacity: params.get('capacity') ?? '',
    priority: params.get('priority') ?? '',
  });
  const recommendation = (params.get('recommendation') ?? '').slice(0, 160);
  const name = (params.get('name') ?? '').slice(0, 80);
  if (!selection || !recommendation)
    return <p className="project-passport-empty">{text.unavailable}</p>;
  const detail = [
    values[locale][selection.material],
    values[locale][selection.goal],
    values[locale][selection.capacity],
    values[locale][selection.priority],
  ].join(' · ');
  const inquiry = `${locale === 'en' ? '/en/inquiry' : '/inquiry'}?product=${encodeURIComponent(recommendation)}&brief=${encodeURIComponent(detail)}`;
  const service = `${locale === 'en' ? '/en/inquiry' : '/inquiry'}?service=1&product=${encodeURIComponent(recommendation)}&brief=${encodeURIComponent(detail)}`;
  return (
    <section className="project-passport" aria-labelledby="project-passport-title">
      <span>{text.eyebrow}</span>
      <h2 id="project-passport-title">{text.title}</h2>
      <p>{text.description}</p>
      <dl>
        <div><dt>{text.project}</dt><dd>{name || recommendation}</dd></div>
        <div><dt>{text.recommendation}</dt><dd>{recommendation}</dd></div>
        <div><dt>{text.selection}</dt><dd>{detail}</dd></div>
      </dl>
      <div className="project-passport-actions">
        <a className="original-inquiry-button" href={inquiry}>{text.inquiry}</a>
        <a href={service}>{text.service}</a>
      </div>
      <small>{text.note}</small>
    </section>
  );
}
