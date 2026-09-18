import { env } from 'cloudflare:workers';
import {
  hashVisitorIdentifier,
  recordChatOutcome,
  recordEvent,
} from '../../../lib/analytics';
import { isChatRequestAllowed } from '../../../lib/chat-rate-limit';
import { retrieveSiteKnowledge } from '../../../lib/site-knowledge';
import { parseLocale, type Locale } from '../../../lib/locales';
import {
  RequestTooLargeError,
  readLimitedRequestBody,
} from '../../../lib/request-body';

const MAX_MESSAGE_LENGTH = 700;
const MAX_BODY_BYTES = 12_000;
const GROQ_MODEL = 'openai/gpt-oss-20b';
const systemPrompts: Record<Locale, string> = {
  'zh-TW': `你是「合軒科技有限公司」網站的測試版客服助理。全程使用繁體中文，語氣簡潔、專業、友善。

只能根據「網站檢索結果」回答，不能使用外部知識或自行推論。回答時只陳述檢索結果明確記載的內容；不可補充任何產品能力、應用情境、規格、售價、交期、保固、認證、庫存或技術承諾。若檢索結果不足，請直接說明目前網站沒有提供該細節，並建議訪客使用「詢價系統」或聯絡合軒科技（06-3319283／info-unirise@unirise.tw）。
不可要求或處理身分證、信用卡、帳密、完整地址或其他敏感個資。`,
  en: `You are the beta customer support assistant for the Unirise website. Respond only in English, briefly, professionally, and kindly.

Answer only from the website retrieval results. Do not use external knowledge or make inferences. State only facts explicitly present in the results. Do not add product capabilities, applications, specifications, prices, lead times, warranties, certifications, stock availability, or technical commitments. If the results are insufficient, explain that the website does not provide that detail and suggest the Inquiry form or contacting Unirise at 06-3319283 / info-unirise@unirise.tw. Use English site links beginning with /en for public pages.
Do not request or process identity numbers, credit cards, credentials, full addresses, or other sensitive personal information.`,
};

