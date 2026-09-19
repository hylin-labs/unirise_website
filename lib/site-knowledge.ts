import {
  type KnowledgeSource,
  retrievePublishedKnowledge,
  retrievePublishedKnowledgeForLocale,
} from './content-repository';
import { uniriseSchema } from '../db/schema';
import type { Locale } from './locales';

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
    [/篩網|濾網|screen|filter/i, ['screen', 'filter', 'backflush', 'changer']],
  ];
  for (const [pattern, expansion] of technicalExpansions) {
    if (pattern.test(value)) terms.push(...expansion);
  }
  return [...new Set(terms)];
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
  const terms = queryTerms(query);
  return rows
    .flat()
    .map((row) => {
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
      return { source, score: knowledgeScore(source, terms) };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ source }) => source);
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
  const documentKnowledge = await retrieveApprovedDocumentKnowledge(
    db,
    query,
    resolvedLimit,
  );
  const terms = queryTerms(query);

  return [...websiteKnowledge, ...documentKnowledge]
    .map((source) => ({ source, score: knowledgeScore(source, terms) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, resolvedLimit)
    .map(({ source }) => source);
}
