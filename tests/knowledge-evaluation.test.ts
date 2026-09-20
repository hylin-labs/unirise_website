import { describe, expect, it } from 'vitest';
import {
  evaluateKnowledgeAnswer,
  validateKnowledgeEvaluationCase,
} from '../lib/knowledge-evaluation';
import { knowledgeEvaluationCases } from './fixtures/knowledge-evaluation-cases';

describe('technical knowledge evaluation baseline', () => {
  it('contains twenty-eight source-verified bilingual questions', () => {
    expect(knowledgeEvaluationCases).toHaveLength(28);
    expect(
      new Set(knowledgeEvaluationCases.map((testCase) => testCase.id)).size,
    ).toBe(knowledgeEvaluationCases.length);
    expect(
      knowledgeEvaluationCases.some((testCase) => testCase.locale === 'zh-TW'),
    ).toBe(true);
    expect(
      knowledgeEvaluationCases.some((testCase) => testCase.locale === 'en'),
    ).toBe(true);
    knowledgeEvaluationCases.forEach(validateKnowledgeEvaluationCase);
  });

  it('requires both the expected answer details and an exact source citation', () => {
    const testCase = knowledgeEvaluationCases[0];
    expect(
      evaluateKnowledgeAnswer(
        testCase,
        'TSK 148 XRS 的尺寸為 2993 × 606 × 1372 mm。',
        [
          {
            documentTitle: 'Technical-Documentation-202515474_TSK-148-XRS_R00',
            page: 46,
          },
        ],
      ),
    ).toMatchObject({ passed: true, answerTermsMissing: [] });

    expect(
      evaluateKnowledgeAnswer(testCase, '尺寸資訊不足。', []),
    ).toMatchObject({ passed: false, hasExpectedCitation: false });
  });
});
