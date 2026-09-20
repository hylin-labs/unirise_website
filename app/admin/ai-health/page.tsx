import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AiHealthPanel } from '../../../components/ai-health-panel';
import { requireAdmin } from '../../../lib/admin-auth';

export default async function AiHealthPage() {
  const request = new Request('https://unirise.internal/admin/ai-health', {
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
  return <AiHealthPanel identity={identity} />;
}
