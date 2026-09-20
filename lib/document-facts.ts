import type { ExtractedDocumentChunk } from './document-repository';

export type ExtractedDocumentFact = {
  factType: 'specification' | 'operation';
  subject: string;
  predicate: string;
  value: string;
  unit: string | null;
  sourcePageStart: number;
  sourcePageEnd: number;
  sourceExcerpt: string;
};

type FactSource = Pick<
  ExtractedDocumentChunk,
  'content' | 'pageStart' | 'pageEnd'
> & {
  subject: string;
};

function normalized(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function excerpt(content: string, match: RegExpMatchArray) {
  const start = Math.max(0, (match.index ?? 0) - 100);
  return content.slice(start, Math.min(content.length, start + 700)).trim();
}

function addMatch(
  facts: ExtractedDocumentFact[],
  source: FactSource,
  predicate: string,
  pattern: RegExp,
  value: (match: RegExpMatchArray) => string,
  unit: string | null,
  factType: ExtractedDocumentFact['factType'] = 'specification',
) {
  const match = source.content.match(pattern);
  if (!match) return;
  facts.push({
    factType,
    subject: source.subject,
    predicate,
    value: value(match),
    unit,
    sourcePageStart: source.pageStart,
    sourcePageEnd: source.pageEnd,
    sourceExcerpt: excerpt(source.content, match),
  });
}

/**
 * Extract only explicit, high-confidence facts from text already accepted for
 * the public assistant. This deliberately does not infer values or translate
 * technical claims; uncertain content stays in ordinary document retrieval.
 */
export function extractDeterministicDocumentFacts(
  sources: FactSource[],
): ExtractedDocumentFact[] {
  const facts: ExtractedDocumentFact[] = [];
  for (const source of sources) {
    const content = normalized(source.content);
    const normalizedSource = { ...source, content };
    addMatch(
      facts,
      normalizedSource,
      'dimensions',
      /Dimensions\s+L\s*x\s*W\s*x\s*H\s+in\s+mm\s+(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i,
      (match) => `${match[1]} × ${match[2]} × ${match[3]}`,
      'mm',
    );
    addMatch(
      facts,
      normalizedSource,
      'weight',
      /Weight\s+.*?\s+kg\s+(\d+(?:\.\d+)?)/i,
      (match) => match[1],
      'kg',
    );
    addMatch(
      facts,
      normalizedSource,
      'housing_temperature_max',
      /Housing\s+temperature\s+°?C\s+max\.\s*(\d+(?:\.\d+)?)/i,
      (match) => match[1],
      '°C',
    );
    addMatch(
      facts,
      normalizedSource,
      'screen_quantity',
      /Screens\s+Quantity\s+(\d+)/i,
      (match) => match[1],
      null,
    );
    addMatch(
      facts,
      normalizedSource,
      'screen_area',
      /Screen\s+area\s+cm²\s+(\d+)\s*x\s*(\d+(?:\.\d+)?)/i,
      (match) => `${match[1]} × ${match[2]}`,
      'cm²',
    );
    addMatch(
      facts,
      normalizedSource,
      'screen_diameter',
      /(?:2\.2\.\s+)?Dimensions\s+mm\s+Ø\s*(\d+(?:\.\d+)?)/i,
      (match) => match[1],
      'mm',
    );
    addMatch(
      facts,
      normalizedSource,
      'heating_voltage',
      /3\.3\.\s+Voltage\s+V\s+(\d+(?:\.\d+)?)/i,
      (match) => match[1],
      'V',
    );
    addMatch(
      facts,
      normalizedSource,
      'hydraulic_power_supply',
      /4\.2\.\s+Voltage\s+V\/Hz\s+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i,
      (match) => `${match[1]} V / ${match[2]} Hz`,
      null,
    );
    addMatch(
      facts,
      normalizedSource,
      'control_voltage',
      /4\.3\.\s+Control\s+voltage\s+V\s+(\d+(?:\.\d+)?)\s*(DC|AC)?/i,
      (match) => `${match[1]} V${match[2] ? ` ${match[2]}` : ''}`,
      null,
    );
    addMatch(
      facts,
      normalizedSource,
      'hydraulic_pressure',
      /4\.5\.\s+Pressure\s+min\.\/max\.\s+bar\s+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i,
      (match) => `${match[1]}–${match[2]}`,
      'bar',
    );
    addMatch(
      facts,
      normalizedSource,
      'throughput_rate',
      /5\.1\.\s+Throughput\s+rate\s+kg\/h\s+(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/i,
      (match) => `${match[1]}–${match[2]}`,
      'kg/h',
    );
    addMatch(
      facts,
      normalizedSource,
      'touch_screen_size',
      /(\d+(?:\.\d+)?)\s*"\s+(?:capacitive\s+)?touch\s+screen/i,
      (match) => match[1],
      'inch',
    );
    addMatch(
      facts,
      normalizedSource,
      'power_supply',
      /Power\s+supply\s+(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*V\s*,?\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*Hz/i,
      (match) => `${match[1]}–${match[2]} V, ${match[3]}/${match[4]} Hz`,
      null,
    );
    addMatch(
      facts,
      normalizedSource,
      'data_retention',
      /Data\s+from\s+the\s+last\s+(\d+)\s+months\s+is\s+saved\s+in\s+a\s+ring\s+buffer/i,
      (match) => match[1],
      'months',
      'operation',
    );
    addMatch(
      facts,
      normalizedSource,
      'measurement_purpose',
      /purpose\s+of\s+the\s+.+?\s+is\s+to\s+measure\s+and\s+visualize\s+the\s+dynamic\s+viscosity\s+of\s+plastic\s+melts/i,
      () => 'dynamic viscosity of plastic melts',
      null,
      'operation',
    );
    addMatch(
      facts,
      normalizedSource,
      'maintenance_power_isolation',
      /before\s+(?:starting\s+)?maintenance\s+work\s+(?:the\s+)?entire\s+line\s+(?:has\s+to\s+be|must\s+be)\s+shut\s+down\s+and\s+disconnected\s+from\s+power/i,
      () => 'shut down the entire line and disconnect it from power',
      null,
      'operation',
    );
    addMatch(
      facts,
      normalizedSource,
      'backflush_preconditions',
      /hydraulic\s+(?:system\s+)?is\s+ready.*?whole\s+line\s+has\s+reached\s+(?:the\s+)?operating\s+temperature.*?protection\s+covers\s+are\s+closed.*?both\s+bolts\s+are\s+in\s+(?:the\s+)?production\s+position.*?previous\s+screen\s+changing\s+process\s+is\s+completed/i,
      () =>
        'hydraulic system ready; line at operating temperature; protection covers closed; both bolts in production position; previous screen-change process complete',
      null,
      'operation',
    );
    addMatch(
      facts,
      normalizedSource,
      'emergency_stop_effect',
      /emergency\s*-?\s*stop.*?(?:immediately\s+)?stops?.{0,120}?movement.*?switches?\s+off.{0,120}?hydraulic/i,
      () =>
        'immediately stops screen-changer movement and switches off the associated hydraulic power unit',
      null,
      'operation',
    );
  }
  return facts.filter(
    (fact, index, all) =>
      all.findIndex(
        (other) =>
          other.subject === fact.subject &&
          other.predicate === fact.predicate &&
          other.value === fact.value &&
          other.sourcePageStart === fact.sourcePageStart &&
          other.sourcePageEnd === fact.sourcePageEnd,
      ) === index,
  );
}
