import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { KnowledgeQualityDashboard } from '../../../components/knowledge-quality-dashboard';
import { requireAdmin } from '../../../lib/admin-auth';

export default async function KnowledgeQualityPage() {
  const request = new Request('https://unirise.internal/admin/knowledge-quality', { headers: await headers() });
  const db = (env as unknown as { DB: D1Database }).DB;
  let identity;
  try { identity = await requireAdmin(request, db); } catch { redirect('/admin/login?error=unavailable'); }
  if (!identity) redirect('/admin/login');
  return <KnowledgeQualityDashboard identity={identity} />;
}
