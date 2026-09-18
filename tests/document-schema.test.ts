import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDocumentInput } from '../lib/document-repository';

describe('document knowledge storage', () => {
  it('keeps source files and extracted chunks in separate tables', async () => {
    const migration = await readFile(
      resolve('drizzle/0004_add_document_knowledge.sql'),
      'utf8',
    );
    expect(migration).toContain('CREATE TABLE knowledge_documents');
    expect(migration).toContain('CREATE TABLE knowledge_document_chunks');
    expect(migration).toContain(
      "access_level IN ('public', 'internal', 'confidential')",
    );
    expect(migration).toContain('ON DELETE CASCADE');
  });

  it('rejects non-PDF files and preserves confidential classification', () => {
    expect(() =>
      createDocumentInput({
        originalFilename: 'quote.xlsx',
        displayTitle: '報價',
        category: '報價',
        sourceLanguage: 'zh-TW',
        accessLevel: 'confidential',
        fileSize: 100,
      }),
    ).toThrow('only PDF files are allowed');
    expect(
      createDocumentInput({
        originalFilename: 'manual.pdf',
        displayTitle: '技術手冊',
        category: '技術文件',
        sourceLanguage: 'en',
        accessLevel: 'confidential',
        fileSize: 100,
      }),
    ).toMatchObject({ accessLevel: 'confidential' });
  });
});
