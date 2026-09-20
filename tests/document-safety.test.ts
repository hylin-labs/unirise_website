import { describe, expect, it } from 'vitest';
import { screenDocumentChunksForAssistant } from '../lib/document-safety';

describe('document assistant safety screening', () => {
  it('keeps ordinary technical material for the assistant', () => {
    const result = screenDocumentChunksForAssistant([
      {
        content: 'The screen changer operates at the configured process pressure.',
        pageStart: 1,
        pageEnd: 1,
      },
    ]);

    expect(result).toMatchObject({ excludedChunkCount: 0 });
    expect(result.safeChunks).toHaveLength(1);
  });

  it('excludes credential-like assignments before they reach assistant storage', () => {
    const result = screenDocumentChunksForAssistant([
      {
        content: 'Password: 1234. Do not share this setting.',
        pageStart: 3,
        pageEnd: 3,
      },
      {
        content: 'Inspect the hydraulic circuit before commissioning.',
        pageStart: 4,
        pageEnd: 4,
      },
    ]);

    expect(result.excludedChunkCount).toBe(1);
    expect(result.safeChunks).toEqual([
      expect.objectContaining({ pageStart: 4, pageEnd: 4 }),
    ]);
  });
});
