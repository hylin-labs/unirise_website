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
