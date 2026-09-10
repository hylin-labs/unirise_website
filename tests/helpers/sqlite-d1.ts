import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export function sqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(resolve('drizzle'))
    .filter((file) => file.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(resolve('drizzle', file), 'utf8'));
  let transaction: Promise<unknown> = Promise.resolve();
  const prepare = (sql: string) => {
    let values: SQLInputValue[] = [];
    const statement = {
      bind(...args: SQLInputValue[]) {
        values = args;
        return statement;
      },
      async first() {
        return sqlite.prepare(sql).get(...values) ?? null;
      },
      async all() {
        return { success: true, results: sqlite.prepare(sql).all(...values) };
      },
      async run() {
        const before = Number(
          sqlite.prepare('SELECT total_changes() AS n').get()!.n,
        );
        const prepared = sqlite.prepare(sql);
        const results = prepared.columns().length
          ? prepared.all(...values)
          : (prepared.run(...values), []);
        return {
          success: true,
          results,
          meta: {
            changes:
              Number(sqlite.prepare('SELECT total_changes() AS n').get()!.n) -
              before,
          },
        };
      },
    };
    return statement;
  };
  const d1 = {
    prepare,
    batch(statements: D1PreparedStatement[]) {
      const operation = transaction.then(async () => {
        sqlite.exec('BEGIN');
        try {
          const results = [];
          for (const statement of statements)
            results.push(await statement.run());
          sqlite.exec('COMMIT');
          return results;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      });
      transaction = operation.catch(() => undefined);
      return operation;
    },
  } as unknown as D1Database;
  return { d1, sqlite };
}
