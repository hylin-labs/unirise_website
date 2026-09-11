export type ResendRuntime = {
  apiKey: string | undefined;
  fromEmail: string | undefined;
  fetch?: typeof fetch;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendLoginCode(
  { to, code }: { to: string; code: string },
  runtime: ResendRuntime,
): Promise<void> {
  if (typeof window !== 'undefined')
    throw new Error('Resend mail can only be sent from the server');
  if (!runtime.apiKey || !runtime.fromEmail)
    throw new Error('Resend is not configured');
  const escapedTo = escapeHtml(to);
  const escapedCode = escapeHtml(code);
  const fetchRequest = runtime.fetch ?? fetch;
  const response = await fetchRequest('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${runtime.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: runtime.fromEmail,
      to: [to],
      subject: 'Your Unirise admin sign-in code',
      text: `Your Unirise admin sign-in code is ${code}. It expires in 10 minutes.`,
      html: `<p>Sign-in requested for ${escapedTo}.</p><p>Your Unirise admin sign-in code is <strong>${escapedCode}</strong>.</p><p>It expires in 10 minutes.</p>`,
    }),
  });
  if (!response.ok)
    throw new Error(`Resend delivery failed with status ${response.status}`);
}

export async function sendLeadNotification(
  message: {
    to: string;
    replyTo: string;
    subject: string;
    text: string;
  },
  runtime: ResendRuntime,
): Promise<void> {
  if (typeof window !== 'undefined')
    throw new Error('Resend mail can only be sent from the server');
  if (!runtime.apiKey || !runtime.fromEmail)
    throw new Error('Resend is not configured');
  const fetchRequest = runtime.fetch ?? fetch;
  const response = await fetchRequest('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(5_000),
    headers: {
      Authorization: `Bearer ${runtime.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: runtime.fromEmail,
      to: [message.to],
      reply_to: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: `<p>${escapeHtml(message.text).replace(/\n/g, '<br>')}</p>`,
    }),
  });
  if (!response.ok)
    throw new Error(`Resend delivery failed with status ${response.status}`);
}

export async function sendLeadConfirmation(
  confirmation: LeadConfirmation,
  runtime: ResendRuntime,
): Promise<void> {
  if (typeof window !== 'undefined')
    throw new Error('Resend mail can only be sent from the server');
  if (!runtime.apiKey || !runtime.fromEmail)
    throw new Error('Resend is not configured');
  const english = confirmation.locale === 'en';
  const requestLabel =
    confirmation.requestType === 'quote'
      ? english
        ? 'quote request'
        : '報價需求'
      : english
        ? 'specialist consultation'
        : '專員諮詢';
  const topic = confirmation.topic
    ? english
      ? `\nTopic: ${confirmation.topic}`
      : `\n詢問主題：${confirmation.topic}`
    : '';
  const text = english
    ? `Hello ${confirmation.name},\n\nWe received your ${requestLabel}. Our team will review it and reply within one business day.${topic}\n\nUnirise Technology Inc.`
    : `${confirmation.name} 您好：\n\n我們已收到您的${requestLabel}，業務團隊將於一個工作天內回覆您。${topic}\n\n合軒科技有限公司`;
  const fetchRequest = runtime.fetch ?? fetch;
  const response = await fetchRequest('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(5_000),
    headers: {
      Authorization: `Bearer ${runtime.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: runtime.fromEmail,
      to: [confirmation.to],
      subject: english
        ? 'We received your Unirise enquiry'
        : '我們已收到您的合軒科技詢問',
      text,
      html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`,
    }),
  });
  if (!response.ok)
    throw new Error(`Resend delivery failed with status ${response.status}`);
}
import type { LeadConfirmation } from './lead-service';
