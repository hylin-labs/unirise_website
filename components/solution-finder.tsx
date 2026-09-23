'use client';

import { useMemo, useState } from 'react';
import {
  createProjectDraft,
  projectPassportHref,
  projectWorkspaceStorageKey,
  projectDraftsFromStorage,
  type ProjectDraft,
  type ProjectCapacity,
  type ProjectGoal,
  type ProjectMaterial,
  type ProjectPriority,
  type ProjectSelection,
} from '../lib/project-workspace';

type Locale = 'zh-TW' | 'en';

type Recommendation = {
  title: string;
  reason: string;
  catalogHref: string;
  configuration?: string[];
};

const copy = {
  'zh-TW': {
    title: '快速選型',
    description: '依序回答四個簡短問題，協助您先找到最值得討論的方案。',
    product: '您的產品類型',
    goal: '主要需求',
    capacity: '預估產能規模',
    priority: '本案最優先目標',
    select: '請選擇',
    results: '建議優先討論',
    details: '查看方案詳情',
    inquiry: '把選型結果帶入詢問',
    summary: '需求摘要',
    projectBrief: '專案需求工作台',
    projectHelp:
      '先將這份初步需求儲存於此裝置，產生規格摘要或可分享的方案護照，再決定是否送出詢價。內容不會包含您的個人資料。',
    projectName: '專案名稱（選填）',
    save: '儲存專案草稿',
    saved: '已儲存於此裝置',
    copy: '複製摘要',
    copied: '已複製',
    bringToInquiry: '帶入詢價',
    specification: '下載規格摘要',
    passport: '建立方案護照連結',
    service: '既有設備服務支援',
    savedProjects: '已儲存的專案草稿',
    openDraft: '開啟',
    removeDraft: '刪除',
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
    priorities: {
      quality: '品質與一致性',
      throughput: '產能與效率',
      automation: '自動化整合',
      safety: '安全與可追溯性',
    },
  },
  en: {
    title: 'Solution Finder',
    description: 'Answer four short questions, one at a time, to identify the best solution to discuss first.',
    product: 'Your product type',
    goal: 'Primary requirement',
    capacity: 'Expected capacity',
    priority: 'Primary project priority',
    select: 'Select an option',
    results: 'Recommended starting point',
    details: 'View solution details',
    inquiry: 'Bring this result to an enquiry',
    summary: 'Requirement summary',
    projectBrief: 'Project Brief',
    projectHelp:
      'Save this preliminary project on this device, create a specification brief or shareable solution passport, then decide whether to send an enquiry. It contains no personal information.',
    projectName: 'Project name (optional)',
    save: 'Save project draft',
    saved: 'Saved on this device',
    copy: 'Copy brief',
    copied: 'Copied',
    bringToInquiry: 'Bring to enquiry',
    specification: 'Download specification brief',
    passport: 'Create solution passport link',
    service: 'Existing equipment support',
    savedProjects: 'Saved project drafts',
    openDraft: 'Open',
    removeDraft: 'Remove',
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
    priorities: {
      quality: 'Quality and consistency',
      throughput: 'Capacity and efficiency',
      automation: 'Automation and integration',
      safety: 'Safety and traceability',
    },
  },
} as const;

