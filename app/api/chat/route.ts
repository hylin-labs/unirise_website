import { env } from 'cloudflare:workers';
import {
  hashVisitorIdentifier,
  recordChatOutcome,
  recordEvent,
} from '../../../lib/analytics';
import { isChatRequestAllowed } from '../../../lib/chat-rate-limit';
import {
  answerFromStructuredFacts,
  retrieveSiteKnowledge,
  type SiteKnowledgeSource,
} from '../../../lib/site-knowledge';
import { parseLocale, type Locale } from '../../../lib/locales';
import {
  RequestTooLargeError,
  readLimitedRequestBody,
} from '../../../lib/request-body';
import { GROQ_CHAT_ENDPOINT } from '../../../lib/groq-endpoint';

const MAX_MESSAGE_LENGTH = 700;
const MAX_BODY_BYTES = 12_000;
const PRIMARY_GROQ_MODEL = 'qwen/qwen3.8-27b';
const FALLBACK_GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_REQUEST_TIMEOUT_MS = 15_000;
const QWEN_FALLBACK_STATUSES = new Set([
  400, 403, 404, 410, 422, 429, 500, 502, 503, 504,
]);
const systemPrompts: Record<Locale, string> = {
  'zh-TW': `你是「合軒科技有限公司」網站的測試版客服助理。全程使用繁體中文，語氣簡潔、專業、友善。

只能根據「網站檢索結果」回答，不能使用外部知識或自行推論。將內容消化後，以自己的繁體中文直接、簡潔地回答問題；不可貼出長篇英文原文、逐字翻譯整段手冊或補充未記載的內容。絕不可輸出來源、參考文件、技術文件名稱、頁碼、段落、連結或引用格式。不可補充任何產品能力、應用情境、規格、售價、交期、保固、認證、庫存或技術承諾。若檢索結果不足，請直接說明目前網站沒有提供該細節，並建議訪客使用「詢價系統」或聯絡合軒科技（06-3319283／info-unirise@unirise.tw）。
不可要求或處理身分證、信用卡、帳密、完整地址或其他敏感個資。`,
  en: `You are the beta customer support assistant for the Unirise website. Respond only in English, briefly, professionally, and kindly.

Answer only from the website retrieval results. Do not use external knowledge or make inferences. Summarize the relevant facts in a direct, concise answer. Never expose sources, reference documents, document names, page numbers, excerpts, URLs, or citation formats. Do not add product capabilities, applications, specifications, prices, lead times, warranties, certifications, stock availability, or technical commitments. If the results are insufficient, explain that the website does not provide that detail and suggest the Inquiry form or contacting Unirise at 06-3319283 / info-unirise@unirise.tw. Use English site links beginning with /en for public pages.
Do not request or process identity numbers, credit cards, credentials, full addresses, or other sensitive personal information.`,
};

const fallbackAnswers: Record<Locale, string> = {
  'zh-TW':
    '目前網站沒有提供這項資訊的細節。建議您使用「詢價系統」或聯絡合軒科技（06-3319283／info-unirise@unirise.tw）。',
  en: 'The website does not currently provide details on this topic. Please use the Inquiry form or contact Unirise at 06-3319283 / info-unirise@unirise.tw.',
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type KnowledgeSource = SiteKnowledgeSource;

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
  return answer
    .replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '')
    .replace(/\[(?:[^\]]+)\]\([^)]*\)/g, '')
    .replace(
      /(?:根據|依據|依)[^。\n]{0,24}?(?:技術文件|參考文件|操作手冊)(?:第\s*\d+\s*頁)?[，,:：]?\s*/g,
      '',
    )
    .replace(
      /(?:according to|based on)[^.\n]{0,42}?(?:technical document|reference document|manual)(?:\s*,?\s*page\s*\d+)?[,:]?\s*/gi,
      '',
    )
    .split(/\n+/)
    .filter(
      (line) =>
        !/^\s*(?:來源|參考(?:資料|文件)?|技術文件|source(?:s)?|references?|citations?|page)\s*[:：]/i.test(
          line,
        ),
    )
    .join('\n')
    .trim();
}

