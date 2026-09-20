import { knowledgeEvaluationCases } from '../tests/fixtures/knowledge-evaluation-cases';
import { evaluateKnowledgeAnswer } from './knowledge-evaluation';
import {
  answerFromStructuredFacts,
  retrieveSiteKnowledge,
  type SiteKnowledgeSource,
} from './site-knowledge';

function citationsFromSources(sources: SiteKnowledgeSource[]) {
  return sources.flatMap((source) => {
    if (source.href) return [];
    const match = source.title.match(/^技術文件：(.*)（第 (\d+)(?:-(\d+))? 頁）$/);
    if (!match) return [];
    const start = Number(match[2]);
    const end = Number(match[3] ?? match[2]);
    return Array.from({ length: end - start + 1 }, (_, offset) => ({
      documentTitle: match[1],
      page: start + offset,
    }));
  });
}

export type KnowledgeQualityResult = {
  id: string;
  category: string;
  locale: 'zh-TW' | 'en';
  question: string;
  passed: boolean;
  answerTermsMissing: string[];
  hasExpectedCitation: boolean;
  answer: string | null;
};

/**
 * This is intentionally deterministic: it verifies the approved public
 * knowledge that can answer without an external model. It never sends a
 * document, visitor question, or credential to an AI provider.
 */
export async function evaluatePublishedStructuredKnowledge(
  db: D1Database,
) {
  const results: KnowledgeQualityResult[] = [];
  for (const testCase of knowledgeEvaluationCases) {
    const sources = await retrieveSiteKnowledge(
      db,
      testCase.locale,
      testCase.question,
    );
    const answer = answerFromStructuredFacts(
      testCase.locale,
      sources,
      testCase.question,
    );
    const evaluation = evaluateKnowledgeAnswer(
      testCase,
      answer ?? '',
      citationsFromSources(sources),
    );
    results.push({
      id: testCase.id,
      category: testCase.category,
      locale: testCase.locale,
      question: testCase.question,
      passed: evaluation.passed,
      answerTermsMissing: evaluation.answerTermsMissing,
      hasExpectedCitation: evaluation.hasExpectedCitation,
      answer,
    });
  }
  const passed = results.filter((result) => result.passed).length;
  return {
    total: results.length,
    passed,
    passRate: results.length ? passed / results.length : 0,
    results,
  };
}
