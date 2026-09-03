import { describe, expect, it } from 'vitest';
import { createFakeD1 } from './helpers/fake-d1';

describe('test D1 harness', () => {
  it('binds values and returns a selected row', async () => {
    const db = createFakeD1();
    await db.prepare('INSERT INTO example (id, value) VALUES (?, ?)').bind('a', 'ok').run();
    await expect(db.prepare<{ value: string }>('SELECT value FROM example WHERE id = ?').bind('a').first())
      .resolves.toEqual({ value: 'ok' });
  });
});
