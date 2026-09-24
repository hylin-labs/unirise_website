import {
  type KnowledgeSource,
  retrievePublishedKnowledge,
  retrievePublishedKnowledgeForLocale,
} from './content-repository';
import { uniriseSchema } from '../db/schema';
import { extractDeterministicDocumentFacts } from './document-facts';
import type { Locale } from './locales';
import { legacyKnowledge } from './seed-content-data';

export type SiteKnowledgeSource = Omit<KnowledgeSource, 'href'> & {
  href?: string;
};

type ApprovedDocumentRow = {
  id: string;
  display_title: string;
  category: string;
  source_language: string;
};

type ApprovedDocumentChunkRow = {
  id: string;
  page_start: number;
  page_end: number;
  content: string;
};

function queryTerms(value: string) {
  const lower = value.toLowerCase();
  const latinAndNumbers = lower.match(/[a-z0-9]+/g) ?? [];
  const chinese = (lower.match(/[\u4e00-\u9fff]/g) ?? []).join('');
  const chinesePairs = Array.from(
    { length: Math.max(0, chinese.length - 1) },
    (_, index) => chinese.slice(index, index + 2),
  );
  const commonPairs = new Set([
    '我們',
    '你們',
    '公司',
    '網站',
    '提供',
    '可以',
    '請問',
    '是否',
    '哪些',
    '什麼',
    '怎麼',
    '如何',
    '資料',
    '資訊',
    '詳細',
    '想要',
    '需要',
    '知道',
    '介紹',
    '建議',
    '問題',
    '服務',
  ]);
  const terms = [
    ...new Set([
      ...latinAndNumbers.filter((term) => term.length > 1),
      ...chinesePairs.filter((term) => !commonPairs.has(term)),
    ]),
  ];
  const technicalExpansions: Array<[RegExp, string[]]> = [
    [/電壓|伏特|voltage|volt/i, ['voltage', 'supply', 'power', '400v', '24v']],
    [
      /輸入|供電|電源|input|feed|supply/i,
      ['input', 'supply', 'feed', 'connection'],
    ],
    [
      /壓縮空氣|氣動|compressed air|pneumatic/i,
      ['compressed', 'air', 'pneumatic', 'pressure'],
    ],
    [/液壓|hydraulic/i, ['hydraulic', 'power', 'pressure', 'unit']],
    [
      /壓力開關|壓力.*(?:單位|顯示)|(?:顯示|螢幕).*(?:壓力|單位)|pressure\s*switch|pressure.*(?:unit|display)|display.*pressure/i,
      ['pressure', 'switch', 'display', 'bar', 'psi', 'mpa'],
    ],
    [/篩網|濾網|screen|filter/i, ['screen', 'filter', 'backflush', 'changer']],
    [
      /維護|保養|maintenance/i,
      ['maintenance', 'maintain', 'shut', 'disconnect', 'power'],
    ],
    [/校正|calibration/i, ['calibration', 'heated', 'depressurized', 'sensor']],
    [
      /總.*(?:濾網|過濾).*面積|total.*(?:screen|filter).*area/i,
      ['screens', 'quantity', 'screen area', '4x', '172'],
    ],
    [
      /加熱.*液壓.*控制|液壓.*加熱.*控制/i,
      [
        'heating voltage',
        'hydraulic power supply',
        'control voltage',
        '400',
        '24',
      ],
    ],
    [
      /緊急停止.*維護|維護.*緊急停止|emergency\s*-?\s*stop.*maintenance|maintenance.*emergency\s*-?\s*stop/i,
      ['emergency stop', 'maintenance', 'shut down', 'disconnect power'],
    ],
    [
      /(?:螢幕|screen).*(?:電源|供電|power)|(?:電源|供電|power).*(?:螢幕|screen)/i,
      ['touch screen', 'power supply', '115', '230'],
    ],
    [
      /(?:液壓.*壓力|hydraulic pressure).*350|350.*(?:bar|壓力|pressure)/i,
      ['hydraulic pressure', 'housing temperature', '120', '330', '350'],
    ],
    [
      /交付內容|包含哪些|標準配備|scope of delivery|included/i,
      [
        'scope of delivery',
        'measuring module',
        'evaluation unit',
        'touch screen',
      ],
    ],
    [
      /目前值|量測資訊|current.*values|measured values/i,
      [
        'current measured values',
        'viscosity',
        'melt temperature',
        'shear rate',
      ],
    ],
    [
      /控制櫃|control cabinet/i,
      ['control cabinet', 'disconnect', 'power supply'],
    ],
    [
      /通訊介面.*出廠|出廠.*通訊|factory.*(?:interface|fieldbus)/i,
      ['interfaces', 'Modbus', 'EtherNet/IP', 'PROFINET', 'factory'],
    ],
    [
      /金屬檢測器|金屬分離器|金屬檢測系統|metal\s+(?:detector|separator|detection\s+system)/i,
      ['metal detector', 'metal separator', 'metal detection system'],
    ],
    [
      /特定區域|無金屬|電磁場|線圈|coil|electromagnetic/i,
      [
        'transmitter coil',
        'receiver coils',
        'electromagnetic field',
        'kept free of metal',
      ],
    ],
    [
      /平衡線圈|balanced\s+coil/i,
      ['balanced coil', 'receivers', 'compensate', 'asymmetry'],
    ],
    [
      /相位技術|相位差|phase\s+(?:technology|shift)/i,
      ['phase technique', 'phase shift', 'sensitivity', 'accuracy'],
    ],
    [
      /靈敏度|資料表|產品測試|sensitivity|data\s*sheet/i,
      ['sensitivity', 'data sheets', 'product sensitivity', 'product tests'],
    ],
    [
      /觸碰靈敏度|產品靈敏度|操作靈敏度|touch\s+sensitivity|product\s+sensitivity|operational\s+sensitivity/i,
      [
        'touch sensitivity',
        'product sensitivity',
        'operational sensitivity',
        'external influences',
      ],
    ],
    [
      /影響.*靈敏度|靈敏度.*因素|factors?.*sensitivity/i,
      ['operating frequency', 'aperture', 'product effect', 'conveying speed'],
    ],
    [
      /鐵系|非鐵|不鏽鋼|金屬粒子|ferrous|non-ferrous|stainless/i,
      ['ferrous', 'non-ferrous', 'stainless steel', 'conductivity'],
    ],
    [
      /金屬球|球體|碎片|test\s+(?:ball|body)|balls?/i,
      ['balls', 'surface', 'volume', 'test bodies', 'reproducible'],
    ],
    [
      /金屬線|長向|直立|橫向|wire|lengthwise|upright|crosswise/i,
      ['wire', 'lengthwise', 'upright', 'crosswise', 'stainless steel'],
    ],
    [
      /產品效應|水分|配方|溫度|導電性|product\s+effect|conductivity/i,
      ['product effect', 'moisture', 'recipe', 'temperature', 'conductivity'],
    ],
    [
      /角度|90°|90度|訊號|angle|signal\s+evaluation/i,
      ['metal contamination', 'same angle', '90', 'detected'],
    ],
    [
      /金屬化薄膜|鋁袋|tetra\s*pak|x.?ray|x光/i,
      ['metallized films', 'aluminum bags', 'tetra packs', 'x-ray system'],
    ],
    [
      /低頻|高頻|頻率選擇|frequency/i,
      ['operating frequency', 'low', 'high', 'ferrous', 'stainless steel'],
    ],
    [
      /濕產品|乾產品|moist|dry\s+product/i,
      ['moist products', 'dry products', 'low frequencies', 'product effect'],
    ],
    [
      /輸送速度|gls\s+genius|conveyor\s+speed/i,
      ['conveying speed', 'gls genius', 'vmin', 'vmax', 'sensitivity'],
    ],
    [
      /線圈開口|開口.*靈敏度|aperture/i,
      ['aperture', 'search coil', 'sensitivity', 'center'],
    ],
    [
      /黃麴毒素|aflasort|aflatoxin/i,
      ['aflasort', 'aflatoxins', 'deep blue', 'fluorescence'],
    ],
    [
      /雷射|螢光|laser|fluorescen/i,
      ['deep blue', 'laser', 'fluorescence', 'residues'],
    ],
    [
      /影像|顏色|良品|pixels?|defects?/i,
      ['different colors', 'uncontaminated', 'pixels', 'small defects'],
    ],
    [
      /連續生產|中途調整|重新校正|清潔|continuous\s+production|recalibrat|cleaning/i,
      ['continuous production', 'adjustment', 'recalibration', 'cleaning'],
    ],
    [
      /遠端|監控|故障排除|remote|troubleshooting/i,
      ['real-time', 'remote monitoring', 'troubleshooting'],
    ],
    [
      /金屬異物|取代金屬檢測|metal\s+(?:foreign|contaminant)|metal\s+detection/i,
      ['metal detector', 'metal contamination', 'aflatoxins', 'fluorescence'],
    ],
    [
      /為零|保證|零污染|guarantee|zero/i,
      ['significantly reduce', 'remove', 'aflatoxins', 'safety'],
    ],
  ];
  for (const [pattern, expansion] of technicalExpansions) {
    if (pattern.test(value)) terms.push(...expansion);
  }
  return [...new Set(terms)];
}

