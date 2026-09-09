import { seedLegacyContent } from './seed-content';

// Workers may reuse an isolate, but a later request can run in a new isolate.
// The seed itself uses INSERT OR IGNORE, so running it again for another D1
// binding or isolate is safe; this cache only avoids duplicate work in one.
const initialized = new WeakMap<object, Promise<void>>();

export function ensureInitialContent(db: D1Database) {
  const cached = initialized.get(db);
  if (cached) return cached;

  const initialization = seedLegacyContent(db).catch((error: unknown) => {
    initialized.delete(db);
    throw error;
  });
  initialized.set(db, initialization);
  return initialization;
}
