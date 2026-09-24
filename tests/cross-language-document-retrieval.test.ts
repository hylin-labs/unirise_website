import { describe, expect, it } from 'vitest';
import { retrieveSiteKnowledge } from '../lib/site-knowledge';
import { ContentDatabase } from './helpers/content-d1';

function seededTechnicalDocuments() {
  const database = new ContentDatabase();
  database.seed('knowledge_documents', {
    id: 'metal-detection',
    display_title: 'Training - Basics of metal detection',
    category: '技術文件',
    source_language: 'en',
    access_level: 'public',
    assistant_status: 'approved',
    updated_at: '2026-09-23T00:00:00.000Z',
  });
  database.seed('knowledge_documents', {
    id: 'aflasort',
    display_title: 'AflaSort-OptimumSorting-EN',
    category: '技術文件',
    source_language: 'en',
    access_level: 'public',
    assistant_status: 'approved',
    updated_at: '2026-09-23T00:00:00.000Z',
  });
  database.seed('knowledge_document_chunks', {
    id: 'metal-field',
    document_id: 'metal-detection',
    chunk_number: 0,
    page_start: 5,
    page_end: 6,
    language: 'en',
    status: 'approved',
    content:
      'The transmitter coil generates a permanent electromagnetic AC field. Each metal detector has zones which must be kept free of metal. The two receivers are switched against each other and compensate each other.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'metal-speed',
    document_id: 'metal-detection',
    chunk_number: 1,
    page_start: 36,
    page_end: 37,
    language: 'en',
    status: 'approved',
    content:
      'For a GLS Genius+ search coil, conveyor speeds range from vmin 0.1 m/s to vmax 2.1 m/s. Below or above these limits, sensitivity decreases.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'aflasort-continuous',
    document_id: 'aflasort',
    chunk_number: 0,
    page_start: 2,
    page_end: 2,
    language: 'en',
    status: 'approved',
    content:
      'AflaSort uses Deep Blue laser fluorescence. No adjustments, recalibrations, or cleaning are required during continuous production.',
  });
  return database;
}

describe('cross-language technical-document retrieval', () => {
  it('retrieves English metal-detection material for a Traditional Chinese question', async () => {
    const database = seededTechnicalDocuments();
    const sources = await retrieveSiteKnowledge(
      database.d1,
      'zh-TW',
      '金屬檢測器為何需要在特定區域保持無金屬？',
    );

    expect(sources.map((source) => source.id)).toContain(
      'document:metal-detection:chunk:metal-field',
    );
  });

  it('retrieves technical speed limits from their English names and units', async () => {
    const database = seededTechnicalDocuments();
    const sources = await retrieveSiteKnowledge(
      database.d1,
      'zh-TW',
      'GLS Genius+ 搜尋線圈的輸送速度範圍是什麼？',
    );

    expect(sources.map((source) => source.id)).toContain(
      'document:metal-detection:chunk:metal-speed',
    );
  });

  it('retrieves continuous-production limits from an English AflaSort document', async () => {
    const database = seededTechnicalDocuments();
    const sources = await retrieveSiteKnowledge(
      database.d1,
      'zh-TW',
      'AflaSort 在連續生產中是否需要中途調整、重新校正或清潔？',
    );

    expect(sources.map((source) => source.id)).toContain(
      'document:aflasort:chunk:aflasort-continuous',
    );
  });
});