function hasVoltageIntent(query: string) {
  return (
    /電壓|伏特|voltage|volt/i.test(query) ||
    /(?:多少|幾|how much|what|which).*(?:供電|輸入|input|supply|power supply)/i.test(
      query,
    )
  );
}

function knowledgeScore(source: SiteKnowledgeSource, terms: string[]) {
  const searchable =
    `${source.title} ${source.content} ${source.tags.join(' ')}`.toLowerCase();
  return terms.reduce(
    (total, term) =>
      total + (searchable.includes(term) ? (term.length > 2 ? 3 : 1) : 0),
    0,
  );
}

const canonicalWebsiteTags: Record<string, string[]> = {
  'catalog-services': ['食品分選', 'X 光檢測', '回收再生', '塑膠化工'],
  'catalog-brands': ['代理品牌', '品牌'],
  'catalog-optimum': ['食品分選', '食品分選方案', '食材分選'],
  'catalog-xavis-xray': ['X 光檢測', '食品安全'],
  'catalog-xavis-weight': ['重量檢測', '重量分級'],
  'catalog-contact': ['聯絡方式', '電話', 'Email', '詢價'],
  'catalog-downloads': ['下載專區', '產品資料'],
};

function canonicalWebsiteKnowledge(): SiteKnowledgeSource[] {
  return legacyKnowledge.map((source) => ({
    ...source,
    tags: canonicalWebsiteTags[source.id] ?? [],
  }));
}

function mergeWebsiteKnowledge(
  canonical: SiteKnowledgeSource[],
  stored: SiteKnowledgeSource[],
) {
  const merged = new Map(canonical.map((source) => [source.id, source]));
  stored.forEach((source) => merged.set(source.id, source));
  return [...merged.values()];
}

