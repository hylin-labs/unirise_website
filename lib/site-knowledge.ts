import { retrievePublishedKnowledge } from './content-repository';

export function retrieveSiteKnowledge(
  db: D1Database,
  query: string,
  limit = 4,
) {
  return retrievePublishedKnowledge(db, query, limit);
}
