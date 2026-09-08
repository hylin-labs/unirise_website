import { env } from 'cloudflare:workers';
import {
  hashVisitorIdentifier,
  recordChatOutcome,
  recordEvent,
} from '../../../lib/analytics';
import { isChatRequestAllowed } from '../../../lib/chat-rate-limit';
import { retrieveSiteKnowledge } from '../../../lib/site-knowledge';

const MAX_MESSAGE_LENGTH = 700;
const GROQ_MODEL = 'openai/gpt-oss-20b';
const systemPrompt = `你是「合軒科技有限公司」網站的測試版客服助理。全程使用繁體中文，語氣簡潔、專業、友善。

只能根據「網站檢索結果」回答，不能使用外部知識或自行推論。回答時只陳述檢索結果明確記載的內容；不可補充任何產品能力、應用情境、規格、售價、交期、保固、認證、庫存或技術承諾。若檢索結果不足，請直接說明目前網站沒有提供該細節，並建議訪客使用「詢價系統」或聯絡合軒科技（06-3319283／info-unirise@unirise.tw）。
不可要求或處理身分證、信用卡、帳密、完整地址或其他敏感個資。`;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type ChatHandlerOptions = {
  db: D1Database;
  groqApiKey?: string;
  isAllowed?: typeof isChatRequestAllowed;
  fetcher?: typeof fetch;
  retrieveKnowledge?: typeof retrieveSiteKnowledge;
};

function validHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-6).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const { role, content } = item as { role?: unknown; content?: unknown };
    if (
      (role !== 'user' && role !== 'assistant') ||
      typeof content !== 'string'
    )
      return [];
    return [{ role, content: content.slice(0, MAX_MESSAGE_LENGTH) }];
  });
}

function json(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function visibleAnswer(answer: string) {
  return answer.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '').trim();
}

export function createChatHandler({
  db,
  groqApiKey,
  isAllowed = isChatRequestAllowed,
  fetcher = fetch,
  retrieveKnowledge = retrieveSiteKnowledge,
}: ChatHandlerOptions) {
  return async function handleChat(request: Request) {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return json('origin_not_allowed', 403);

    let body: { message?: unknown; history?: unknown };
    try {
      body = await request.json();
    } catch {
      return json('invalid_request', 400);
    }

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > MAX_MESSAGE_LENGTH)
      return json('invalid_message', 400);
    if (!groqApiKey) return json('chat_not_configured', 503);

    const visitorId =
      request.headers.get('CF-Connecting-IP') ??
      request.headers.get('x-forwarded-for') ??
      'unknown';
    const visitorHash = await hashVisitorIdentifier(visitorId);
    let sources: Awaited<ReturnType<typeof retrieveSiteKnowledge>>;
    try {
      if (!(await isAllowed(db, visitorId))) return json('rate_limited', 429);
      try {
        await recordEvent(db, {
          visitorHash,
          name: 'chat_question',
          path: '/chat',
        });
      } catch {
        // Analytics must never prevent a visitor from using chat.
      }
      sources = await retrieveKnowledge(db, message);
    } catch {
      return json('chat_unavailable', 503);
    }
    if (sources.length === 0) {
      try {
        await Promise.all([
          recordEvent(db, {
            visitorHash,
            name: 'chat_unanswered',
            path: '/chat',
          }),
          recordChatOutcome(db, {
            question: message,
            outcome: 'unanswered',
            sourceIds: [],
          }),
        ]);
      } catch {
        // Analytics must never prevent a visitor from receiving the fallback.
      }
      return Response.json(
        {
          answer:
            '目前網站沒有提供這項資訊的細節。建議您使用「詢價系統」或聯絡合軒科技（06-3319283／info-unirise@unirise.tw）。',
          sources: [],
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const websiteContext = sources
      .map((source) => `【${source.title}】\n${source.content}`)
      .join('\n\n');

    try {
      const upstream = await fetcher(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            temperature: 0,
            max_tokens: 260,
            messages: [
              {
                role: 'system',
                content: `${systemPrompt}\n\n網站檢索結果：\n${websiteContext}`,
              },
              ...validHistory(body.history),
              { role: 'user', content: message },
            ],
          }),
        },
      );

      if (!upstream.ok) return json('chat_service_unavailable', 502);
      const response = (await upstream.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const answer = response.choices?.[0]?.message?.content;
      if (typeof answer !== 'string')
        return json('chat_service_unavailable', 502);
      const cleanedAnswer = visibleAnswer(answer);
      if (!cleanedAnswer) return json('chat_service_unavailable', 502);
      try {
        await Promise.all([
          recordEvent(db, {
            visitorHash,
            name: 'chat_answered',
            path: '/chat',
          }),
          recordChatOutcome(db, {
            question: message,
            outcome: 'answered',
            sourceIds: sources.map((source) => source.id),
          }),
        ]);
      } catch {
        // The successful answer is still returned if analytics is unavailable.
      }
      return Response.json(
        {
          answer: cleanedAnswer,
          sources: sources.map(({ title, href }) => ({ title, href })),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch {
      return json('chat_service_unavailable', 502);
    }
  };
}

export async function POST(request: Request) {
  const runtime = env as unknown as {
    DB: D1Database;
    GROQ_API_KEY?: string;
  };
  return createChatHandler({
    db: runtime.DB,
    groqApiKey: runtime.GROQ_API_KEY,
  })(request);
}
