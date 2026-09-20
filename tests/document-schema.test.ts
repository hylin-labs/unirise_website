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

  it('stores extraction progress separately from the original PDF', async () => {
    const migration = await readFile(
      resolve('drizzle/0005_add_document_extraction_metadata.sql'),
      'utf8',
    );
    expect(migration).toContain('extraction_page_count');
    expect(migration).toContain('extraction_error');
  });

  it('adds versioned, reviewable facts without changing the original PDF record', async () => {
    const migration = await readFile(
      resolve('drizzle/0006_add_structured_knowledge_foundation.sql'),
      'utf8',
    );
    expect(migration).toContain('CREATE TABLE knowledge_document_lineages');
    expect(migration).toContain('CREATE TABLE knowledge_document_versions');
    expect(migration).toContain('CREATE TABLE knowledge_document_facts');
    expect(migration).toContain(
      "review_status IN ('pending', 'approved', 'rejected', 'excluded')",
    );
    expect(migration).toContain('source_page_start INTEGER NOT NULL');
    expect(migration).toContain('confidence >= 0 AND confidence <= 1');
    expect(migration).toContain('ON DELETE SET NULL');
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
