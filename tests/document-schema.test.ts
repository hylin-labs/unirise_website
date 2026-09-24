import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  createDocumentInput,
  documentMimeTypeForFilename,
} from '../lib/document-repository';

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

  it('stores multiple configurable LINE contacts without storing QR images separately', async () => {
    const migration = await readFile(
      resolve('drizzle/0007_add_line_contact_settings.sql'),
      'utf8',
    );
    expect(migration).toContain('CREATE TABLE site_line_contacts');
    expect(migration).toContain('line_url TEXT NOT NULL');
    expect(migration).toContain('enabled INTEGER NOT NULL DEFAULT 1');
    expect(migration).toContain('display_order INTEGER NOT NULL DEFAULT 0');
  });

  it('accepts common technical document formats and preserves confidential classification', () => {
    expect(documentMimeTypeForFilename('manual.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(documentMimeTypeForFilename('presentation.pptx')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(
      createDocumentInput({
        originalFilename: 'manual.docx',
        displayTitle: '技術手冊',
        category: '技術文件',
        sourceLanguage: 'en',
        accessLevel: 'public',
        fileSize: 100,
      }),
    ).toMatchObject({
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(
      createDocumentInput({
        originalFilename: 'training.pptx',
        displayTitle: '教育訓練',
        category: '技術文件',
        sourceLanguage: 'zh-TW',
        accessLevel: 'public',
        fileSize: 100,
      }),
    ).toMatchObject({
      mimeType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    expect(() =>
      createDocumentInput({
        originalFilename: 'legacy-manual.doc',
        displayTitle: '報價',
        category: '報價',
        sourceLanguage: 'zh-TW',
        accessLevel: 'confidential',
        fileSize: 100,
      }),
    ).toThrow('only_pdf_docx_pptx_files_are_allowed');
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