const fallbackAnswers: Record<Locale, string> = {
  'zh-TW':
    '目前網站沒有提供這項資訊的細節。建議您使用「詢價系統」或聯絡合軒科技（06-3319283／info-unirise@unirise.tw）。',
  en: 'The website does not currently provide details on this topic. Please use the Inquiry form or contact Unirise at 06-3319283 / info-unirise@unirise.tw.',
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type KnowledgeSource = Awaited<ReturnType<typeof retrieveSiteKnowledge>>[number];

type ChatHandlerOptions = {
  db: D1Database;
  groqApiKey?: string;
  isAllowed?: typeof isChatRequestAllowed;
  fetcher?: typeof fetch;
  retrieveKnowledge?: typeof retrieveSiteKnowledge;
  analyticsHashPepper?: string;
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

function sourceFallbackAnswer(locale: Locale, sources: KnowledgeSource[]) {
  const summary = sources
    .slice(0, 3)
    .map((source) => {
      const content = source.content.replace(/\s+/g, ' ').trim().slice(0, 360);
      return `• ${source.title}：${content}`;
    })
    .join('\n');
  const closing =
    locale === 'en'
      ? 'For specifications, project suitability, or a quotation, please use the Inquiry form or contact Unirise at 06-3319283 / info-unirise@unirise.tw.'
      : '如需規格、適用性或報價，請使用「詢價系統」或聯絡合軒科技（06-3319283／info-unirise@unirise.tw）。';
  return `${locale === 'en' ? 'Based on published website information:' : '依網站已公開的相關資訊：'}\n${summary}\n\n${closing}`;
}

function reportChatProviderFailure(
  kind: 'http' | 'response' | 'request',
  details: Record<string, string | number | boolean>,
) {
  // 僅保留可用於診斷的中繼資料，絕不可記錄金鑰、訪客問題或檢索內容。
  console.error('chat_provider_failure', { kind, ...details });
}

function sourceFallbackResponse(locale: Locale, sources: KnowledgeSource[]) {
  return Response.json(
    {
      answer: sourceFallbackAnswer(locale, sources),
      sources: sources.map(({ title, href }) => ({ title, href })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export function createChatHandler({
  db,
  groqApiKey,
  isAllowed = isChatRequestAllowed,
  fetcher = fetch,
  retrieveKnowledge = retrieveSiteKnowledge,
  analyticsHashPepper = '',
}: ChatHandlerOptions) {
  return async function handleChat(request: Request) {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return json('origin_not_allowed', 403);

    let body: { message?: unknown; history?: unknown; locale?: unknown };
    try {
      const value: unknown = JSON.parse(
        await readLimitedRequestBody(request, MAX_BODY_BYTES),
      );
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return json('invalid_request', 400);
      body = value;
    } catch (error) {
      if (error instanceof RequestTooLargeError)
        return json('request_too_large', 413);
      return json('invalid_request', 400);
    }

    const locale = parseLocale(body.locale);
    if (!locale) return json('invalid_locale', 400);
    const chatPath = locale === 'en' ? '/en/chat' : '/chat';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > MAX_MESSAGE_LENGTH)
      return json('invalid_message', 400);
    if (!groqApiKey) return json('chat_not_configured', 503);

    const visitorId =
      request.headers.get('CF-Connecting-IP') ??
      request.headers.get('x-forwarded-for') ??
      'unknown';
    let visitorHash: string | null = null;
    if (analyticsHashPepper) {
      try {
        visitorHash = await hashVisitorIdentifier(
          visitorId,
          analyticsHashPepper,
          'chat-visitor',
        );
      } catch {
        // Chat remains available when analytics configuration is unavailable.
      }
    }
    let sources: Awaited<ReturnType<typeof retrieveSiteKnowledge>>;
    try {
      if (!(await isAllowed(db, visitorId, analyticsHashPepper))) {
        return json('rate_limited', 429);
      }
      if (visitorHash) {
        try {
          await recordEvent(db, {
            visitorHash,
            name: 'chat_question',
            path: chatPath,
            locale,
          });
        } catch {
          // Analytics must never prevent a visitor from using chat.
        }
      }
      sources = await retrieveKnowledge(db, locale, message);
    } catch {
      return json('chat_unavailable', 503);
    }
    if (sources.length === 0) {
      if (visitorHash) {
        try {
          await Promise.all([
            recordEvent(db, {
              visitorHash,
              name: 'chat_unanswered',
              path: chatPath,
              locale,
            }),
            recordChatOutcome(db, {
              locale,
              question: message,
              outcome: 'unanswered',
              sourceIds: [],
            }),
          ]);
        } catch {
          // Analytics must never prevent a visitor from receiving the fallback.
        }
      }
      return Response.json(
        {
          answer: fallbackAnswers[locale],
          sources: [],
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const websiteContext = sources
      .map((source) => `[${source.title}](${source.href})\n${source.content}`)
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
                content: `${systemPrompts[locale]}\n\n${locale === 'en' ? 'Website retrieval results:' : '網站檢索結果：'}\n${websiteContext}`,
              },
              ...validHistory(body.history),
              { role: 'user', content: message },
            ],
          }),
        },
      );

      if (!upstream.ok) {
        reportChatProviderFailure('http', {
          status: upstream.status,
          contentType: upstream.headers.get('content-type') ?? 'unknown',
        });
        return sourceFallbackResponse(locale, sources);
      }
      const response = (await upstream.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const answer = response.choices?.[0]?.message?.content;
      if (typeof answer !== 'string') {
        reportChatProviderFailure('response', {
          hasChoices: Array.isArray(response.choices),
        });
        return sourceFallbackResponse(locale, sources);
      }
      const cleanedAnswer = visibleAnswer(answer);
      if (!cleanedAnswer) {
        reportChatProviderFailure('response', { hasChoices: true });
        return sourceFallbackResponse(locale, sources);
      }
      if (visitorHash) {
        try {
          await Promise.all([
            recordEvent(db, {
              visitorHash,
              name: 'chat_answered',
              path: chatPath,
              locale,
            }),
            recordChatOutcome(db, {
              locale,
              question: message,
              outcome: 'answered',
              sourceIds: sources.map((source) => source.id),
            }),
          ]);
        } catch {
          // The successful answer is still returned if analytics is unavailable.
        }
      }
      return Response.json(
        {
          answer: cleanedAnswer,
          sources: sources.map(({ title, href }) => ({ title, href })),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      reportChatProviderFailure('request', {
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      return sourceFallbackResponse(locale, sources);
    }
  };
}

export async function POST(request: Request) {
  const runtime = env as unknown as {
    DB: D1Database;
    GROQ_API_KEY?: string;
    ANALYTICS_HASH_PEPPER?: string;
  };
  return createChatHandler({
    db: runtime.DB,
    groqApiKey: runtime.GROQ_API_KEY,
    analyticsHashPepper: runtime.ANALYTICS_HASH_PEPPER,
  })(request);
}