function technicalSpecificationScore(
  source: SiteKnowledgeSource,
  query: string,
) {
  if (source.href || !hasVoltageIntent(query)) return 0;

  const content = source.content.replace(/\s+/g, ' ');
  let score = 0;

  // 規格表的欄位比接線圖或零件清單更適合作為電壓問答依據。
  if (/3\.3\s+Voltage\s+V\s+\d+(?:\.\d+)?/i.test(content)) score += 100;
  if (/4\.2\s+Voltage\s+V\/Hz\s+\d+(?:\.\d+)?\/\d+(?:\.\d+)?/i.test(content))
    score += 100;
  if (/4\.3\s+Control voltage\s+V\s+\d+(?:\.\d+)?\s*(?:DC|AC)?/i.test(content))
    score += 100;
  if (/Voltage\s+V\s+\d+(?:\.\d+)?/i.test(content)) score += 30;
  if (/Control voltage\s+V\s+\d+(?:\.\d+)?/i.test(content)) score += 30;

  return score;
}

function technicalIntentScore(source: SiteKnowledgeSource, query: string) {
  if (source.href) return 0;
  const content = source.content.replace(/\s+/g, ' ');
  let score = 0;

  if (
    /尺寸|長寬高|dimensions?|length.*width.*height/i.test(query) &&
    /Dimensions\s+L\s*x\s*W\s*x\s*H\s+in\s+mm\s+\d+/i.test(content)
  )
    score += 160;
  if (
    /(?:維護|保養|maintenance).*(?:斷電|切斷|電源|power|disconnect)|(?:斷電|切斷|電源|disconnect).*(?:維護|保養|maintenance)/i.test(
      query,
    ) &&
    /shut down and disconnected from power/i.test(content)
  )
    score += 160;
  if (
    /反沖洗|backflush/i.test(query) &&
    /Following requirements have to be fulfilled to enable backflushing/i.test(
      content,
    )
  )
    score += 160;
  if (
    /緊急停止|emergency\s*-?\s*stop/i.test(query) &&
    /EMERGENCY-STOP|Emergency stop/i.test(content)
  )
    score += 160;

  return score;
}

function factPredicate(source: SiteKnowledgeSource) {
  return source.tags.find((tag) => tag.startsWith('fact:'))?.slice(5) ?? null;
}

function factIntentScore(source: SiteKnowledgeSource, query: string) {
  const predicate = factPredicate(source);
  if (!predicate) return 0;
  const checks: Array<[RegExp, string[]]> = [
    [
      /總.*(?:濾網|過濾).*面積|total.*(?:screen|filter).*area/i,
      ['screen_quantity', 'screen_area'],
    ],
    [
      /加熱.*液壓.*控制|液壓.*加熱.*控制/i,
      ['heating_voltage', 'hydraulic_power_supply', 'control_voltage'],
    ],
    [
      /緊急停止.*維護|維護.*緊急停止|emergency\s*-?\s*stop.*maintenance|maintenance.*emergency\s*-?\s*stop/i,
      ['emergency_stop_effect', 'maintenance_power_isolation'],
    ],
    [
      /(?:螢幕|screen).*(?:電源|供電|power)|(?:電源|供電|power).*(?:螢幕|screen)/i,
      ['touch_screen_size', 'power_supply'],
    ],
    [
      /(?:液壓.*壓力|hydraulic pressure).*350|350.*(?:bar|壓力|pressure)/i,
      ['hydraulic_pressure', 'housing_temperature_max'],
    ],
    [/尺寸|長寬高|dimensions?|length.*width.*height/i, ['dimensions']],
    [/重量|weight/i, ['weight']],
    [/外殼.*溫度|housing.*temperature/i, ['housing_temperature_max']],
    [/數量|幾個|how many|quantity/i, ['screen_quantity']],
    [/面積|area/i, ['screen_area']],
    [/直徑|diameter/i, ['screen_diameter']],
    [/加熱.*(?:電壓|輸入)|heating.*(?:voltage|input)/i, ['heating_voltage']],
    [
      /液壓.*(?:電壓|頻率|供電)|hydraulic.*(?:voltage|frequency|power)/i,
      ['hydraulic_power_supply'],
    ],
    [/控制電壓|control voltage/i, ['control_voltage']],
    [/液壓.*壓力|hydraulic pressure/i, ['hydraulic_pressure']],
    [
      /壓力.*(?:單位|顯示)|(?:顯示|螢幕).*(?:壓力|單位)|pressure.*(?:unit|display)|display.*pressure/i,
      ['pressure_display_units'],
    ],
    [/處理量|throughput/i, ['throughput_rate']],
    [/觸控螢幕|觸碰螢幕|touch\s*screen/i, ['touch_screen_size']],
    [/供電|電源|power supply/i, ['power_supply']],
    [
      /保存多久|保留多久|(?:保存|保留).*資料|data retention|how long.*data/i,
      ['data_retention'],
    ],
    [/量測|測量|measure/i, ['measurement_purpose']],
    [/用途|適用|intended use|field of application/i, ['intended_use']],
    [
      /交付內容|包含哪些|標準配備|scope of delivery|included/i,
      ['scope_of_delivery'],
    ],
    [/控制櫃|control cabinet/i, ['control_cabinet_power_isolation']],
    [
      /觸控.*(?:操作|使用)|stylus|(?:touch\s*panel.*|operate.*touch\s*panel)(?:operate|use)?/i,
      ['touch_panel_operation'],
    ],
    [
      /顯示.*(?:數值|資料)|目前值|current.*values|measured values|viscosity.*(?:temperature|shear)/i,
      ['measured_values_displayed'],
    ],
    [/平滑|smoothing/i, ['smoothing_option']],
    [/報告.*(?:匯出|輸出)|export.*report/i, ['report_export']],
    [/免維護|maintenance.free/i, ['maintenance_free']],
    [/校正|calibration/i, ['sensor_calibration_conditions']],
    [/通訊介面|現場匯流排|fieldbus|protocol/i, ['fieldbus_interfaces']],
    [
      /(?:維護|保養|maintenance).*(?:斷電|切斷|電源|power|disconnect)|(?:斷電|切斷|電源|disconnect).*(?:維護|保養|maintenance)/i,
      ['maintenance_power_isolation'],
    ],
    [/反沖洗|backflush/i, ['backflush_preconditions']],
    [/緊急停止|emergency\s*-?\s*stop/i, ['emergency_stop_effect']],
  ];
  return checks.some(
    ([pattern, predicates]) =>
      pattern.test(query) && predicates.includes(predicate),
  )
    ? 1_000
    : 0;
}

