import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../../../lib/admin-auth';
import { GROQ_CHAT_ENDPOINT } from '../../../../lib/groq-endpoint';
import {
  requestGroqCompletion,
  type GroqProxyBinding,
} from '../../../../lib/groq-proxy';

const PRIMARY_MODEL = 'qwen/qwen3.8-27b';
const FALLBACK_MODEL = 'openai/gpt-oss-120b';
const REQUEST_TIMEOUT_MS = 10_000;

type Runtime = {
  DB: D1Database;
  GROQ_API_KEY?: string;
  GROQ_PROXY?: GroqProxyBinding;
};
type Authenticate = typeof requireAdmin;
type Fetcher = typeof fetch;
type CheckResult = {
  model: string;
  status: 'healthy' | 'http_error' | 'connection_failed' | 'timeout';
  httpStatus?: number;
};

function json(payload: object, status = 200) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function checkModel(
  model: string,
  groqApiKey: string,
  fetcher: Fetcher,
  groqProxy?: GroqProxyBinding,
): Promise<CheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await requestGroqCompletion(
      GROQ_CHAT_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 4,
          messages: [{ role: 'user', content: 'Reply with OK.' }],
        }),
      },
      fetcher,
      groqProxy,
    );
    if (response.ok) return { model, status: 'healthy' };
    return { model, status: 'http_error', httpStatus: response.status };
  } catch (error) {
    if (controller.signal.aborted) return { model, status: 'timeout' };
    console.error('ai_health_provider_failure', {
      kind: 'request',
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return { model, status: 'connection_failed' };
  } finally {
    clearTimeout(timer);
  }
}

export function createAiHealthHandler(
  runtime: Runtime,
  authenticate: Authenticate = requireAdmin,
  fetcher: Fetcher = fetch,
) {
  return async function handleAiHealth(request: Request) {
    const actor = await authenticate(request, runtime.DB);
    if (!actor) return json({ error: 'unauthorized' }, 401);
    if (request.method !== 'GET')
      return json({ error: 'method_not_allowed' }, 405);
    if (!runtime.GROQ_API_KEY)
      return json({ provider: 'groq', status: 'not_configured' }, 503);

    const primary = await checkModel(
      PRIMARY_MODEL,
      runtime.GROQ_API_KEY,
      fetcher,
      runtime.GROQ_PROXY,
    );
    if (primary.status === 'healthy')
      return json({ provider: 'groq', status: 'healthy', primary });

    // Qwen is a preview model. Check GPT-OSS separately so administrators can
    // distinguish a model issue from a complete provider connection failure.
    const fallback = await checkModel(
      FALLBACK_MODEL,
      runtime.GROQ_API_KEY,
      fetcher,
      runtime.GROQ_PROXY,
    );
    const status =
      fallback.status === 'healthy' ? 'fallback_healthy' : 'unavailable';
    return json({ provider: 'groq', status, primary, fallback }, 503);
  };
}

function handler(request: Request) {
  return createAiHealthHandler(env as unknown as Runtime)(request);
}

export const GET = handler;
