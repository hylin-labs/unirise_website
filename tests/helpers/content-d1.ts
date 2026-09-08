type Row = Record<string, unknown>;

const d1Result = (changes = 0, results: Row[] = []) => ({
  success: true as const,
  results,
  meta: {
    duration: 0,
    size_after: 0,
    rows_read: results.length,
    rows_written: changes,
    last_row_id: 0,
    changed_db: changes > 0,
    changes,
  },
});

function normalized(sql: string) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function selectedColumns(sql: string) {
  const match = sql.match(/select\s+(.+?)\s+from\s+/i);
  if (!match || match[1] === '*') return null;
  return match[1].split(',').map((column) => {
    const name = column.trim();
    const alias = name.match(/\s+as\s+(\w+)$/i)?.[1];
    return { source: name.split(/\s+as\s+/i)[0].trim(), target: alias ?? name };
  });
}

class ContentPreparedStatement {
  private values: unknown[] = [];

  constructor(
    readonly sql: string,
    private readonly database: ContentDatabase,
  ) {}

  bind(...values: unknown[]): this {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return (
      (this.database.read(this.sql, this.values)[0] as T | undefined) ?? null
    );
  }

  async all<T>() {
    const rows = this.database.read(this.sql, this.values) as T[];
    return d1Result(0, rows as Row[]);
  }

  async run() {
    return d1Result(this.database.write(this.sql, this.values));
  }
}

export class ContentDatabase {
  private readonly tables = new Map<string, Row[]>();
  private beforeBatch: (() => Promise<void>) | null = null;
  private lastChanges = 0;

  readonly d1 = {
    prepare: (sql: string) =>
      new ContentPreparedStatement(sql, this) as unknown as D1PreparedStatement,
    batch: async (statements: D1PreparedStatement[]) => {
      const beforeBatch = this.beforeBatch;
      this.beforeBatch = null;
      if (beforeBatch) await beforeBatch();
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  } as unknown as D1Database;

  interleaveNextBatch(operation: () => Promise<void>) {
    this.beforeBatch = operation;
  }

  rows(table: string) {
    return [...(this.tables.get(table) ?? [])];
  }

  read(sql: string, values: unknown[]) {
    const query = normalized(sql);
    const table = query.match(/\sfrom\s+(\w+)/)?.[1];
    if (!table)
      throw new Error(`ContentDatabase does not support read SQL: ${sql}`);
    let rows = [...(this.tables.get(table) ?? [])];
    const where = query.match(/\swhere\s+(.+?)(?:\sorder\s+by|\slimit|$)/)?.[1];
    if (where) {
      let valueIndex = 0;
      for (const clause of where.split(/\s+and\s+/)) {
        const match = clause.match(/^(\w+)\s*=\s*\?$/);
        if (!match) throw new Error(`Unsupported WHERE clause: ${clause}`);
        const expected = values[valueIndex];
        valueIndex += 1;
        rows = rows.filter((row) => row[match[1]] === expected);
      }
    }
    if (query.includes('order by published_at desc')) {
      rows.sort((left, right) =>
        (typeof right.published_at === 'string'
          ? right.published_at
          : ''
        ).localeCompare(
          typeof left.published_at === 'string' ? left.published_at : '',
        ),
      );
    }
    const limit = query.match(/\slimit\s+(\d+)/)?.[1];
    if (limit) rows = rows.slice(0, Number(limit));
    const columns = selectedColumns(sql);
    if (!columns) return rows;
    return rows.map((row) =>
      Object.fromEntries(
        columns.map(({ source, target }) => [target, row[source]]),
      ),
    );
  }

  write(sql: string, values: unknown[]) {
    const query = normalized(sql);
    const conditionalInsert = sql.match(
      /insert\s+into\s+(\w+)\s*\(([^)]+)\)\s*select/i,
    );
    if (conditionalInsert && query.includes('where changes() > 0')) {
      if (this.lastChanges === 0) return 0;
      const columns = conditionalInsert[2]
        .split(',')
        .map((column) => column.trim());
      const row = Object.fromEntries(
        columns.map((column, index) => [column, values[index]]),
      );
      const rows = this.tables.get(conditionalInsert[1]) ?? [];
      rows.push(row);
      this.tables.set(conditionalInsert[1], rows);
      this.lastChanges = 1;
      return 1;
    }

    const insert = sql.match(/insert\s+into\s+(\w+)\s*\(([^)]+)\)\s*values/i);
    if (insert) {
      const columns = insert[2].split(',').map((column) => column.trim());
      const row = Object.fromEntries(
        columns.map((column, index) => [column, values[index]]),
      );
      const rows = this.tables.get(insert[1]) ?? [];
      const existingIndex = rows.findIndex((item) => item.id === row.id);
      if (existingIndex >= 0 && query.includes('on conflict(id) do nothing')) {
        this.lastChanges = 0;
        return 0;
      }
      if (existingIndex >= 0 && query.includes('on conflict')) {
        rows[existingIndex] = { ...rows[existingIndex], ...row };
      } else {
        rows.push(row);
      }
      this.tables.set(insert[1], rows);
      this.lastChanges = 1;
      return 1;
    }

    const update = query.match(/update\s+(\w+)\s+set\s+(.+?)\s+where\s+(.+)/);
    if (update) {
      const assignments = update[2].split(',').map((part) => part.trim());
      const predicates = update[3].split(/\s+and\s+/);
      const predicateValues = values.slice(assignments.length);
      const row = (this.tables.get(update[1]) ?? []).find((item) =>
        predicates.every((predicate, index) => {
          const match = predicate.match(/^(\w+)\s*(?:=|is)\s*\?$/);
          if (!match) throw new Error(`Unsupported WHERE clause: ${predicate}`);
          return item[match[1]] === predicateValues[index];
        }),
      );
      if (!row) {
        this.lastChanges = 0;
        return 0;
      }
      assignments.forEach((assignment, index) => {
        const column = assignment.match(/^(\w+)\s*=\s*\?$/)?.[1];
        if (!column) throw new Error(`Unsupported SET clause: ${assignment}`);
        row[column] = values[index];
      });
      this.lastChanges = 1;
      return 1;
    }

    throw new Error(`ContentDatabase does not support write SQL: ${sql}`);
  }
}
