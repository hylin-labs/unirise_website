import { describe, expect, it } from 'vitest';
import {
  answerFromStructuredFacts,
  retrieveSiteKnowledge,
} from '../lib/site-knowledge';
import { extractDeterministicDocumentFacts } from '../lib/document-facts';
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
    id: 'tsk-data',
    document_id: 'tsk',
    chunk_number: 0,
    page_start: 46,
    page_end: 46,
    language: 'en',
    status: 'approved',
    content:
      'Dimensions L x W x H in mm 2993 x 606 x 1372 Weight TSK 148 XRS kg 1600 Housing temperature °C max. 350 Screens Quantity 4 Screen area cm² 4x 172 Dimensions mm Ø 148 3.3. Voltage V 400 4.2. Voltage V/Hz 400/50 4.3. Control voltage V 24 DC 4.5. Pressure min./max. bar 120/330 5.1. Throughput rate kg/h 1150 - 1250',
  });
  database.seed('knowledge_document_chunks', {
    id: 'tsk-pressure-switch',
    document_id: 'tsk',
    chunk_number: 4,
    page_start: 167,
    page_end: 167,
    language: 'en',
    status: 'approved',
    content:
      'Electronic Pressure Switch EDS 3000. The 4-digit digital display can indicate the pressure in bar, PSI or MPa. The user can select the individual measurement unit.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'promix-purpose',
    document_id: 'promix',
    chunk_number: 0,
    page_start: 3,
    page_end: 3,
    language: 'en',
    status: 'approved',
    content:
      'The purpose of the Promix Visco P viscosity measuring device is to measure and visualize the dynamic viscosity of plastic melts in the extrusion process. The device is suitable for determining the flow behavior of plastic melts in production, in the laboratory and for quality assurance purposes. The scope of delivery includes the measuring module with the necessary sensors, an evaluation unit for processing the signals and transferring them to a 15" touch screen panel PC with the corresponding software.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'promix-retention',
    document_id: 'promix',
    chunk_number: 1,
    page_start: 12,
    page_end: 12,
    language: 'en',
    status: 'approved',
    content:
      'Data from the last 12 months is saved in a ring buffer in the device memory.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'promix-power',
    document_id: 'promix',
    chunk_number: 2,
    page_start: 28,
    page_end: 28,
    language: 'en',
    status: 'approved',
    content:
      'Panel PC with 15" capacitive touch screen. Power supply 115-230V, 50/60Hz.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'tsk-backflush',
    document_id: 'tsk',
    chunk_number: 1,
    page_start: 24,
    page_end: 24,
    language: 'en',
    status: 'approved',
    content:
      'Backflushing may begin when the hydraulic system is ready, the whole line has reached the operating temperature, the protection covers are closed, both bolts are in the production position, and the previous screen changing process is completed.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'tsk-emergency',
    document_id: 'tsk',
    chunk_number: 2,
    page_start: 25,
    page_end: 25,
    language: 'en',
    status: 'approved',
    content:
      'The EMERGENCY-STOP immediately stops screen changer movement and switches off the associated hydraulic power unit.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'tsk-maintenance',
    document_id: 'tsk',
    chunk_number: 3,
    page_start: 26,
    page_end: 26,
    language: 'en',
    status: 'approved',
    content:
      'Before starting maintenance work the entire line has to be shut down and disconnected from power.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'promix-safety',
    document_id: 'promix',
    chunk_number: 3,
    page_start: 4,
    page_end: 4,
    language: 'en',
    status: 'approved',
    content:
      'CAUTION: Disconnect the power supply before opening the control cabinet.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'promix-operation',
    document_id: 'promix',
    chunk_number: 4,
    page_start: 6,
    page_end: 6,
    language: 'en',
    status: 'approved',
    content:
      'The Promix Visco P viscosity measuring device is operated via a touch panel and can be operated either by touching it with a finger or using a corresponding stylus.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'promix-measurements',
    document_id: 'promix',
    chunk_number: 5,
    page_start: 8,
    page_end: 8,
    language: 'en',
    status: 'approved',
    content:
      'The current measured values for viscosity, melt temperature and shear rate are displayed.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'promix-smoothing',
    document_id: 'promix',
    chunk_number: 6,
    page_start: 10,
    page_end: 10,
    language: 'en',
    status: 'approved',
    content: 'Smoothing can be activated as an option.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'promix-reports',
    document_id: 'promix',
    chunk_number: 7,
    page_start: 17,
    page_end: 17,
    language: 'en',
    status: 'approved',
    content:
      'To export the reports to a storage medium, press the EXPORT REPORT button and select the storage medium (USB stick). Reports are output in PDF format and saved monthly in subfolders.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'promix-service',
    document_id: 'promix',
    chunk_number: 8,
    page_start: 21,
    page_end: 21,
    language: 'en',
    status: 'approved',
    content:
      'The Promix Visco P viscosity measuring device is essentially maintenance-free. The calibration process must be carried out with the system heated up and depressurized.',
  });
  database.seed('knowledge_document_chunks', {
    id: 'promix-fieldbus',
    document_id: 'promix',
    chunk_number: 9,
    page_start: 23,
    page_end: 23,
    language: 'en',
    status: 'approved',
    content:
      'The following interfaces are available: • Serial Modbus RTU • EtherNet/IP • PROFINET Device • PowerLINK • SERCOS III • CANopen • DeviceNet • PROFIBUS DP The Modbus interface can be set up on any Promix Visco P at the factory.',
  });
  return database;
}

