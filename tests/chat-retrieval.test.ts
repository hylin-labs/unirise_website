import { describe, expect, it, vi } from 'vitest';
import type { AdminIdentity } from '../lib/admin-auth';
import {
  saveKnowledge,
  setKnowledgePublication,
} from '../lib/content-repository';
import { createChatHandler } from '../app/api/chat/route';
import { ContentDatabase } from './helpers/content-d1';

vi.mock('cloudflare:workers', () => ({ env: {} }));

const admin: AdminIdentity = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
};

describe('chat retrieval', () => {
  it('returns source links only for matching published knowledge', async () => {
    const database = new ContentDatabase();
    await saveKnowledge(
      database.d1,
      {
        id: 'draft',
        title: 'Draft source',
        href: '/private',
        body: 'X-ray draft',
        tags: ['xray'],
        status: 'draft',
      },
      admin,
    );
    await saveKnowledge(
      database.d1,
      {
        id: 'public',
        title: 'XAVIS source',
        href: '/catalog?type=brand&id=2',
        body: 'X-ray inspection equipment',
        tags: ['xray'],
        status: 'draft',
      },
      admin,
    );
    await setKnowledgePublication(database.d1, 'public', 'published', admin);
    const handler = createChatHandler({
      db: database.d1,
      groqApiKey: 'test-key',
      isAllowed: async () => true,
      fetcher: async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: '公開回答' } }] }),
          { status: 200 },
        ),
    });

    const response = await handler(
      new Request('https://unirise.example/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'X-ray' }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      answer: '公開回答',
      sources: [{ title: 'XAVIS source', href: '/catalog?type=brand&id=2' }],
    });
  });

  it('returns a controlled response when rate-limit storage fails', async () => {
    const database = new ContentDatabase();
    const handler = createChatHandler({
      db: database.d1,
      groqApiKey: 'test-key',
      isAllowed: async () => {
        throw new Error('D1 unavailable');
      },
    });

    const response = await handler(
      new Request('https://unirise.example/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'X-ray' }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'chat_unavailable',
    });
  });

  it('returns a controlled response when knowledge retrieval fails', async () => {
    const failingDatabase = {
      prepare() {
        throw new Error('D1 unavailable');
      },
    } as unknown as D1Database;
    const handler = createChatHandler({
      db: failingDatabase,
      groqApiKey: 'test-key',
      isAllowed: async () => true,
    });

    const response = await handler(
      new Request('https://unirise.example/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'X-ray' }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'chat_unavailable',
    });
  });
});
