import { env } from 'cloudflare:workers';
import {
  fallbackLineContacts,
  listLineContacts,
  publicLineContacts,
} from '../../../lib/line-contacts';

export async function GET() {
  try {
    const contacts = await listLineContacts(
      (env as unknown as { DB: D1Database }).DB,
    );
    return Response.json(
      { contacts: publicLineContacts(contacts) },
      { headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  } catch (error) {
    console.error('Public LINE contacts unavailable', error);
    return Response.json(
      { contacts: publicLineContacts(fallbackLineContacts) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