describe('structured technical facts', () => {
  it('extracts the maintenance isolation requirement from the manual wording', () => {
    const facts = extractDeterministicDocumentFacts([
      {
        subject: 'TSK 148 XRS',
        content:
          'The entire line has to be shut down and disconnected from the power supply during maintenance work.',
        pageStart: 21,
        pageEnd: 21,
      },
    ]);

    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          predicate: 'maintenance_power_isolation',
          value: 'shut down the entire line and disconnect it from power',
        }),
      ]),
    );
  });

  it.each([
    {
      question: 'AflaSort 在連續生產中是否需要中途調整、重新校正或清潔？',
      source:
        'The Deep Blue laser light induces fluorescence in the aflatoxin residues. Moreover, no intermediate adjustment, recalibration, or cleaning is required, allowing for continuous production.',
      terms: ['不需要', '中途調整', '重新校正', '清潔'],
    },
    {
      question:
        '請用繁體中文簡述：為何 AflaSort 可在不頻繁停機的前提下協助提升分選品質？',
      source:
        'The Deep Blue laser light induces fluorescence in the aflatoxin residues. Moreover, no intermediate adjustment, recalibration, or cleaning is required, allowing for continuous production.',
      terms: ['Deep Blue', '螢光', '不需中途調整'],
    },
    {
      question:
        '請區分 touch、product 與 operational sensitivity 所處理的影響範圍。',
      source:
        'The terms touch sensitivity, product sensitivity, and operational sensitivity are used. No external influences. Influences due to the examined product (product effect). Impact of conveyance and/or separation. External interferences during operation at customers place.',
      terms: ['產品效應', '輸送或分離', '現場干擾'],
    },
    {
      question: '為何濕產品通常應選較低訊號頻率？請連結產品效應解釋。',
      source: 'Product effect is influenced by frequency.',
      terms: ['產品效應', '較低訊號頻率'],
    },
  ])(
    'returns a stable document-grounded summary for $question',
    ({ question, source, terms }) => {
      const answer = answerFromStructuredFacts(
        'zh-TW',
        [
          {
            id: 'document',
            title: '技術文件：測試文件（第 1 頁）',
            content: source,
            tags: ['技術文件'],
          },
        ],
        question,
      );

      expect(answer).not.toBeNull();
      for (const term of terms) expect(answer).toContain(term);
    },
  );

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

  it.each([
    {
      question: 'TSK 148 XRS 的外型尺寸與重量各是多少？請附單位。',
      terms: ['2993', '606', '1372', 'mm', '1600', 'kg'],
    },
    {
      question: 'TSK 148 XRS 有 4 片、每片 172 cm² 的濾網。總過濾面積是多少？',
      terms: ['688', 'cm²', '4', '172'],
    },
    {
      question:
        '請一次比較 TSK 148 XRS 的加熱器、液壓動力單元與控制系統供電；不要把三者混為同一規格。',
      terms: ['400', '50', '24', 'dc'],
    },
    {
      question:
        '「TSK 的液壓壓力是 350 bar」正確嗎？請更正並說明 350 代表什麼。',
      terms: ['不正確', '120', '330', '350', '°c'],
    },
    {
      question: '緊急停止與開始維護前的停機要求有何不同？',
      terms: ['緊急停止', '液壓', '整條生產線', '斷開電源'],
    },
    {
      question:
        '需要一台濾網直徑 148 mm、控制電壓 24 V DC 的 TSK。文件中的規格是否符合？',
      terms: ['符合', '148', '24', 'dc'],
    },
    {
      question:
        '請用繁體中文回答：The hydraulic power supply is 400 V/50 Hz. Is that the same specification as the heating input?',
      terms: ['不完全相同', '400', '50', '加熱'],
    },
    {
      question:
        '請列出 Promix Visco P 交付內容的三個主要組成，不要只回答「觸控螢幕」。',
      terms: ['量測模組', '評估單元', '15', '軟體'],
    },
    {
      question: '這台設備的螢幕尺寸與可接受電源範圍分別為何？',
      terms: ['15', '115', '230', '50', '60'],
    },
    {
      question: '操作者問「目前值」時，Promix 畫面應提供哪三項量測資訊？',
      terms: ['黏度', '熔體溫度', '剪切速率'],
    },
    {
      question: '控制櫃要檢修但尚未切斷電源，可否先打開查看？',
      terms: ['不可', '斷開電源'],
    },
    {
      question: 'Promix 感測器校正前需要同時達成哪兩項狀態？',
      terms: ['加熱', '洩壓'],
    },
    {
      question:
        '請列出至少 4 種 Promix 可用的通訊介面，並說明哪一種可在出廠時設置於任何 Promix Visco P。',
      terms: ['modbus', 'ethernet/ip', 'profinet', '出廠'],
    },
    {
      question:
        '「Promix 基本上免維護，所以任何校正前置條件都不需要。」這句話對嗎？',
      terms: ['不對', '免維護', '加熱', '洩壓'],
    },
  ])(
    'combines all approved facts for $question',
    async ({ question, terms }) => {
      const database = seededKnowledgeDatabase();
      const answer = answerFromStructuredFacts(
        'zh-TW',
        await retrieveSiteKnowledge(database.d1, 'zh-TW', question),
        question,
      );

      expect(answer).not.toBeNull();
      for (const term of terms) expect(answer?.toLowerCase()).toContain(term);
    },
  );

  it('retrieves and answers a Chinese pressure-display-unit question from English technical text', async () => {
    const database = seededKnowledgeDatabase();
    const question =
      'TSK 148 XRS 所使用的 EDS 3000 壓力開關，螢幕可以顯示哪些壓力單位？';
    const sources = await retrieveSiteKnowledge(database.d1, 'zh-TW', question);

    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining(
            'pressure_display_units: bar, PSI or MPa',
          ),
        }),
      ]),
    );
    expect(answerFromStructuredFacts('zh-TW', sources, question)).toBe(
      '該壓力開關可顯示的壓力單位為 bar、PSI 或 MPa。',
    );
  });
});
