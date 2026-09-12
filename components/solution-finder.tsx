'use client';

import { useMemo, useState } from 'react';

type Locale = 'zh-TW' | 'en';
type FinderValue = 'fresh' | 'protein' | 'packaged' | 'recycled' | 'plastics';
type Goal =
  | 'sorting'
  | 'inspection'
  | 'weighing'
  | 'packing'
  | 'recycling'
  | 'materials';
type Capacity = 'pilot' | 'growing' | 'high';

type Recommendation = {
  title: string;
  reason: string;
  catalogHref: string;
};

const copy = {
  'zh-TW': {
    title: '快速選型',
    description: '用三個問題，協助您先找到最值得討論的方案。',
    product: '您的產品類型',
    goal: '主要需求',
    capacity: '預估產能規模',
    select: '請選擇',
    results: '建議優先討論',
    details: '查看方案詳情',
    inquiry: '把選型結果帶入詢問',
    summary: '需求摘要',
    projectBrief: '專案需求工作台',
    projectHelp:
      '先將這份初步需求摘要儲存於此裝置，再決定是否送出詢價。摘要不會包含您的個人資料。',
    save: '儲存摘要',
    saved: '已儲存於此裝置',
    copy: '複製摘要',
    copied: '已複製',
    bringToInquiry: '帶入詢價',
    materials: {
      fresh: '新鮮蔬果／農產',
      protein: '肉品、海鮮或蛋白質食品',
      packaged: '包裝食品、罐裝或瓶裝產品',
      recycled: '回收物與再生資源',
      plastics: '塑膠、板材或化工材料',
    },
    goals: {
      sorting: '依外觀、色澤或瑕疵分選',
      inspection: 'X 光異物檢測',
      weighing: '重量檢測或重量分級',
      packing: '自動包裝與產線整合',
      recycling: '回收分選與物料處理',
      materials: '材料製程、發泡或測厚',
    },
    capacities: {
      pilot: '試產／小量',
      growing: '成長中的量產線',
      high: '高產能或多線生產',
    },
  },
  en: {
    title: 'Solution Finder',
    description: 'Answer three questions to identify the best solution to discuss first.',
    product: 'Your product type',
    goal: 'Primary requirement',
    capacity: 'Expected capacity',
    select: 'Select an option',
    results: 'Recommended starting point',
    details: 'View solution details',
    inquiry: 'Bring this result to an enquiry',
    summary: 'Requirement summary',
    projectBrief: 'Project Brief',
    projectHelp:
      'Save this preliminary brief on this device, then decide whether to send an enquiry. The brief contains no personal information.',
    save: 'Save brief',
    saved: 'Saved on this device',
    copy: 'Copy brief',
    copied: 'Copied',
    bringToInquiry: 'Bring to enquiry',
    materials: {
      fresh: 'Fresh produce and agricultural products',
      protein: 'Meat, seafood, or protein products',
      packaged: 'Packaged, canned, or bottled food',
      recycled: 'Recyclables and recovered materials',
      plastics: 'Plastics, sheet, or chemical materials',
    },
    goals: {
      sorting: 'Sort by appearance, colour, or defects',
      inspection: 'X-ray foreign-object inspection',
      weighing: 'Checkweighing or weight grading',
      packing: 'Automated packaging and line integration',
      recycling: 'Recycling sorting and material handling',
      materials: 'Processing, foaming, or thickness measurement',
    },
    capacities: {
      pilot: 'Pilot or low-volume line',
      growing: 'Growing production line',
      high: 'High-capacity or multi-line production',
    },
  },
} as const;