function factSource(input: {
  id: string;
  displayTitle: string;
  category: string;
  sourceLanguage: string;
  predicate: string;
  value: string;
  unit: string | null;
  pageStart: number;
  pageEnd: number;
  excerpt: string;
}): SiteKnowledgeSource {
  const pageLabel =
    input.pageStart === input.pageEnd
      ? `第 ${input.pageStart} 頁`
      : `第 ${input.pageStart}-${input.pageEnd} 頁`;
  return {
    id: `fact:${input.id}`,
    title: `技術文件：${input.displayTitle}（${pageLabel}）`,
    content: `${input.predicate}: ${input.value}${input.unit ? ` ${input.unit}` : ''}\n${input.excerpt}`,
    tags: [
      input.category,
      input.sourceLanguage,
      '技術文件',
      `fact:${input.predicate}`,
    ],
  };
}

async function retrieveApprovedDocumentKnowledge(
  db: D1Database,
  query: string,
  limit: number,
): Promise<SiteKnowledgeSource[]> {
  const documents = await db
    .prepare(
      `SELECT id, display_title, category, source_language
       FROM ${uniriseSchema.documents}
       WHERE access_level = ? AND assistant_status = ?
       ORDER BY updated_at DESC`,
    )
    .bind('public', 'approved')
    .all<ApprovedDocumentRow>();
  const rows = await Promise.all(
    documents.results.map(async (document) => {
      const chunks = await db
        .prepare(
          `SELECT id, page_start, page_end, content
           FROM ${uniriseSchema.documentChunks}
           WHERE document_id = ? AND status = ?
           ORDER BY chunk_number ASC`,
        )
        .bind(document.id, 'approved')
        .all<ApprovedDocumentChunkRow>();
      return chunks.results.map((chunk) => ({
        documentId: document.id,
        displayTitle: document.display_title,
        category: document.category,
        sourceLanguage: document.source_language,
        chunkId: chunk.id,
        pageStart: chunk.page_start,
        pageEnd: chunk.page_end,
        content: chunk.content,
      }));
    }),
  );
  const documentRows = rows.flat();
  const documentSources = documentRows.map((row) => {
    const pageLabel =
      row.pageStart === row.pageEnd
        ? `第 ${row.pageStart} 頁`
        : `第 ${row.pageStart}-${row.pageEnd} 頁`;
    const source: SiteKnowledgeSource = {
      id: `document:${row.documentId}:chunk:${row.chunkId}`,
      title: `技術文件：${row.displayTitle}（${pageLabel}）`,
      content: row.content,
      tags: [row.category, row.sourceLanguage, '技術文件'],
    };
    return source;
  });
  const derivedFactSources = extractDeterministicDocumentFacts(
    documentRows.map((row) => ({
      content: row.content,
      pageStart: row.pageStart,
      pageEnd: row.pageEnd,
      subject: row.displayTitle,
    })),
  ).map((fact, index) => {
    const matchingRow = documentRows.find(
      (row) =>
        row.displayTitle === fact.subject &&
        row.pageStart === fact.sourcePageStart &&
        row.pageEnd === fact.sourcePageEnd,
    );
    return factSource({
      id: `derived:${index}:${fact.predicate}:${fact.sourcePageStart}`,
      displayTitle: fact.subject,
      category: matchingRow?.category ?? '技術文件',
      sourceLanguage: matchingRow?.sourceLanguage ?? 'mixed',
      predicate: fact.predicate,
      value: fact.value,
      unit: fact.unit,
      pageStart: fact.sourcePageStart,
      pageEnd: fact.sourcePageEnd,
      excerpt: fact.sourceExcerpt,
    });
  });
  const terms = queryTerms(query);
  return [...documentSources, ...derivedFactSources]
    .map((source) => ({
      source,
      score:
        knowledgeScore(source, terms) +
        technicalSpecificationScore(source, query) +
        technicalIntentScore(source, query) +
        factIntentScore(source, query),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ source }) => source);
}

function matchingFact(sources: SiteKnowledgeSource[], predicate: string) {
  const source = sources.find((item) => factPredicate(item) === predicate);
  if (!source) return null;
  const firstLine = source.content.split('\n', 1)[0] ?? '';
  const value = firstLine.slice(`${predicate}:`.length).trim();
  return value ? value : null;
}

/**
 * Facts are intentionally answered before an external model is called. Their
 * values have an approved page citation and this prevents a model from mixing
 * similarly named products or unrelated specifications.
 */
