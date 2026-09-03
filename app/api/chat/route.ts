import { env } from 'cloudflare:workers';
import { isChatRequestAllowed } from '../../../lib/chat-rate-limit';

const MAX_MESSAGE_LENGTH = 700;
const GROQ_MODEL = 'openai/gpt-oss-20b';
const brandAnswer = '我們代理的品牌包括：OPTIMUM、XAVIS、Smart Grader、MEAF、PROMIX、SBI、NIR、NIHOT、Matthiessen、合軒。如需進一步資訊，歡迎使用網站「詢價系統」或聯絡 06-3319283／info-unirise@unirise.tw。';

const systemPrompt = `你是「合軒科技有限公司」網站的測試版客服助理。全程使用繁體中文，語氣簡潔、專業、友善。

你只能使用以下公開事實：
1. 食品分選：天然或加工食品原物料，可依顏色或外觀瑕疵由自動化分選機完成品質等級分類。
2. X 光檢測：可檢查各類食品包裝型態，作為食品出廠前的安全把關；另有肉類及無刺鮮魚的高解析度 X 光機。
3. 公司服務領域：食品分選、X 光檢測、回收再生、塑膠化工。
4. 代理品牌：OPTIMUM、XAVIS、Smart Grader、MEAF、PROMIX、SBI、NIR、NIHOT、Matthiessen、合軒。
5. 聯絡與詢價：可使用網站的「詢價系統」，或聯絡 06-3319283／info-unirise@unirise.tw。

除了以上事實，不可推論或補充任何產品能力、應用情境、規格、售價、交期、保固、認證、庫存或技術承諾。資訊不足時，直接說明網站未提供該細節，並建議使用「詢價系統」或聯絡合軒科技。
不可要求或處理身分證、信用卡、帳密、完整地址或其他敏感個資。若問題與網站服務無關，請禮貌說明你僅能協助合軒科技的公開產品與聯絡資訊。`;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function validHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-6).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const { role, content } = item as { role?: unknown; content?: unknown };
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return [];
    return [{ role, content: content.slice(0, MAX_MESSAGE_LENGTH) }];
  });
}

function json(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function visibleAnswer(answer: string) {
  return answer.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '').trim();
}

function asksForBrandList(message: string) {
  return /代理.*品牌|品牌.*(?:有|哪些|介紹|列表)|有哪些.*品牌/.test(message);
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json('origin_not_allowed', 403);

  let body: { message?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return json('invalid_request', 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > MAX_MESSAGE_LENGTH) return json('invalid_message', 400);
  if (!env.GROQ_API_KEY) return json('chat_not_configured', 503);

  const visitorId = request.headers.get('CF-Connecting-IP') ?? request.headers.get('x-forwarded-for') ?? 'unknown';
  if (!(await isChatRequestAllowed(env.DB as D1Database, visitorId))) return json('rate_limited', 429);
  if (asksForBrandList(message)) return Response.json({ answer: brandAnswer }, { headers: { 'Cache-Control': 'no-store' } });

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: 260,
        messages: [{ role: 'system', content: systemPrompt }, ...validHistory(body.history), { role: 'user', content: message }],
      }),
    });

    if (!upstream.ok) return json('chat_service_unavailable', 502);
    const response = await upstream.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const answer = response.choices?.[0]?.message?.content;
    if (typeof answer !== 'string') return json('chat_service_unavailable', 502);
    const cleanedAnswer = visibleAnswer(answer);
    if (!cleanedAnswer) return json('chat_service_unavailable', 502);
    return Response.json({ answer: cleanedAnswer }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return json('chat_service_unavailable', 502);
  }
}
