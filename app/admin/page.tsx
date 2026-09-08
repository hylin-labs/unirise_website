import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminDashboard } from '../../components/admin-dashboard';
import { requireAdmin } from '../../lib/admin-auth';

export default async function AdminPage() {
  const requestHeaders = await headers();
  const request = new Request('https://unirise.internal/admin', {
    headers: requestHeaders,
  });
  const db = (env as unknown as { DB: D1Database }).DB;
  let identity;
  try {
    identity = await requireAdmin(request, db);
  } catch {
    redirect('/admin/login?error=unavailable');
  }
  if (!identity) redirect('/admin/login');
  return <AdminDashboard identity={identity} />;
}
