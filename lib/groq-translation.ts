import {
  validateSourcePayload,
  validateTranslationPayload,
  type CanonicalSource,
  type TranslationPayload,
} from './translation-types';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-20b';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_TOKENS = 2_000;
const technicalToken = /\{[a-zA-Z]+\}|[a-zA-Z0-9]+(?:[._@+/-][a-zA-Z0-9]+)*/g;

export type GroqTranslationErrorCode =
  | 'translation_not_configured'
  | 'translation_timeout'
  | 'translation_upstream_unavailable'
  | 'translation_output_invalid';

export class GroqTranslationError extends Error {
  constructor(readonly code: GroqTranslationErrorCode) {
    super(code);
    this.name = 'GroqTranslationError';
  }
}

export type GroqTranslationOptions = {
  groqApiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

type Replacement = { placeholder: string; value: string };

function replaceTechnicalTokens(
  value: unknown,
  replacements: Replacement[],
): unknown {
  if (typeof value === 'string')
    return value.replace(technicalToken, (token) => {
      const placeholder = `__UNIRISE_LITERAL_${String(replacements.length).padStart(3, '0')}__`;
      replacements.push({ placeholder, value: token });
      return placeholder;
    });
  if (Array.isArray(value))
    return value.map((item) => replaceTechnicalTokens(item, replacements));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      replaceTechnicalTokens(item, replacements),
    ]),
  );
}

function protectLiteralFields(
  value: unknown,
  replacements: Replacement[],
): unknown {
  if (typeof value === 'string') {
    const placeholder = `__UNIRISE_LITERAL_${String(replacements.length).padStart(3, '0')}__`;
    replacements.push({ placeholder, value });
    return placeholder;
  }
  if (Array.isArray(value))
    return value.map((item) => protectLiteralFields(item, replacements));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      protectLiteralFields(item, replacements),
    ]),
  );
}

function protectedPayload(source: CanonicalSource) {
  const payload = validateSourcePayload(source.payload, source);
  const replacements: Replacement[] = [];
  return {
    payload: {
      kind: payload.kind,
      text: replaceTechnicalTokens(payload.text, replacements),
      literals: protectLiteralFields(payload.literals, replacements),
    },
    replacements,
  };
}

function occurrences(value: string, needle: string) {
  let total = 0;
  let offset = 0;
  while (true) {
    const found = value.indexOf(needle, offset);
    if (found < 0) return total;
    total += 1;
    offset = found + needle.length;
  }
}

function restoreProtectedPayload(value: unknown, replacements: Replacement[]) {
  const serialized = JSON.stringify(value);
  if (
    typeof serialized !== 'string' ||
    replacements.some(
      ({ placeholder }) => occurrences(serialized, placeholder) !== 1,
    )
  )
    throw new GroqTranslationError('translation_output_invalid');
  const restore = (part: unknown): unknown => {
    if (typeof part === 'string') {
      let restored = part;
      for (const replacement of replacements)
        restored = restored.replaceAll(
          replacement.placeholder,
          replacement.value,
        );
      return restored;
    }
    if (Array.isArray(part)) return part.map(restore);
    if (!part || typeof part !== 'object') return part;
    return Object.fromEntries(
      Object.entries(part).map(([key, item]) => [key, restore(item)]),
    );
  };
  return restore(value);
}

function systemPrompt(resourceType: CanonicalSource['resourceType']) {
  return `You translate Unirise website ${resourceType} content from Traditional Chinese into natural English. Return exactly one JSON object and nothing else: no Markdown, explanation, or code fence. The object must retain the exact source schema, keys, array lengths, kind, and every __UNIRISE_LITERAL_NNN__ placeholder exactly once. Translate only reader-facing prose to English; never invent product specifications, commitments, URLs, contact details, or identifiers.`;
}

function responseContent(value: unknown) {
  const content = (
    value as { choices?: Array<{ message?: { content?: unknown } }> }
  )?.choices?.[0]?.message?.content;
  if (typeof content !== 'string')
    throw new GroqTranslationError('translation_output_invalid');
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new GroqTranslationError('translation_output_invalid');
  }
}

export async function translateWithGroq(
  source: CanonicalSource,
  {
    groqApiKey,
    fetcher = fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
  }: GroqTranslationOptions,
): Promise<TranslationPayload> {
  if (!groqApiKey) throw new GroqTranslationError('translation_not_configured');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
    throw new GroqTranslationError('translation_upstream_unavailable');
  const protectedSource = protectedPayload(source);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let upstream: Response;
  try {
    upstream = await fetcher(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt(source.resourceType) },
          {
            role: 'user',
            content: JSON.stringify({ source: protectedSource.payload }),
          },
        ],
      }),
    });
  } catch {
    if (controller.signal.aborted)
      throw new GroqTranslationError('translation_timeout');
    throw new GroqTranslationError('translation_upstream_unavailable');
  } finally {
    clearTimeout(timer);
  }
  if (!upstream.ok)
    throw new GroqTranslationError('translation_upstream_unavailable');
  let parsed: unknown;
  try {
    parsed = responseContent(await upstream.json());
  } catch (error) {
    if (error instanceof GroqTranslationError) throw error;
    throw new GroqTranslationError('translation_output_invalid');
  }
  try {
    return validateTranslationPayload(
      restoreProtectedPayload(parsed, protectedSource.replacements),
      source,
    );
  } catch (error) {
    if (error instanceof GroqTranslationError) throw error;
    throw new GroqTranslationError('translation_output_invalid');
  }
}
