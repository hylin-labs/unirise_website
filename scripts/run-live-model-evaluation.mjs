import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const endpoint =
  process.env.UNIRISE_EVALUATION_URL ??
  'https://unirise-staging.hungyu.workers.dev/api/chat';
const intervalMs = Number(process.env.UNIRISE_EVALUATION_INTERVAL_MS ?? 11_000);

function parseCases(markdown) {
  return markdown
    .split(/\r?\n/)
    .filter((line) => /^\| (?:TSK|PMX|MTD|AFL)-\d+ \|/.test(line))
    .map((line) => {
      const [, id, difficulty, question, expected, reference] = line
        .split('|')
        .map((cell) => cell.trim());
      return {
        id,
        difficulty: Number(difficulty),
        question,
        expected,
        reference,
        coveredByStaging: /^(TSK|PMX)-/.test(id),
        locale: /[\u3400-\u9fff]/.test(question) ? 'zh-TW' : 'en',
      };
    });
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

const source = await readFile(
  resolve(root, 'UNIRISE_MODEL_EVALUATION_50.md'),
  'utf8',
);
const allCases = parseCases(source);
if (allCases.length !== 50)
  throw new Error(`Expected 50 evaluation cases, found ${allCases.length}.`);
const requestedIds = new Set(
  (process.env.UNIRISE_EVALUATION_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);
const cases =
  requestedIds.size > 0
    ? allCases.filter((testCase) => requestedIds.has(testCase.id))
    : allCases;
if (requestedIds.size > 0 && cases.length !== requestedIds.size) {
  const foundIds = new Set(cases.map((testCase) => testCase.id));
  const missingIds = [...requestedIds].filter((id) => !foundIds.has(id));
  throw new Error(`Unknown evaluation case IDs: ${missingIds.join(', ')}`);
}

const results = [];
for (const [index, testCase] of cases.entries()) {
  const startedAt = new Date().toISOString();
  let answer = null;
  let error = null;
  let status = null;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: new URL(endpoint).origin,
      },
      body: JSON.stringify({
        message: testCase.question,
        history: [],
        locale: testCase.locale,
      }),
    });
    status = response.status;
    const payload = await response.json();
    answer = typeof payload.answer === 'string' ? payload.answer : null;
    error = typeof payload.error === 'string' ? payload.error : null;
  } catch (cause) {
    error = cause instanceof Error ? cause.name : 'request_failed';
  }
  results.push({ ...testCase, startedAt, status, answer, error });
  console.log(
    `${String(index + 1).padStart(2, '0')}/${cases.length} ${testCase.id} ${
      status ?? 'network_error'
    }`,
  );
  if (index < cases.length - 1) await wait(intervalMs);
}

const outputDirectory = resolve(root, 'outputs');
await mkdir(outputDirectory, { recursive: true });
const outputPath = resolve(
  outputDirectory,
  process.env.UNIRISE_EVALUATION_OUTPUT ??
    `live-model-evaluation-${cases.length}.json`,
);
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      endpoint,
      completedAt: new Date().toISOString(),
      note: 'Results were collected from the public Staging chat endpoint. Score answers only against sources confirmed as available in Staging at the time of this run.',
      results,
    },
    null,
    2,
  )}\n`,
);
console.log(`Saved ${outputPath}`);
