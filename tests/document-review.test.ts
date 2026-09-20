import { describe, expect, it } from 'vitest';
import type { AdminIdentity } from '../lib/admin-auth';
import {
  approveAllDocumentChunks,
  completeDocumentExtraction,
  createDocumentInput,
  createStoredDocument,
  findDocumentForExtraction,
  getDocumentReview,
  reviewDocumentChunk,
} from '../lib/document-repository';
import { retrieveSiteKnowledge } from '../lib/site-knowledge';
import { sqliteD1 } from './helpers/sqlite-d1';

const admin: AdminIdentity = {
  id: 'document-review-admin',
  email: 'admin@example.com',
  role: 'admin',
};

async function reviewedFixture() {
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
      originalFilename: 'manual.pdf',
      displayTitle: '技術手冊',
      category: '技術文件',
      sourceLanguage: 'en',
      accessLevel: 'public',
      fileSize: 100,
    }),
    null,
    admin,
    'document-review-fixture',
  );
  const document = await findDocumentForExtraction(
    d1,
    'document-review-fixture',
  );
  if (!document) throw new Error('fixture document missing');
  await completeDocumentExtraction(
    d1,
    document,
    [
      {
        content: 'X-ray inspection detects foreign material.',
        pageStart: 1,
        pageEnd: 1,
      },
      {
        content: 'Use the control panel to review alarms.',
        pageStart: 2,
        pageEnd: 2,
      },
    ],
    2,
    88,
    admin,
  );
  return d1;
}

describe('document review workflow', () => {
  it('keeps each chunk reviewable with its PDF page source', async () => {
    const d1 = await reviewedFixture();
    const review = await getDocumentReview(d1, 'document-review-fixture');

    expect(review.summary).toEqual({
      reviewRequired: 2,
      approved: 0,
      rejected: 0,
    });
    expect(review.chunks[0]).toMatchObject({ pageStart: 1, pageEnd: 1 });
  });

  it('requires a chunk to belong to the selected document before approval', async () => {
    const d1 = await reviewedFixture();
    await expect(
      reviewDocumentChunk(
        d1,
        {
          documentId: 'document-review-fixture',
          chunkId: 'not-a-real-chunk',
          action: 'approve',
        },
        admin,
      ),
    ).rejects.toThrow('document_chunk_not_found');
  });

  it('allows edits, individual approval, and a later batch approval', async () => {
    const d1 = await reviewedFixture();
    const initial = await getDocumentReview(d1, 'document-review-fixture');
    const [first, second] = initial.chunks;

    await reviewDocumentChunk(
      d1,
      {
        documentId: initial.document.id,
        chunkId: first.id,
        action: 'save',
        content: 'Edited inspection guidance.',
      },
      admin,
    );
    let review = await reviewDocumentChunk(
      d1,
      {
        documentId: initial.document.id,
        chunkId: first.id,
        action: 'approve',
      },
      admin,
    );
    expect(review.summary).toEqual({
      reviewRequired: 1,
      approved: 1,
      rejected: 0,
    });
    expect(review.chunks.find((chunk) => chunk.id === first.id)?.content).toBe(
      'Edited inspection guidance.',
    );

    review = await approveAllDocumentChunks(d1, initial.document.id, admin);
    expect(review.summary).toEqual({
      reviewRequired: 0,
      approved: 2,
      rejected: 0,
    });
    expect(review.document.assistantStatus).toBe('approved');
    expect(review.chunks.find((chunk) => chunk.id === second.id)?.status).toBe(
      'approved',
    );
  });

  it('only supplies approved public document segments to the website assistant', async () => {
    const d1 = await reviewedFixture();
    expect(await retrieveSiteKnowledge(d1, 'zh-TW', 'X-ray')).toEqual([]);

    const review = await getDocumentReview(d1, 'document-review-fixture');
    await reviewDocumentChunk(
      d1,
      {
        documentId: review.document.id,
        chunkId: review.chunks[0].id,
        action: 'approve',
      },
      admin,
    );
    await reviewDocumentChunk(
      d1,
      {
        documentId: review.document.id,
        chunkId: review.chunks[1].id,
        action: 'reject',
      },
      admin,
    );

    await expect(retrieveSiteKnowledge(d1, 'zh-TW', 'X-ray')).resolves.toEqual([
      expect.objectContaining({
        id: expect.stringContaining('document:document-review-fixture:chunk:'),
        title: '技術文件：技術手冊（第 1 頁）',
        content: 'X-ray inspection detects foreign material.',
      }),
    ]);
  });

  it('can automatically approve screened document chunks for the public assistant', async () => {
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
        originalFilename: 'automatic.pdf',
        displayTitle: '自動處理手冊',
        category: '技術文件',
        sourceLanguage: 'en',
        accessLevel: 'public',
        fileSize: 100,
      }),
      null,
      admin,
      'automatic-document-fixture',
    );
    const document = await findDocumentForExtraction(
      d1,
      'automatic-document-fixture',
    );
    if (!document) throw new Error('automatic fixture document missing');
    await completeDocumentExtraction(
      d1,
      document,
      [
        {
          content: 'Automatic screening keeps this safe instruction.',
          pageStart: 1,
          pageEnd: 1,
        },
      ],
      1,
      49,
      admin,
      { autoApprove: true, excludedChunkCount: 1 },
    );

    await expect(
      retrieveSiteKnowledge(d1, 'en', 'automatic screening'),
    ).resolves.toEqual([
      expect.objectContaining({
        title: '技術文件：自動處理手冊（第 1 頁）',
      }),
    ]);
  });
});
