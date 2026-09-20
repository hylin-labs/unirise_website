import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../../../lib/admin-auth';
import { listApprovedDocumentFacts, listDocuments } from '../../../../lib/document-repository';
import { evaluatePublishedStructuredKnowledge } from '../../../../lib/knowledge-quality';

function json(error: string, status: number) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function createKnowledgeQualityHandler(
  request: Request,
  db: D1Database,
  authenticate: typeof requireAdmin = requireAdmin,
) {
  const actor = await authenticate(request, db);
  if (!actor) return json('unauthorized', 401);
  if (request.method !== 'GET') return json('method_not_allowed', 405);
  try {
    const [documents, facts, evaluation] = await Promise.all([
      listDocuments(db),
      listApprovedDocumentFacts(db, 100),
      evaluatePublishedStructuredKnowledge(db),
    ]);
    return Response.json({
      documents: documents.map((document) => ({
        id: document.id,
        title: document.displayTitle,
        accessLevel: document.accessLevel,
        assistantStatus: document.assistantStatus,
        pages: document.extractionPageCount,
        updatedAt: document.updatedAt,
      })),
      facts,
      evaluation,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Knowledge quality listing failed', error);
    return json('knowledge_quality_unavailable', 503);
  }
}

export function GET(request: Request) {
  return createKnowledgeQualityHandler(request, (env as unknown as { DB: D1Database }).DB);
}