function documentText(sources: KnowledgeSource[]) {
  return sources
    .filter((source) => !source.href)
    .map((source) => source.content.replace(/\s+/g, ' '))
    .join(' ');
}

function isCommercialQuestion(question: string) {
  return /價格|報價|費用|交期|price|pricing|cost|lead time/i.test(question);
}

function hasVoltageIntent(question: string) {
  return (
    /電壓|伏特|voltage|volt/i.test(question) ||
    /(?:多少|幾|how much|what|which).*(?:供電|輸入|input|supply|power supply)/i.test(
      question,
    )
  );
}

function voltageFallbackAnswer(
  locale: Locale,
  sources: KnowledgeSource[],
  question: string,
) {
  if (!hasVoltageIntent(question) || !sources.some((source) => !source.href))
    return null;
  const text = documentText(sources);
  const heatingVoltage = text.match(
    /(?:3\.3\s+)?Voltage\s+V\s+(\d+(?:\.\d+)?)/i,
  )?.[1];
  const hydraulicVoltage = text.match(
    /(?:4\.2\s+)?Voltage\s+V\/Hz\s+(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/i,
  );
  const controlVoltage = text.match(
    /(?:4\.3\s+)?Control voltage\s+V\s+(\d+(?:\.\d+)?)\s*(DC|AC)?/i,
  );
  if (!heatingVoltage && !hydraulicVoltage && !controlVoltage) return null;

  if (locale === 'en') {
    const details = [
      heatingVoltage ? `heating system: ${heatingVoltage} V` : null,
      hydraulicVoltage
        ? `hydraulic power unit: ${hydraulicVoltage[1]} V / ${hydraulicVoltage[2]} Hz`
        : null,
      controlVoltage
        ? `control voltage: ${controlVoltage[1]} V${controlVoltage[2] ? ` ${controlVoltage[2]}` : ''}`
        : null,
    ].filter((detail): detail is string => Boolean(detail));
    return `${details.join('; ')}.`;
  }
  const details = [
    heatingVoltage ? `加熱系統為 ${heatingVoltage} V` : null,
    hydraulicVoltage
      ? `液壓動力單元為 ${hydraulicVoltage[1]} V／${hydraulicVoltage[2]} Hz`
      : null,
    controlVoltage
      ? `控制電壓為 ${controlVoltage[1]} V${controlVoltage[2] ? ` ${controlVoltage[2]}` : ''}`
      : null,
  ].filter((detail): detail is string => Boolean(detail));
  return `${details.join('；')}。`;
}

function technicalFallbackAnswer(
  locale: Locale,
  sources: KnowledgeSource[],
  question: string,
) {
  const text = documentText(sources);
  if (!text) return null;
  const hasDocumentPage = (page: number) =>
    sources.some(
      (source) =>
        !source.href && new RegExp(`第 ${page}(?:[- ]| 頁)`).test(source.title),
    );

  if (
    /尺寸|長寬高|dimensions?|length.*width.*height|l\s*[x×]/i.test(question)
  ) {
    const dimensions = text.match(
      /Dimensions\s+L\s*x\s*W\s*x\s*H\s+in\s+mm\s+(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i,
    );
    if (dimensions) {
      return locale === 'en'
        ? `The TSK 148 XRS dimensions (L × W × H) are ${dimensions[1]} × ${dimensions[2]} × ${dimensions[3]} mm.`
        : `TSK 148 XRS 的尺寸（長 × 寬 × 高）為 ${dimensions[1]} × ${dimensions[2]} × ${dimensions[3]} mm。`;
    }
  }

  if (
    /(?:維護|保養|maintenance).*(?:斷電|切斷|電源|power|disconnect)|(?:斷電|切斷|電源|disconnect).*(?:維護|保養|maintenance)/i.test(
      question,
    ) &&
    (/shut down and disconnected from power/i.test(text) || hasDocumentPage(26))
  ) {
    return locale === 'en'
      ? 'Before maintenance, shut down the entire line and disconnect it from power.'
      : '開始維護前，必須關閉整條生產線並斷開電源。';
  }

  if (
    /反沖洗|backflush/i.test(question) &&
    (/hydraulic is ready.*whole line has reached operating temperature.*protection covers are closed.*both bolts are in production position.*previous screen changing process is completed/i.test(
      text,
    ) ||
      hasDocumentPage(24))
  ) {
    return locale === 'en'
      ? 'Before backflushing, the hydraulic system must be ready, the full line must be at operating temperature, the protection covers must be closed, both bolts must be in production position, and the previous screen-change process must be complete.'
      : '進行反沖洗前，請確認液壓系統已就緒、整線已達操作溫度、保護蓋已關閉、兩支螺栓在生產位置，且前一次換網程序已完成。';
  }

  if (
    /緊急停止|emergency\s*-?\s*stop/i.test(question) &&
    /stops.*movement.*switches off.*hydraulic/i.test(text)
  ) {
    return locale === 'en'
      ? 'The emergency stop immediately stops screen-changer movement and switches off the associated hydraulic power unit.'
      : '緊急停止會立即停止換網器移動，並關閉相關液壓動力單元。';
  }

  return null;
}

function touchScreenFallbackAnswer(
  locale: Locale,
  sources: KnowledgeSource[],
  question: string,
) {
  if (
    !/觸控螢幕|觸摸螢幕|觸碰螢幕|touch\s*screen|screen\s*size/i.test(
      question,
    )
  )
    return null;
  const text = documentText(sources);
  const size =
    text.match(
      /(?:to|with|a|an)?\s*(\d+(?:\.\d+)?)\s*(?:"|″|inch(?:es)?)\s+touch\s*screen/i,
    )?.[1] ??
    text.match(
      /touch\s*screen(?:\s+(?:panel|panel\s+pc))?[^\d]{0,60}(\d+(?:\.\d+)?)\s*(?:"|″|inch(?:es)?)/i,
    )?.[1];
  if (!size) return null;
  return locale === 'en'
    ? `This equipment uses a ${size}-inch touch-screen panel PC with the corresponding software.`
    : `這套設備配備 ${size} 吋觸控螢幕面板電腦，並搭配相對應軟體。`;
}

function websiteKnowledgeFallbackAnswer(
  sources: KnowledgeSource[],
  question: string,
) {
  const foodSortingSource =
    /食品.*分選|食材.*分選|food\s*sorting/i.test(question)
      ? sources.find((candidate) => candidate.id === 'catalog-optimum')
      : null;
  const source =
    foodSortingSource ??
    sources.find(
      (candidate) => candidate.href && candidate.content.trim().length > 0,
    );
  if (!source) return null;
  // 公開網站資料本身已是經整理的內容。供應商暫時不可用時，仍將最相關的
  // 網站資訊直接提供給訪客，而非誤導地說沒有答案。
  return source.content.replace(/\s+/g, ' ').trim().slice(0, 900);
}

function sourceFallbackAnswer(
  locale: Locale,
  sources: KnowledgeSource[],
  question: string,
) {
  if (isCommercialQuestion(question)) {
    return locale === 'en'
      ? 'The public website does not provide price or lead-time details. Please use the Inquiry form or contact Unirise at 06-3319283 / info-unirise@unirise.tw.'
      : '公開網站沒有提供價格或交期細節。請使用「詢價系統」或聯絡合軒科技（06-3319283／info-unirise@unirise.tw）。';
  }
  const voltageAnswer = voltageFallbackAnswer(locale, sources, question);
  if (voltageAnswer) return voltageAnswer;
  const technicalAnswer = technicalFallbackAnswer(locale, sources, question);
  if (technicalAnswer) return technicalAnswer;
  const documentAnswer = touchScreenFallbackAnswer(locale, sources, question);
  if (documentAnswer) return documentAnswer;
  const websiteAnswer = websiteKnowledgeFallbackAnswer(sources, question);
  if (websiteAnswer) return websiteAnswer;
  return locale === 'en'
    ? 'The assistant is temporarily unable to confirm this detail from the available public information. Please use the Inquiry form or contact Unirise at 06-3319283 / info-unirise@unirise.tw.'
    : '網站助理暫時無法從現有公開資料確認這項細節。請使用「詢價系統」或聯絡合軒科技（06-3319283／info-unirise@unirise.tw）。';
}

function reportChatProviderFailure(
  kind: 'http' | 'response' | 'request',
  details: Record<string, string | number | boolean>,
) {
  // 僅保留可用於診斷的中繼資料，絕不可記錄金鑰、訪客問題或檢索內容。
  console.error('chat_provider_failure', { kind, ...details });
}

function answerResponse(
  locale: Locale,
  sources: KnowledgeSource[],
  question: string,
) {
  return Response.json(
    { answer: sourceFallbackAnswer(locale, sources, question) },
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

    let locale = parseLocale(body.locale);
    if (!locale) return json('invalid_locale', 400);
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > MAX_MESSAGE_LENGTH)
      return json('invalid_message', 400);
    if (/[\u4e00-\u9fff]/.test(message)) locale = 'zh-TW';
    const chatPath = locale === 'en' ? '/en/chat' : '/chat';
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
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const structuredFactAnswer = answerFromStructuredFacts(
      locale,
      sources,
      message,
    );
    if (structuredFactAnswer) {
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
          // Analytics must never prevent a verified answer.
        }
      }
      return Response.json(
        {
          answer: structuredFactAnswer,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const websiteContext = sources
      .map((source) => `[${source.title}](${source.href})\n${source.content}`)
      .join('\n\n');

    try {
      const messages = [
        {
          role: 'system' as const,
          content: `${systemPrompts[locale]}\n\n${locale === 'en' ? 'Website retrieval results:' : '網站檢索結果：'}\n${websiteContext}`,
        },
        ...validHistory(body.history),
        { role: 'user' as const, content: message },
      ];
      const requestCompletion = async (model: string) => {
        const send = async () => {
          const controller = new AbortController();
          const timer = setTimeout(
            () => controller.abort(),
            GROQ_REQUEST_TIMEOUT_MS,
          );
          try {
            return await fetcher(
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
                  max_tokens: 260,
                  messages,
                }),
              },
            );
          } finally {
            clearTimeout(timer);
          }
        };
        try {
          return await send();
        } catch (error) {
          // A single retry covers short-lived connection resets without turning
          // a persistent provider outage into unbounded visitor traffic.
          if (!(error instanceof TypeError)) throw error;
          return send();
        }
      };
      let upstream = await requestCompletion(PRIMARY_GROQ_MODEL);

      // Qwen is a preview model. If it is unavailable, rate limited, rejected
      // by model permissions, or has a provider-side failure, use the stable
      // GPT-OSS model before returning the safe document fallback.
      if (!upstream.ok && QWEN_FALLBACK_STATUSES.has(upstream.status))
        upstream = await requestCompletion(FALLBACK_GROQ_MODEL);

      if (!upstream.ok) {
        reportChatProviderFailure('http', {
          status: upstream.status,
          contentType: upstream.headers.get('content-type') ?? 'unknown',
        });
        return answerResponse(locale, sources, message);
      }
      const response = (await upstream.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const answer = response.choices?.[0]?.message?.content;
      if (typeof answer !== 'string') {
        reportChatProviderFailure('response', {
          hasChoices: Array.isArray(response.choices),
        });
        return answerResponse(locale, sources, message);
      }
      const cleanedAnswer = visibleAnswer(answer);
      if (!cleanedAnswer) {
        reportChatProviderFailure('response', { hasChoices: true });
        return answerResponse(locale, sources, message);
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
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      reportChatProviderFailure('request', {
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      return answerResponse(locale, sources, message);
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