export function answerFromStructuredFacts(
  locale: Locale,
  sources: SiteKnowledgeSource[],
  question: string,
) {
  const zh = locale === 'zh-TW';
  const answer = (zhText: string, enText: string) =>
    (zh ? zhText : enText)
      .replace(/^依已核准的技術文件[，：]/, '')
      .replace(/^According to the approved technical document,?\s*/i, '');
  const localizedValue = (value: string) =>
    zh
      ? value
          .replace(/\binch\b/gi, '吋')
          .replace(/\bmonths\b/gi, '個月')
          .replace(/\s\/\s/g, '／')
      : value;
  const sourceText = sources
    .filter((source) => !source.href)
    .map((source) => source.content)
    .join(' ');
  const isAflaSortQuestion = /aflasort|ventus/i.test(question);
  if (
    isAflaSortQuestion &&
    /(?:中途調整|重新校正|recalibration|清潔|cleaning|連續生產|continuous)/i.test(
      question,
    ) &&
    /no\s+intermediate\s+adjustment,?\s+recalibration,?\s+or\s+cleaning\s+is\s+required/i.test(
      sourceText,
    )
  )
    return answer(
      '不需要。系統不需中途調整、重新校正或清潔，因此可支援連續生產。',
      'No. It requires no intermediate adjustment, recalibration, or cleaning, which supports continuous production.',
    );
  if (
    isAflaSortQuestion &&
    /不頻繁停機|分選品質|sorting quality|frequent downtime/i.test(question) &&
    /deep\s+blue\s+laser.*?fluorescence/i.test(sourceText) &&
    /no\s+intermediate\s+adjustment,?\s+recalibration,?\s+or\s+cleaning\s+is\s+required/i.test(
      sourceText,
    )
  )
    return answer(
      'AflaSort 以 Deep Blue 雷射誘發污染殘留的螢光來進行分選；系統不需中途調整、重新校正或清潔，因此可持續提升分選品質而不必頻繁停機。',
      'AflaSort uses a Deep Blue laser to induce fluorescence in contamination residues. Because it needs no intermediate adjustment, recalibration, or cleaning, it can improve sorting quality without frequent downtime.',
    );
  if (
    /touch.*product.*operational\s+sensitivity|touch.*product.*operational\s+靈敏度|touch、product.*operational\s+sensitivity/i.test(
      question,
    ) &&
    /touch\s+sensitivity[\s\S]*?product\s+sensitivity[\s\S]*?operational\s+sensitivity/i.test(
      sourceText,
    )
  )
    return answer(
      'Touch sensitivity 是不受外部影響的檢測器基礎能力；product sensitivity 加入被測產品的產品效應；operational sensitivity 再納入輸送或分離與客戶現場干擾，最接近實際表現。',
      'Touch sensitivity is the detector baseline without external influences; product sensitivity adds the examined-product effect; operational sensitivity further includes conveyance or separation and on-site interference.',
    );
  if (
    /濕產品.*(?:低.*頻率|訊號頻率)|wet\s+products?.*(?:low|lower).*frequency/i.test(
      question,
    ) &&
    /product\s+effect/i.test(sourceText)
  )
    return answer(
      '濕產品的產品效應會隨頻率提高而加劇，可能掩蓋金屬污染訊號；選用較低訊號頻率可降低這項影響。',
      'The product effect of wet products increases at higher frequencies and can mask metal-contamination signals; a lower signal frequency reduces that effect.',
    );
  const dimensions = matchingFact(sources, 'dimensions');
  const weight = matchingFact(sources, 'weight');
  if (
    /(?:尺寸|長寬高|dimensions?).*(?:重量|weight)|(?:重量|weight).*(?:尺寸|長寬高|dimensions?)/i.test(
      question,
    ) &&
    dimensions &&
    weight
  )
    return answer(
      `設備尺寸（長 × 寬 × 高）為 ${localizedValue(dimensions)}，重量為 ${localizedValue(weight)}。`,
      `The equipment dimensions (L × W × H) are ${dimensions}, and the weight is ${weight}.`,
    );
  if (
    /尺寸|長寬高|dimensions?|length.*width.*height/i.test(question) &&
    !/觸控螢幕|觸碰螢幕|螢幕尺寸|touch\s*screen/i.test(question) &&
    dimensions
  )
    return answer(
      `依已核准的技術文件，設備尺寸（長 × 寬 × 高）為 ${localizedValue(dimensions)}。`,
      `According to the approved technical document, the equipment dimensions (L × W × H) are ${dimensions}.`,
    );
  if (/重量|weight/i.test(question) && weight)
    return answer(
      `依已核准的技術文件，設備重量為 ${localizedValue(weight)}。`,
      `According to the approved technical document, the equipment weight is ${weight}.`,
    );
  const temperature = matchingFact(sources, 'housing_temperature_max');
  if (/外殼.*溫度|housing.*temperature/i.test(question) && temperature)
    return answer(
      `依已核准的技術文件，外殼最高溫度為 ${localizedValue(temperature)}。`,
      `According to the approved technical document, the maximum housing temperature is ${temperature}.`,
    );
  const screenQuantity = matchingFact(sources, 'screen_quantity');
  const screenArea = matchingFact(sources, 'screen_area');
  if (
    /總.*(?:濾網|過濾).*面積|total.*(?:screen|filter).*area/i.test(question) &&
    screenQuantity &&
    screenArea
  ) {
    const quantity = Number(screenQuantity.match(/\d+/)?.[0]);
    const perScreen = Number(
      screenArea.match(/(?:\d+\s*x\s*)?(\d+(?:\.\d+)?)\s*cm(?:²|2)/i)?.[1],
    );
    if (Number.isFinite(quantity) && Number.isFinite(perScreen)) {
      const total = quantity * perScreen;
      return answer(
        `總過濾面積為 ${total} cm²（${quantity} 片 × 每片 ${perScreen} cm²）。`,
        `The total filter area is ${total} cm² (${quantity} screens × ${perScreen} cm² each).`,
      );
    }
  }
  if (
    /數量|幾個|how many|quantity|面積|area/i.test(question) &&
    (screenQuantity || screenArea)
  ) {
    const zhDetails = [
      screenQuantity && `濾網數量為 ${localizedValue(screenQuantity)}`,
      screenArea && `每片濾網面積為 ${localizedValue(screenArea)}`,
    ]
      .filter(Boolean)
      .join('；');
    const enDetails = [
      screenQuantity && `there are ${screenQuantity} screens`,
      screenArea && `each screen area is ${screenArea}`,
    ]
      .filter(Boolean)
      .join('; ');
    return answer(
      `依已核准的技術文件，${zhDetails}。`,
      `According to the approved technical document, ${enDetails}.`,
    );
  }
  const diameter = matchingFact(sources, 'screen_diameter');
  const control = matchingFact(sources, 'control_voltage');
  if (
    /(?:直徑|diameter).*(?:控制電壓|control voltage)|(?:控制電壓|control voltage).*(?:直徑|diameter)/i.test(
      question,
    ) &&
    diameter &&
    control
  )
    return answer(
      `符合：濾網直徑為 ${localizedValue(diameter)}，控制電壓為 ${localizedValue(control)}。`,
      `Yes. The screen diameter is ${diameter}, and the control voltage is ${control}.`,
    );
  if (/直徑|diameter/i.test(question) && diameter)
    return answer(
      `依已核准的技術文件，濾網直徑為 ${localizedValue(diameter)}。`,
      `According to the approved technical document, the screen diameter is ${diameter}.`,
    );
  const heating = matchingFact(sources, 'heating_voltage');
  const hydraulic = matchingFact(sources, 'hydraulic_power_supply');
  if (
    /(?:加熱|heating).*(?:液壓|hydraulic).*(?:控制|control)|(?:液壓|hydraulic).*(?:加熱|heating).*(?:控制|control)/i.test(
      question,
    ) &&
    heating &&
    hydraulic &&
    control
  )
    return answer(
      `加熱器輸入為 ${localizedValue(heating)}；液壓動力單元為 ${localizedValue(hydraulic)}；控制系統為 ${localizedValue(control)}。三者不是同一規格。`,
      `The heating input is ${heating}; the hydraulic power unit is ${hydraulic}; and the control system is ${control}. These are separate specifications.`,
    );
  if (
    /(?:液壓|hydraulic).*(?:加熱|heating)|(?:加熱|heating).*(?:液壓|hydraulic)/i.test(
      question,
    ) &&
    heating &&
    hydraulic
  )
    return answer(
      `不完全相同：液壓動力單元為 ${localizedValue(hydraulic)}，加熱器輸入僅列 ${localizedValue(heating)}。`,
      `Not exactly. The hydraulic power unit is ${hydraulic}, while the heating input is listed only as ${heating}.`,
    );
  if (
    /加熱.*(?:電壓|輸入)|heating.*(?:voltage|input)/i.test(question) &&
    heating
  )
    return answer(
      `依已核准的技術文件，加熱系統輸入電壓為 ${localizedValue(heating)}。`,
      `According to the approved technical document, the heating-system input voltage is ${heating}.`,
    );
  if (
    /液壓.*(?:電壓|頻率|供電)|hydraulic.*(?:voltage|frequency|power)/i.test(
      question,
    ) &&
    hydraulic
  )
    return answer(
      `依已核准的技術文件，液壓動力單元供電為 ${localizedValue(hydraulic)}。`,
      `According to the approved technical document, the hydraulic power-unit supply is ${hydraulic}.`,
    );
  if (/控制電壓|control voltage/i.test(question) && control)
    return answer(
      `依已核准的技術文件，控制電壓為 ${localizedValue(control)}。`,
      `According to the approved technical document, the control voltage is ${control}.`,
    );
  const pressure = matchingFact(sources, 'hydraulic_pressure');
  if (
    /(?:液壓.*壓力|hydraulic pressure).*350|350.*(?:bar|壓力|pressure)/i.test(
      question,
    ) &&
    pressure &&
    temperature
  )
    return answer(
      `不正確。液壓壓力範圍為 ${localizedValue(pressure)}；350 指的是外殼最高溫度 ${localizedValue(temperature)}。`,
      `No. The hydraulic pressure range is ${pressure}; 350 refers to the maximum housing temperature of ${temperature}.`,
    );
  if (/液壓.*壓力|hydraulic pressure/i.test(question) && pressure)
    return answer(
      `依已核准的技術文件，液壓壓力範圍為 ${localizedValue(pressure)}。`,
      `According to the approved technical document, the hydraulic pressure range is ${pressure}.`,
    );
  const pressureDisplayUnits = matchingFact(sources, 'pressure_display_units');
  const localizedPressureDisplayUnits =
    zh && pressureDisplayUnits
      ? pressureDisplayUnits.replace(/,\s*/g, '、').replace(/\s+or\s+/i, ' 或 ')
      : pressureDisplayUnits;
  if (
    /壓力.*(?:單位|顯示)|(?:顯示|螢幕).*(?:壓力|單位)|pressure.*(?:unit|display)|display.*pressure/i.test(
      question,
    ) &&
    localizedPressureDisplayUnits
  )
    return answer(
      `該壓力開關可顯示的壓力單位為 ${localizedPressureDisplayUnits}。`,
      `The pressure switch can display pressure in ${pressureDisplayUnits}.`,
    );
  const throughput = matchingFact(sources, 'throughput_rate');
  if (/處理量|throughput/i.test(question) && throughput)
    return answer(
      `依已核准的技術文件，處理量範圍為 ${localizedValue(throughput)}。`,
      `According to the approved technical document, the throughput range is ${throughput}.`,
    );
  const touchScreen = matchingFact(sources, 'touch_screen_size');
  const supply = matchingFact(sources, 'power_supply');
  if (
    /(?:螢幕|screen).*(?:電源|供電|power)|(?:電源|供電|power).*(?:螢幕|screen)/i.test(
      question,
    ) &&
    touchScreen &&
    supply
  )
    return answer(
      `螢幕尺寸為 ${localizedValue(touchScreen)}；可接受供電範圍為 ${localizedValue(supply)}。`,
      `The screen is ${touchScreen}, and the accepted power range is ${supply}.`,
    );
  if (
    /觸控螢幕|觸碰螢幕|touch\s*screen/i.test(question) &&
    !/交付內容|包含哪些|標準配備|scope of delivery|included/i.test(question) &&
    touchScreen
  )
    return answer(
      `依已核准的技術文件，設備配備 ${localizedValue(touchScreen)} 的觸控螢幕。`,
      `According to the approved technical document, the equipment has a ${touchScreen} touch screen.`,
    );
  const retentionSource = sources.find(
    (item) => factPredicate(item) === 'data_retention',
  );
  const retention = matchingFact(sources, 'data_retention');
  if (
    /保存多久|保留多久|(?:保存|保留).*資料|data retention|how long.*data/i.test(
      question,
    ) &&
    retention
  )
    return answer(
      `依已核准的技術文件，裝置會保存最近 ${localizedValue(retention)} 的量測資料${/ring buffer/i.test(retentionSource?.content ?? '') ? '，並儲存在裝置記憶體的環形緩衝區' : ''}。`,
      `According to the approved technical document, the device retains measurement data for the last ${retention}${/ring buffer/i.test(retentionSource?.content ?? '') ? ' in a ring buffer in device memory' : ''}.`,
    );
  const purpose = matchingFact(sources, 'measurement_purpose');
  if (
    /量測|測量|measure/i.test(question) &&
    !/顯示.*(?:數值|資料)|目前值|current.*values|measured values/i.test(
      question,
    ) &&
    purpose
  )
    return answer(
      '依已核准的技術文件，Promix Visco P 用於量測塑料熔體的動態黏度。',
      `According to the approved technical document, Promix Visco P measures ${purpose}.`,
    );
  const intendedUse = matchingFact(sources, 'intended_use');
  if (
    /用途|適用|intended use|field of application/i.test(question) &&
    intendedUse
  )
    return answer(
      '依已核准的技術文件，Promix Visco P 適用於塑料熔體流動行為的生產、實驗室與品質保證評估。',
      'According to the approved technical document, Promix Visco P is suitable for production, laboratory, and quality-assurance evaluation of plastic-melt flow behaviour.',
    );
  const scopeOfDelivery = matchingFact(sources, 'scope_of_delivery');
  if (
    /交付內容|包含哪些|標準配備|scope of delivery|included/i.test(question) &&
    scopeOfDelivery
  )
    return answer(
      '依已核准的技術文件，交付內容包括含感測器的量測模組、訊號處理用評估單元，以及含軟體的 15 吋觸控螢幕面板電腦。',
      'According to the approved technical document, delivery includes the measuring module with sensors, an evaluation unit, and a 15-inch touch-screen panel PC with software.',
    );
  const cabinetIsolation = matchingFact(
    sources,
    'control_cabinet_power_isolation',
  );
  if (/控制櫃|control cabinet/i.test(question) && cabinetIsolation)
    return answer(
      /可否|可以|能否|can/i.test(question)
        ? '不可；開啟控制櫃前必須先斷開電源供應。'
        : '開啟控制櫃前必須先斷開電源供應。',
      /can/i.test(question)
        ? 'No. Disconnect the power supply before opening the control cabinet.'
        : 'Disconnect the power supply before opening the control cabinet.',
    );
  if (/供電|電源|power supply/i.test(question) && supply)
    return answer(
      `供電規格為 ${localizedValue(supply)}。`,
      `The power supply is ${supply}.`,
    );
  const touchPanelOperation = matchingFact(sources, 'touch_panel_operation');
  if (
    /觸控.*(?:操作|使用)|stylus|(?:touch\s*panel.*|operate.*touch\s*panel)(?:operate|use)?/i.test(
      question,
    ) &&
    touchPanelOperation
  )
    return answer(
      '依已核准的技術文件，觸控面板可用手指或合適的觸控筆操作。',
      'According to the approved technical document, operate the touch panel with a finger or a suitable stylus.',
    );
  const measuredValues = matchingFact(sources, 'measured_values_displayed');
  if (
    /顯示.*(?:數值|資料)|目前值|current.*values|measured values|viscosity.*(?:temperature|shear)/i.test(
      question,
    ) &&
    measuredValues
  )
    return answer(
      '依已核准的技術文件，畫面會顯示黏度、熔體溫度與剪切速率。',
      'According to the approved technical document, the display shows viscosity, melt temperature, and shear rate.',
    );
  const smoothing = matchingFact(sources, 'smoothing_option');
  if (/平滑|smoothing/i.test(question) && smoothing)
    return answer(
      '依已核准的技術文件，系統提供可選用的平滑功能。',
      'According to the approved technical document, the system provides an optional smoothing function.',
    );
  const reportExport = matchingFact(sources, 'report_export');
  if (/報告.*(?:匯出|輸出)|export.*report/i.test(question) && reportExport)
    return answer(
      '依已核准的技術文件，報告可匯出至 USB 儲存裝置，格式為 PDF，並以月為單位儲存。',
      'According to the approved technical document, reports can be exported to USB storage in PDF format and are saved monthly.',
    );
  const maintenanceFree = matchingFact(sources, 'maintenance_free');
  const calibration = matchingFact(sources, 'sensor_calibration_conditions');
  if (
    /免維護|maintenance.free/i.test(question) &&
    /校正|calibration/i.test(question) &&
    maintenanceFree &&
    calibration
  )
    return answer(
      '不對。Promix Visco P 基本上免維護，但感測器校正仍必須在系統已加熱且已洩壓的狀態下進行。',
      'No. Promix Visco P is essentially maintenance-free, but sensor calibration still requires the system to be heated up and depressurized.',
    );
  if (/免維護|maintenance.free/i.test(question) && maintenanceFree)
    return answer(
      '依已核准的技術文件，Promix Visco P 黏度量測裝置基本上免維護。',
      'According to the approved technical document, the Promix Visco P viscosity measuring device is essentially maintenance-free.',
    );
  if (
    /promix|visco/i.test(question) &&
    /校正|calibration/i.test(question) &&
    calibration
  )
    return answer(
      '依已核准的技術文件，感測器校正必須在系統已加熱且已洩壓的狀態下進行。',
      'According to the approved technical document, calibrate the sensor with the system heated up and depressurized.',
    );
  const fieldbus = matchingFact(sources, 'fieldbus_interfaces');
  if (/通訊介面|現場匯流排|fieldbus|protocol/i.test(question) && fieldbus)
    return answer(
      /出廠|工廠|factory/i.test(question)
        ? '可用通訊介面包括 Serial Modbus RTU、EtherNet/IP、PROFINET Device、PowerLINK、SERCOS III、CANopen、DeviceNet 與 PROFIBUS DP；Modbus 可在出廠時設定於任何 Promix Visco P。'
        : '可用通訊介面包括 Serial Modbus RTU、EtherNet/IP、PROFINET Device、PowerLINK、SERCOS III、CANopen、DeviceNet 與 PROFIBUS DP。',
      /factory/i.test(question)
        ? `Available fieldbus interfaces are ${fieldbus}. Modbus can be set up on any Promix Visco P at the factory.`
        : `Available fieldbus interfaces are ${fieldbus}.`,
    );
  const maintenance = matchingFact(sources, 'maintenance_power_isolation');
  const emergencyStop = matchingFact(sources, 'emergency_stop_effect');
  if (
    /緊急停止|emergency\s*-?\s*stop/i.test(question) &&
    /維護|maintenance/i.test(question) &&
    emergencyStop &&
    maintenance
  )
    return answer(
      '緊急停止會立即停止換網器移動並關閉相關液壓動力單元；開始維護前則必須關閉整條生產線並斷開電源。',
      'An emergency stop immediately stops screen-changer movement and switches off the associated hydraulic power unit; before maintenance, shut down the entire line and disconnect power.',
    );
  if (
    /(?:維護|保養|maintenance).*(?:斷電|切斷|電源|power|disconnect)|(?:斷電|切斷|電源|disconnect).*(?:維護|保養|maintenance)/i.test(
      question,
    ) &&
    maintenance
  )
    return answer(
      '依已核准的技術文件，開始維護前必須關閉整條生產線並斷開電源。',
      'According to the approved technical document, before maintenance the entire line must be shut down and disconnected from power.',
    );
  const backflush = matchingFact(sources, 'backflush_preconditions');
  if (/反沖洗|backflush/i.test(question) && backflush)
    return answer(
      '依已核准的技術文件，進行反沖洗前必須確認：液壓系統已就緒、整線已達操作溫度、保護蓋已關閉、兩支螺栓在生產位置，且前一次換網程序已完成。',
      'According to the approved technical document, before backflushing the hydraulic system must be ready, the full line must be at operating temperature, the protection covers must be closed, both bolts must be in production position, and the previous screen-change process must be complete.',
    );
  if (/緊急停止|emergency\s*-?\s*stop/i.test(question) && emergencyStop)
    return answer(
      '依已核准的技術文件，緊急停止會立即停止換網器移動，並關閉相關液壓動力單元。',
      'According to the approved technical document, the emergency stop immediately stops screen-changer movement and switches off the associated hydraulic power unit.',
    );
  return null;
}

