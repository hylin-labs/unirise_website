import { describe, expect, it } from 'vitest';
import { englishSeedPayload } from '../lib/english-seed';
import { initialPublicContent } from '../lib/public-content';
import {
  legacyDownloads,
  legacyKnowledge,
  legacyNewsPosts,
} from '../lib/seed-content-data';
import type { TranslationPayload } from '../lib/translation-types';

const han = /[\u3400-\u9fff]/u;

function readerText(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(readerText);
  if (!value || typeof value !== 'object') return [];
  // Object keys in the catalogue include stable Chinese lookup keys. They are
  // not rendered; only their values are reader-facing text.
  return Object.values(value).flatMap(readerText);
}

function seededPayloads(): TranslationPayload[] {
  return [
    ...Object.values(initialPublicContent),
    ...legacyNewsPosts.map((post) => ({
      kind: 'news' as const,
      text: {
        title: post.title,
        lead: post.lead,
        highlights: post.highlights,
      },
      literals: {
        legacyId: post.id,
        imageUrl: post.image,
        videoUrl: post.video ?? null,
      },
    })),
    ...legacyDownloads.map((download) => ({
      kind: 'download' as const,
      text: { title: download.title },
      literals: { legacyId: download.id },
    })),
    ...legacyKnowledge.map((item) => ({
      kind: 'knowledge' as const,
      text: { title: item.title, body: item.content, tags: [] },
      literals: { href: item.href },
    })),
  ];
}

describe('English seed content', () => {
  it('translates every reader-facing seed string while preserving immutable links and assets', () => {
    for (const source of seededPayloads()) {
      const translated = englishSeedPayload(source);
      expect(readerText(translated.text).join('\n'), source.kind).not.toMatch(han);
      expect(translated.literals, source.kind).toEqual(source.literals);
    }
  });
});
