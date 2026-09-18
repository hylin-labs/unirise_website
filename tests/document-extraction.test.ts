import { describe, expect, it } from 'vitest';
import { chunkExtractedPages } from '../lib/document-extraction';

describe('document text extraction chunks', () => {
  it('keeps page references when creating reviewable chunks', () => {
    const result = chunkExtractedPages(['第一頁技術規格', '第二頁操作說明']);
    expect(result.chunks).toEqual([
      {
        content: '第一頁技術規格\n\n第二頁操作說明',
        pageStart: 1,
        pageEnd: 2,
      },
    ]);
  });

  it('drops empty pages and limits an oversized extraction', () => {
    const result = chunkExtractedPages(['', '內容', ' '.repeat(10)]);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toMatchObject({ pageStart: 2, pageEnd: 2 });
  });

  it('splits a long page without losing its page reference', () => {
    const longPage = Array.from({ length: 700 }, () => 'technical').join(' ');
    const result = chunkExtractedPages([longPage]);

    expect(result.chunks.length).toBeGreaterThan(1);
    expect(result.chunks.every((chunk) => chunk.content.length <= 1800)).toBe(
      true,
    );
    expect(result.chunks.every((chunk) => chunk.pageStart === 1)).toBe(true);
    expect(result.chunks.every((chunk) => chunk.pageEnd === 1)).toBe(true);
  });
});
