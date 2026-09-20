import type { KnowledgeEvaluationCase } from '../../lib/knowledge-evaluation';

export const knowledgeEvaluationCases: KnowledgeEvaluationCase[] = [
  {
    id: 'tsk-dimensions-zh',
    category: 'specification',
    locale: 'zh-TW',
    question: 'Backflush Screen Changer TSK 148 XRS 的尺寸是多少？',
    expectedAnswerTerms: ['2993', '606', '1372'],
    expectedCitation: {
      documentTitle: 'Technical-Documentation-202515474_TSK-148-XRS_R00',
      page: 46,
    },
  },
  {
    id: 'tsk-dimensions-en',
    category: 'bilingual',
    locale: 'en',
    question: 'What are the TSK 148 XRS dimensions?',
    expectedAnswerTerms: ['2993', '606', '1372'],
    expectedCitation: {
      documentTitle: 'Technical-Documentation-202515474_TSK-148-XRS_R00',
      page: 46,
    },
  },
  {
    id: 'tsk-weight-zh',
    category: 'specification',
    locale: 'zh-TW',
    question: 'TSK 148 XRS 的重量是多少？',
    expectedAnswerTerms: ['1600'],
    expectedCitation: {
      documentTitle: 'Technical-Documentation-202515474_TSK-148-XRS_R00',
      page: 46,
    },
  },
  {
    id: 'tsk-heating-voltage-zh',
    category: 'specification',
    locale: 'zh-TW',
    question: 'TSK 148 XRS 的加熱器輸入電壓是多少？',
    expectedAnswerTerms: ['400'],
    expectedCitation: {
      documentTitle: 'Technical-Documentation-202515474_TSK-148-XRS_R00',
      page: 46,
    },
  },
  {
    id: 'tsk-hydraulic-voltage-en',
    category: 'specification',
    locale: 'en',
    question: 'What is the hydraulic power-unit voltage and frequency?',
    expectedAnswerTerms: ['400', '50'],
    expectedCitation: {
      documentTitle: 'Technical-Documentation-202515474_TSK-148-XRS_R00',
      page: 46,
    },
  },
  {
    id: 'tsk-control-voltage-zh',
    category: 'specification',
    locale: 'zh-TW',
    question: 'TSK 148 XRS 的控制電壓是多少？',
    expectedAnswerTerms: ['24'],
    expectedCitation: {
      documentTitle: 'Technical-Documentation-202515474_TSK-148-XRS_R00',
      page: 46,
    },
  },
  {
    id: 'tsk-temperature-zh',
    category: 'specification',
    locale: 'zh-TW',
    question: 'TSK 148 XRS 的外殼最高溫度是多少？',
    expectedAnswerTerms: ['350'],
    expectedCitation: {
      documentTitle: 'Technical-Documentation-202515474_TSK-148-XRS_R00',
      page: 46,
    },
  },
  {
    id: 'tsk-screens-en',
    category: 'specification',
    locale: 'en',
    question: 'How many screens and what is their area?',
    expectedAnswerTerms: ['4', '172', 'cm'],
    expectedCitation: {
      documentTitle: 'Technical-Documentation-202515474_TSK-148-XRS_R00',
      page: 46,
    },
  },
  {
    id: 'tsk-screen-diameter-zh',
    category: 'specification',
    locale: 'zh-TW',
    question: 'TSK 148 XRS 濾網直徑是多少？',
    expectedAnswerTerms: ['148'],
    expectedCitation: {
      documentTitle: 'Technical-Documentation-202515474_TSK-148-XRS_R00',
      page: 46,
    },
  },
  {
    id: 'tsk-hydraulic-pressure-en',
    category: 'specification',
    locale: 'en',
    question: 'What is the hydraulic pressure range?',
    expectedAnswerTerms: ['120', '330', 'bar'],
    expectedCitation: {
      documentTitle: 'Technical-Documentation-202515474_TSK-148-XRS_R00',
      page: 46,
    },
  },
  {
    id: 'tsk-throughput-zh',
    category: 'specification',
    locale: 'zh-TW',
    question: 'TSK 148 XRS 的處理量範圍是多少？',
    expectedAnswerTerms: ['1150', '1250'],
    expectedCitation: {
      documentTitle: 'Technical-Documentation-202515474_TSK-148-XRS_R00',
      page: 46,
    },
  },
  {
    id: 'promix-touchscreen-zh',
    category: 'bilingual',
    locale: 'zh-TW',
    question: 'Promix Visco P 的觸控螢幕尺寸是多少？',
    expectedAnswerTerms: ['15'],
    expectedCitation: {
      documentTitle: 'Operating Manual Promix Visco P_Rev4.1',
      page: 3,
    },
  },
  {
    id: 'promix-power-supply-en',
    category: 'specification',
    locale: 'en',
    question: 'What power supply does Promix Visco P require?',
    expectedAnswerTerms: ['115', '230', '50', '60'],
    expectedCitation: {
      documentTitle: 'Operating Manual Promix Visco P_Rev4.1',
      page: 28,
    },
  },
  {
    id: 'promix-data-retention-zh',
    category: 'operation',
    locale: 'zh-TW',
    question: 'Promix Visco P 裝置內可保存多久的量測資料？',
    expectedAnswerTerms: ['12'],
    expectedCitation: {
      documentTitle: 'Operating Manual Promix Visco P_Rev4.1',
      page: 12,
    },
  },
  {
    id: 'promix-purpose-en',
    category: 'operation',
    locale: 'en',
    question: 'What does the Promix Visco P measure?',
    expectedAnswerTerms: ['dynamic viscosity', 'plastic melts'],
    expectedCitation: {
      documentTitle: 'Operating Manual Promix Visco P_Rev4.1',
      page: 3,
    },
  },
];
