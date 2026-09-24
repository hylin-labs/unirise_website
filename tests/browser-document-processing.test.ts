import { describe, expect, it } from 'vitest';
import type { AdminIdentity } from '../lib/admin-auth';
import { processBrowserExtractedDocument } from '../lib/document-processing';
import {
  createDocumentInput,
  createStoredDocument,
  findDocumentForExtraction,
} from '../lib/document-repository';
import { sqliteD1 } from './helpers/sqlite-d1';

const admin: AdminIdentity = {
  id: 'browser-document-admin',
  email: 'admin@example.com',
  role: 'admin',
};

describe('browser document processing', () => {
  it('stores browser-extracted pages without requiring Worker PDF parsing', async () => {
    const { d1 } = sqliteD1();
    await d1
      .prepare(
        `INSERT INTO admin_users (id, email, role, enabled, created_at, updated_at)
         VALUES (?, ?, 'admin', 1, ?, ?)`,
      )
      .bind(
        admin.id,
        admin.email,
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      )
      .run();
    await createStoredDocument(
      d1,
      createDocumentInput({
        originalFilename: 'browser.pdf',
        displayTitle: '瀏覽器擷取手冊',
        category: '技術文件',
        sourceLanguage: 'en',
        accessLevel: 'public',
        fileSize: 100,
      }),
      null,
      admin,
      'browser-document-fixture',
    );

    await expect(
      processBrowserExtractedDocument(
        { DB: d1 },
        'browser-document-fixture',
        ['First page operating instructions.', 'Second page safety guidance.'],
        admin,
      ),
    ).resolves.toMatchObject({
      documentId: 'browser-document-fixture',
      status: 'approved',
      pageCount: 2,
    });

    await expect(
      findDocumentForExtraction(d1, 'browser-document-fixture'),
    ).resolves.toMatchObject({ assistant_status: 'approved' });
    await expect(
      d1
        .prepare(
          `SELECT page_start, page_end, status FROM knowledge_document_chunks WHERE document_id = ?`,
        )
        .bind('browser-document-fixture')
        .all(),
    ).resolves.toMatchObject({
      results: [
        expect.objectContaining({
          page_start: 1,
          page_end: 2,
          status: 'approved',
        }),
      ],
    });
  });
});
