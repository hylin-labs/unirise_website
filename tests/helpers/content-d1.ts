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

  readonly d1 = {
    prepare: (sql: string) =>
      new ContentPreparedStatement(sql, this) as unknown as D1PreparedStatement,
    batch: async (statements: D1PreparedStatement[]) =>
      Promise.all(statements.map((statement) => statement.run())),
  } as unknown as D1Database;

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
    const insert = sql.match(/insert\s+into\s+(\w+)\s*\(([^)]+)\)\s*values/i);
    if (insert) {
      const columns = insert[2].split(',').map((column) => column.trim());
      const row = Object.fromEntries(
        columns.map((column, index) => [column, values[index]]),
      );
      const rows = this.tables.get(insert[1]) ?? [];
      const existingIndex = rows.findIndex((item) => item.id === row.id);
      if (existingIndex >= 0 && query.includes('on conflict')) {
        rows[existingIndex] = { ...rows[existingIndex], ...row };
      } else {
        rows.push(row);
      }
      this.tables.set(insert[1], rows);
      return 1;
    }

    const update = query.match(
      /update\s+(\w+)\s+set\s+(.+?)\s+where\s+id\s*=\s*\?/,
    );
    if (update) {
      const assignments = update[2].split(',').map((part) => part.trim());
      const id = values[assignments.length];
      const row = (this.tables.get(update[1]) ?? []).find(
        (item) => item.id === id,
      );
      if (!row) return 0;
      assignments.forEach((assignment, index) => {
        const column = assignment.match(/^(\w+)\s*=\s*\?$/)?.[1];
        if (!column) throw new Error(`Unsupported SET clause: ${assignment}`);
        row[column] = values[index];
      });
      return 1;
    }

    throw new Error(`ContentDatabase does not support write SQL: ${sql}`);
  }
}
