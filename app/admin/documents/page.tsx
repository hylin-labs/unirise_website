import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { DocumentManager } from '../../../components/document-manager';
import { requireAdmin } from '../../../lib/admin-auth';

export default async function DocumentsAdminPage() {
  const request = new Request('https://unirise.internal/admin/documents', {
    headers: await headers(),
  });
  const db = (env as unknown as { DB: D1Database }).DB;
  let identity;
  try {
    identity = await requireAdmin(request, db);
  } catch {
    redirect('/admin/login?error=unavailable');
  }
  if (!identity) redirect('/admin/login');
  return <DocumentManager identity={identity} />;
}
