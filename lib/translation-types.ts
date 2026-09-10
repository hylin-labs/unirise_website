import type { Locale } from './locales';
import { initialPublicContent, type PublicContentId } from './public-content';
import { ContentValidationError } from './content-repository';

export const RESOURCE_TYPES = [
  'news',
  'download',
  'knowledge',
  'public_content',
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type TranslationLocale = Extract<Locale, 'en'>;
export type TranslationStatus = 'draft' | 'needs_review' | 'published';
export type TranslationOrigin = 'ai' | 'human';
export type NewsPayload = {
  kind: 'news';
  text: { title: string; lead: string; highlights: string[] };
  literals: { legacyId: string; imageUrl: string; videoUrl: string | null };
};
export type DownloadPayload = {
  kind: 'download';
  text: { title: string };
  literals: { legacyId: string };
};
export type KnowledgePayload = {
  kind: 'knowledge';
  text: { title: string; body: string; tags: string[] };
  literals: { href: string };
};
export type HomePayload = typeof initialPublicContent.home;
export type CatalogPayload = typeof initialPublicContent.catalog;
export type ContactPayload = typeof initialPublicContent.contact;
export type InquiryPayload = typeof initialPublicContent.inquiry;
export type ChromePayload = typeof initialPublicContent.chrome;
export type PublicPayload =
  | HomePayload
  | CatalogPayload
  | ContactPayload
  | InquiryPayload
  | ChromePayload;
export type TranslationPayload =
  | NewsPayload
  | DownloadPayload
  | KnowledgePayload
  | PublicPayload;
export type SourceReference = {
  resourceType: ResourceType;
  resourceId: string;
  sourceVersion: number;
};
export type CanonicalSource = SourceReference & {
  payload: TranslationPayload;
  status: 'draft' | 'published';
};
export type TranslationRecord = SourceReference & {
  id: string;
  locale: TranslationLocale;
  payload: TranslationPayload;
  status: TranslationStatus;
  origin: TranslationOrigin;
  outdated: boolean;
  failureReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  translatedAt: string;
  updatedAt: string;
};
export type TranslationJobState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';
export type TranslationItemState =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped';
export type TranslationJob = {
  id: string;
  requestKey: string;
  locale: TranslationLocale;
  state: TranslationJobState;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
};
export type TranslationJobItem = SourceReference & {
  id: string;
  jobId: string;
  sourcePayload: TranslationPayload;
  state: TranslationItemState;
  attempts: number;
  claimToken: string | null;
  leaseExpiresAt: string | null;
  failureReason: string | null;
  history: {
    attempt: number;
    state: TranslationItemState | 'lease_expired';
    at: string;
    failureReason?: string;
  }[];
};

function invalid(message: string): never {
  throw new ContentValidationError(message);
}
export function validateResourceReference(value: SourceReference) {
  if (!value || !RESOURCE_TYPES.includes(value.resourceType))
    invalid('unknown resource type');
  if (
    typeof value.resourceId !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(value.resourceId)
  )
    invalid('invalid resource ID');
  if (!Number.isSafeInteger(value.sourceVersion) || value.sourceVersion < 1)
    invalid('invalid source version');
  if (
    value.resourceType === 'public_content' &&
    !Object.hasOwn(initialPublicContent, value.resourceId)
  )
    invalid('unknown public content ID');
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('payload must be an object');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[]) {
  if (
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  )
    invalid('payload has missing or unknown fields');
}
function text(value: unknown, maximum = 8000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    invalid('text is empty or exceeds its bound');
}
function list(value: unknown, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum)
    invalid('malformed or oversized array');
  value.forEach((item) => text(item));
}
function safeLink(value: unknown) {
  text(value, 2048);
  const url = value as string;
  if (
    Array.from(url).some(
      (character) => character.charCodeAt(0) <= 32 || character === '\\',
    )
  )
    invalid('invalid link');
  try {
    if (
      url.startsWith('/') &&
      !url.startsWith('//') &&
      new URL(url, 'https://unirise.invalid').origin ===
        'https://unirise.invalid'
    )
      return;
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password)
      return;
  } catch {
    /* The validation error below handles malformed links. */
  }
  invalid('link must be local or HTTPS');
}

