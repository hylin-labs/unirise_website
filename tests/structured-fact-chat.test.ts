import { describe, expect, it } from 'vitest';
import {
  answerFromStructuredFacts,
  retrieveSiteKnowledge,
} from '../lib/site-knowledge';
import { knowledgeEvaluationCases } from './fixtures/knowledge-evaluation-cases';
import { ContentDatabase } from './helpers/content-d1';

function seededKnowledgeDatabase() {
  const database = new ContentDatabase();
  database.seed('knowledge_documents', {
    id: 'tsk',
    display_title: 'Technical-Documentation-202515474_TSK-148-XRS_R00',
    category: '技術文件',
    source_language: 'en',
    access_level: 'public',
    assistant_status: 'approved',
    updated_at: '2026-09-20T00:00:00.000Z',
  });
  database.seed('knowledge_documents', {
    id: 'promix',
    display_title: 'Operating Manual Promix Visco P_Rev4.1',
    category: '技術文件',
    source_language: 'en',
    access_level: 'public',
    assistant_status: 'approved',
    updated_at: '2026-09-20T00:00:00.000Z',
  });
  database.seed('knowledge_document_chunks', {
    id: 'tsk-data', document_id: 'tsk', chunk_number: 0, page_start: 46, page_end: 46,
    language: 'en', status: 'approved',
    content: 'Dimensions L x W x H in mm 2993 x 606 x 1372 Weight TSK 148 XRS kg 1600 Housing temperature °C max. 350 Screens Quantity 4 Screen area cm² 4x 172 Dimensions mm Ø 148 3.3. Voltage V 400 4.2. Voltage V/Hz 400/50 4.3. Control voltage V 24 DC 4.5. Pressure min./max. bar 120/330 5.1. Throughput rate kg/h 1150 - 1250',
  });
  database.seed('knowledge_document_chunks', {
    id: 'promix-purpose', document_id: 'promix', chunk_number: 0, page_start: 3, page_end: 3,
    language: 'en', status: 'approved',
    content: 'The purpose of the Promix Visco P viscosity measuring device is to measure and visualize the dynamic viscosity of plastic melts in the extrusion process. The scope of delivery includes an evaluation unit transferring signals to a 15" touch screen panel PC.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'promix-retention', document_id: 'promix', chunk_number: 1, page_start: 12, page_end: 12,
    language: 'en', status: 'approved',
    content: 'Data from the last 12 months is saved in a ring buffer in the device memory.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'promix-power', document_id: 'promix', chunk_number: 2, page_start: 28, page_end: 28,
    language: 'en', status: 'approved',
    content: 'Panel PC with 15" capacitive touch screen. Power supply 115-230V, 50/60Hz.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'tsk-backflush', document_id: 'tsk', chunk_number: 1, page_start: 24, page_end: 24,
    language: 'en', status: 'approved',
    content: 'Backflushing may begin when the hydraulic system is ready, the whole line has reached the operating temperature, the protection covers are closed, both bolts are in the production position, and the previous screen changing process is completed.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'tsk-emergency', document_id: 'tsk', chunk_number: 2, page_start: 25, page_end: 25,
    language: 'en', status: 'approved',
    content: 'The EMERGENCY-STOP immediately stops screen changer movement and switches off the associated hydraulic power unit.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'tsk-maintenance', document_id: 'tsk', chunk_number: 3, page_start: 26, page_end: 26,
    language: 'en', status: 'approved',
    content: 'Before starting maintenance work the entire line has to be shut down and disconnected from power.',
  });
  return database;
}

describe('structured technical facts', () => {
  it.each(knowledgeEvaluationCases)(
    'answers $id from the matching document fact',
    async (testCase) => {
      const database = seededKnowledgeDatabase();
      const sources = await retrieveSiteKnowledge(
        database.d1,
        testCase.locale,
        testCase.question,
      );
      const answer = answerFromStructuredFacts(
        testCase.locale,
        sources,
        testCase.question,
      );

      expect(answer).not.toBeNull();
      for (const term of testCase.expectedAnswerTerms) {
        expect(answer?.toLowerCase()).toContain(term.toLowerCase());
      }
      expect(sources.map((source) => source.title)).toContain(
        `技術文件：${testCase.expectedCitation.documentTitle}（第 ${testCase.expectedCitation.page} 頁）`,
      );
    },
  );
});