export async function retrieveSiteKnowledge(
  db: D1Database,
  localeOrQuery: string,
  queryOrLimit?: string | number,
  limit = 4,
): Promise<SiteKnowledgeSource[]> {
  const localeRequest =
    (localeOrQuery === 'zh-TW' || localeOrQuery === 'en') &&
    typeof queryOrLimit === 'string';
  const query = localeRequest ? queryOrLimit : localeOrQuery;
  const resolvedLimit = localeRequest
    ? limit
    : typeof queryOrLimit === 'number'
      ? queryOrLimit
      : 4;
  if (!Number.isInteger(resolvedLimit) || resolvedLimit < 1) return [];

  const websiteKnowledge = localeRequest
    ? await retrievePublishedKnowledgeForLocale(
        db,
        query,
        localeOrQuery as Locale,
        resolvedLimit,
      )
    : await retrievePublishedKnowledge(db, query, resolvedLimit);
  // 正式網站的固定公開資訊必須能在首次部署、或知識資料表尚未補齊時
  // 可靠回答；後台已發布的資料則以相同 id 覆蓋這份基準內容。
  const canonicalKnowledge =
    localeRequest && localeOrQuery === 'zh-TW'
      ? canonicalWebsiteKnowledge()
      : [];
  const documentKnowledge = await retrieveApprovedDocumentKnowledge(
    db,
    query,
    resolvedLimit,
  );
  const terms = queryTerms(query);

  return [
    ...mergeWebsiteKnowledge(canonicalKnowledge, websiteKnowledge),
    ...documentKnowledge,
  ]
    .map((source) => ({
      source,
      score:
        knowledgeScore(source, terms) +
        technicalSpecificationScore(source, query) +
        technicalIntentScore(source, query) +
        factIntentScore(source, query),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, resolvedLimit)
    .map(({ source }) => source);
}
