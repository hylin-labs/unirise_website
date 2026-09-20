import { describe, expect, it } from 'vitest';
import { createKnowledgeQualityHandler } from '../app/api/admin/knowledge-quality/route';
import { ContentDatabase } from './helpers/content-d1';

describe('knowledge quality administration', () => {
  it('requires an authenticated administrator', async () => {
    const database = new ContentDatabase();
    const response = await createKnowledgeQualityHandler(
      new Request('https://unirise.test/api/admin/knowledge-quality'),
      database.d1,
      async () => null,
    );
    expect(response.status).toBe(401);
  });

  it('only permits read-only quality checks', async () => {
    const database = new ContentDatabase();
    const response = await createKnowledgeQualityHandler(
      new Request('https://unirise.test/api/admin/knowledge-quality', {
        method: 'POST',
      }),
      database.d1,
      async () => ({ id: 'admin-1', email: 'hungyu@gmail.com', role: 'admin' }),
    );
    expect(response.status).toBe(405);
  });
});
