export const knowledgeEvaluationCategories = [
  'specification',
  'operation',
  'safety',
  'maintenance',
  'bilingual',
] as const;

export type KnowledgeEvaluationCategory =
  (typeof knowledgeEvaluationCategories)[number];

export type KnowledgeEvaluationCase = {
  id: string;
  category: KnowledgeEvaluationCategory;
  locale: 'zh-TW' | 'en';
  question: string;
  expectedAnswerTerms: string[];
  expectedCitation: {
    documentTitle: string;
    page: number;
  };
};

export type KnowledgeAnswerEvaluation = {
  answerTermsMatched: string[];
  answerTermsMissing: string[];
  hasExpectedCitation: boolean;
  passed: boolean;
};

function normalized(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function validateKnowledgeEvaluationCase(
  value: KnowledgeEvaluationCase,
) {
  if (!value.id || !value.question || !value.expectedAnswerTerms.length) {
    throw new Error('knowledge evaluation case is incomplete');
  }
  if (!knowledgeEvaluationCategories.includes(value.category)) {
    throw new Error('knowledge evaluation category is invalid');
  }
  if (!['zh-TW', 'en'].includes(value.locale)) {
    throw new Error('knowledge evaluation locale is invalid');
  }
  if (
    !value.expectedCitation.documentTitle ||
    value.expectedCitation.page < 1
  ) {
    throw new Error('knowledge evaluation citation is invalid');
  }
  return value;
}

export function evaluateKnowledgeAnswer(
  testCase: KnowledgeEvaluationCase,
  answer: string,
  citations: Array<{ documentTitle: string; page: number }>,
): KnowledgeAnswerEvaluation {
  validateKnowledgeEvaluationCase(testCase);
  const answerText = normalized(answer);
  const answerTermsMatched = testCase.expectedAnswerTerms.filter((term) =>
    answerText.includes(normalized(term)),
  );
  const answerTermsMissing = testCase.expectedAnswerTerms.filter(
    (term) => !answerTermsMatched.includes(term),
  );
  const hasExpectedCitation = citations.some(
    (citation) =>
      normalized(citation.documentTitle) ===
        normalized(testCase.expectedCitation.documentTitle) &&
      citation.page === testCase.expectedCitation.page,
  );
  return {
    answerTermsMatched,
    answerTermsMissing,
    hasExpectedCitation,
    passed: answerTermsMissing.length === 0 && hasExpectedCitation,
  };
}
