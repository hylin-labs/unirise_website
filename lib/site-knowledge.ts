import {
  retrievePublishedKnowledge,
  retrievePublishedKnowledgeForLocale,
} from './content-repository';
import type { Locale } from './locales';

export function retrieveSiteKnowledge(
  db: D1Database,
  locale: Locale,
  query: string,
  limit?: number,
): ReturnType<typeof retrievePublishedKnowledgeForLocale>;
export function retrieveSiteKnowledge(
  db: D1Database,
  query: string,
  limit?: number,
): ReturnType<typeof retrievePublishedKnowledge>;
export function retrieveSiteKnowledge(
  db: D1Database,
  localeOrQuery: string,
  queryOrLimit?: string | number,
  limit = 4,
) {
  if (
    (localeOrQuery === 'zh-TW' || localeOrQuery === 'en') &&
    typeof queryOrLimit === 'string'
  )
    return retrievePublishedKnowledgeForLocale(
      db,
      queryOrLimit,
      localeOrQuery,
      limit,
    );
  return retrievePublishedKnowledge(
    db,
    localeOrQuery,
    typeof queryOrLimit === 'number' ? queryOrLimit : 4,
  );
}
