import { env } from 'cloudflare:workers';
import { findLineContact } from '../../../../lib/line-contacts';

function json(error: string, status: number) {
  return Response.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function validId(value: string) {
  return /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

export async function GET(request: Request) {
  try {
    const runtime = env as unknown as { DB: D1Database; DOCUMENTS?: R2Bucket };
    if (!runtime.DOCUMENTS) return json('line_contact_unavailable', 503);
    const id = new URL(request.url).searchParams.get('id') ?? '';
    if (!validId(id)) return json('not_found', 404);
    const contact = await findLineContact(runtime.DB, id, false);
    if (!contact?.qrImageKey) return json('not_found', 404);
    const stored = await runtime.DOCUMENTS.get(contact.qrImageKey);
    if (!stored) return json('not_found', 404);
    return new Response(stored.body, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': stored.httpMetadata?.contentType ?? 'image/png',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Public LINE QR image unavailable', error);
    return json('line_contact_unavailable', 503);
  }
}