function recommendationFor(locale: Locale, goal: Goal): Recommendation {
  const zh = locale === 'zh-TW';
  const recommendations: Record<Goal, Recommendation> = {
    sorting: {
      title: zh ? 'OPTIMUM 食材分選方案' : 'OPTIMUM Food Sorting Solutions',
      reason: zh
        ? '適合依顏色、外觀與品質條件進行自動分選。'
        : 'Designed for automated sorting by colour, appearance, and quality criteria.',
      catalogHref: '/catalog?type=brand&id=1',
    },
    inspection: {
      title: zh ? 'XAVIS 食品 X 光異物檢測' : 'XAVIS Food X-ray Inspection',
      reason: zh
        ? '可進一步依包裝型態與異物特性評估檢測方案。'
        : 'The next discussion can match the inspection method to your packaging and contamination risks.',
      catalogHref: '/catalog?type=brand&id=2',
    },
    weighing: {
      title: zh ? 'XAVIS 重量檢測與分級' : 'XAVIS Checkweighing and Weight Grading',
      reason: zh
        ? '適合做重量檢測、分級與包裝前的品質控管。'
        : 'Suitable for checkweighing, grading, and quality control before packaging.',
      catalogHref: '/catalog?type=brand&id=147',
    },
    packing: {
      title: zh ? 'OPTIMUM 自動包裝與產線整合' : 'OPTIMUM Automated Packaging and Line Integration',
      reason: zh
        ? '可從分選、秤重到包裝，討論適合的整線配置。'
        : 'A starting point for discussing an integrated sorting, weighing, and packaging line.',
      catalogHref: '/catalog?type=brand&id=1',
    },
    recycling: {
      title: zh ? '回收再生分選方案' : 'Recycling and Recovery Solutions',
      reason: zh
        ? '可依物料、污染狀況與目標回收率安排進一步評估。'
        : 'The next evaluation can consider material type, contamination, and recovery targets.',
      catalogHref: '/catalog?type=industry&id=6',
    },
    materials: {
      title: zh ? '塑膠化工製程方案' : 'Plastics and Chemicals Process Solutions',
      reason: zh
        ? '適合討論押出、物理發泡與厚度量測等製程需求。'
        : 'Suitable for discussing extrusion, physical foaming, and thickness measurement needs.',
      catalogHref: '/catalog?type=industry&id=7',
    },
  };
  return recommendations[goal];
}

export function SolutionFinder({ locale }: { locale: Locale }) {
  const text = copy[locale];
  const [material, setMaterial] = useState<FinderValue | ''>('');
  const [goal, setGoal] = useState<Goal | ''>('');
  const [capacity, setCapacity] = useState<Capacity | ''>('');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const recommendation = useMemo(
    () => (material && goal && capacity ? recommendationFor(locale, goal) : null),
    [capacity, goal, locale, material],
  );
  const summary = useMemo(() => {
    if (!recommendation || !material || !goal || !capacity) return '';
    return `${text.materials[material]} · ${text.goals[goal]} · ${text.capacities[capacity]}`;
  }, [capacity, goal, material, recommendation, text]);
  const inquiryHref = recommendation
    ? `?product=${encodeURIComponent(recommendation.title)}&brief=${encodeURIComponent(summary)}`
    : '#inquiry-form';
  const saveBrief = () => {
    if (!recommendation || !summary) return;
    try {
      window.localStorage.setItem(
        'unirise-project-brief',
        JSON.stringify({
          title: recommendation.title,
          summary,
          savedAt: new Date().toISOString(),
        }),
      );
      setSaved(true);
    } catch {
      // Storage can be unavailable in a private browsing session. The enquiry
      // path remains available without saving anything.
    }
  };
  const copyBrief = async () => {
    if (!recommendation || !summary || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(`${recommendation.title}\n${summary}`);
      setCopied(true);
    } catch {
      // Copying is optional; visitors can still use the enquiry link.
    }
  };

  return (
    <section
      className="solution-finder"
      id="solution-finder"
      aria-labelledby="solution-finder-title"
    >
      <div className="solution-finder-intro">
        <span>01</span>
        <div>
          <h2 id="solution-finder-title">{text.title}</h2>
          <p>{text.description}</p>
        </div>
      </div>
      <div className="solution-finder-fields">
        <label>
          {text.product}
          <select
            value={material}
            onChange={(event) => setMaterial(event.currentTarget.value as FinderValue | '')}
          >
            <option value="">{text.select}</option>
            {Object.entries(text.materials).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text.goal}
          <select
            value={goal}
            onChange={(event) => setGoal(event.currentTarget.value as Goal | '')}
          >
            <option value="">{text.select}</option>
            {Object.entries(text.goals).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text.capacity}
          <select
            value={capacity}
            onChange={(event) => setCapacity(event.currentTarget.value as Capacity | '')}
          >
            <option value="">{text.select}</option>
            {Object.entries(text.capacities).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {recommendation && (
        <div className="solution-finder-result" aria-live="polite">
          <span>{text.results}</span>
          <h3>{recommendation.title}</h3>
          <p>{recommendation.reason}</p>
          <small>
            {text.summary}：{summary}
          </small>
          <div>
            <a href={recommendation.catalogHref}>{text.details}</a>
            <a className="original-inquiry-button" href={inquiryHref}>
              {text.inquiry}
            </a>
          </div>
          <aside className="project-brief" aria-label={text.projectBrief}>
            <div>
              <strong>{text.projectBrief}</strong>
              <p>{text.projectHelp}</p>
            </div>
            <div className="project-brief-actions">
              <button type="button" onClick={saveBrief}>
                {saved ? text.saved : text.save}
              </button>
              <button type="button" onClick={copyBrief}>
                {copied ? text.copied : text.copy}
              </button>
              <a className="original-inquiry-button" href={inquiryHref}>
                {text.bringToInquiry}
              </a>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
