import { describe, expect, it } from 'vitest';
import { createFakeD1 } from './helpers/fake-d1';
import { seedLegacyContent } from '../lib/seed-content';

describe('legacy content seed', () => {
  it('keeps news 3944 published and addressable by its existing ID', async () => {
    const db = createFakeD1();
    await seedLegacyContent(db);
    const row = await db.prepare('SELECT legacy_id, status FROM managed_news WHERE legacy_id = ?')
      .bind('3944').first<{ legacy_id: string; status: string }>();
    expect(row).toEqual({ legacy_id: '3944', status: 'published' });
  });
});