// Public records use the complete seed shape as a closed schema. Neither key
// names nor array positions are prose; changing them would break consumers.
function matchShape(
  value: unknown,
  template: unknown,
  literal = false,
  key = '',
): void {
  if (typeof template === 'string') {
    text(value, literal ? 2048 : 8000);
    if (literal && /url|image|href/i.test(key)) {
      if (key === 'phoneUrl') {
        if (!/^tel:[+\d-]+$/.test(value as string))
          invalid('invalid telephone literal');
      } else if (key === 'emailUrl') {
        if (!/^mailto:[^\s?@]+@[^\s?@]+$/.test(value as string))
          invalid('invalid email literal');
      } else safeLink(value);
    }
    return;
  }
  if (Array.isArray(template)) {
    if (
      !Array.isArray(value) ||
      value.length !== template.length ||
      value.length > 128
    )
      invalid('malformed array');
    value.forEach((entry, index) =>
      matchShape(entry, template[index], literal, key),
    );
    return;
  }
  const record = object(value);
  const fields = object(template);
  keys(record, Object.keys(fields));
  for (const field of Object.keys(fields))
    matchShape(record[field], fields[field], literal, field);
}

export function validateSourcePayload(
  payload: unknown,
  source: SourceReference,
): TranslationPayload {
  validateResourceReference(source);
  const value = object(payload);
  keys(value, ['kind', 'text', 'literals']);
  if (
    value.kind !==
    (source.resourceType === 'public_content'
      ? source.resourceId
      : source.resourceType)
  )
    invalid('source and payload kind mismatch');
  const prose = object(value.text);
  const literals = object(value.literals);
  if (source.resourceType === 'public_content') {
    const template = initialPublicContent[source.resourceId as PublicContentId];
    matchShape(prose, template.text);
    matchShape(literals, template.literals, true);
  } else {
    keys(
      prose,
      source.resourceType === 'news'
        ? ['title', 'lead', 'highlights']
        : source.resourceType === 'knowledge'
          ? ['title', 'body', 'tags']
          : ['title'],
    );
    text(prose.title, 160);
    if (source.resourceType === 'news') {
      text(prose.lead);
      list(prose.highlights, 12);
      keys(literals, ['legacyId', 'imageUrl', 'videoUrl']);
      safeLink(literals.imageUrl);
      if (literals.videoUrl !== null) safeLink(literals.videoUrl);
    } else if (source.resourceType === 'knowledge') {
      text(prose.body);
      list(prose.tags, 12);
      keys(literals, ['href']);
      safeLink(literals.href);
    } else keys(literals, ['legacyId']);
    if (
      source.resourceType !== 'knowledge' &&
      (typeof literals.legacyId !== 'string' ||
        !/^\d{1,160}$/.test(literals.legacyId))
    )
      invalid('invalid legacy ID');
  }
  if (JSON.stringify(value).length > 200_000) invalid('payload is too large');
  return value as TranslationPayload;
}

function sameLiterals(left: unknown, right: unknown): boolean {
  if (
    typeof left !== 'object' ||
    left === null ||
    right === null ||
    typeof right !== 'object'
  )
    return left === right;
  if (Array.isArray(left))
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameLiterals(value, right[index]))
    );
  const other = right as Record<string, unknown>;
  return (
    Object.keys(left).length === Object.keys(other).length &&
    Object.entries(left).every(
      ([key, value]) =>
        Object.hasOwn(other, key) && sameLiterals(value, other[key]),
    )
  );
}

function preserveTechnicalLiterals(value: unknown, original: unknown): void {
  if (typeof original === 'string') {
    if (typeof value !== 'string') invalid('text shape mismatch');
    // Preserve model identifiers, measurements, brands, mail addresses, and
    // template placeholders embedded in otherwise translatable Chinese prose.
    const tokenPattern = /\{[a-zA-Z]+\}|[a-zA-Z0-9]+(?:[._@+/-][a-zA-Z0-9]+)*/g;
    const tokens = original.match(tokenPattern) ?? [];
    const translatedTokens = new Set(value.match(tokenPattern) ?? []);
    for (const token of tokens) {
      // A single-letter designation such as X may become X-ray. Full model
      // names must match a whole token, so FSCAN-4350G2 is not FSCAN-4350G.
      const preserved = /^[a-zA-Z]$/.test(token)
        ? new RegExp(`(?<![a-zA-Z0-9])${token}(?![a-zA-Z0-9])`).test(value)
        : translatedTokens.has(token);
      if (!preserved) invalid(`technical literal must be preserved: ${token}`);
    }
  } else if (Array.isArray(original)) {
    if (!Array.isArray(value) || value.length !== original.length)
      invalid('translation array must match source');
    original.forEach((item, index) =>
      preserveTechnicalLiterals(value[index], item),
    );
  } else {
    for (const [key, field] of Object.entries(object(original)))
      preserveTechnicalLiterals(object(value)[key], field);
  }
}

export function validateTranslationPayload(
  payload: unknown,
  source: SourceReference & { payload: TranslationPayload },
): TranslationPayload {
  const original = validateSourcePayload(source.payload, source);
  const validated = validateSourcePayload(payload, source);
  if (!sameLiterals(validated.literals, original.literals))
    invalid('translation changed immutable literals');
  preserveTechnicalLiterals(validated.text, original.text);
  return validated;
}
