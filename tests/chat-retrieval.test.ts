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
        body: JSON.stringify({ locale: 'zh-TW', message: 'X-ray' }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      answer: '公開回答',
      sources: [{ title: 'XAVIS source', href: '/catalog?type=brand&id=2' }],
    });
  });

  it('retries with GPT-OSS 120B when the Qwen model is unavailable', async () => {
    const database = new ContentDatabase();
    const requests: RequestInit[] = [];
    const requestedModels: string[] = [];
    const handler = createChatHandler({
      db: database.d1,
      groqApiKey: 'test-key',
      isAllowed: async () => true,
      retrieveKnowledge: async () => [
        {
          id: 'source',
          title: '公開來源',
          href: '/source',
          content: '已公開的測試內容。',
          tags: ['測試'],
        },
      ],
      fetcher: async (_input, init) => {
        requests.push(init ?? {});
        if (typeof init?.body === 'string')
          requestedModels.push(JSON.parse(init.body).model);
        return requests.length === 1
          ? new Response('model_not_found', { status: 404 })
          : new Response(
              JSON.stringify({
                choices: [{ message: { content: '備援回答' } }],
              }),
              { status: 200 },
            );
      },
    });

    const response = await handler(
      new Request('https://unirise.example/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: 'zh-TW', message: '測試問題' }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      answer: '備援回答',
    });
    expect(requests).toHaveLength(2);
    expect(requestedModels).toEqual([
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-120b',
    ]);
  });

  it('uses GPT-OSS when Qwen is blocked by model permissions', async () => {
    const database = new ContentDatabase();
    const requestedModels: string[] = [];
    const handler = createChatHandler({
      db: database.d1,
      groqApiKey: 'test-key',
      isAllowed: async () => true,
      retrieveKnowledge: async () => [
        {
          id: 'source',
          title: '公開來源',
          href: '/source',
          content: '已公開的測試內容。',
          tags: ['測試'],
        },
      ],
      fetcher: async (_input, init) => {
        if (typeof init?.body === 'string')
          requestedModels.push(JSON.parse(init.body).model);
        return requestedModels.length === 1
          ? new Response('model_forbidden', { status: 403 })
          : Response.json({
              choices: [{ message: { content: '備援回答' } }],
            });
      },
    });

    const response = await handler(
      new Request('https://unirise.example/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: 'zh-TW', message: '測試問題' }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      answer: '備援回答',
    });
    expect(requestedModels).toEqual([
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-120b',
    ]);
  });

  it('uses a concise controlled response when the chat provider is temporarily unavailable', async () => {
    const database = new ContentDatabase();
    await saveKnowledge(
      database.d1,
      {
        id: 'fallback-source',
        title: '食品分選方案',
        href: '/catalog?type=industry&id=1',
        body: '網站提供依顏色與外觀進行食品品質等級分類的自動化分選方案。',
        tags: ['食品', '分選'],
        status: 'draft',
      },
      admin,
    );
    await setKnowledgePublication(
      database.d1,
      'fallback-source',
      'published',
      admin,
    );
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = createChatHandler({
      db: database.d1,
      groqApiKey: 'test-key',
      isAllowed: async () => true,
      fetcher: async () => {
        throw new TypeError('fetch failed');
      },
    });

    const response = await handler(
      new Request('https://unirise.example/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: 'zh-TW', message: '食品分選' }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      answer:
        '網站助理暫時無法從現有公開資料確認這項細節。請使用「詢價系統」或聯絡合軒科技（06-3319283／info-unirise@unirise.tw）。',
      sources: [{ title: '食品分選方案', href: '/catalog?type=industry&id=1' }],
    });
    expect(logger).toHaveBeenCalledWith('chat_provider_failure', {
      kind: 'request',
      errorName: 'TypeError',
    });
    logger.mockRestore();
  });

  it('returns reviewed voltage data when a technical-document answer cannot reach the chat provider', async () => {
    const database = new ContentDatabase();
    const handler = createChatHandler({
      db: database.d1,
      groqApiKey: 'test-key',
      isAllowed: async () => true,
      retrieveKnowledge: async () => [
        {
          id: 'document:tsk-148:chunk:technical-data',
          title: '技術文件：TSK 148 XRS（第 41 頁）',
          content:
            '3.3 Voltage V 400 4.2 Voltage V/Hz 400/50 4.3 Control voltage V 24 DC',
          tags: ['技術文件'],
        },
      ],
      fetcher: async () => {
        throw new TypeError('fetch failed');
      },
    });

    const response = await handler(
      new Request('https://unirise.example/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale: 'zh-TW',
          message: 'TSK 148 XRS 需要多少電壓的輸入？',
        }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      answer:
        '依已核准的技術文件：加熱系統為 400 V；液壓動力單元為 400 V／50 Hz；控制電壓為 24 V DC。',
      sources: [{ title: '技術文件：TSK 148 XRS（第 41 頁）' }],
    });
  });

  it('returns reviewed dimensions when a technical-document answer cannot reach the chat provider', async () => {
    const database = new ContentDatabase();
    const handler = createChatHandler({
      db: database.d1,
      groqApiKey: 'test-key',
      isAllowed: async () => true,
      retrieveKnowledge: async () => [
        {
          id: 'document:tsk-148:chunk:technical-data',
          title: '技術文件：TSK 148 XRS（第 46 頁）',
          content: 'Dimensions L x W x H in mm 2993 x 606 x 1372',
          tags: ['技術文件'],
        },
      ],
      fetcher: async () => {
        throw new TypeError('fetch failed');
      },
    });

    const response = await handler(
      new Request('https://unirise.example/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale: 'zh-TW',
          message: 'TSK 148 XRS 尺寸是多少？',
        }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      answer:
        '依已核准的技術文件，TSK 148 XRS 的尺寸（長 × 寬 × 高）為 2993 × 606 × 1372 mm。',
      sources: [{ title: '技術文件：TSK 148 XRS（第 46 頁）' }],
    });
  });

  it('does not mistake a maintenance power-disconnect question for a voltage question', async () => {
    const database = new ContentDatabase();
    const handler = createChatHandler({
      db: database.d1,
      groqApiKey: 'test-key',
      isAllowed: async () => true,
      retrieveKnowledge: async () => [
        {
          id: 'document:tsk-148:chunk:maintenance',
          title: '技術文件：TSK 148 XRS（第 26 頁）',
          content:
            'Before starting maintenance work the entire line has to be shut down and disconnected from power.',
          tags: ['技術文件'],
        },
      ],
      fetcher: async () => {
        throw new TypeError('fetch failed');
      },
    });

    const response = await handler(
      new Request('https://unirise.example/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale: 'zh-TW',
          message: '維護設備時是否必須切斷電源？',
        }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      answer: '依已核准的技術文件，開始維護前必須關閉整條生產線並斷開電源。',
      sources: [{ title: '技術文件：TSK 148 XRS（第 26 頁）' }],
    });
  });

  it('returns reviewed backflush requirements when the provider is unavailable', async () => {
    const database = new ContentDatabase();
    const handler = createChatHandler({
      db: database.d1,
      groqApiKey: 'test-key',
      isAllowed: async () => true,
      retrieveKnowledge: async () => [
        {
          id: 'document:tsk-148:chunk:backflush',
          title: '技術文件：TSK 148 XRS（第 24 頁）',
          content:
            'Backflushing is available after the listed requirements are fulfilled.',
          tags: ['技術文件'],
        },
      ],
      fetcher: async () => {
        throw new TypeError('fetch failed');
      },
    });

    const response = await handler(
      new Request('https://unirise.example/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale: 'zh-TW',
          message: '進行 Backflush 前必須符合哪些條件？',
        }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      answer:
        '依已核准的技術文件，進行反沖洗前必須確認：液壓系統已就緒、整線已達操作溫度、保護蓋已關閉、兩支螺栓在生產位置，且前一次換網程序已完成。',
      sources: [{ title: '技術文件：TSK 148 XRS（第 24 頁）' }],
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
        body: JSON.stringify({ locale: 'zh-TW', message: 'X-ray' }),
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
        body: JSON.stringify({ locale: 'zh-TW', message: 'X-ray' }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'chat_unavailable',
    });
  });
});