function recommendationFor(locale: Locale, selection: ProjectSelection): Recommendation {
  const zh = locale === 'zh-TW';
  const recommendations: Record<ProjectGoal, Recommendation> = {
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
  const materialFocus = zh
    ? `產品範圍：${copy['zh-TW'].materials[selection.material]}`
    : `Product scope: ${copy.en.materials[selection.material]}`;
  const capacityFocus = zh
    ? `產能討論：${copy['zh-TW'].capacities[selection.capacity]}`
    : `Capacity discussion: ${copy.en.capacities[selection.capacity]}`;
  const priorityFocus = zh
    ? `優先目標：${copy['zh-TW'].priorities[selection.priority]}`
    : `Primary priority: ${copy.en.priorities[selection.priority]}`;
  return {
    ...recommendations[selection.goal],
    configuration: [materialFocus, capacityFocus, priorityFocus],
  };
}

export function SolutionFinder({ locale }: { locale: Locale }) {
  const text = copy[locale];
  const [material, setMaterial] = useState<ProjectMaterial | ''>('');
  const [goal, setGoal] = useState<ProjectGoal | ''>('');
  const [capacity, setCapacity] = useState<ProjectCapacity | ''>('');
  const [priority, setPriority] = useState<ProjectPriority | ''>('');
  const [projectName, setProjectName] = useState('');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [drafts, setDrafts] = useState<ProjectDraft[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return projectDraftsFromStorage(
        JSON.parse(window.localStorage.getItem(projectWorkspaceStorageKey) ?? '[]'),
      );
    } catch {
      return [];
    }
  });
  const completedSteps = [material, goal, capacity, priority].filter(Boolean).length;
  const recommendation = useMemo(
    () =>
      material && goal && capacity && priority
        ? recommendationFor(locale, { material, goal, capacity, priority })
        : null,
    [capacity, goal, locale, material, priority],
  );
  const summary = useMemo(() => {
    if (!recommendation || !material || !goal || !capacity || !priority) return '';
    return `${text.materials[material]} · ${text.goals[goal]} · ${text.capacities[capacity]} · ${text.priorities[priority]}`;
  }, [capacity, goal, material, priority, recommendation, text]);
  const inquiryHref = recommendation
    ? `?product=${encodeURIComponent(recommendation.title)}&brief=${encodeURIComponent(summary)}`
    : '#inquiry-form';
  const saveBrief = () => {
    if (!recommendation || !summary || !material || !goal || !capacity || !priority) return;
    try {
      const selection: ProjectSelection = { material, goal, capacity, priority };
      const draft = createProjectDraft(selection, recommendation.title, projectName);
      const previous = projectDraftsFromStorage(
        JSON.parse(window.localStorage.getItem(projectWorkspaceStorageKey) ?? '[]'),
      );
      const next = [draft, ...previous].slice(0, 20);
      window.localStorage.setItem(
        projectWorkspaceStorageKey,
        JSON.stringify(next),
      );
      setDrafts(next);
      setSaved(true);
    } catch {
      // Storage can be unavailable in a private browsing session. The enquiry
      // path remains available without saving anything.
    }
  };
  const openDraft = (draft: ProjectDraft) => {
    setMaterial(draft.material);
    setGoal(draft.goal);
    setCapacity(draft.capacity);
    setPriority(draft.priority);
    setProjectName(draft.name);
    setSaved(true);
  };
  const removeDraft = (id: string) => {
    const next = drafts.filter((draft) => draft.id !== id);
    try {
      window.localStorage.setItem(projectWorkspaceStorageKey, JSON.stringify(next));
    } catch {
      return;
    }
    setDrafts(next);
  };
  const passportHref =
    recommendation && material && goal && capacity && priority
      ? projectPassportHref(
          locale,
          createProjectDraft(
            { material, goal, capacity, priority },
            recommendation.title,
            projectName,
          ),
        )
      : '#solution-finder';
  const downloadSpecification = () => {
    if (!recommendation || !summary) return;
    const lines = [
      locale === 'en' ? 'Unirise preliminary specification brief' : '合軒科技初步規格摘要',
      '',
      `${locale === 'en' ? 'Project' : '專案'}: ${projectName.trim() || recommendation.title}`,
      `${locale === 'en' ? 'Recommended discussion' : '建議優先討論'}: ${recommendation.title}`,
      `${locale === 'en' ? 'Initial configuration' : '初步設定'}: ${summary}`,
      ...(recommendation.configuration ?? []),
      '',
      locale === 'en'
        ? 'This is a preliminary discussion brief, not a formal quotation or final technical specification.'
        : '本文件為初步討論摘要，並非正式報價或最終技術規格。',
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'unirise-project-brief.txt';
    anchor.click();
    URL.revokeObjectURL(url);
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
  const restartFrom = (step: number) => {
    if (step <= 0) setMaterial('');
    if (step <= 1) setGoal('');
    if (step <= 2) setCapacity('');
    if (step <= 3) setPriority('');
    setSaved(false);
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
      <ol className="solution-finder-progress" aria-label={text.title}>
        {[text.product, text.goal, text.capacity, text.priority].map((label, index) => (
          <li
            className={index < completedSteps ? 'complete' : index === completedSteps ? 'active' : ''}
            key={label}
          >
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="solution-finder-fields">
        {!material ? (
          <label className="solution-finder-question">
          {text.product}
          <select
            value={material}
            onChange={(event) => {
              setMaterial(event.currentTarget.value as ProjectMaterial | '');
              restartFrom(1);
            }}
          >
            <option value="">{text.select}</option>
            {Object.entries(text.materials).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          </label>
        ) : (
          <button className="solution-finder-answer" type="button" onClick={() => restartFrom(0)}>
            <span>{text.product}</span>
            {text.materials[material]}
          </button>
        )}
        {material && !goal && (
          <label className="solution-finder-question">
          {text.goal}
          <select
            value={goal}
            onChange={(event) => {
              setGoal(event.currentTarget.value as ProjectGoal | '');
              restartFrom(2);
            }}
          >
            <option value="">{text.select}</option>
            {Object.entries(text.goals).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          </label>
        )}
        {goal && (
          <button className="solution-finder-answer" type="button" onClick={() => restartFrom(1)}>
            <span>{text.goal}</span>
            {text.goals[goal]}
          </button>
        )}
        {goal && !capacity && (
          <label className="solution-finder-question">
          {text.capacity}
          <select
            value={capacity}
            onChange={(event) => {
              setCapacity(event.currentTarget.value as ProjectCapacity | '');
              restartFrom(3);
            }}
          >
            <option value="">{text.select}</option>
            {Object.entries(text.capacities).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          </label>
        )}
        {capacity && (
          <button className="solution-finder-answer" type="button" onClick={() => restartFrom(2)}>
            <span>{text.capacity}</span>
            {text.capacities[capacity]}
          </button>
        )}
        {capacity && !priority && (
          <label className="solution-finder-question">
          {text.priority}
          <select
            value={priority}
            onChange={(event) => setPriority(event.currentTarget.value as ProjectPriority | '')}
          >
            <option value="">{text.select}</option>
            {Object.entries(text.priorities).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          </label>
        )}
        {priority && (
          <button className="solution-finder-answer" type="button" onClick={() => restartFrom(3)}>
            <span>{text.priority}</span>
            {text.priorities[priority]}
          </button>
        )}
      </div>
      {recommendation && (
        <div className="solution-finder-result" aria-live="polite">
          <span>{text.results}</span>
          <h3>{recommendation.title}</h3>
          <p>{recommendation.reason}</p>
          <small>
            {text.summary}：{summary}
          </small>
          <ul className="project-configuration">
            {(recommendation.configuration ?? []).map((item) => <li key={item}>{item}</li>)}
          </ul>
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
            <label className="project-name-field">
              {text.projectName}
              <input
                value={projectName}
                maxLength={80}
                onChange={(event) => setProjectName(event.currentTarget.value)}
              />
            </label>
            <div className="project-brief-actions">
              <button type="button" onClick={saveBrief}>
                {saved ? text.saved : text.save}
              </button>
              <button type="button" onClick={copyBrief}>
                {copied ? text.copied : text.copy}
              </button>
              <button type="button" onClick={downloadSpecification}>
                {text.specification}
              </button>
              <a href={passportHref}>{text.passport}</a>
              <a className="original-inquiry-button" href={inquiryHref}>
                {text.bringToInquiry}
              </a>
              <a href={`${locale === 'en' ? '/en/inquiry' : '/inquiry'}?service=1&product=${encodeURIComponent(recommendation.title)}&brief=${encodeURIComponent(summary)}`}>
                {text.service}
              </a>
            </div>
          </aside>
        </div>
      )}
      {drafts.length > 0 && (
        <aside className="project-draft-list" aria-label={text.savedProjects}>
          <strong>{text.savedProjects}</strong>
          {drafts.map((draft) => (
            <div key={draft.id}>
              <span>{draft.name}</span>
              <button type="button" onClick={() => openDraft(draft)}>{text.openDraft}</button>
              <button type="button" onClick={() => removeDraft(draft.id)}>{text.removeDraft}</button>
            </div>
          ))}
        </aside>
      )}
    </section>
  );
}
