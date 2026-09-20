import { describe, expect, it, vi } from 'vitest';
import { createAiHealthHandler } from '../app/api/admin/ai-health/route';

const authenticated = async () => ({
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'admin' as const,
});

function request(method = 'GET') {
  return new Request('https://unirise.craniai.com/api/admin/ai-health', {
    method,
  });
}

describe('AI provider health endpoint', () => {
  it('requires an administrator session', async () => {
    const handler = createAiHealthHandler(
      { DB: {} as D1Database, GROQ_API_KEY: 'server-only-key' },
      async () => null,
    );

    const response = await handler(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('reports a healthy Qwen chat completion without exposing the key', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: 'OK' } }] }),
    );
    const handler = createAiHealthHandler(
      { DB: {} as D1Database, GROQ_API_KEY: 'server-only-key' },
      authenticated,
      fetcher,
    );

    const response = await handler(request());
    expect(response.status).toBe(200);
    const payload = await response.text();
    expect(JSON.parse(payload)).toEqual({
      provider: 'groq',
      status: 'healthy',
      primary: { model: 'qwen/qwen3.8-27b', status: 'healthy' },
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(payload).not.toContain('server-only-key');
  });

  it('checks GPT-OSS when the primary model is rejected', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: 'OK' } }] }),
      );
    const handler = createAiHealthHandler(
      { DB: {} as D1Database, GROQ_API_KEY: 'server-only-key' },
      authenticated,
      fetcher,
    );

    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      provider: 'groq',
      status: 'fallback_healthy',
      primary: {
        model: 'qwen/qwen3.8-27b',
        status: 'http_error',
        httpStatus: 404,
      },
      fallback: { model: 'openai/gpt-oss-120b', status: 'healthy' },
    });
  });

  it('does not reveal network error details', async () => {
    const handler = createAiHealthHandler(
      { DB: {} as D1Database, GROQ_API_KEY: 'server-only-key' },
      authenticated,
      async () => {
        throw new TypeError('network path contains private data');
      },
    );

    const response = await handler(request());
    const payload = JSON.stringify(await response.json());
    expect(response.status).toBe(503);
    expect(payload).toContain('connection_failed');
    expect(payload).not.toContain('private data');
    expect(payload).not.toContain('server-only-key');
  });
});
